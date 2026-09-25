from datetime import datetime
import logging
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
    PlanUnusedApply,
    PlanUnusedOptionsRead,
)
from app.services.related_records import count_related_file_records, delete_related_file_records
from app.services.budget_availability import calculate_budget_availability

router = APIRouter(prefix="/plans", tags=["Plans"])
logger = logging.getLogger(__name__)

PlanScopeKey = tuple[int, int, int, int]
PlanScopeTotals = dict[str, float]


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
    unused = _unused_amount_for_scope(session, budget_item_id, year, month, scenario_id)
    availability = calculate_budget_availability(revised, actual, unused)
    return BudgetAvailableRead(
        revised_amount=availability.planned_amount,
        actual_amount=availability.valid_expense_total,
        unused_amount=availability.unused_amount,
        available_amount=availability.available_amount,
    )


def _scope_key(
    budget_item_id: int,
    year: int,
    month: int,
    scenario_id: int,
) -> PlanScopeKey:
    return (int(budget_item_id), int(year), int(month), int(scenario_id))


def _scope_key_from_row(row: dict) -> PlanScopeKey:
    return _scope_key(
        row.get("budget_item_id"),
        row.get("year"),
        row.get("month"),
        row.get("scenario_id"),
    )


def _empty_scope_totals() -> PlanScopeTotals:
    return {
        "original": 0.0,
        "transfer_in": 0.0,
        "transfer_out": 0.0,
        "actual": 0.0,
        "cancelled": 0.0,
        "unused": 0.0,
    }


