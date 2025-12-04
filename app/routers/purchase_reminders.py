from fastapi import APIRouter, Depends, Query
from sqlalchemy import exists, func
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
from app.models import BudgetItem, Expense, ExpenseStatus, PlanEntry, PurchaseFormStatus, User
from app.schemas import PurchaseReminder, PurchaseReminderUpdate

router = APIRouter(prefix="/budget", tags=["Budget"])


@router.get("/purchase-reminders", response_model=list[PurchaseReminder])
def list_purchase_reminders(
    year: int = Query(..., description="Year to check for planned purchases"),
    month: int = Query(..., ge=1, le=12, description="Month to check for planned purchases"),
    scenario_id: int | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[PurchaseReminder]:
    status_subq = (
        select(PurchaseFormStatus)
        .where(PurchaseFormStatus.year == year)
        .where(PurchaseFormStatus.month == month)
        .subquery()
    )

    plan_query = (
        select(
            PlanEntry.budget_item_id,
            BudgetItem.code,
            BudgetItem.name,
            PlanEntry.year,
            PlanEntry.month,
            func.coalesce(status_subq.c.is_prepared, False).label("is_form_prepared"),
        )
        .join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id)
        .join(status_subq, status_subq.c.budget_item_id == PlanEntry.budget_item_id, isouter=True)
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
        PurchaseReminder(
            budget_item_id=budget_item_id,
            budget_code=code,
            budget_name=name,
            year=plan_year,
            month=plan_month,
            is_form_prepared=is_form_prepared,
        )
        for budget_item_id, code, name, plan_year, plan_month, is_form_prepared in rows
    ]


@router.post("/purchase-reminders/mark-prepared")
def mark_purchase_forms_prepared(
    items: list[PurchaseReminderUpdate],
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
):
    for item in items:
        status = (
            session.exec(
                select(PurchaseFormStatus)
                .where(PurchaseFormStatus.budget_item_id == item.budget_item_id)
                .where(PurchaseFormStatus.year == item.year)
                .where(PurchaseFormStatus.month == item.month)
            ).first()
        )

        if item.is_form_prepared:
            if not status:
                status = PurchaseFormStatus(
                    budget_item_id=item.budget_item_id,
                    year=item.year,
                    month=item.month,
                    is_prepared=True,
                )
                session.add(status)
            else:
                status.is_prepared = True
        else:
            if status:
                status.is_prepared = False

    session.commit()
    return {"detail": "Satın alma formu durumları güncellendi."}
