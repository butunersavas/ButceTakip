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


@dataclass
class QuarterlyAggregate:
    quarter: int
    planned: float
    actual: float
    out_of_budget: float
    cancelled: float

    @property
    def saving(self) -> float:
        return self.planned - self.actual


def compute_monthly_summary(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    month: int | None = None,
) -> list[MonthlyAggregate]:
    plan_query = select(PlanEntry.month, func.sum(PlanEntry.amount)).where(PlanEntry.year == year)
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        plan_query = plan_query.where(PlanEntry.budget_item_id == budget_item_id)
    if month is not None:
        plan_query = plan_query.where(PlanEntry.month == month)
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
    if month is not None:
        expense_query = expense_query.where(func.extract("month", Expense.expense_date) == month)
    expense_query = expense_query.group_by(func.extract("month", Expense.expense_date))
    expense_rows = session.exec(expense_query).all()

    expense_map = defaultdict(float, {int(month): amount or 0.0 for month, amount in expense_rows})

    months = {month} if month is not None else set(plan_map.keys()) | set(expense_map.keys()) | set(range(1, 13))
    return [
        MonthlyAggregate(month=m, planned=float(plan_map[m]), actual=float(expense_map[m]))
        for m in sorted(months)
    ]


def totalize(monthly: Iterable[MonthlyAggregate]) -> tuple[float, float]:
    total_plan = sum(item.planned for item in monthly)
    total_actual = sum(item.actual for item in monthly)
    return total_plan, total_actual


def compute_quarterly_summary(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
) -> list[QuarterlyAggregate]:
    monthly = compute_monthly_summary(session, year, scenario_id, budget_item_id)
    planned_map = defaultdict(float, {item.month: item.planned for item in monthly})
    actual_map = defaultdict(float, {item.month: item.actual for item in monthly})

    out_of_budget_query = (
        select(func.extract("month", Expense.expense_date), func.sum(Expense.amount))
        .where(func.extract("year", Expense.expense_date) == year)
        .where(Expense.is_out_of_budget.is_(True))
        .where(Expense.status == ExpenseStatus.RECORDED)
    )
    if scenario_id is not None:
        out_of_budget_query = out_of_budget_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        out_of_budget_query = out_of_budget_query.where(Expense.budget_item_id == budget_item_id)
    out_of_budget_rows = session.exec(out_of_budget_query.group_by(func.extract("month", Expense.expense_date))).all()
    out_of_budget_map = defaultdict(
        float, {int(month): float(amount or 0.0) for month, amount in out_of_budget_rows}
    )

    cancelled_query = (
        select(func.extract("month", Expense.expense_date), func.sum(Expense.amount))
        .where(func.extract("year", Expense.expense_date) == year)
        .where(Expense.status == ExpenseStatus.CANCELLED)
    )
    if scenario_id is not None:
        cancelled_query = cancelled_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        cancelled_query = cancelled_query.where(Expense.budget_item_id == budget_item_id)
    cancelled_rows = session.exec(cancelled_query.group_by(func.extract("month", Expense.expense_date))).all()
    cancelled_map = defaultdict(float, {int(month): float(amount or 0.0) for month, amount in cancelled_rows})

    quarterly: list[QuarterlyAggregate] = []
    for quarter in range(1, 5):
        start_month = (quarter - 1) * 3 + 1
        months = range(start_month, start_month + 3)
        planned_total = sum(float(planned_map[m]) for m in months)
        actual_total = sum(float(actual_map[m]) for m in months)
        out_of_budget_total = sum(float(out_of_budget_map[m]) for m in months)
        cancelled_total = sum(float(cancelled_map[m]) for m in months)
        quarterly.append(
            QuarterlyAggregate(
                quarter=quarter,
                planned=planned_total,
                actual=actual_total,
                out_of_budget=out_of_budget_total,
                cancelled=cancelled_total,
            )
        )
    return quarterly
