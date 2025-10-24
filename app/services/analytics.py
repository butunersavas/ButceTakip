from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable

from sqlmodel import Session, func, select

from app.models import Expense, ExpenseStatus, PlanEntry


@dataclass
class MonthlyAggregate:
    month: int
    planned: float
    actual: float

    @property
    def saving(self) -> float:
        return self.planned - self.actual


def compute_monthly_summary(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
) -> list[MonthlyAggregate]:
    plan_query = select(PlanEntry.month, func.sum(PlanEntry.amount)).where(PlanEntry.year == year)
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        plan_query = plan_query.where(PlanEntry.budget_item_id == budget_item_id)
    plan_query = plan_query.group_by(PlanEntry.month)
    plan_rows = session.exec(plan_query).all()
    plan_map = defaultdict(float, {month: amount or 0.0 for month, amount in plan_rows})

    expense_query = (
        select(func.extract("month", Expense.expense_date), func.sum(Expense.amount))
        .where(func.extract("year", Expense.expense_date) == year)
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
    )
    if scenario_id is not None:
        expense_query = expense_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        expense_query = expense_query.where(Expense.budget_item_id == budget_item_id)
    expense_query = expense_query.group_by(func.extract("month", Expense.expense_date))
    expense_rows = session.exec(expense_query).all()

    expense_map = defaultdict(float, {int(month): amount or 0.0 for month, amount in expense_rows})

    months = set(plan_map.keys()) | set(expense_map.keys()) | set(range(1, 13))
    return [
        MonthlyAggregate(month=m, planned=float(plan_map[m]), actual=float(expense_map[m]))
        for m in sorted(months)
    ]


def totalize(monthly: Iterable[MonthlyAggregate]) -> tuple[float, float]:
    total_plan = sum(item.planned for item in monthly)
    total_actual = sum(item.actual for item in monthly)
    return total_plan, total_actual
