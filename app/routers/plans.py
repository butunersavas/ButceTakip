from datetime import datetime
import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, exists, func, or_
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import Session, select

from app.dependencies import get_admin_user, get_current_user, get_db_session
from app.models import (
    BudgetItem,
    BudgetTransfer,
    Expense,
    ExpenseAllocation,
    ExpenseStatus,
    PlanEntry,
    PurchaseFormStatusExt,
    Scenario,
    User,
)
from app.schemas import (
    BudgetAvailableRead,
    BudgetTransferCreate,
    BudgetTransferRead,
    DeleteDependencyInfo,
    PlanAggregateRead,
    PlanEntryCreate,
    PlanManualCreate,
    PlanEntryRead,
    PlanEntryUpdate,
    PlanUnusedUpdate,
)
from app.services.related_records import count_related_file_records, delete_related_file_records

router = APIRouter(prefix="/plans", tags=["Plans"])


def _normalize_capex_opex(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    if normalized in {"capex", "opex"}:
        return normalized
    return None


def _normalize_code(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.strip().upper()
    ascii_text = re.sub(r"[^A-Z0-9]+", "_", ascii_text)
    ascii_text = ascii_text.strip("_")
    return (ascii_text or "ITEM")[:64]


def _generate_manual_code(session: Session) -> str:
    base_code = f"MANUAL-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
    candidate = base_code
    suffix = 1
    while session.exec(select(BudgetItem).where(BudgetItem.code == candidate)).first():
        suffix += 1
        candidate = f"{base_code}-{suffix}"
    return candidate


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _apply_budget_item_updates(
    session: Session,
    item: BudgetItem,
    name: str | None = None,
    map_attribute: str | None = None,
    map_category: str | None = None,
    description: str | None = None,
) -> BudgetItem:
    updated = False
    if name and item.name != name:
        item.name = name
        updated = True
    if map_attribute is not None and item.map_attribute != map_attribute:
        item.map_attribute = map_attribute
        updated = True
    if map_category is not None and item.map_category != map_category:
        item.map_category = map_category
        updated = True
    if description is not None and item.description != description:
        item.description = description
        updated = True
    if updated:
        session.add(item)
        session.commit()
        session.refresh(item)
    return item


def _transfer_totals_for_scope(
    session: Session,
    budget_item_id: int,
    year: int,
    month: int,
    scenario_id: int,
) -> tuple[float, float]:
    incoming = session.exec(
        select(func.coalesce(func.sum(BudgetTransfer.amount), 0))
        .where(BudgetTransfer.target_budget_item_id == budget_item_id)
        .where(BudgetTransfer.target_year == year)
        .where(BudgetTransfer.target_month == month)
        .where(BudgetTransfer.target_scenario_id == scenario_id)
        .where(BudgetTransfer.is_cancelled.is_(False))
    ).one()
    outgoing = session.exec(
        select(func.coalesce(func.sum(BudgetTransfer.amount), 0))
        .where(BudgetTransfer.source_budget_item_id == budget_item_id)
        .where(BudgetTransfer.source_year == year)
        .where(BudgetTransfer.source_month == month)
        .where(BudgetTransfer.source_scenario_id == scenario_id)
        .where(BudgetTransfer.is_cancelled.is_(False))
    ).one()
    return float(incoming or 0), float(outgoing or 0)


def _original_plan_amount(
    session: Session,
    budget_item_id: int,
    year: int,
    month: int,
    scenario_id: int,
) -> float:
    amount = session.exec(
        select(func.coalesce(func.sum(PlanEntry.amount), 0))
        .where(PlanEntry.budget_item_id == budget_item_id)
        .where(PlanEntry.year == year)
        .where(PlanEntry.month == month)
        .where(PlanEntry.scenario_id == scenario_id)
    ).one()
    return float(amount or 0)


def _revised_plan_amount(
    session: Session,
    budget_item_id: int,
    year: int,
    month: int,
    scenario_id: int,
) -> tuple[float, float, float, float]:
    original = _original_plan_amount(session, budget_item_id, year, month, scenario_id)
    incoming, outgoing = _transfer_totals_for_scope(session, budget_item_id, year, month, scenario_id)
    return original, incoming, outgoing, original + incoming - outgoing


def _actual_amount_for_scope(
    session: Session,
    budget_item_id: int,
    year: int,
    month: int,
    scenario_id: int,
) -> float:
    allocated = session.exec(
        select(func.coalesce(func.sum(ExpenseAllocation.allocated_amount), 0))
        .select_from(ExpenseAllocation)
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .where(ExpenseAllocation.budget_item_id == budget_item_id)
        .where(ExpenseAllocation.year == year)
        .where(ExpenseAllocation.month == month)
        .where(ExpenseAllocation.scenario_id == scenario_id)
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
    ).one()
    fallback = session.exec(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.budget_item_id == budget_item_id)
        .where(Expense.scenario_id == scenario_id)
        .where(func.extract("year", Expense.expense_date) == year)
        .where(func.extract("month", Expense.expense_date) == month)
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
        .where(~exists().where(ExpenseAllocation.expense_id == Expense.id))
    ).one()
    return float(allocated or 0) + float(fallback or 0)


def _cancelled_amount_for_scope(
    session: Session,
    budget_item_id: int,
    year: int,
    month: int,
    scenario_id: int,
) -> float:
    allocated = session.exec(
        select(func.coalesce(func.sum(ExpenseAllocation.allocated_amount), 0))
        .select_from(ExpenseAllocation)
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .where(ExpenseAllocation.budget_item_id == budget_item_id)
        .where(ExpenseAllocation.year == year)
        .where(ExpenseAllocation.month == month)
        .where(ExpenseAllocation.scenario_id == scenario_id)
        .where(Expense.status == ExpenseStatus.CANCELLED)
        .where(Expense.is_out_of_budget.is_(False))
    ).one()
    fallback = session.exec(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.budget_item_id == budget_item_id)
        .where(Expense.scenario_id == scenario_id)
        .where(func.extract("year", Expense.expense_date) == year)
        .where(func.extract("month", Expense.expense_date) == month)
        .where(Expense.status == ExpenseStatus.CANCELLED)
        .where(Expense.is_out_of_budget.is_(False))
        .where(~exists().where(ExpenseAllocation.expense_id == Expense.id))
    ).one()
    return float(allocated or 0) + float(fallback or 0)


