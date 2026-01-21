from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
from app.models import BudgetItem, Expense, ExpenseStatus, PlanEntry, Scenario
from app.schemas import (
    DashboardKPI,
    DashboardResponse,
    DashboardSummary,
    NoSpendItem,
    OverBudgetItem,
    OverBudgetResponse,
    OverBudgetSummary,
    RiskyItem,
    SpendMonthlySummary,
)
from app.services.analytics import compute_monthly_summary, totalize

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


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


def _calculate_item_based_monthly_totals(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
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
        )
        .select_from(PlanEntry)
        .join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id)
        .where(PlanEntry.year == year)
        .where(PlanEntry.month.in_(month_range))
    )
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        plan_query = plan_query.where(PlanEntry.budget_item_id == budget_item_id)
    if department is not None:
        plan_query = plan_query.where(PlanEntry.department == department)
    if capex_opex:
        plan_query = plan_query.where(func.lower(BudgetItem.map_category) == capex_opex)
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
    )
    if scenario_id is not None:
        expense_query = expense_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        expense_query = expense_query.where(Expense.budget_item_id == budget_item_id)
    if capex_opex:
        expense_query = expense_query.where(func.lower(BudgetItem.map_category) == capex_opex)
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
    expense_map: dict[tuple[int, str], float] = {
        (int(row.month), row.budget_code or "(boş)"): float(row.actual_total or 0)
        for row in expense_rows
    }

    results: list[SpendMonthlySummary] = []
    for month_value in month_range:
        plan_total = 0.0
        actual_total = 0.0
        over_total = 0.0
        remaining_total = 0.0
        within_plan_total = 0.0
        item_codes = {
            budget_code
            for (month_key, budget_code) in plan_map.keys() | expense_map.keys()
            if month_key == month_value
        }
        for budget_code in item_codes:
            plan_item = plan_map.get((month_value, budget_code), 0.0)
            actual_item = expense_map.get((month_value, budget_code), 0.0)
            plan_total += plan_item
            actual_total += actual_item
            over_total += max(actual_item - plan_item, 0)
            remaining_total += max(plan_item - actual_item, 0)
            within_plan_total += min(actual_item, plan_item)

        results.append(
            SpendMonthlySummary(
                month=month_value,
                plan_total=plan_total,
                actual_total=actual_total,
                within_plan_total=within_plan_total,
                over_total=over_total,
                remaining_total=remaining_total,
            )
        )
    return results


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    year: int = Query(..., description="Year to summarize"),
    scenario_id: int | None = Query(default=None),
    month: int | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _ = Depends(get_current_user),
) -> DashboardResponse:
    if year is None:
        raise HTTPException(status_code=400, detail="Year is required")
    capex_filter = _normalize_capex_opex(capex_opex)
    monthly = compute_monthly_summary(
        session, year, scenario_id, budget_item_id, month, department, capex_filter
    )
    total_plan, total_actual = totalize(monthly)
    # Remaining budget should never go below zero – once there is an overrun we
    # already report that separately via ``total_overrun``.
    # Having a negative "remaining" value makes the dashboard hard to interpret
    # because it shows both an overrun and a negative remainder at the same
    # time.  Clamp the value to zero so that "Kalan" only represents the
    # actually available amount.
    total_remaining = max(total_plan - total_actual, 0)
    total_saving = sum(item.saving for item in monthly if item.saving > 0)
    total_overrun = sum(-item.saving for item in monthly if item.saving < 0)
    return DashboardResponse(
        kpi=DashboardKPI(
            total_plan=total_plan,
            total_actual=total_actual,
            total_remaining=total_remaining,
            total_saving=total_saving,
            total_overrun=total_overrun,
        ),
        monthly=[
            DashboardSummary(month=item.month, planned=item.planned, actual=item.actual, saving=item.saving)
            for item in monthly
        ],
    )


def _budget_item_aggregates(
    session: Session,
    year: int,
    month: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
):
    plan_query = select(
        PlanEntry.budget_item_id,
        func.sum(PlanEntry.amount).label("plan_total"),
    ).where(PlanEntry.year == year)

    if capex_opex in {"capex", "opex"}:
        plan_query = plan_query.join(
            BudgetItem, BudgetItem.id == PlanEntry.budget_item_id
        ).where(func.lower(BudgetItem.map_category) == capex_opex)

    if department is not None:
        plan_query = plan_query.where(PlanEntry.department == department)

    if month is not None:
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
    )

    if capex_opex in {"capex", "opex"}:
        expense_query = expense_query.join(
            BudgetItem, BudgetItem.id == Expense.budget_item_id
        ).where(func.lower(BudgetItem.map_category) == capex_opex)

    if department is not None:
        department_budget_items_query = (
            select(PlanEntry.budget_item_id)
            .where(PlanEntry.year == year)
            .where(PlanEntry.department == department)
        )
        expense_query = expense_query.where(
            Expense.budget_item_id.in_(department_budget_items_query)
        )

    if month is not None:
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

    return session.exec(query).all()