def _collect_plan_scope_totals(session: Session, rows: list) -> dict[PlanScopeKey, PlanScopeTotals]:
    keys = {_scope_key_from_row(row._mapping) for row in rows}
    if not keys:
        return {}

    totals = {key: _empty_scope_totals() for key in keys}
    budget_item_ids = sorted({key[0] for key in keys})
    years = sorted({key[1] for key in keys})
    months = sorted({key[2] for key in keys})
    scenario_ids = sorted({key[3] for key in keys})

    plan_amount_rows = session.exec(
        select(
            PlanEntry.budget_item_id,
            PlanEntry.year,
            PlanEntry.month,
            PlanEntry.scenario_id,
            func.coalesce(func.sum(PlanEntry.amount), 0).label("amount"),
        )
        .where(PlanEntry.budget_item_id.in_(budget_item_ids))
        .where(PlanEntry.year.in_(years))
        .where(PlanEntry.month.in_(months))
        .where(PlanEntry.scenario_id.in_(scenario_ids))
        .group_by(
            PlanEntry.budget_item_id,
            PlanEntry.year,
            PlanEntry.month,
            PlanEntry.scenario_id,
        )
    ).all()
    for row in plan_amount_rows:
        key = _scope_key(row.budget_item_id, row.year, row.month, row.scenario_id)
        if key in totals:
            totals[key]["original"] = float(row.amount or 0)

    unused_rows = session.exec(
        select(
            PlanEntry.budget_item_id,
            PlanEntry.year,
            PlanEntry.month,
            PlanEntry.scenario_id,
            func.coalesce(func.sum(PlanEntry.unused_amount), 0).label("amount"),
        )
        .where(PlanEntry.budget_item_id.in_(budget_item_ids))
        .where(PlanEntry.year.in_(years))
        .where(PlanEntry.month.in_(months))
        .where(PlanEntry.scenario_id.in_(scenario_ids))
        .group_by(
            PlanEntry.budget_item_id,
            PlanEntry.year,
            PlanEntry.month,
            PlanEntry.scenario_id,
        )
    ).all()
    for row in unused_rows:
        key = _scope_key(row.budget_item_id, row.year, row.month, row.scenario_id)
        if key in totals:
            totals[key]["unused"] = float(row.amount or 0)

    incoming_rows = session.exec(
        select(
            BudgetTransfer.target_budget_item_id,
            BudgetTransfer.target_year,
            BudgetTransfer.target_month,
            BudgetTransfer.target_scenario_id,
            func.coalesce(func.sum(BudgetTransfer.amount), 0).label("amount"),
        )
        .where(BudgetTransfer.target_budget_item_id.in_(budget_item_ids))
        .where(BudgetTransfer.target_year.in_(years))
        .where(BudgetTransfer.target_month.in_(months))
        .where(BudgetTransfer.target_scenario_id.in_(scenario_ids))
        .where(BudgetTransfer.is_cancelled.is_(False))
        .group_by(
            BudgetTransfer.target_budget_item_id,
            BudgetTransfer.target_year,
            BudgetTransfer.target_month,
            BudgetTransfer.target_scenario_id,
        )
    ).all()
    for row in incoming_rows:
        key = _scope_key(
            row.target_budget_item_id,
            row.target_year,
            row.target_month,
            row.target_scenario_id,
        )
        if key in totals:
            totals[key]["transfer_in"] = float(row.amount or 0)

    outgoing_rows = session.exec(
        select(
            BudgetTransfer.source_budget_item_id,
            BudgetTransfer.source_year,
            BudgetTransfer.source_month,
            BudgetTransfer.source_scenario_id,
            func.coalesce(func.sum(BudgetTransfer.amount), 0).label("amount"),
        )
        .where(BudgetTransfer.source_budget_item_id.in_(budget_item_ids))
        .where(BudgetTransfer.source_year.in_(years))
        .where(BudgetTransfer.source_month.in_(months))
        .where(BudgetTransfer.source_scenario_id.in_(scenario_ids))
        .where(BudgetTransfer.is_cancelled.is_(False))
        .group_by(
            BudgetTransfer.source_budget_item_id,
            BudgetTransfer.source_year,
            BudgetTransfer.source_month,
            BudgetTransfer.source_scenario_id,
        )
    ).all()
    for row in outgoing_rows:
        key = _scope_key(
            row.source_budget_item_id,
            row.source_year,
            row.source_month,
            row.source_scenario_id,
        )
        if key in totals:
            totals[key]["transfer_out"] = float(row.amount or 0)

    allocated_rows = session.exec(
        select(
            ExpenseAllocation.budget_item_id,
            ExpenseAllocation.year,
            ExpenseAllocation.month,
            ExpenseAllocation.scenario_id,
            Expense.status,
            func.coalesce(func.sum(ExpenseAllocation.allocated_amount), 0).label("amount"),
        )
        .select_from(ExpenseAllocation)
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .where(ExpenseAllocation.budget_item_id.in_(budget_item_ids))
        .where(ExpenseAllocation.year.in_(years))
        .where(ExpenseAllocation.month.in_(months))
        .where(ExpenseAllocation.scenario_id.in_(scenario_ids))
        .where(Expense.status.in_([ExpenseStatus.RECORDED, ExpenseStatus.CANCELLED]))
        .where(Expense.is_out_of_budget.is_(False))
        .group_by(
            ExpenseAllocation.budget_item_id,
            ExpenseAllocation.year,
            ExpenseAllocation.month,
            ExpenseAllocation.scenario_id,
            Expense.status,
        )
    ).all()
    for row in allocated_rows:
        key = _scope_key(row.budget_item_id, row.year, row.month, row.scenario_id)
        if key not in totals:
            continue
        total_key = "cancelled" if row.status == ExpenseStatus.CANCELLED else "actual"
        totals[key][total_key] += float(row.amount or 0)

    expense_year = func.extract("year", Expense.expense_date)
    expense_month = func.extract("month", Expense.expense_date)
    fallback_rows = session.exec(
        select(
            Expense.budget_item_id,
            expense_year.label("year"),
            expense_month.label("month"),
            Expense.scenario_id,
            Expense.status,
            func.coalesce(func.sum(Expense.amount), 0).label("amount"),
        )
        .where(Expense.budget_item_id.in_(budget_item_ids))
        .where(Expense.scenario_id.in_(scenario_ids))
        .where(expense_year.in_(years))
        .where(expense_month.in_(months))
        .where(Expense.status.in_([ExpenseStatus.RECORDED, ExpenseStatus.CANCELLED]))
        .where(Expense.is_out_of_budget.is_(False))
        .where(~exists().where(ExpenseAllocation.expense_id == Expense.id))
        .group_by(
            Expense.budget_item_id,
            expense_year,
            expense_month,
            Expense.scenario_id,
            Expense.status,
        )
    ).all()
    for row in fallback_rows:
        if row.budget_item_id is None or row.scenario_id is None:
            continue
        key = _scope_key(row.budget_item_id, row.year, row.month, row.scenario_id)
        if key not in totals:
            continue
        total_key = "cancelled" if row.status == ExpenseStatus.CANCELLED else "actual"
        totals[key][total_key] += float(row.amount or 0)

    return totals


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
            Scenario.year.label("scenario_year"),
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
            PlanEntry.purchase_requested_by,
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


