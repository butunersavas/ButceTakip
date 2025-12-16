from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, func, select

from app.dependencies import get_current_user, get_db_session
from app.models import BudgetItem, Expense, ExpenseStatus, PlanEntry
from app.schemas import (
    DashboardKPI,
    DashboardResponse,
    DashboardSummary,
    NoSpendItem,
    RiskyItem,
)
from app.services.analytics import compute_monthly_summary, totalize

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    year: int = Query(..., description="Year to summarize"),
    scenario_id: int | None = Query(default=None),
    month: int | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _ = Depends(get_current_user),
) -> DashboardResponse:
    if year is None:
        raise HTTPException(status_code=400, detail="Year is required")
    monthly = compute_monthly_summary(session, year, scenario_id, budget_item_id, month)
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


def _budget_item_aggregates(session: Session, year: int, month: int | None = None):
    plan_query = select(
        PlanEntry.budget_item_id,
        func.sum(PlanEntry.amount).label("plan_total"),
    ).where(PlanEntry.year == year)

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
    session: Session = Depends(get_db_session),
    _ = Depends(get_current_user),
) -> list[RiskyItem]:
    rows = _budget_item_aggregates(session, year, month)
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
    session: Session = Depends(get_db_session),
    _ = Depends(get_current_user),
) -> list[NoSpendItem]:
    rows = _budget_item_aggregates(session, year, month)
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
