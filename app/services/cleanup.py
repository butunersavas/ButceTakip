from datetime import datetime

from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import Session, delete

from app.models import (
    BudgetItem,
    Expense,
    ExpenseAttachment,
    PlanEntry,
    PurchaseRequestTracking,
    PurchaseFormStatus,
    PurchaseFormStatusExt,
)
from app.schemas import CleanupRequest


def perform_cleanup(session: Session, request: CleanupRequest) -> dict[str, int]:
    filters = []
    if request.budget_item_id is not None:
        filters.append(Expense.budget_item_id == request.budget_item_id)
    if request.scenario_id is not None:
        filters.append(Expense.scenario_id == request.scenario_id)

    if request.clear_imported_only:
        filters.append(Expense.description.ilike("%import%"))

    deleted_plans = 0
    deleted_budget_items = 0
    resequenced_budget_items = 0
    deleted_purchase_statuses = 0
    deleted_expenses = 0
    try:
        target_expense_id_rows = session.exec(select(Expense.id).where(*filters)).all()
        target_expense_ids = [
            int(row[0]) if hasattr(row, "__getitem__") else int(row)
            for row in target_expense_id_rows
        ]
        if target_expense_ids:
            session.exec(
                delete(ExpenseAttachment).where(
                    ExpenseAttachment.expense_id.in_(target_expense_ids)
                )
            )

        expense_query = delete(Expense)
        for condition in filters:
            expense_query = expense_query.where(condition)
        result = session.exec(expense_query)
        deleted_expenses = result.rowcount if result else 0

        if request.reset_plans:
            purchase_status_query = delete(PurchaseFormStatus)
            purchase_status_ext_query = delete(PurchaseFormStatusExt)
            if request.budget_item_id is not None:
                purchase_status_query = purchase_status_query.where(
                    PurchaseFormStatus.budget_item_id == request.budget_item_id
                )
                purchase_status_ext_query = purchase_status_ext_query.where(
                    PurchaseFormStatusExt.budget_code.in_(
                        select(PlanEntry.budget_code).where(
                            PlanEntry.budget_item_id == request.budget_item_id
                        )
                    )
                )
            elif request.scenario_id is not None:
                purchase_status_query = purchase_status_query.where(
                    PurchaseFormStatus.budget_item_id.in_(
                        select(PlanEntry.budget_item_id).where(
                            PlanEntry.scenario_id == request.scenario_id
                        )
                    )
                )
                purchase_status_ext_query = purchase_status_ext_query.where(
                    PurchaseFormStatusExt.scenario_id == request.scenario_id
                )
            purchase_status_result = session.exec(purchase_status_query)
            purchase_status_ext_result = session.exec(purchase_status_ext_query)
            deleted_purchase_statuses = (
                purchase_status_result.rowcount if purchase_status_result else 0
            )
            if purchase_status_ext_result:
                deleted_purchase_statuses += purchase_status_ext_result.rowcount or 0

            plan_filters = []
            plan_query = delete(PlanEntry)
            if request.budget_item_id is not None:
                plan_filters.append(PlanEntry.budget_item_id == request.budget_item_id)
            if request.scenario_id is not None:
                plan_filters.append(PlanEntry.scenario_id == request.scenario_id)

            for condition in plan_filters:
                plan_query = plan_query.where(condition)

            session.exec(
                delete(PurchaseRequestTracking).where(
                    PurchaseRequestTracking.plan_item_id.in_(
                        select(PlanEntry.id).where(*plan_filters)
                    )
                )
            )
            plan_result = session.exec(plan_query)
            deleted_plans = plan_result.rowcount if plan_result else 0

            orphan_budget_query = delete(BudgetItem).where(
                ~exists(select(PlanEntry.id).where(PlanEntry.budget_item_id == BudgetItem.id)),
                ~exists(select(Expense.id).where(Expense.budget_item_id == BudgetItem.id)),
            )
            orphan_result = session.exec(orphan_budget_query)
            deleted_budget_items = orphan_result.rowcount if orphan_result else 0

            resequenced_budget_items = _resequence_budget_codes(session)
        session.commit()
    except (IntegrityError, SQLAlchemyError):
        session.rollback()
        raise

    return {
        "cleared_expenses": deleted_expenses,
        "cleared_plans": deleted_plans,
        "cleared_budget_items": deleted_budget_items,
        "reindexed_budget_items": resequenced_budget_items,
        "cleared_purchase_statuses": deleted_purchase_statuses,
    }


def _resequence_budget_codes(session: Session) -> int:
    items = session.exec(select(BudgetItem).order_by(BudgetItem.created_at, BudgetItem.id)).all()
    now = datetime.utcnow()

    pending_updates: list[tuple[BudgetItem, str]] = []
    for index, item in enumerate(items, start=1):
        expected_code = f"SK{index:02d}"
        if item.code != expected_code:
            pending_updates.append((item, expected_code))

    if not pending_updates:
        return 0

    # Assign temporary unique codes first to avoid unique constraint collisions while resequencing.
    for item, _ in pending_updates:
        item.code = f"TMP-{item.id}-{item.code}"
        item.updated_at = now
        session.add(item)

    session.flush()

    for item, expected_code in pending_updates:
        item.code = expected_code
        item.updated_at = now
        session.add(item)

    return len(pending_updates)