def _unused_amount_for_scope(
    session: Session,
    budget_item_id: int,
    year: int,
    month: int,
    scenario_id: int,
    exclude_plan_id: int | None = None,
) -> float:
    query = (
        select(func.coalesce(func.sum(PlanEntry.unused_amount), 0))
        .where(PlanEntry.budget_item_id == budget_item_id)
        .where(PlanEntry.year == year)
        .where(PlanEntry.month == month)
        .where(PlanEntry.scenario_id == scenario_id)
    )
    if exclude_plan_id is not None:
        query = query.where(PlanEntry.id != exclude_plan_id)
    amount = session.exec(query).one()
    return float(amount or 0)


def _available_budget_for_scope(
    session: Session,
    budget_item_id: int,
    year: int,
    month: int,
    scenario_id: int,
) -> BudgetAvailableRead:
    _, _, _, revised = _revised_plan_amount(session, budget_item_id, year, month, scenario_id)
    actual = _actual_amount_for_scope(session, budget_item_id, year, month, scenario_id)
    cancelled = _cancelled_amount_for_scope(session, budget_item_id, year, month, scenario_id)
    unused = _unused_amount_for_scope(session, budget_item_id, year, month, scenario_id)
    return BudgetAvailableRead(
        revised_amount=revised,
        actual_amount=actual,
        unused_amount=unused,
        available_amount=revised - actual - unused - cancelled,
    )


