from sqlmodel import Session, delete

from app.models import Expense, PlanEntry
from app.schemas import CleanupRequest


def perform_cleanup(session: Session, request: CleanupRequest) -> dict[str, int]:
    filters = []
    if request.budget_item_id is not None:
        filters.append(Expense.budget_item_id == request.budget_item_id)
    if request.scenario_id is not None:
        filters.append(Expense.scenario_id == request.scenario_id)

    deleted_expenses = 0
    if request.clear_imported_only:
        expense_query = delete(Expense).where(Expense.description.ilike("%import%"))
    else:
        expense_query = delete(Expense)
    for condition in filters:
        expense_query = expense_query.where(condition)
    result = session.exec(expense_query)
    deleted_expenses = result.rowcount if result else 0

    deleted_plans = 0
    if request.reset_plans:
        plan_query = delete(PlanEntry)
        if request.budget_item_id is not None:
            plan_query = plan_query.where(PlanEntry.budget_item_id == request.budget_item_id)
        if request.scenario_id is not None:
            plan_query = plan_query.where(PlanEntry.scenario_id == request.scenario_id)
        plan_result = session.exec(plan_query)
        deleted_plans = plan_result.rowcount if plan_result else 0

    session.commit()
    return {"deleted_expenses": deleted_expenses, "deleted_plans": deleted_plans}