def _build_plan_read(
    row: dict,
    session: Session,
    scope_totals_by_key: dict[PlanScopeKey, PlanScopeTotals] | None = None,
) -> PlanEntryRead:
    budget_code = row.get("plan_budget_code") or row.get("budget_code")
    budget_name = row.get("budget_name") or budget_code
    capex_value = row.get("capex_opex") or row.get("map_capex_opex")
    asset_value = row.get("asset_type") or row.get("map_nitelik")
    amount = float(row.get("amount") or 0)
    if scope_totals_by_key is not None:
        scope_totals = scope_totals_by_key.get(_scope_key_from_row(row), _empty_scope_totals())
        transfer_in = scope_totals["transfer_in"]
        transfer_out = scope_totals["transfer_out"]
        scope_revised_amount = scope_totals["original"] + transfer_in - transfer_out
        actual_amount = scope_totals["actual"]
        scope_cancelled_amount = scope_totals["cancelled"]
        scope_unused_amount = scope_totals["unused"]
    else:
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
    scope_available_amount = calculate_budget_availability(
        scope_revised_amount, actual_amount, scope_unused_amount
    ).available_amount
    row_available_amount = calculate_budget_availability(
        revised_amount, actual_amount, row_unused_amount
    ).available_amount
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
        scenario_year=row.get("scenario_year"),
        is_carryover=bool(
            row.get("scenario_year") is not None
            and row.get("year") is not None
            and row.get("scenario_year") < row.get("year")
        ),
        source_year=(
            row.get("scenario_year")
            if row.get("scenario_year") is not None
            and row.get("year") is not None
            and row.get("scenario_year") < row.get("year")
            else None
        ),
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
        available_amount=row_available_amount,
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
        purchase_requested_by=row.get("purchase_requested_by"),
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
    effective_primary: bool = False,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[PlanEntryRead]:
    capex_filter = _normalize_capex_opex(capex_opex)
    query = _plan_read_query(capex_filter)
    if year is not None:
        query = query.where(PlanEntry.year == year)
    if scenario_id is not None:
        effective_ids = [scenario_id]
        selected_scenario = session.get(Scenario, scenario_id)
        if (
            effective_primary
            and selected_scenario
            and selected_scenario.year == year
            and selected_scenario.is_primary
        ):
            carryover_ids = session.exec(
                select(Scenario.id)
                .join(PlanEntry, PlanEntry.scenario_id == Scenario.id)
                .where(Scenario.is_primary.is_(True))
                .where(Scenario.year < year)
                .where(PlanEntry.year == year)
                .distinct()
            ).all()
            effective_ids.extend(value for value in carryover_ids if value != scenario_id)
        query = query.where(PlanEntry.scenario_id.in_(effective_ids))
    if budget_item_id is not None:
        query = query.where(PlanEntry.budget_item_id == budget_item_id)
    if month is not None:
        query = query.where(PlanEntry.month == month)
    if department is not None:
        query = query.where(PlanEntry.department == department)
    rows = session.exec(query).all()
    scope_totals_by_key = _collect_plan_scope_totals(session, rows)
    return [_build_plan_read(row._mapping, session, scope_totals_by_key) for row in rows]


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


def _remaining_plan_scopes(session: Session, plan: PlanEntry) -> list[tuple[PlanEntry, BudgetAvailableRead]]:
    rows = session.exec(
        select(PlanEntry)
        .where(PlanEntry.budget_item_id == plan.budget_item_id)
        .where(PlanEntry.scenario_id == plan.scenario_id)
        .order_by(PlanEntry.year, PlanEntry.month, PlanEntry.id)
    ).all()
    first_by_scope: dict[tuple[int, int], PlanEntry] = {}
    for row in rows:
        if (row.year, row.month) < (plan.year, plan.month):
            continue
        first_by_scope.setdefault((row.year, row.month), row)
    return [
        (
            row,
            _available_budget_for_scope(
                session, row.budget_item_id, row.year, row.month, row.scenario_id
            ),
        )
        for row in first_by_scope.values()
    ]