@router.get("/risky-items", response_model=list[RiskyItem])
def get_risky_budget_items(
    year: int,
    month: int | None = None,
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _ = Depends(get_current_user),
) -> list[RiskyItem]:
    rows = _budget_item_aggregates(
        session, year, month, department, _normalize_capex_opex(capex_opex)
    )
    items: list[RiskyItem] = []

    for row in rows:
        plan = float(row.plan or 0)
        actual = float(row.actual or 0)
        if plan <= 0:
            continue

        ratio = actual / plan
        if ratio >= 0.8:
            items.append(
                RiskyItem(
                    budget_item_id=row.budget_item_id,
                    budget_code=row.code,
                    budget_name=row.name,
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
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _ = Depends(get_current_user),
) -> list[NoSpendItem]:
    rows = _budget_item_aggregates(
        session, year, month, department, _normalize_capex_opex(capex_opex)
    )
    items: list[NoSpendItem] = []

    for row in rows:
        plan = float(row.plan or 0)
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


@router.get("/overbudget", response_model=OverBudgetResponse)
def get_overbudget(
    year: int | None = Query(default=None),
    scenario_id: int | None = Query(default=None),
    months: int = Query(default=3, ge=1, le=12),
    month: int | None = Query(default=None),
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

    month_range = _resolve_month_range(month, months)
    capex_filter = _normalize_capex_opex(capex_opex)

    plan_query = (
        select(
            PlanEntry.budget_item_id,
            func.sum(PlanEntry.amount).label("plan_total"),
        )
        .where(PlanEntry.year == resolved_year)
        .where(PlanEntry.month.in_(month_range))
    )
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if department is not None:
        plan_query = plan_query.where(PlanEntry.department == department)
    plan_query = plan_query.group_by(PlanEntry.budget_item_id).subquery()

    expense_query = (
        select(
            Expense.budget_item_id,
            func.sum(Expense.amount).label("actual_total"),
        )
        .where(func.extract("year", Expense.expense_date) == resolved_year)
        .where(func.extract("month", Expense.expense_date).in_(month_range))
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
    )
    if scenario_id is not None:
        expense_query = expense_query.where(Expense.scenario_id == scenario_id)
    expense_query = expense_query.group_by(Expense.budget_item_id).subquery()

    query = (
        select(
            BudgetItem.id,
            BudgetItem.code,
            BudgetItem.name,
            func.coalesce(plan_query.c.plan_total, 0).label("plan"),
            func.coalesce(expense_query.c.actual_total, 0).label("actual"),
        )
        .join(plan_query, BudgetItem.id == plan_query.c.budget_item_id, isouter=True)
        .join(expense_query, BudgetItem.id == expense_query.c.budget_item_id, isouter=True)
    )
    if capex_filter:
        query = query.where(func.lower(BudgetItem.map_category) == capex_filter)
    if budget_code:
        query = query.where(BudgetItem.code == budget_code)
    else:
        query = query.where(
            plan_query.c.plan_total.is_not(None) | expense_query.c.actual_total.is_not(None)
        )

    rows = session.exec(query).all()
    items: list[OverBudgetItem] = []
    for row in rows:
        plan = float(row.plan or 0)
        actual = float(row.actual or 0)
        over = max(actual - plan, 0)
        over_pct = (over / plan * 100) if plan > 0 else 0.0
        if budget_code or over > 0:
            items.append(
                OverBudgetItem(
                    budget_code=row.code,
                    budget_name=row.name,
                    plan=plan,
                    actual=actual,
                    over=over,
                    over_pct=over_pct,
                )
            )

    items.sort(key=lambda item: item.over, reverse=True)
    over_total = sum(item.over for item in items)
    over_item_count = sum(1 for item in items if item.over > 0)
    return OverBudgetResponse(
        summary=OverBudgetSummary(over_total=over_total, over_item_count=over_item_count),
        items=items,
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


@router.get("/trend", response_model=list[SpendMonthlySummary])
def get_spend_trend(
    year: int | None = Query(default=None),
    scenario_id: int | None = Query(default=None),
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

    capex_filter = _normalize_capex_opex(capex_opex)
    month_range = list(range(1, 13))
    return _calculate_item_based_monthly_totals(
        session,
        year=resolved_year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_filter,
    )