def _plan_read_query(capex_filter: str | None):
    normalized_plan_code = func.upper(func.trim(PlanEntry.budget_code))
    normalized_item_code = func.upper(func.trim(BudgetItem.code))
    plan_budget_code = func.coalesce(func.nullif(func.trim(PlanEntry.budget_code), ""), BudgetItem.code)
    plan_department = func.coalesce(PlanEntry.department, "")
    status_budget_code = func.upper(func.trim(PurchaseFormStatusExt.budget_code))
    query = (
        select(
            PlanEntry.id,
            PlanEntry.year,
            PlanEntry.month,
            PlanEntry.amount,
            PlanEntry.scenario_id,
            PlanEntry.budget_item_id,
            PlanEntry.department,
            PlanEntry.department.label("department_name"),
            func.nullif(func.trim(PlanEntry.budget_code), "").label("plan_budget_code"),
            Scenario.name.label("scenario_name"),
            func.coalesce(func.nullif(func.trim(PlanEntry.budget_code), ""), BudgetItem.code).label(
                "budget_code"
            ),
            BudgetItem.name.label("budget_name"),
            BudgetItem.map_category.label("capex_opex"),
            BudgetItem.map_attribute.label("asset_type"),
            BudgetItem.map_category.label("map_capex_opex"),
            BudgetItem.map_attribute.label("map_nitelik"),
            func.coalesce(PurchaseFormStatusExt.is_form_prepared, False).label("is_form_prepared"),
            PlanEntry.purchase_requested,
            PlanEntry.purchase_requested_at,
            PlanEntry.unused_amount,
            PlanEntry.unused_reason,
            PlanEntry.unused_note,
            PlanEntry.unused_updated_at,
        )
        .select_from(PlanEntry)
        .join(Scenario, Scenario.id == PlanEntry.scenario_id)
        .outerjoin(
            BudgetItem,
            or_(
                and_(
                    PlanEntry.budget_code.is_not(None),
                    normalized_item_code == normalized_plan_code,
                ),
                BudgetItem.id == PlanEntry.budget_item_id,
            ),
        )
        .outerjoin(
            PurchaseFormStatusExt,
            and_(
                status_budget_code == func.upper(func.trim(plan_budget_code)),
                PurchaseFormStatusExt.year == PlanEntry.year,
                PurchaseFormStatusExt.month == PlanEntry.month,
                PurchaseFormStatusExt.scenario_id == PlanEntry.scenario_id,
                PurchaseFormStatusExt.department == plan_department,
            ),
        )
    )
    if capex_filter:
        query = query.where(func.lower(func.trim(BudgetItem.map_category)) == capex_filter)
    return query


def _build_plan_read(row: dict, session: Session) -> PlanEntryRead:
    budget_code = row.get("plan_budget_code") or row.get("budget_code")
    budget_name = row.get("budget_name") or budget_code
    capex_value = row.get("capex_opex") or row.get("map_capex_opex")
    asset_value = row.get("asset_type") or row.get("map_nitelik")
    amount = float(row.get("amount") or 0)
    _original_amount, transfer_in, transfer_out, scope_revised_amount = _revised_plan_amount(
        session,
        row.get("budget_item_id"),
        row.get("year"),
        row.get("month"),
        row.get("scenario_id"),
    )
    actual_amount = _actual_amount_for_scope(
        session,
        row.get("budget_item_id"),
        row.get("year"),
        row.get("month"),
        row.get("scenario_id"),
    )
    scope_cancelled_amount = _cancelled_amount_for_scope(
        session,
        row.get("budget_item_id"),
        row.get("year"),
        row.get("month"),
        row.get("scenario_id"),
    )
    scope_unused_amount = _unused_amount_for_scope(
        session,
        row.get("budget_item_id"),
        row.get("year"),
        row.get("month"),
        row.get("scenario_id"),
    )
    row_unused_amount = float(row.get("unused_amount") or 0)
    revised_amount = amount + transfer_in - transfer_out
    scope_available_amount = (
        scope_revised_amount
        - actual_amount
        - scope_unused_amount
        - scope_cancelled_amount
    )
    return PlanEntryRead(
        id=row.get("id"),
        year=row.get("year"),
        month=row.get("month"),
        amount=amount,
        scenario_id=row.get("scenario_id"),
        budget_item_id=row.get("budget_item_id"),
        department=row.get("department"),
        department_name=row.get("department_name"),
        scenario_name=row.get("scenario_name"),
        budget_code=budget_code,
        budget_name=budget_name,
        capex_opex=capex_value.title() if capex_value else None,
        asset_type=asset_value,
        map_capex_opex=capex_value.title() if capex_value else None,
        map_nitelik=asset_value,
        nitelik=asset_value,
        transfer_in_amount=transfer_in,
        transfer_out_amount=transfer_out,
        revised_amount=revised_amount,
        actual_amount=actual_amount,
        unused_amount=row_unused_amount,
        available_amount=revised_amount - actual_amount - row_unused_amount - scope_cancelled_amount,
        scope_revised_amount=scope_revised_amount,
        scope_actual_amount=actual_amount,
        scope_unused_amount=scope_unused_amount,
        scope_cancelled_amount=scope_cancelled_amount,
        scope_available_amount=scope_available_amount,
        cancelled_amount=scope_cancelled_amount,
        is_cancelled=scope_cancelled_amount > 0.005,
        unused_reason=row.get("unused_reason"),
        unused_note=row.get("unused_note"),
        unused_updated_at=row.get("unused_updated_at"),
        is_form_prepared=row.get("is_form_prepared") or False,
        purchase_requested=row.get("purchase_requested") or False,
        purchase_requested_at=row.get("purchase_requested_at"),
    )


