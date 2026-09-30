from datetime import date
from dataclasses import fields
from decimal import Decimal
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import exists, func
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
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
    BudgetReconciliationRead,
    DashboardAccrualItem,
    DashboardAccrualSummary,
    DashboardPurchaseAlertItem,
    DashboardPurchaseAlertResponse,
    DashboardKPI,
    DashboardResponse,
    DashboardSummary,
    NoSpendItem,
    OverBudgetItem,
    OverBudgetResponse,
    OverBudgetSummary,
    RiskyItem,
    SpendMonthlySummary,
    SpendTrendMonth,
    SpendTrendResponse,
)
from app.services.analytics import (
    BudgetReconciliationSummary,
    MonthlyAggregate,
    compute_budget_reconciliation_summary,
    compute_budget_item_overrun_statuses,
    compute_budget_item_statuses,
    compute_budget_scope_statuses,
    compute_monthly_summary,
    compute_negotiated_saving_statuses,
    compute_remaining_budget_statuses,
)
from app.services.unused_reason import UNUSED_REASON_ALIASES
from app.services.accruals import (
    accrual_allocations_for_year,
    accrual_reservations_for_source_year,
    carryover_totals,
    money,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _effective_primary_scenario_ids(
    session: Session,
    *,
    year: int,
    scenario_id: int | None,
    effective_primary: bool,
) -> list[int | None]:
    if not effective_primary or scenario_id is None:
        return [scenario_id]
    selected = session.get(Scenario, scenario_id)
    if not selected or selected.year != year or not selected.is_primary:
        return [scenario_id]
    carryover_ids = session.exec(
        select(Scenario.id)
        .join(PlanEntry, PlanEntry.scenario_id == Scenario.id)
        .where(Scenario.is_primary.is_(True))
        .where(Scenario.year < year)
        .where(PlanEntry.year == year)
        .distinct()
    ).all()
    return [scenario_id, *[value for value in carryover_ids if value != scenario_id]]


def _sum_reconciliations(
    values: list[BudgetReconciliationSummary],
) -> BudgetReconciliationSummary:
    return BudgetReconciliationSummary(**{
        field.name: round(sum(float(getattr(value, field.name) or 0) for value in values), 2)
        for field in fields(BudgetReconciliationSummary)
    })


def _sum_monthly(values: list[list[MonthlyAggregate]]) -> list[MonthlyAggregate]:
    grouped: dict[int, MonthlyAggregate] = {}
    for rows in values:
        for row in rows:
            current = grouped.setdefault(row.month, MonthlyAggregate(row.month, 0, 0))
            current.planned += row.planned
            current.actual += row.actual
            current.unused += row.unused
            current.negotiated_saving += row.negotiated_saving
            current.cancelled += row.cancelled
            current.cancelled_budget += row.cancelled_budget
    return [grouped[month] for month in sorted(grouped)]


def _parse_month_list(value: str | None) -> list[int] | None:
    if value is None:
        return None
    months: list[int] = []
    for raw in str(value).split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            month = int(raw)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Geçersiz ay filtresi.") from exc
        if month < 1 or month > 12:
            raise HTTPException(status_code=400, detail="Ay değeri 1 ile 12 arasında olmalı.")
        if month not in months:
            months.append(month)
    return sorted(months) if months else None


def _dashboard_month_range(
    *,
    month: int | None = None,
    month_list: str | None = None,
    default_all: bool = True,
) -> list[int]:
    parsed_months = _parse_month_list(month_list)
    if parsed_months:
        return parsed_months
    if month is not None:
        return [month]
    return list(range(1, 13)) if default_all else []


def _dashboard_accrual_summary(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_ids: list[int | None],
    budget_item_id: int | None,
    department: str | None,
    capex_opex: str | None,
) -> DashboardAccrualSummary:
    resolved_scenario_ids = [value for value in scenario_ids if value is not None]
    target_scenario_id = resolved_scenario_ids[0] if resolved_scenario_ids else None
    rows = accrual_allocations_for_year(
        session,
        year=year,
        budget_item_id=budget_item_id,
        scenario_id=target_scenario_id,
        department=department,
        capex_opex=capex_opex,
        include_source_year=True,
    )
    rows = [row for row in rows if row[0].month in month_range]
    items: list[DashboardAccrualItem] = []
    for allocation, accrual, budget_item, source_scenario in rows:
        amount = money(allocation.amount)
        used = money(allocation.used_amount)
        items.append(DashboardAccrualItem(
            accrual_id=accrual.id,
            allocation_id=allocation.id,
            budget_item_id=accrual.budget_item_id,
            budget_code=budget_item.code,
            budget_name=budget_item.name,
            source_scenario_id=accrual.source_scenario_id,
            scenario_name=source_scenario.name,
            department=accrual.department,
            capex_opex=budget_item.map_category,
            asset_type=budget_item.map_attribute,
            source_year=accrual.source_year,
            year=allocation.year,
            month=allocation.month,
            amount=amount,
            used_amount=used,
            remaining_amount=max(amount - used, Decimal("0.00")),
            is_carryover=accrual.source_year < allocation.year,
        ))
    totals = carryover_totals(rows)
    carryover_rows = [row for row in rows if row[1].source_year < row[0].year]
    carryover = carryover_totals(carryover_rows)
    return DashboardAccrualSummary(
        accrual_plan_amount=totals["total"],
        accrual_used_amount=totals["used"],
        accrual_remaining_amount=totals["remaining"],
        accrual_group_count=totals["item_count"],
        carryover_accrual_amount=carryover["total"],
        carryover_used_amount=carryover["used"],
        carryover_remaining_amount=carryover["remaining"],
        items=items,
    )


@router.get("/purchase-alert", response_model=DashboardPurchaseAlertResponse)
def get_purchase_alert(
    year: int | None = Query(default=None, description="Yıl (varsayılan: mevcut yıl)"),
    month: int | None = Query(default=None, ge=1, le=12, description="Ay (varsayılan: mevcut ay)"),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> DashboardPurchaseAlertResponse:
    today = date.today()
    selected_year = year or today.year
    selected_month = month or today.month
    prepared_status_exists = exists().where(
        PurchaseFormStatusExt.budget_code
        == func.coalesce(func.nullif(PlanEntry.budget_code, ""), BudgetItem.code)
    ).where(PurchaseFormStatusExt.year == PlanEntry.year).where(
        PurchaseFormStatusExt.month == PlanEntry.month
    ).where(PurchaseFormStatusExt.scenario_id == PlanEntry.scenario_id).where(
        PurchaseFormStatusExt.department == func.coalesce(PlanEntry.department, "")
    ).where(
        PurchaseFormStatusExt.is_form_prepared.is_(True)
    )

    query = (
        select(
            PlanEntry.id,
            BudgetItem.name,
            PlanEntry.department,
            PlanEntry.amount,
            PlanEntry.purchase_requested.label("requested"),
            PlanEntry.purchase_requested_at.label("requested_at"),
        )
        .join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id)
        .where(PlanEntry.year == selected_year)
        .where(PlanEntry.month == selected_month)
        .where(PlanEntry.amount > 0)
        .where(PlanEntry.unused_amount <= 0)
        .where(PlanEntry.purchase_requested.is_(False))
        .where(~prepared_status_exists)
        .order_by(PlanEntry.department, BudgetItem.name)
    )

    rows = session.exec(query).all()
    items = [
        DashboardPurchaseAlertItem(
            id=plan_id,
            title=title,
            department=department,
            amount=float(amount or 0),
            requested=bool(requested),
            requested_at=requested_at,
        )
        for plan_id, title, department, amount, requested, requested_at in rows
    ]
    done_count = sum(1 for item in items if item.requested)
    total_count = len(items)

    return DashboardPurchaseAlertResponse(
        year=selected_year,
        month=selected_month,
        total=total_count,
        pending=total_count - done_count,
        done=done_count,
        items=items,
    )


def _normalize_capex_opex(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    if normalized in {"capex", "opex"}:
        return normalized
    return None


def _resolve_month_range(month: int | None, months: int) -> list[int]:
    months = max(months, 1)
    end_month = month or date.today().month
    start_month = max(end_month - months + 1, 1)
    return list(range(start_month, end_month + 1))


def _department_budget_items_query(
    year: int,
    department: str,
    scenario_id: int | None = None,
):
    query = select(PlanEntry.budget_item_id).where(PlanEntry.year == year).where(
        PlanEntry.department == department
    )
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)
    return query


def _actual_month_code_map(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    budget_code: str | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> dict[tuple[int, str], float]:
    actual_map: dict[tuple[int, str], float] = {}
    allocation_query = (
        select(
            ExpenseAllocation.month,
            BudgetItem.code.label("budget_code"),
            func.sum(ExpenseAllocation.allocated_amount).label("actual_total"),
        )
        .select_from(ExpenseAllocation)
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .join(BudgetItem, BudgetItem.id == ExpenseAllocation.budget_item_id)
        .where(ExpenseAllocation.year == year)
        .where(ExpenseAllocation.month.in_(month_range))
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
        .where(Expense.funding_source != "carryover")
    )
    fallback_query = (
        select(
            func.extract("month", Expense.expense_date).label("month"),
            BudgetItem.code.label("budget_code"),
            func.sum(Expense.amount).label("actual_total"),
        )
        .select_from(Expense)
        .join(BudgetItem, BudgetItem.id == Expense.budget_item_id)
        .where(func.extract("year", Expense.expense_date) == year)
        .where(func.extract("month", Expense.expense_date).in_(month_range))
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
        .where(Expense.funding_source != "carryover")
        .where(~exists().where(ExpenseAllocation.expense_id == Expense.id))
    )
    if scenario_id is not None:
        allocation_query = allocation_query.where(ExpenseAllocation.scenario_id == scenario_id)
        fallback_query = fallback_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        allocation_query = allocation_query.where(ExpenseAllocation.budget_item_id == budget_item_id)
        fallback_query = fallback_query.where(Expense.budget_item_id == budget_item_id)
    if budget_code is not None:
        allocation_query = allocation_query.where(BudgetItem.code == budget_code)
        fallback_query = fallback_query.where(BudgetItem.code == budget_code)
    if capex_opex:
        allocation_query = allocation_query.where(func.lower(func.trim(BudgetItem.map_category)) == capex_opex)
        fallback_query = fallback_query.where(func.lower(func.trim(BudgetItem.map_category)) == capex_opex)
    if department is not None:
        department_query = _department_budget_items_query(year, department, scenario_id)
        allocation_query = allocation_query.where(ExpenseAllocation.budget_item_id.in_(department_query))
        fallback_query = fallback_query.where(Expense.budget_item_id.in_(department_query))

    for row in session.exec(
        allocation_query.group_by(ExpenseAllocation.month, BudgetItem.code)
    ).all():
        actual_map[(int(row.month), row.budget_code or "(boş)")] = (
            actual_map.get((int(row.month), row.budget_code or "(boş)"), 0.0)
            + float(row.actual_total or 0)
        )
    for row in session.exec(
        fallback_query.group_by(func.extract("month", Expense.expense_date), BudgetItem.code)
    ).all():
        actual_map[(int(row.month), row.budget_code or "(boş)")] = (
            actual_map.get((int(row.month), row.budget_code or "(boş)"), 0.0)
            + float(row.actual_total or 0)
        )
    return actual_map


def _actual_budget_item_map(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> dict[int, float]:
    actual_map: dict[int, float] = {}
    allocation_query = (
        select(
            ExpenseAllocation.budget_item_id,
            func.sum(ExpenseAllocation.allocated_amount).label("actual_total"),
        )
        .select_from(ExpenseAllocation)
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .where(ExpenseAllocation.year == year)
        .where(ExpenseAllocation.month.in_(month_range))
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
        .where(Expense.funding_source != "carryover")
        .group_by(ExpenseAllocation.budget_item_id)
    )
    fallback_query = (
        select(Expense.budget_item_id, func.sum(Expense.amount).label("actual_total"))
        .where(func.extract("year", Expense.expense_date) == year)
        .where(func.extract("month", Expense.expense_date).in_(month_range))
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
        .where(Expense.funding_source != "carryover")
        .where(~exists().where(ExpenseAllocation.expense_id == Expense.id))
        .group_by(Expense.budget_item_id)
    )
    if scenario_id is not None:
        allocation_query = allocation_query.where(ExpenseAllocation.scenario_id == scenario_id)
        fallback_query = fallback_query.where(Expense.scenario_id == scenario_id)
    if department is not None:
        department_query = _department_budget_items_query(year, department, scenario_id)
        allocation_query = allocation_query.where(ExpenseAllocation.budget_item_id.in_(department_query))
        fallback_query = fallback_query.where(Expense.budget_item_id.in_(department_query))
    if capex_opex:
        allocation_query = allocation_query.join(
            BudgetItem, BudgetItem.id == ExpenseAllocation.budget_item_id
        ).where(func.lower(func.trim(BudgetItem.map_category)) == capex_opex)
        fallback_query = fallback_query.join(
            BudgetItem, BudgetItem.id == Expense.budget_item_id
        ).where(func.lower(func.trim(BudgetItem.map_category)) == capex_opex)

    for row in session.exec(allocation_query).all():
        actual_map[row.budget_item_id] = actual_map.get(row.budget_item_id, 0.0) + float(
            row.actual_total or 0
        )
    for row in session.exec(fallback_query).all():
        actual_map[row.budget_item_id] = actual_map.get(row.budget_item_id, 0.0) + float(
            row.actual_total or 0
        )
    return actual_map


def _transfer_month_code_adjustments(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    budget_code: str | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> dict[tuple[int, str], float]:
    adjustment_map: dict[tuple[int, str], float] = {}
    transfer_query = select(BudgetTransfer).where(BudgetTransfer.is_cancelled.is_(False))
    if scenario_id is not None:
        transfer_query = transfer_query.where(
            (BudgetTransfer.source_scenario_id == scenario_id)
            | (BudgetTransfer.target_scenario_id == scenario_id)
        )
    transfers = session.exec(transfer_query).all()
    transfer_budget_ids = {
        transfer.source_budget_item_id
        for transfer in transfers
        if transfer.source_year == year and transfer.source_month in month_range
    } | {
        transfer.target_budget_item_id
        for transfer in transfers
        if transfer.target_year == year and transfer.target_month in month_range
    }
    if not transfer_budget_ids:
        return adjustment_map

    budget_item_map = {
        item.id: item
        for item in session.exec(select(BudgetItem).where(BudgetItem.id.in_(transfer_budget_ids))).all()
    }
    department_budget_ids: set[int] | None = None
    if department is not None:
        department_budget_ids = set(
            session.exec(_department_budget_items_query(year, department, scenario_id)).all()
        )

    def include_side(item_id: int, transfer_month: int, transfer_scenario_id: int) -> tuple[bool, str]:
        if transfer_month not in month_range:
            return False, ""
        if scenario_id is not None and transfer_scenario_id != scenario_id:
            return False, ""
        if budget_item_id is not None and item_id != budget_item_id:
            return False, ""
        if department_budget_ids is not None and item_id not in department_budget_ids:
            return False, ""
        item = budget_item_map.get(item_id)
        item_code = item.code if item and item.code else "(bos)"
        if budget_code is not None and item_code != budget_code:
            return False, ""
        if capex_opex and (not item or (item.map_category or "").strip().lower() != capex_opex):
            return False, ""
        return True, item_code

    for transfer in transfers:
        if transfer.source_year == year:
            included, item_code = include_side(
                transfer.source_budget_item_id,
                transfer.source_month,
                transfer.source_scenario_id,
            )
            if included:
                key = (transfer.source_month, item_code)
                adjustment_map[key] = adjustment_map.get(key, 0.0) - float(transfer.amount or 0)
        if transfer.target_year == year:
            included, item_code = include_side(
                transfer.target_budget_item_id,
                transfer.target_month,
                transfer.target_scenario_id,
            )
            if included:
                key = (transfer.target_month, item_code)
                adjustment_map[key] = adjustment_map.get(key, 0.0) + float(transfer.amount or 0)

    return adjustment_map


def _transfer_budget_item_adjustments(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> dict[int, float]:
    adjustment_map: dict[int, float] = {}
    transfer_query = select(BudgetTransfer).where(BudgetTransfer.is_cancelled.is_(False))
    if scenario_id is not None:
        transfer_query = transfer_query.where(
            (BudgetTransfer.source_scenario_id == scenario_id)
            | (BudgetTransfer.target_scenario_id == scenario_id)
        )
    transfers = session.exec(transfer_query).all()
    transfer_budget_ids = {
        transfer.source_budget_item_id
        for transfer in transfers
        if transfer.source_year == year and transfer.source_month in month_range
    } | {
        transfer.target_budget_item_id
        for transfer in transfers
        if transfer.target_year == year and transfer.target_month in month_range
    }
    if not transfer_budget_ids:
        return adjustment_map

    budget_item_map = {
        item.id: item
        for item in session.exec(select(BudgetItem).where(BudgetItem.id.in_(transfer_budget_ids))).all()
    }
    department_budget_ids: set[int] | None = None
    if department is not None:
        department_budget_ids = set(
            session.exec(_department_budget_items_query(year, department, scenario_id)).all()
        )

    def include_side(item_id: int, transfer_month: int, transfer_scenario_id: int) -> bool:
        if transfer_month not in month_range:
            return False
        if scenario_id is not None and transfer_scenario_id != scenario_id:
            return False
        if department_budget_ids is not None and item_id not in department_budget_ids:
            return False
        if capex_opex:
            item = budget_item_map.get(item_id)
            if not item or (item.map_category or "").strip().lower() != capex_opex:
                return False
        return True

    for transfer in transfers:
        if transfer.source_year == year and include_side(
            transfer.source_budget_item_id,
            transfer.source_month,
            transfer.source_scenario_id,
        ):
            adjustment_map[transfer.source_budget_item_id] = (
                adjustment_map.get(transfer.source_budget_item_id, 0.0) - float(transfer.amount or 0)
            )
        if transfer.target_year == year and include_side(
            transfer.target_budget_item_id,
            transfer.target_month,
            transfer.target_scenario_id,
        ):
            adjustment_map[transfer.target_budget_item_id] = (
                adjustment_map.get(transfer.target_budget_item_id, 0.0) + float(transfer.amount or 0)
            )

    return adjustment_map


def _calculate_item_based_monthly_totals(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    budget_code: str | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> list[SpendMonthlySummary]:
    plan_budget_code = func.coalesce(PlanEntry.budget_code, BudgetItem.code).label(
        "budget_code"
    )
    plan_query = (
        select(
            PlanEntry.month,
            plan_budget_code,
            func.sum(PlanEntry.amount).label("plan_total"),
            func.sum(PlanEntry.unused_amount).label("unused_total"),
        )
        .select_from(PlanEntry)
        .outerjoin(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id)
        .where(PlanEntry.year == year)
        .where(PlanEntry.month.in_(month_range))
    )
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        plan_query = plan_query.where(PlanEntry.budget_item_id == budget_item_id)
    if budget_code is not None:
        plan_query = plan_query.where(plan_budget_code == budget_code)
    if department is not None:
        plan_query = plan_query.where(PlanEntry.department == department)
    if capex_opex:
        plan_query = plan_query.where(func.lower(func.trim(BudgetItem.map_category)) == capex_opex)
    plan_rows = session.exec(plan_query.group_by(PlanEntry.month, plan_budget_code)).all()

    expense_query = (
        select(
            func.extract("month", Expense.expense_date).label("month"),
            BudgetItem.code.label("budget_code"),
            func.sum(Expense.amount).label("actual_total"),
        )
        .select_from(Expense)
        .join(BudgetItem, BudgetItem.id == Expense.budget_item_id)
        .where(func.extract("year", Expense.expense_date) == year)
        .where(func.extract("month", Expense.expense_date).in_(month_range))
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
        .where(Expense.funding_source != "carryover")
    )
    if scenario_id is not None:
        expense_query = expense_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        expense_query = expense_query.where(Expense.budget_item_id == budget_item_id)
    if budget_code is not None:
        expense_query = expense_query.where(BudgetItem.code == budget_code)
    if capex_opex:
        expense_query = expense_query.where(func.lower(func.trim(BudgetItem.map_category)) == capex_opex)
    if department is not None:
        department_budget_items_query = (
            select(PlanEntry.budget_item_id)
            .where(PlanEntry.year == year)
            .where(PlanEntry.department == department)
        )
        if scenario_id is not None:
            department_budget_items_query = department_budget_items_query.where(
                PlanEntry.scenario_id == scenario_id
            )
        expense_query = expense_query.where(
            Expense.budget_item_id.in_(department_budget_items_query)
        )
    expense_rows = session.exec(
        expense_query.group_by(func.extract("month", Expense.expense_date), BudgetItem.code)
    ).all()

    plan_map: dict[tuple[int, str], float] = {
        (int(row.month), row.budget_code or "(boş)"): float(row.plan_total or 0)
        for row in plan_rows
    }
    unused_map: dict[tuple[int, str], float] = {
        (int(row.month), row.budget_code or "(boş)"): float(row.unused_total or 0)
        for row in plan_rows
    }
    for key, amount in _transfer_month_code_adjustments(
        session,
        year=year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        budget_code=budget_code,
        department=department,
        capex_opex=capex_opex,
    ).items():
        plan_map[key] = plan_map.get(key, 0.0) + amount
    expense_map: dict[tuple[int, str], float] = {
        (int(row.month), row.budget_code or "(boş)"): float(row.actual_total or 0)
        for row in expense_rows
    }
    expense_map = _actual_month_code_map(
        session,
        year=year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        budget_code=budget_code,
        department=department,
        capex_opex=capex_opex,
    )
    cancelled_query = (
        select(
            func.extract("month", Expense.expense_date).label("month"),
            BudgetItem.code.label("budget_code"),
            func.sum(Expense.amount).label("cancelled_total"),
        )
        .select_from(Expense)
        .join(BudgetItem, BudgetItem.id == Expense.budget_item_id)
        .where(func.extract("year", Expense.expense_date) == year)
        .where(func.extract("month", Expense.expense_date).in_(month_range))
        .where(Expense.status == ExpenseStatus.CANCELLED)
        .where(Expense.is_out_of_budget.is_(False))
    )
    if scenario_id is not None:
        cancelled_query = cancelled_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        cancelled_query = cancelled_query.where(Expense.budget_item_id == budget_item_id)
    if budget_code is not None:
        cancelled_query = cancelled_query.where(BudgetItem.code == budget_code)
    if capex_opex:
        cancelled_query = cancelled_query.where(func.lower(func.trim(BudgetItem.map_category)) == capex_opex)
    if department is not None:
        department_budget_items_query = (
            select(PlanEntry.budget_item_id)
            .where(PlanEntry.year == year)
            .where(PlanEntry.department == department)
        )
        if scenario_id is not None:
            department_budget_items_query = department_budget_items_query.where(
                PlanEntry.scenario_id == scenario_id
            )
        cancelled_query = cancelled_query.where(
            Expense.budget_item_id.in_(department_budget_items_query)
        )
    cancelled_rows = session.exec(
        cancelled_query.group_by(func.extract("month", Expense.expense_date), BudgetItem.code)
    ).all()
    cancelled_map: dict[tuple[int, str], float] = {
        (int(row.month), row.budget_code or "(boş)"): float(row.cancelled_total or 0)
        for row in cancelled_rows
    }

    results: list[SpendMonthlySummary] = []
    for month_value in month_range:
        plan_total = 0.0
        actual_total = 0.0
        over_total = 0.0
        remaining_total = 0.0
        unused_total = 0.0
        within_plan_total = 0.0
        item_codes = {
            budget_code
            for (month_key, budget_code) in plan_map.keys()
            | expense_map.keys()
            | unused_map.keys()
            | cancelled_map.keys()
            if month_key == month_value
        }
        for budget_code in item_codes:
            plan_item = plan_map.get((month_value, budget_code), 0.0)
            actual_item = expense_map.get((month_value, budget_code), 0.0)
            unused_item = unused_map.get((month_value, budget_code), 0.0)
            cancelled_item = cancelled_map.get((month_value, budget_code), 0.0)
            plan_total += plan_item
            actual_total += actual_item
            unused_total += unused_item
            over_total += max(actual_item - plan_item, 0)
            remaining_total += max(plan_item - actual_item - unused_item - cancelled_item, 0)
            within_plan_total += min(actual_item, plan_item)

        results.append(
            SpendMonthlySummary(
                month=month_value,
                plan_total=plan_total,
                actual_total=actual_total,
                within_plan_total=within_plan_total,
                over_total=over_total,
                remaining_total=remaining_total,
                unused_total=unused_total,
            )
        )
    return results


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    year: int = Query(..., description="Year to summarize"),
    scenario_id: int | None = Query(default=None),
    month: int | None = Query(default=None),
    month_list: str | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    effective_primary: bool = False,
    session: Session = Depends(get_db_session),
    _ = Depends(get_current_user),
) -> DashboardResponse:
    if year is None:
        raise HTTPException(status_code=400, detail="Year is required")
    capex_filter = _normalize_capex_opex(capex_opex)
    month_range = _dashboard_month_range(month=month, month_list=month_list)
    effective_scenario_ids = _effective_primary_scenario_ids(
        session,
        year=year,
        scenario_id=scenario_id,
        effective_primary=effective_primary,
    )
    monthly = _sum_monthly([
        compute_monthly_summary(
            session,
            year,
            effective_scenario_id,
            budget_item_id,
            month_range[0] if len(month_range) == 1 else None,
            department,
            capex_filter,
        )
        for effective_scenario_id in effective_scenario_ids
    ])
    monthly = [item for item in monthly if item.month in month_range]
    reconciliations = [
        compute_budget_reconciliation_summary(
            session,
            year=year,
            month_range=month_range,
            scenario_id=effective_scenario_id,
            budget_item_id=budget_item_id,
            department=department,
            capex_opex=capex_filter,
            monthly_overrun=budget_item_id is not None or month is not None or bool(month_list),
        )
        for effective_scenario_id in effective_scenario_ids
    ]
    reconciliation = _sum_reconciliations(reconciliations)
    new_budget_plan_amount = reconciliations[0].total_plan_amount
    accruals = _dashboard_accrual_summary(
        session,
        year=year,
        month_range=month_range,
        scenario_ids=effective_scenario_ids,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_filter,
    )
    reservation_rows = accrual_reservations_for_source_year(
        session,
        source_year=year,
        source_months=month_range,
        budget_item_id=budget_item_id,
        scenario_ids=effective_scenario_ids,
        department=department,
        capex_opex=capex_filter,
    )
    accrual_reserve_by_category = {"capex": 0.0, "opex": 0.0, "unclassified": 0.0}
    for allocation, _accrual, item in reservation_rows:
        key = (item.map_category or "").strip().lower()
        category = key if key in {"capex", "opex"} else "unclassified"
        accrual_reserve_by_category[category] += float(max(
            money(allocation.amount) - money(allocation.used_amount),
            money(0),
        ))
    accrual_reserve_total = round(sum(accrual_reserve_by_category.values()), 2)
    carryover_accrual_total = float(accruals.carryover_accrual_amount)
    carryover_accrual_used = float(accruals.carryover_used_amount)
    carryover_accrual_remaining = float(accruals.carryover_remaining_amount)
    carryover_plan_amount = carryover_accrual_total
    total_plan = round(reconciliation.total_plan_amount, 2)
    total_actual = round(reconciliation.realized_plan_inside_amount + carryover_accrual_used, 2)
    total_remaining = round(reconciliation.remaining_available_amount, 2)
    total_overrun = round(reconciliation.overrun_amount, 2)
    total_remaining = round(max(total_remaining - accrual_reserve_total, 0.0), 2)
    total_negotiated_saving = reconciliation.negotiated_saving_amount
    total_unused = reconciliation.other_saving_amount
    total_other_saving = total_unused
    total_combined_saving = total_negotiated_saving + total_other_saving
    total_cancelled = reconciliation.canceled_budget_amount
    accrual_used_by_category = {"capex": 0.0, "opex": 0.0, "unclassified": 0.0}
    for item in accruals.items:
        if not item.is_carryover:
            continue
        key = (item.capex_opex or "").strip().lower()
        category = key if key in {"capex", "opex"} else "unclassified"
        accrual_used_by_category[category] += float(item.used_amount)
    category_metrics = {
        category: (
            round(getattr(reconciliation, f"{category}_realized_plan_inside_amount") + accrual_used_by_category[category], 2),
            round(getattr(reconciliation, f"{category}_remaining_available_amount"), 2),
            round(getattr(reconciliation, f"{category}_overrun_amount"), 2),
        )
        for category in ("capex", "opex", "unclassified")
    }
    category_metrics = {
        category: (
            values[0],
            round(max(values[1] - accrual_reserve_by_category[category], 0.0), 2),
            values[2],
        )
        for category, values in category_metrics.items()
    }
    return DashboardResponse(
        kpi=DashboardKPI(
            total_plan=total_plan,
            total_actual=total_actual,
            total_remaining=total_remaining,
            total_saving=total_negotiated_saving,
            total_overrun=total_overrun,
            total_unused=total_unused,
            total_negotiated_saving=total_negotiated_saving,
            total_other_saving=total_other_saving,
            total_combined_saving=total_combined_saving,
            total_cancelled=total_cancelled,
            capex_total_plan_amount=reconciliation.capex_total_plan_amount,
            opex_total_plan_amount=reconciliation.opex_total_plan_amount,
            unclassified_total_plan_amount=reconciliation.unclassified_total_plan_amount,
            realized_plan_inside_amount=total_actual,
            capex_realized_plan_inside_amount=category_metrics["capex"][0],
            opex_realized_plan_inside_amount=category_metrics["opex"][0],
            unclassified_realized_plan_inside_amount=category_metrics["unclassified"][0],
            remaining_available_amount=total_remaining,
            capex_remaining_available_amount=category_metrics["capex"][1],
            opex_remaining_available_amount=category_metrics["opex"][1],
            unclassified_remaining_available_amount=category_metrics["unclassified"][1],
            negotiated_saving_amount=reconciliation.negotiated_saving_amount,
            capex_negotiated_saving_amount=reconciliation.capex_negotiated_saving_amount,
            opex_negotiated_saving_amount=reconciliation.opex_negotiated_saving_amount,
            unclassified_negotiated_saving_amount=(
                reconciliation.unclassified_negotiated_saving_amount
            ),
            other_saving_amount=reconciliation.other_saving_amount,
            capex_other_saving_amount=reconciliation.capex_other_saving_amount,
            opex_other_saving_amount=reconciliation.opex_other_saving_amount,
            unclassified_other_saving_amount=reconciliation.unclassified_other_saving_amount,
            canceled_budget_amount=reconciliation.canceled_budget_amount,
            capex_canceled_budget_amount=reconciliation.capex_canceled_budget_amount,
            opex_canceled_budget_amount=reconciliation.opex_canceled_budget_amount,
            unclassified_canceled_budget_amount=(
                reconciliation.unclassified_canceled_budget_amount
            ),
            overrun_amount=total_overrun,
            capex_overrun_amount=category_metrics["capex"][2],
            opex_overrun_amount=category_metrics["opex"][2],
            unclassified_overrun_amount=category_metrics["unclassified"][2],
            budget_outside_amount=reconciliation.budget_outside_amount,
            capex_budget_outside_amount=reconciliation.capex_budget_outside_amount,
            opex_budget_outside_amount=reconciliation.opex_budget_outside_amount,
            unclassified_budget_outside_amount=(
                reconciliation.unclassified_budget_outside_amount
            ),
            reconciliation_total=reconciliation.reconciliation_total,
            capex_reconciliation_total=reconciliation.capex_reconciliation_total,
            opex_reconciliation_total=reconciliation.opex_reconciliation_total,
            unclassified_reconciliation_total=(
                reconciliation.unclassified_reconciliation_total
            ),
            reconciliation_difference=reconciliation.reconciliation_difference,
            capex_reconciliation_difference=reconciliation.capex_reconciliation_difference,
            opex_reconciliation_difference=reconciliation.opex_reconciliation_difference,
            unclassified_reconciliation_difference=(
                reconciliation.unclassified_reconciliation_difference
            ),
            new_budget_plan_amount=new_budget_plan_amount,
            carryover_plan_amount=carryover_plan_amount,
            effective_plan_amount=total_plan,
            accrual_plan_amount=float(accruals.accrual_plan_amount),
            accrual_group_count=accruals.accrual_group_count,
            carryover_accrual_amount=float(accruals.carryover_accrual_amount),
            accrual_reserve_amount=accrual_reserve_total,
            capex_accrual_reserve_amount=round(accrual_reserve_by_category["capex"], 2),
            opex_accrual_reserve_amount=round(accrual_reserve_by_category["opex"], 2),
            unclassified_accrual_reserve_amount=round(
                accrual_reserve_by_category["unclassified"], 2
            ),
        ),
        monthly=[
            DashboardSummary(
                month=item.month,
                planned=item.planned,
                actual=item.actual,
                saving=item.saving,
                remaining=item.remaining,
                unused=item.unused,
                cancelled=item.cancelled,
            )
            for item in monthly
        ],
        reconciliation=BudgetReconciliationRead(
            total_plan_amount=total_plan,
            capex_total_plan_amount=reconciliation.capex_total_plan_amount,
            opex_total_plan_amount=reconciliation.opex_total_plan_amount,
            unclassified_total_plan_amount=reconciliation.unclassified_total_plan_amount,
            realized_plan_inside_amount=reconciliation.realized_plan_inside_amount,
            capex_realized_plan_inside_amount=reconciliation.capex_realized_plan_inside_amount,
            opex_realized_plan_inside_amount=reconciliation.opex_realized_plan_inside_amount,
            unclassified_realized_plan_inside_amount=reconciliation.unclassified_realized_plan_inside_amount,
            remaining_available_amount=total_remaining,
            capex_remaining_available_amount=category_metrics["capex"][1],
            opex_remaining_available_amount=category_metrics["opex"][1],
            unclassified_remaining_available_amount=category_metrics["unclassified"][1],
            negotiated_saving_amount=reconciliation.negotiated_saving_amount,
            capex_negotiated_saving_amount=reconciliation.capex_negotiated_saving_amount,
            opex_negotiated_saving_amount=reconciliation.opex_negotiated_saving_amount,
            unclassified_negotiated_saving_amount=(
                reconciliation.unclassified_negotiated_saving_amount
            ),
            other_saving_amount=reconciliation.other_saving_amount,
            capex_other_saving_amount=reconciliation.capex_other_saving_amount,
            opex_other_saving_amount=reconciliation.opex_other_saving_amount,
            unclassified_other_saving_amount=reconciliation.unclassified_other_saving_amount,
            canceled_budget_amount=reconciliation.canceled_budget_amount,
            capex_canceled_budget_amount=reconciliation.capex_canceled_budget_amount,
            opex_canceled_budget_amount=reconciliation.opex_canceled_budget_amount,
            unclassified_canceled_budget_amount=(
                reconciliation.unclassified_canceled_budget_amount
            ),
            accrual_reserve_amount=accrual_reserve_total,
            capex_accrual_reserve_amount=round(accrual_reserve_by_category["capex"], 2),
            opex_accrual_reserve_amount=round(accrual_reserve_by_category["opex"], 2),
            unclassified_accrual_reserve_amount=round(
                accrual_reserve_by_category["unclassified"], 2
            ),
            overrun_amount=total_overrun,
            capex_overrun_amount=category_metrics["capex"][2],
            opex_overrun_amount=category_metrics["opex"][2],
            unclassified_overrun_amount=category_metrics["unclassified"][2],
            budget_outside_amount=reconciliation.budget_outside_amount,
            capex_budget_outside_amount=reconciliation.capex_budget_outside_amount,
            opex_budget_outside_amount=reconciliation.opex_budget_outside_amount,
            unclassified_budget_outside_amount=(
                reconciliation.unclassified_budget_outside_amount
            ),
            reconciliation_total=reconciliation.reconciliation_total,
            capex_reconciliation_total=reconciliation.capex_reconciliation_total,
            opex_reconciliation_total=reconciliation.opex_reconciliation_total,
            unclassified_reconciliation_total=(
                reconciliation.unclassified_reconciliation_total
            ),
            reconciliation_difference=reconciliation.reconciliation_difference,
            capex_reconciliation_difference=reconciliation.capex_reconciliation_difference,
            opex_reconciliation_difference=reconciliation.opex_reconciliation_difference,
            unclassified_reconciliation_difference=(
                reconciliation.unclassified_reconciliation_difference
            ),
        ),
        accruals=accruals,
    )


def _budget_item_aggregates(
    session: Session,
    year: int,
    month: int | None = None,
    month_range: list[int] | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
):
    resolved_month_range = (
        sorted(set(month_range))
        if month_range
        else list(range(1, (month or 12) + 1))
    )
    plan_query = select(
        PlanEntry.budget_item_id,
        func.sum(PlanEntry.amount).label("plan_total"),
    ).where(PlanEntry.year == year)

    if capex_opex in {"capex", "opex"}:
        plan_query = plan_query.join(
            BudgetItem, BudgetItem.id == PlanEntry.budget_item_id
        ).where(func.lower(func.trim(BudgetItem.map_category)) == capex_opex)

    if department is not None:
        plan_query = plan_query.where(PlanEntry.department == department)

    if month_range:
        plan_query = plan_query.where(PlanEntry.month.in_(resolved_month_range))
    elif month is not None:
        plan_query = plan_query.where(PlanEntry.month <= month)

    plan_query = plan_query.group_by(PlanEntry.budget_item_id).subquery()

    expense_query = (
        select(
            Expense.budget_item_id,
            func.sum(Expense.amount).label("actual_total"),
        )
        .where(func.extract("year", Expense.expense_date) == year)
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
        .where(Expense.funding_source != "carryover")
    )

    if capex_opex in {"capex", "opex"}:
        expense_query = expense_query.join(
            BudgetItem, BudgetItem.id == Expense.budget_item_id
        ).where(func.lower(func.trim(BudgetItem.map_category)) == capex_opex)

    if department is not None:
        department_budget_items_query = (
            select(PlanEntry.budget_item_id)
            .where(PlanEntry.year == year)
            .where(PlanEntry.department == department)
        )
        expense_query = expense_query.where(
            Expense.budget_item_id.in_(department_budget_items_query)
        )

    if month_range:
        expense_query = expense_query.where(
            func.extract("month", Expense.expense_date).in_(resolved_month_range)
        )
    elif month is not None:
        expense_query = expense_query.where(func.extract("month", Expense.expense_date) <= month)

    expense_query = expense_query.group_by(Expense.budget_item_id).subquery()

    query = (
        select(
            BudgetItem.id.label("budget_item_id"),
            BudgetItem.code,
            BudgetItem.name,
            func.coalesce(plan_query.c.plan_total, 0).label("plan"),
            func.coalesce(expense_query.c.actual_total, 0).label("actual"),
        )
        .join(plan_query, BudgetItem.id == plan_query.c.budget_item_id)
        .join(expense_query, BudgetItem.id == expense_query.c.budget_item_id, isouter=True)
    )

    rows = session.exec(query).all()
    actual_map = _actual_budget_item_map(
        session,
        year=year,
        month_range=resolved_month_range,
        department=department,
        capex_opex=capex_opex,
    )
    transfer_map = _transfer_budget_item_adjustments(
        session,
        year=year,
        month_range=resolved_month_range,
        department=department,
        capex_opex=capex_opex,
    )
    return [
        SimpleNamespace(
            budget_item_id=row.budget_item_id,
            code=row.code,
            name=row.name,
            plan=float(row.plan or 0) + float(transfer_map.get(row.budget_item_id, 0.0)),
            actual=actual_map.get(row.budget_item_id, 0.0),
        )
        for row in rows
    ]


@router.get("/risky-items", response_model=list[RiskyItem])
def get_risky_budget_items(
    year: int,
    scenario_id: int | None = Query(default=None),
    month: int | None = None,
    month_list: str | None = Query(default=None),
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    effective_primary: bool = False,
    session: Session = Depends(get_db_session),
    _ = Depends(get_current_user),
) -> list[RiskyItem]:
    month_range = _parse_month_list(month_list) or list(range(1, (month or 12) + 1))
    effective_ids = _effective_primary_scenario_ids(
        session,
        year=year,
        scenario_id=scenario_id,
        effective_primary=effective_primary,
    )
    carryover_by_budget_item: dict[int, float] = {}
    for allocation, accrual, *_ in accrual_allocations_for_year(
        session,
        year=year,
        scenario_id=effective_ids[0] if effective_ids else scenario_id,
        department=department,
        capex_opex=_normalize_capex_opex(capex_opex),
    ):
        if allocation.month in month_range:
            carryover_by_budget_item[accrual.budget_item_id] = (
                carryover_by_budget_item.get(accrual.budget_item_id, 0.0)
                + float(allocation.amount or 0)
            )
    remaining_statuses = [
        row
        for effective_id in effective_ids
        for row in compute_remaining_budget_statuses(
            session,
            year=year,
            month_range=month_range,
            scenario_id=effective_id,
            department=department,
            capex_opex=_normalize_capex_opex(capex_opex),
        )
    ]
    overrun_statuses = [
        row
        for effective_id in effective_ids
        for row in compute_budget_item_overrun_statuses(
            session,
            year=year,
            month_range=month_range,
            scenario_id=effective_id,
            department=department,
            capex_opex=_normalize_capex_opex(capex_opex),
        )
    ]
    items: list[RiskyItem] = []

    for row in [*remaining_statuses, *overrun_statuses]:
        plan = float(row.revised_plan or 0) + carryover_by_budget_item.get(
            row.budget_item_id, 0.0
        )
        actual = float(row.actual or 0)
        if plan <= 0:
            continue

        ratio = actual / plan
        if ratio >= 0.8:
            items.append(
                RiskyItem(
                    budget_item_id=row.budget_item_id,
                    budget_code=row.budget_code,
                    budget_name=row.budget_name,
                    plan=plan,
                    actual=actual,
                    ratio=ratio,
                )
            )

    items.sort(key=lambda x: x.ratio, reverse=True)
    return items[:5]


@router.get("/no-spend-items", response_model=list[NoSpendItem])
def get_no_spend_items(
    year: int,
    month: int | None = None,
    month_list: str | None = Query(default=None),
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _ = Depends(get_current_user),
) -> list[NoSpendItem]:
    month_range = _parse_month_list(month_list) or list(range(1, (month or 12) + 1))
    rows = compute_remaining_budget_statuses(
        session,
        year=year,
        month_range=month_range,
        department=department,
        capex_opex=_normalize_capex_opex(capex_opex),
    )
    items: list[NoSpendItem] = []

    for row in rows:
        plan = float(row.revised_plan or 0)
        actual = float(row.actual or 0)
        if plan > 0 and actual == 0:
            items.append(
                NoSpendItem(
                    budget_item_id=row.budget_item_id,
                    budget_code=row.code,
                    budget_name=row.name,
                    plan=plan,
                )
            )

    return items[:10]


def _unused_budget_items(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> list[OverBudgetItem]:
    scope_map = compute_budget_scope_statuses(
        session,
        year=year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_opex,
    )
    query = (
        select(PlanEntry, BudgetItem)
        .join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id)
        .where(PlanEntry.year == year)
        .where(PlanEntry.month.in_(month_range))
        .where(PlanEntry.unused_amount > 0)
    )
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        query = query.where(PlanEntry.budget_item_id == budget_item_id)
    if department is not None:
        query = query.where(PlanEntry.department == department)
    if capex_opex:
        query = query.where(func.lower(func.trim(BudgetItem.map_category)) == capex_opex)

    items: list[OverBudgetItem] = []
    for plan, budget_item in session.exec(query.order_by(PlanEntry.month, BudgetItem.name)).all():
        scope = scope_map.get((plan.budget_item_id, plan.year, plan.month, plan.scenario_id))
        revised_plan = float(scope.revised_plan if scope else plan.amount or 0)
        actual = float(scope.actual if scope else 0)
        unused_amount = float(plan.unused_amount or 0)
        available_amount = max(
            revised_plan
            - actual
            - float(scope.unused_amount if scope else unused_amount)
            - float(scope.cancelled_amount if scope else 0),
            0,
        )
        items.append(
            OverBudgetItem(
                budget_item_id=plan.budget_item_id,
                budget_code=plan.budget_code or budget_item.code,
                budget_name=budget_item.name,
                months=[plan.month],
                capex_opex=(
                    (budget_item.map_category or "").strip().lower().capitalize()
                    if (budget_item.map_category or "").strip().lower() in {"capex", "opex"}
                    else budget_item.map_category
                ),
                asset_type=budget_item.map_attribute,
                department=plan.department,
                plan=revised_plan,
                actual=actual,
                over=unused_amount,
                over_pct=(unused_amount / revised_plan * 100) if revised_plan > 0 else 0,
                unused_amount=unused_amount,
                available_amount=available_amount,
                reason=plan.unused_reason,
                note=plan.unused_note,
                unused_updated_at=plan.unused_updated_at,
                year=plan.year,
                month=plan.month,
                scenario=plan.scenario_id,
            )
        )
    return items


@router.get("/overbudget", response_model=OverBudgetResponse)
def get_overbudget(
    year: int | None = Query(default=None),
    scenario_id: int | None = Query(default=None),
    months: int | None = Query(default=None, ge=1, le=12),
    month: int | None = Query(default=None, ge=1, le=12),
    month_list: str | None = Query(default=None),
    start_month: int | None = Query(default=None, ge=1, le=12),
    end_month: int | None = Query(default=None, ge=1, le=12),
    budget_item_id: int | None = Query(default=None),
    budget_code: str | None = Query(default=None),
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _ = Depends(get_current_user),
) -> OverBudgetResponse:
    resolved_year = year
    if resolved_year is None and scenario_id is not None:
        scenario = session.get(Scenario, scenario_id)
        resolved_year = scenario.year if scenario else None
    if resolved_year is None:
        resolved_year = date.today().year

    parsed_months = _parse_month_list(month_list)
    if parsed_months:
        month_range = parsed_months
    elif month is not None:
        month_range = [month]
    elif start_month is not None or end_month is not None:
        resolved_start_month = start_month or 1
        resolved_end_month = end_month or 12
        if resolved_start_month > resolved_end_month:
            raise HTTPException(
                status_code=400,
                detail="Başlangıç ayı bitiş ayından büyük olamaz.",
            )
        month_range = list(range(resolved_start_month, resolved_end_month + 1))
    elif months is not None:
        month_range = _resolve_month_range(None, months)
    else:
        month_range = list(range(1, 13))
    capex_filter = _normalize_capex_opex(capex_opex)

    if budget_item_id is None and budget_code:
        budget_item_id = session.exec(
            select(BudgetItem.id).where(BudgetItem.code == budget_code)
        ).first()

    carryover_by_budget_item: dict[int, float] = {}
    for allocation, accrual, *_ in accrual_allocations_for_year(
        session,
        year=resolved_year,
        budget_item_id=budget_item_id,
        scenario_id=scenario_id,
        department=department,
        capex_opex=capex_filter,
    ):
        if allocation.month in month_range:
            carryover_by_budget_item[accrual.budget_item_id] = (
                carryover_by_budget_item.get(accrual.budget_item_id, 0.0)
                + float(allocation.amount or 0)
            )

    statuses = compute_budget_item_statuses(
        session,
        year=resolved_year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_filter,
    )
    saving_statuses = compute_negotiated_saving_statuses(
        session,
        year=resolved_year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_filter,
    )
    reconciliation = compute_budget_reconciliation_summary(
        session,
        year=resolved_year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_filter,
        monthly_overrun=budget_item_id is not None or month is not None or bool(month_list),
    )
    remaining_statuses = compute_remaining_budget_statuses(
        session,
        year=resolved_year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_filter,
    )

    def serialize_status(item, *, include_carryover: bool = False) -> OverBudgetItem:
        plan = float(item.revised_plan or 0)
        if include_carryover:
            plan += carryover_by_budget_item.get(item.budget_item_id, 0.0)
        over = max(float(item.actual or 0) - plan, 0.0) if include_carryover else item.difference
        over_pct = (
            over / plan * 100
            if plan > 0
            else 0.0
        )
        return OverBudgetItem(
            budget_item_id=item.budget_item_id,
            budget_code=item.budget_code,
            budget_name=item.budget_name,
            months=item.months,
            capex_opex=item.capex_opex,
            asset_type=item.asset_type,
            department=item.department,
            plan=plan,
            actual=item.actual,
            over=over,
            over_pct=over_pct,
            year=resolved_year,
            month=item.months[0] if len(item.months) == 1 else None,
            scenario=item.scenario_id,
        )

    overrun_statuses = compute_budget_item_overrun_statuses(
        session,
        year=resolved_year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_filter,
        monthly_scope=budget_item_id is not None or month is not None or bool(month_list),
    )

    items = [
        serialized
        for item in overrun_statuses
        if (serialized := serialize_status(item, include_carryover=True)).over > 0
    ]
    saving_items = [serialize_status(item) for item in saving_statuses]
    remaining_items = [serialize_status(item) for item in remaining_statuses]
    reservation_by_scope: dict[tuple[int, int | None], float] = {}
    for allocation, accrual, _item in accrual_reservations_for_source_year(
        session,
        source_year=resolved_year,
        source_months=month_range,
        budget_item_id=budget_item_id,
        scenario_ids=[scenario_id],
        department=department,
        capex_opex=capex_filter,
    ):
        key = (accrual.budget_item_id, accrual.source_scenario_id)
        reservation_by_scope[key] = reservation_by_scope.get(key, 0.0) + float(max(
            money(allocation.amount) - money(allocation.used_amount),
            money(0),
        ))
    canonical_remaining_items: list[OverBudgetItem] = []
    for item in remaining_items:
        key = (item.budget_item_id, item.scenario)
        available = round(max(float(item.over) - reservation_by_scope.get(key, 0.0), 0.0), 2)
        if available <= 0.005:
            continue
        canonical_remaining_items.append(item.copy(update={"over": available}))
    remaining_items = canonical_remaining_items
    all_unused_items = _unused_budget_items(
        session,
        year=resolved_year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_filter,
    )
    cancelled_items = [
        item
        for item in all_unused_items
        if UNUSED_REASON_ALIASES.get(item.reason, item.reason) == "purchase_cancelled"
    ]
    unused_items = [
        item
        for item in all_unused_items
        if UNUSED_REASON_ALIASES.get(item.reason, item.reason) != "purchase_cancelled"
    ]
    items.sort(key=lambda item: item.over, reverse=True)
    saving_items.sort(key=lambda item: item.over, reverse=True)
    remaining_items.sort(key=lambda item: item.over, reverse=True)
    unused_items.sort(key=lambda item: item.unused_amount, reverse=True)
    cancelled_items.sort(key=lambda item: item.unused_amount, reverse=True)
    canonical_cancelled_remaining = float(reconciliation.canceled_budget_amount)
    canonical_cancelled_items: list[OverBudgetItem] = []
    for item in cancelled_items:
        canonical_amount = min(float(item.unused_amount), canonical_cancelled_remaining)
        if canonical_amount <= 0.005:
            continue
        canonical_cancelled_items.append(
            item.copy(update={"unused_amount": canonical_amount, "over": canonical_amount})
        )
        canonical_cancelled_remaining = round(
            canonical_cancelled_remaining - canonical_amount, 2
        )
    over_total = sum(item.over for item in items)
    unused_total = reconciliation.other_saving_amount
    negotiated_saving_total = reconciliation.negotiated_saving_amount
    negotiated_saving_item_count = len(saving_statuses)
    total_saving_total = negotiated_saving_total + unused_total
    return OverBudgetResponse(
        summary=OverBudgetSummary(
            over_total=over_total,
            over_item_count=len(items),
            total_revised_plan=sum(item.plan for item in items),
            total_actual=sum(item.actual for item in items),
            total_valid_actual=sum(item.overall_actual for item in statuses),
            remaining_total=round(sum(item.over for item in remaining_items), 2),
            remaining_item_count=len(remaining_items),
            saving_total=negotiated_saving_total,
            saving_item_count=negotiated_saving_item_count,
            unused_total=unused_total,
            unused_item_count=len(unused_items),
            negotiated_saving_total=negotiated_saving_total,
            negotiated_saving_item_count=negotiated_saving_item_count,
            other_saving_total=unused_total,
            other_saving_item_count=len(unused_items),
            total_saving_total=total_saving_total,
            total_saving_item_count=negotiated_saving_item_count + len(unused_items),
        ),
        items=items,
        saving_items=saving_items,
        remaining_items=remaining_items,
        unused_items=unused_items,
        cancelled_items=canonical_cancelled_items,
    )


@router.get("/spend_last_months", response_model=list[SpendMonthlySummary])
def get_spend_last_months(
    year: int | None = Query(default=None),
    scenario_id: int | None = Query(default=None),
    months: int = Query(default=3, ge=1, le=12),
    month: int | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _ = Depends(get_current_user),
) -> list[SpendMonthlySummary]:
    resolved_year = year
    if resolved_year is None and scenario_id is not None:
        scenario = session.get(Scenario, scenario_id)
        resolved_year = scenario.year if scenario else None
    if resolved_year is None:
        resolved_year = date.today().year

    month_range = _resolve_month_range(month, months)
    capex_filter = _normalize_capex_opex(capex_opex)

    return _calculate_item_based_monthly_totals(
        session,
        year=resolved_year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_filter,
    )


@router.get("/trend", response_model=SpendTrendResponse)
def get_spend_trend(
    year: int | None = Query(default=None),
    scenario_id: int | None = Query(default=None),
    month: int | None = Query(default=None, ge=1, le=12),
    month_list: str | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    budget_code: str | None = Query(default=None),
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _ = Depends(get_current_user),
) -> SpendTrendResponse:
    resolved_year = year
    if resolved_year is None and scenario_id is not None:
        scenario = session.get(Scenario, scenario_id)
        resolved_year = scenario.year if scenario else None
    if resolved_year is None:
        resolved_year = date.today().year

    capex_filter = _normalize_capex_opex(capex_opex)
    month_range = _dashboard_month_range(month=month, month_list=month_list)
    raw_months = _calculate_item_based_monthly_totals(
        session,
        year=resolved_year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        budget_code=budget_code,
        department=department,
        capex_opex=capex_filter,
    )
    month_map = {entry.month: entry for entry in raw_months}
    normalized_months: list[SpendTrendMonth] = []
    for month in month_range:
        entry = month_map.get(
            month,
            SpendMonthlySummary(
                month=month,
                plan_total=0,
                actual_total=0,
                within_plan_total=0,
                over_total=0,
                remaining_total=0,
                unused_total=0,
            ),
        )
        planned = float(entry.plan_total or 0)
        actual = float(entry.actual_total or 0)
        remaining = float(entry.remaining_total or 0)
        overrun = float(entry.over_total or 0)
        overrun_pct = (overrun / planned * 100) if planned > 0 else 0.0
        normalized_months.append(
            SpendTrendMonth(
                month=month,
                planned=planned,
                actual=actual,
                remaining=remaining,
                overrun=overrun,
                overrun_pct=overrun_pct,
            )
        )

    selected_budget_code = budget_code
    if not selected_budget_code and budget_item_id is not None:
        budget_item = session.get(BudgetItem, budget_item_id)
        selected_budget_code = budget_item.code if budget_item else None
    scope = "item" if (budget_code or budget_item_id) else "all"
    return SpendTrendResponse(
        year=resolved_year,
        scenario_id=scenario_id,
        scope=scope,
        selected_budget_code=selected_budget_code,
        months=normalized_months,
    )
