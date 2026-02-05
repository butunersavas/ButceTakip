from fastapi import APIRouter, Depends, Query
from datetime import datetime

from sqlalchemy import exists, func
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
from app.models import BudgetItem, Expense, ExpenseStatus, PlanEntry, PurchaseFormStatusExt, User
from app.schemas import PurchaseReminder, PurchaseReminderUpdate

router = APIRouter(prefix="/budget", tags=["Budget"])


@router.get("/purchase-reminders", response_model=list[PurchaseReminder])
def list_purchase_reminders(
    year: int = Query(..., description="Year to check for planned purchases"),
    month: int = Query(..., ge=1, le=12, description="Month to check for planned purchases"),
    scenario_id: int | None = Query(default=None),
    department: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[PurchaseReminder]:
    plan_budget_code = func.coalesce(
        func.nullif(func.trim(PlanEntry.budget_code), ""),
        BudgetItem.code,
    )
    plan_department = func.coalesce(PlanEntry.department, "")

    status_query = (
        select(PurchaseFormStatusExt)
        .where(PurchaseFormStatusExt.year == year)
        .where(PurchaseFormStatusExt.month == month)
    )
    if scenario_id is not None:
        status_query = status_query.where(PurchaseFormStatusExt.scenario_id == scenario_id)
    if department is not None:
        status_query = status_query.where(PurchaseFormStatusExt.department == department)
    status_subq = status_query.subquery()

    plan_query = (
        select(
            PlanEntry.budget_item_id,
            plan_budget_code.label("budget_code"),
            BudgetItem.name,
            PlanEntry.year,
            PlanEntry.month,
            PlanEntry.scenario_id,
            PlanEntry.department,
            func.coalesce(status_subq.c.is_form_prepared, False).label("is_form_prepared"),
        )
        .join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id)
        .join(
            status_subq,
            (
                (status_subq.c.budget_code == plan_budget_code)
                & (status_subq.c.year == PlanEntry.year)
                & (status_subq.c.month == PlanEntry.month)
                & (status_subq.c.scenario_id == PlanEntry.scenario_id)
                & (status_subq.c.department == plan_department)
            ),
            isouter=True,
        )
        .where(PlanEntry.year == year)
        .where(PlanEntry.month == month)
        .where(PlanEntry.amount > 0)
    )

    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if department is not None:
        plan_query = plan_query.where(PlanEntry.department == department)

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
            scenario_id=plan_scenario_id,
            department=plan_department_value,
            is_form_prepared=is_form_prepared,
        )
        for (
            budget_item_id,
            code,
            name,
            plan_year,
            plan_month,
            plan_scenario_id,
            plan_department_value,
            is_form_prepared,
        ) in rows
    ]


@router.post("/purchase-reminders/mark-prepared")
def mark_purchase_forms_prepared(
    items: list[PurchaseReminderUpdate],
    session: Session = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    for item in items:
        normalized_department = (item.department or "").strip()
        status = (
            session.exec(
                select(PurchaseFormStatusExt)
                .where(PurchaseFormStatusExt.budget_code == item.budget_code)
                .where(PurchaseFormStatusExt.year == item.year)
                .where(PurchaseFormStatusExt.month == item.month)
                .where(PurchaseFormStatusExt.scenario_id == item.scenario_id)
                .where(PurchaseFormStatusExt.department == normalized_department)
            ).first()
        )

        if not status:
            status = PurchaseFormStatusExt(
                budget_code=item.budget_code,
                year=item.year,
                month=item.month,
                scenario_id=item.scenario_id,
                department=normalized_department,
                is_form_prepared=item.is_form_prepared,
                updated_at=datetime.utcnow(),
                updated_by=user.id,
            )
            session.add(status)
        else:
            status.is_form_prepared = item.is_form_prepared
            status.updated_at = datetime.utcnow()
            status.updated_by = user.id

    session.commit()
    return {"detail": "Satın alma formu durumları güncellendi."}