@router.get("/{plan_id}/unused-options", response_model=PlanUnusedOptionsRead)
def get_plan_unused_options(
    plan_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> PlanUnusedOptionsRead:
    plan = session.get(PlanEntry, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    scopes = _remaining_plan_scopes(session, plan)
    current = next(
        summary for row, summary in scopes if row.year == plan.year and row.month == plan.month
    )
    budget_item = session.get(BudgetItem, plan.budget_item_id)
    return PlanUnusedOptionsRead(
        plan_id=plan.id,
        budget_name=(budget_item.name if budget_item else plan.budget_code),
        total_budget=round(sum(item.revised_amount for _, item in scopes), 2),
        spent_amount=round(sum(item.actual_amount for _, item in scopes), 2),
        unused_amount=round(sum(item.unused_amount for _, item in scopes), 2),
        current_month_available=current.available_amount,
        total_remaining_available=round(sum(item.available_amount for _, item in scopes), 2),
        unused_reason=plan.unused_reason,
        unused_note=plan.unused_note,
    )


@router.post("/{plan_id}/unused-apply")
def apply_plan_unused_budget(
    plan_id: int,
    payload: PlanUnusedApply,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
):
    plan = session.get(PlanEntry, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if payload.mode == "reason_only":
        if float(plan.unused_amount or 0) <= 0:
            raise HTTPException(status_code=400, detail="Düzenlenecek kullanılmayacak tutarı bulunamadı.")
        plan.unused_reason = payload.reason
        plan.unused_note = payload.note
        plan.unused_updated_at = datetime.utcnow()
        plan.updated_at = datetime.utcnow()
        session.add(plan)
        session.commit()
        return {"detail": "Kullanılmayacak sebebi güncellendi.", "applied_amount": 0.0}
    scopes = _remaining_plan_scopes(session, plan)
    current_row, current = next(
        pair for pair in scopes if pair[0].year == plan.year and pair[0].month == plan.month
    )
    if payload.mode == "current_month":
        allocations = [(current_row, current.available_amount)]
    elif payload.mode == "all_remaining":
        allocations = [(row, summary.available_amount) for row, summary in scopes]
    else:
        requested = round(float(payload.amount or 0), 2)
        if requested <= 0:
            raise HTTPException(status_code=400, detail="Kullanılmayacak tutar 0'dan büyük olmalı.")
        if requested > current.available_amount + 0.005:
            logger.warning(
                "Kullanılmayacak tutar validasyonu başarısız",
                extra={
                    "plan_id": plan_id,
                    "planned_amount": current.revised_amount,
                    "valid_expense_total": current.actual_amount,
                    "existing_unused_amount": current.unused_amount,
                    "calculated_available_amount": current.available_amount,
                    "requested_unused_amount": requested,
                },
            )
            raise HTTPException(
                status_code=400,
                detail=(
                    "Kullanılmayacak tutar kalan kullanılabilir bütçeden fazla olamaz. "
                    f"Maksimum tutar: ${current.available_amount:,.2f}"
                ),
            )
        allocations = [(current_row, requested)]
    now = datetime.utcnow()
    applied = 0.0
    for row, amount in allocations:
        amount = round(float(amount or 0), 2)
        if amount <= 0:
            continue
        row.unused_amount = round(float(row.unused_amount or 0) + amount, 2)
        row.unused_reason = _clean_text(payload.reason) or row.unused_reason
        row.unused_note = _clean_text(payload.note) or row.unused_note
        row.unused_updated_at = now
        row.updated_at = now
        session.add(row)
        applied += amount
    if applied <= 0:
        raise HTTPException(status_code=400, detail="Kullanılabilir bütçe bulunamadı.")
    session.commit()
    return {"detail": "Kullanılmayacak bütçe kaydedildi.", "applied_amount": round(applied, 2)}


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
    other_unused = _unused_amount_for_scope(
        session,
        plan.budget_item_id,
        plan.year,
        plan.month,
        plan.scenario_id,
        exclude_plan_id=plan.id,
    )
    max_unused = calculate_budget_availability(revised, actual, other_unused).available_amount
    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kullanılmayacak tutar 0'dan büyük olmalı.",
        )
    if amount > max_unused + 0.005:
        logger.warning(
            "Kullanılmayacak tutar validasyonu başarısız",
            extra={
                "plan_id": plan_id,
                "planned_amount": float(revised or 0),
                "valid_expense_total": float(actual or 0),
                "existing_unused_amount": float(other_unused or 0),
                "calculated_available_amount": max_unused,
                "requested_unused_amount": amount,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Kullanılmayacak tutar kalan kullanılabilir bütçeden fazla olamaz. "
                f"Maksimum tutar: ${max_unused:,.2f}"
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
    if (
        any(update_data.get(field) is not None for field in ("unused_reason", "unused_note"))
        and float(plan.unused_amount or 0) <= 0
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kullanılmayacak sebebi yalnızca kullanılmayacak tutarı olan planlarda güncellenebilir.",
        )
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
