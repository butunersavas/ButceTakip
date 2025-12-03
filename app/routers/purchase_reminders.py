from fastapi import APIRouter, Depends, Query
from sqlalchemy import exists, func
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
from app.models import BudgetItem, Expense, ExpenseStatus, PlanEntry, User
from app.schemas import PurchaseReminder

router = APIRouter(prefix="/budget", tags=["Budget"])


@router.get("/purchase-reminders", response_model=list[PurchaseReminder])
def list_purchase_reminders(
    year: int = Query(..., description="Year to check for planned purchases"),
    month: int = Query(..., ge=1, le=12, description="Month to check for planned purchases"),
    scenario_id: int | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[PurchaseReminder]:
    plan_query = (
        select(BudgetItem.code, BudgetItem.name, PlanEntry.year, PlanEntry.month)
        .join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id)
        .where(PlanEntry.year == year)
        .where(PlanEntry.month == month)
        .where(PlanEntry.amount > 0)
    )

    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)

    expense_exists_query = (
        select(Expense.id)
        .where(Expense.budget_item_id == PlanEntry.budget_item_id)
        .where(func.extract("year", Expense.expense_date) == year)
        .where(func.extract("month", Expense.expense_date) == month)
        .where(Expense.status == ExpenseStatus.RECORDED)
    )

    if scenario_id is not None:
        expense_exists_query = expense_exists_query.where(Expense.scenario_id == scenario_id)

    plan_query = plan_query.where(~exists(expense_exists_query))
    plan_query = plan_query.distinct()

    rows = session.exec(plan_query).all()
    return [
        PurchaseReminder(budget_code=code, budget_name=name, year=plan_year, month=plan_month)
        for code, name, plan_year, plan_month in rows
    ]