def _fetch_plan_read(session: Session, plan_id: int) -> PlanEntryRead:
    row = session.exec(_plan_read_query(None).where(PlanEntry.id == plan_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return _build_plan_read(row._mapping, session)


@router.get("", response_model=list[PlanEntryRead])
@router.get("/", response_model=list[PlanEntryRead], include_in_schema=False)
def list_plans(
    year: int = Query(...),
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    month: int | None = Query(default=None),
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[PlanEntryRead]:
    capex_filter = _normalize_capex_opex(capex_opex)
    query = _plan_read_query(capex_filter)
    if year is not None:
        query = query.where(PlanEntry.year == year)
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        query = query.where(PlanEntry.budget_item_id == budget_item_id)
    if month is not None:
        query = query.where(PlanEntry.month == month)
    if department is not None:
        query = query.where(PlanEntry.department == department)
    rows = session.exec(query).all()
    return [_build_plan_read(row._mapping, session) for row in rows]


@router.get("/aggregate", response_model=list[PlanAggregateRead])
@router.get("/aggregate/", response_model=list[PlanAggregateRead], include_in_schema=False)
def aggregate_plans(
    year: int = Query(...),
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
):
    query = select(PlanEntry)
    query = query.where(PlanEntry.year == year)
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        query = query.where(PlanEntry.budget_item_id == budget_item_id)
    capex_filter = _normalize_capex_opex(capex_opex)
    if capex_filter:
        query = query.join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id).where(
            func.lower(func.trim(BudgetItem.map_category)) == capex_filter
        )
    plans = session.exec(query).all()
    budget_items = {
        item.id: item
        for item in session.exec(
            select(BudgetItem).where(
                BudgetItem.id.in_({plan.budget_item_id for plan in plans} or {0})
            )
        ).all()
    }
    aggregates: dict[tuple[int, int], float] = {}
    original_aggregates: dict[tuple[int, int], float] = {}
    transfer_in_map: dict[tuple[int, int], float] = {}
    transfer_out_map: dict[tuple[int, int], float] = {}
    unused_map: dict[tuple[int, int], float] = {}
    aggregate_meta: dict[tuple[int, int], dict[str, str | int | None]] = {}
    for plan in plans:
        key = (plan.budget_item_id, plan.month)
        aggregates[key] = aggregates.get(key, 0.0) + plan.amount
        original_aggregates[key] = original_aggregates.get(key, 0.0) + plan.amount
        unused_map[key] = unused_map.get(key, 0.0) + float(plan.unused_amount or 0)
        item = budget_items.get(plan.budget_item_id)
        meta = aggregate_meta.setdefault(
            key,
            {
                "scenario_id": plan.scenario_id,
                "budget_code": plan.budget_code or item.code if item else plan.budget_code,
                "budget_name": item.name if item else None,
                "department": plan.department,
                "capex_opex": item.map_category if item else None,
                "asset_type": item.map_attribute if item else None,
            },
        )
        if not meta.get("department") and plan.department:
            meta["department"] = plan.department

    transfer_query = select(BudgetTransfer).where(BudgetTransfer.is_cancelled.is_(False))
    if scenario_id is not None:
        transfer_query = transfer_query.where(
            or_(
                BudgetTransfer.source_scenario_id == scenario_id,
                BudgetTransfer.target_scenario_id == scenario_id,
            )
        )
    if budget_item_id is not None:
        transfer_query = transfer_query.where(
            or_(
                BudgetTransfer.source_budget_item_id == budget_item_id,
                BudgetTransfer.target_budget_item_id == budget_item_id,
            )
        )
    transfers = session.exec(transfer_query).all()
    transfer_budget_ids = {
        transfer.source_budget_item_id
        for transfer in transfers
        if transfer.source_year == year
    } | {
        transfer.target_budget_item_id
        for transfer in transfers
        if transfer.target_year == year
    }
    if transfer_budget_ids:
        for item in session.exec(select(BudgetItem).where(BudgetItem.id.in_(transfer_budget_ids))).all():
            budget_items.setdefault(item.id, item)
    for transfer in transfers:
        if (
            transfer.source_year == year
            and (scenario_id is None or transfer.source_scenario_id == scenario_id)
            and (
                budget_item_id is None
                or transfer.source_budget_item_id == budget_item_id
            )
        ):
            key = (transfer.source_budget_item_id, transfer.source_month)
            item = budget_items.get(transfer.source_budget_item_id)
            if capex_filter and (not item or (item.map_category or "").strip().lower() != capex_filter):
                continue
            aggregates[key] = aggregates.get(key, 0.0) - transfer.amount
            transfer_out_map[key] = transfer_out_map.get(key, 0.0) + transfer.amount
            aggregate_meta.setdefault(
                key,
                {
                    "scenario_id": transfer.source_scenario_id,
                    "budget_code": item.code if item else None,
                    "budget_name": item.name if item else None,
                    "department": None,
                    "capex_opex": item.map_category if item else None,
                    "asset_type": item.map_attribute if item else None,
                },
            )
        if (
            transfer.target_year == year
            and (scenario_id is None or transfer.target_scenario_id == scenario_id)
            and (
                budget_item_id is None
                or transfer.target_budget_item_id == budget_item_id
            )
        ):
            key = (transfer.target_budget_item_id, transfer.target_month)
            item = budget_items.get(transfer.target_budget_item_id)
            if capex_filter and (not item or (item.map_category or "").strip().lower() != capex_filter):
                continue
            aggregates[key] = aggregates.get(key, 0.0) + transfer.amount
            transfer_in_map[key] = transfer_in_map.get(key, 0.0) + transfer.amount
            aggregate_meta.setdefault(
                key,
                {
                    "scenario_id": transfer.target_scenario_id,
                    "budget_code": item.code if item else None,
                    "budget_name": item.name if item else None,
                    "department": None,
                    "capex_opex": item.map_category if item else None,
                    "asset_type": item.map_attribute if item else None,
                },
            )
    return [
        PlanAggregateRead(
            budget_item_id=budget_item,
            month=month,
            total_amount=float(amount),
            original_amount=float(original_aggregates.get((budget_item, month), 0.0)),
            transfer_in_amount=float(transfer_in_map.get((budget_item, month), 0.0)),
            transfer_out_amount=float(transfer_out_map.get((budget_item, month), 0.0)),
            unused_amount=float(unused_map.get((budget_item, month), 0.0)),
            scenario_id=aggregate_meta.get((budget_item, month), {}).get("scenario_id"),
            budget_code=aggregate_meta.get((budget_item, month), {}).get("budget_code"),
            budget_name=aggregate_meta.get((budget_item, month), {}).get("budget_name"),
            department=aggregate_meta.get((budget_item, month), {}).get("department"),
            department_name=aggregate_meta.get((budget_item, month), {}).get("department"),
            capex_opex=(
                str(aggregate_meta.get((budget_item, month), {}).get("capex_opex")).title()
                if aggregate_meta.get((budget_item, month), {}).get("capex_opex")
                else None
            ),
            asset_type=aggregate_meta.get((budget_item, month), {}).get("asset_type"),
            map_capex_opex=(
                str(aggregate_meta.get((budget_item, month), {}).get("capex_opex")).title()
                if aggregate_meta.get((budget_item, month), {}).get("capex_opex")
                else None
            ),
            map_nitelik=aggregate_meta.get((budget_item, month), {}).get("asset_type"),
            nitelik=aggregate_meta.get((budget_item, month), {}).get("asset_type"),
        )
        for (budget_item, month), amount in sorted(aggregates.items())
    ]


@router.get("/departments", response_model=list[str])
@router.get("/departments/", response_model=list[str], include_in_schema=False)
def list_departments(
    year: int | None = None,
    scenario_id: int | None = None,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[str]:
    query = select(PlanEntry.department).where(PlanEntry.department.is_not(None))
    if year is not None:
        query = query.where(PlanEntry.year == year)
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)

    departments = session.exec(query.distinct()).all()
    return sorted({dept for dept in departments if dept})


def _build_transfer_read(session: Session, transfer: BudgetTransfer) -> BudgetTransferRead:
    source_item = session.get(BudgetItem, transfer.source_budget_item_id)
    target_item = session.get(BudgetItem, transfer.target_budget_item_id)
    return BudgetTransferRead(
        id=transfer.id,
        source_budget_item_id=transfer.source_budget_item_id,
        source_year=transfer.source_year,
        source_month=transfer.source_month,
        source_scenario_id=transfer.source_scenario_id,
        target_budget_item_id=transfer.target_budget_item_id,
        target_year=transfer.target_year,
        target_month=transfer.target_month,
        target_scenario_id=transfer.target_scenario_id,
        amount=float(transfer.amount or 0),
        reason=transfer.reason,
        created_by_id=transfer.created_by_id,
        created_at=transfer.created_at,
        is_cancelled=transfer.is_cancelled,
        source_budget_name=source_item.name if source_item else None,
        target_budget_name=target_item.name if target_item else None,
    )


@router.get("/transfers", response_model=list[BudgetTransferRead])
@router.get("/transfers/", response_model=list[BudgetTransferRead], include_in_schema=False)
def list_budget_transfers(
    year: int | None = None,
    scenario_id: int | None = None,
    include_cancelled: bool = Query(False),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[BudgetTransferRead]:
    query = select(BudgetTransfer)
    if not include_cancelled:
        query = query.where(BudgetTransfer.is_cancelled.is_(False))
    if year is not None:
        query = query.where(
            or_(BudgetTransfer.source_year == year, BudgetTransfer.target_year == year)
        )
    if scenario_id is not None:
        query = query.where(
            or_(
                BudgetTransfer.source_scenario_id == scenario_id,
                BudgetTransfer.target_scenario_id == scenario_id,
            )
        )
    transfers = session.exec(query.order_by(BudgetTransfer.created_at.desc())).all()
    return [_build_transfer_read(session, transfer) for transfer in transfers]


@router.get("/transfers/available", response_model=BudgetAvailableRead)
def get_budget_transfer_available(
    budget_item_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    scenario_id: int = Query(...),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> BudgetAvailableRead:
    return _available_budget_for_scope(session, budget_item_id, year, month, scenario_id)


@router.post("/transfers", response_model=BudgetTransferRead, status_code=status.HTTP_201_CREATED)
@router.post(
    "/transfers/",
    response_model=BudgetTransferRead,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def create_budget_transfer(
    transfer_in: BudgetTransferCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_admin_user),
) -> BudgetTransferRead:
    if (
        transfer_in.source_budget_item_id == transfer_in.target_budget_item_id
        and transfer_in.source_year == transfer_in.target_year
        and transfer_in.source_month == transfer_in.target_month
        and transfer_in.source_scenario_id == transfer_in.target_scenario_id
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kaynak ve hedef aynı olamaz.")

    source_item = session.get(BudgetItem, transfer_in.source_budget_item_id)
    target_item = session.get(BudgetItem, transfer_in.target_budget_item_id)
    if not source_item or not target_item:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bütçe kalemi bulunamadı.")
    if not session.get(Scenario, transfer_in.source_scenario_id) or not session.get(
        Scenario, transfer_in.target_scenario_id
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senaryo bulunamadı.")

    available = _available_budget_for_scope(
        session,
        transfer_in.source_budget_item_id,
        transfer_in.source_year,
        transfer_in.source_month,
        transfer_in.source_scenario_id,
    )
    if transfer_in.amount > available.available_amount + 0.005:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aktarım tutarı kaynak kullanılabilir bütçeden fazla olamaz.",
        )

    target_plan = session.exec(
        select(PlanEntry)
        .where(PlanEntry.budget_item_id == transfer_in.target_budget_item_id)
        .where(PlanEntry.year == transfer_in.target_year)
        .where(PlanEntry.month == transfer_in.target_month)
        .where(PlanEntry.scenario_id == transfer_in.target_scenario_id)
    ).first()
    if not target_plan:
        target_plan = PlanEntry(
            budget_item_id=transfer_in.target_budget_item_id,
            budget_code=target_item.code,
            year=transfer_in.target_year,
            month=transfer_in.target_month,
            scenario_id=transfer_in.target_scenario_id,
            amount=0,
        )
        session.add(target_plan)

    transfer = BudgetTransfer(
        **transfer_in.dict(),
        created_by_id=current_user.id,
    )
    session.add(transfer)
    session.commit()
    session.refresh(transfer)
    return _build_transfer_read(session, transfer)


@router.delete("/transfers/{transfer_id}", response_model=BudgetTransferRead)
@router.delete("/transfers/{transfer_id}/", response_model=BudgetTransferRead, include_in_schema=False)
def cancel_budget_transfer(
    transfer_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_admin_user),
) -> BudgetTransferRead:
    transfer = session.get(BudgetTransfer, transfer_id)
    if not transfer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aktarım kaydı bulunamadı.")
    if not transfer.is_cancelled:
        transfer.is_cancelled = True
        transfer.cancelled_at = datetime.utcnow()
        transfer.cancelled_by_id = current_user.id
        transfer.updated_at = datetime.utcnow()
        session.add(transfer)
        session.commit()
        session.refresh(transfer)
    return _build_transfer_read(session, transfer)


@router.post("", response_model=PlanEntryRead, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=PlanEntryRead, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_plan_entry(
    plan_in: PlanEntryCreate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> PlanEntryRead:
    if not session.get(Scenario, plan_in.scenario_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scenario not found")
    budget_item = session.get(BudgetItem, plan_in.budget_item_id)
    if not budget_item:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Budget item not found")
    plan = PlanEntry(**plan_in.dict(), budget_code=budget_item.code)
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _fetch_plan_read(session, plan.id)


@router.post("/manual", response_model=PlanEntryRead, status_code=status.HTTP_201_CREATED)
@router.post("/manual/", response_model=PlanEntryRead, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_manual_plan_entry(
    plan_in: PlanManualCreate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> PlanEntryRead:
    if not session.get(Scenario, plan_in.scenario_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scenario not found")

    map_category = _normalize_capex_opex(plan_in.map_category) or _clean_text(plan_in.map_category)
    map_attribute = _clean_text(plan_in.map_attribute)
    description = _clean_text(plan_in.description)
    budget_name = _clean_text(plan_in.budget_name)
    budget_code = _clean_text(plan_in.budget_code)

    if plan_in.budget_item_id:
        budget_item = session.get(BudgetItem, plan_in.budget_item_id)
        if not budget_item:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Budget item not found",
            )
        budget_item = _apply_budget_item_updates(
            session,
            budget_item,
            name=budget_name,
            map_attribute=map_attribute,
            map_category=map_category,
            description=description,
        )
    else:
        if not budget_name and not budget_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Budget name is required",
            )
        effective_code = budget_code or _generate_manual_code(session)
        budget_item = None
        if budget_code:
            budget_item = session.exec(
                select(BudgetItem).where(func.upper(func.trim(BudgetItem.code)) == effective_code.upper())
            ).first()
        if budget_item is None and budget_name:
            budget_item = session.exec(
                select(BudgetItem).where(func.lower(func.trim(BudgetItem.name)) == budget_name.lower())
            ).first()
        if budget_item:
            budget_item = _apply_budget_item_updates(
                session,
                budget_item,
                name=budget_name,
                map_attribute=map_attribute,
                map_category=map_category,
                description=description,
            )
        else:
            budget_item = BudgetItem(
                code=effective_code,
                name=budget_name or effective_code,
                description=description,
                map_attribute=map_attribute,
                map_category=map_category,
            )
            session.add(budget_item)
            session.commit()
            session.refresh(budget_item)

    existing_plan = None
    if plan_in.merge_mode == "merge":
        existing_plan = session.exec(
            select(PlanEntry)
            .where(PlanEntry.year == plan_in.year)
            .where(PlanEntry.month == plan_in.month)
            .where(PlanEntry.scenario_id == plan_in.scenario_id)
            .where(PlanEntry.budget_item_id == budget_item.id)
        ).first()

    if existing_plan:
        existing_plan.amount = float(existing_plan.amount or 0) + float(plan_in.amount or 0)
        if plan_in.department:
            existing_plan.department = plan_in.department
        existing_plan.budget_code = budget_item.code
        existing_plan.updated_at = datetime.utcnow()
        session.add(existing_plan)
        session.commit()
        session.refresh(existing_plan)
        return _fetch_plan_read(session, existing_plan.id)

    plan = PlanEntry(
        year=plan_in.year,
        month=plan_in.month,
        amount=plan_in.amount,
        scenario_id=plan_in.scenario_id,
        budget_item_id=budget_item.id,
        budget_code=budget_item.code,
        department=plan_in.department,
    )
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _fetch_plan_read(session, plan.id)


@router.post("/{plan_id}/unused", response_model=PlanEntryRead)
@router.post("/{plan_id}/unused/", response_model=PlanEntryRead, include_in_schema=False)
def mark_plan_unused_budget(
    plan_id: int,
    payload: PlanUnusedUpdate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> PlanEntryRead:
    plan = session.get(PlanEntry, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    amount = round(float(payload.amount or 0), 2)
    _, _, _, revised = _revised_plan_amount(
        session,
        plan.budget_item_id,
        plan.year,
        plan.month,
        plan.scenario_id,
    )
    actual = _actual_amount_for_scope(
        session,
        plan.budget_item_id,
        plan.year,
        plan.month,
        plan.scenario_id,
    )
    cancelled = _cancelled_amount_for_scope(
        session,
        plan.budget_item_id,
        plan.year,
        plan.month,
        plan.scenario_id,
    )
    other_unused = _unused_amount_for_scope(
        session,
        plan.budget_item_id,
        plan.year,
        plan.month,
        plan.scenario_id,
        exclude_plan_id=plan.id,
    )
    max_unused = max(
        float(revised or 0) - float(actual or 0) - float(cancelled or 0) - other_unused,
        0.0,
    )
    if amount > max_unused + 0.005:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Kullanılmayacak tutar kalan kullanılabilir bütçeden fazla olamaz. "
                f"Maksimum tutar: {max_unused:.2f}"
            ),
        )

    plan.unused_amount = amount
    plan.unused_reason = _clean_text(payload.reason) if amount > 0 else None
    plan.unused_note = _clean_text(payload.note) if amount > 0 else None
    plan.unused_updated_at = datetime.utcnow()
    plan.updated_at = datetime.utcnow()
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _fetch_plan_read(session, plan.id)


@router.delete("/{plan_id}/unused", response_model=PlanEntryRead)
@router.delete("/{plan_id}/unused/", response_model=PlanEntryRead, include_in_schema=False)
def clear_plan_unused_budget(
    plan_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> PlanEntryRead:
    plan = session.get(PlanEntry, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    plan.unused_amount = 0
    plan.unused_reason = None
    plan.unused_note = None
    plan.unused_updated_at = datetime.utcnow()
    plan.updated_at = datetime.utcnow()
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _fetch_plan_read(session, plan.id)


@router.put("/{plan_id}", response_model=PlanEntryRead)
@router.put("/{plan_id}/", response_model=PlanEntryRead, include_in_schema=False)
def update_plan_entry(
    plan_id: int,
    plan_in: PlanEntryUpdate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> PlanEntryRead:
    plan = session.get(PlanEntry, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    update_data = plan_in.dict(exclude_unset=True)
    if "budget_item_id" in update_data:
        budget_item = session.get(BudgetItem, update_data["budget_item_id"])
        if not budget_item:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Budget item not found",
            )
        update_data["budget_code"] = budget_item.code
    for field, value in update_data.items():
        setattr(plan, field, value)
    plan.updated_at = datetime.utcnow()
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _fetch_plan_read(session, plan.id)


@router.get("/{plan_id}/delete-info", response_model=DeleteDependencyInfo)
@router.get("/{plan_id}/delete-info/", response_model=DeleteDependencyInfo, include_in_schema=False)
def get_plan_delete_info(
    plan_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> DeleteDependencyInfo:
    plan = session.get(PlanEntry, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return DeleteDependencyInfo(
        related_file_count=count_related_file_records(session, "plan_entries", plan_id)
    )


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/{plan_id}/", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
def delete_plan_entry(
    plan_id: int,
    delete_related: bool = Query(False),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> None:
    plan = session.get(PlanEntry, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    related_file_count = count_related_file_records(session, "plan_entries", plan_id)
    if related_file_count and not delete_related:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Bu kayda bağlı {related_file_count} ek/dosya var. "
                "Silmeden önce onay verin."
            ),
        )

    try:
        if delete_related:
            delete_related_file_records(session, "plan_entries", plan_id)
        session.delete(plan)
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan kaydı bağlı başka veriler nedeniyle silinemedi.",
        )
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan kaydı silinirken beklenmedik bir hata oluştu.",
        )
