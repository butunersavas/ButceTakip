from collections.abc import Sequence

from sqlalchemy.sql.elements import ColumnElement
from sqlmodel import Session, delete, select

from app.models import Expense, ExpenseAttachment


def delete_expenses_with_attachments(
    session: Session,
    expense_filters: Sequence[ColumnElement[bool]],
) -> tuple[int, int]:
    """Delete expense attachments first, then expenses, for the given expense filters."""

    target_expense_ids = list(session.exec(select(Expense.id).where(*expense_filters)).all())

    deleted_attachments = 0
    if target_expense_ids:
        attachments_result = session.exec(
            delete(ExpenseAttachment).where(ExpenseAttachment.expense_id.in_(target_expense_ids))
        )
        deleted_attachments = attachments_result.rowcount or 0
        # Ensure child-row deletions are flushed before deleting parent expenses.
        session.flush()

    expense_query = delete(Expense)
    for condition in expense_filters:
        expense_query = expense_query.where(condition)
    expenses_result = session.exec(expense_query)
    deleted_expenses = expenses_result.rowcount or 0

    return deleted_attachments, deleted_expenses
