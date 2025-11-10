"""Helper utilities for dashboard reminders and daily highlights."""

from __future__ import annotations

from datetime import date
from typing import Iterable

from sqlmodel import Session, func, select

from app.models import BudgetItem, Expense, ExpenseStatus, PlanEntry
from app.schemas import (
    DashboardReminder,
    DashboardTodayEntry,
    DashboardTodayPanel,
)
from app.services.analytics import MonthlyAggregate

MONTH_NAMES_TR = [
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık",
]


def _format_budget_item_label(item: BudgetItem) -> str:
    parts = []
    if item.code:
        parts.append(item.code.strip())
    if item.name:
        parts.append(item.name.strip())
    return " — ".join(part for part in parts if part) or "Tanımsız Kalem"


def _months_since(last_date: date, today: date) -> int:
    return (today.year - last_date.year) * 12 + today.month - last_date.month


def build_dashboard_reminders(
    session: Session,
    *,
    year: int,
    scenario_id: int | None,
    budget_item_id: int | None,
    monthly: Iterable[MonthlyAggregate],
) -> list[DashboardReminder]:
    """Produce reminders and suggestions for the dashboard view."""

    today = date.today()
    reminders: list[DashboardReminder] = []

    future_year = year > today.year
    if future_year:
        month_cutoff = 0
    elif year == today.year:
        month_cutoff = today.month
    else:
        month_cutoff = 12

    for entry in monthly:
        if future_year:
            continue
        if entry.month > month_cutoff:
            continue
        if entry.planned <= 0 or entry.actual > 0:
            continue
        month_label = MONTH_NAMES_TR[entry.month - 1]
        reminders.append(
            DashboardReminder(
                severity="warning",
                message=f"{month_label} faturaları girilmedi",
            )
        )

    reminders = reminders[:3]

    if future_year:
        return reminders

    if year != today.year:
        return reminders

    plan_stmt = (
        select(PlanEntry.budget_item_id, func.sum(PlanEntry.amount))
        .where(PlanEntry.year == year)
        .group_by(PlanEntry.budget_item_id)
    )
    if scenario_id is not None:
        plan_stmt = plan_stmt.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        plan_stmt = plan_stmt.where(PlanEntry.budget_item_id == budget_item_id)

    planned_rows = session.exec(plan_stmt).all()
    planned_ids = {
        row[0]
        for row in planned_rows
        if row[0] is not None and float(row[1] or 0) > 0
    }

    if budget_item_id is not None and budget_item_id not in planned_ids:
        planned_ids.add(budget_item_id)

    if not planned_ids:
        return reminders

    expense_stmt = select(
        Expense.budget_item_id,
        func.max(Expense.expense_date),
    ).where(Expense.status == ExpenseStatus.RECORDED)
    if scenario_id is not None:
        expense_stmt = expense_stmt.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        expense_stmt = expense_stmt.where(Expense.budget_item_id == budget_item_id)
    expense_stmt = expense_stmt.group_by(Expense.budget_item_id)

    expense_rows = session.exec(expense_stmt).all()
    last_expense_map = {
        row[0]: row[1]
        for row in expense_rows
        if row[0] in planned_ids
    }

    budget_items = session.exec(
        select(BudgetItem).where(BudgetItem.id.in_(list(planned_ids)))
    ).all()

    inactive_candidates: list[tuple[BudgetItem, date | None, int]] = []
    for item in budget_items:
        last_date = last_expense_map.get(item.id)
        if last_date is None:
            inactive_candidates.append((item, None, 999))
            continue
        months_inactive = _months_since(last_date, today)
        if months_inactive >= 3:
            inactive_candidates.append((item, last_date, months_inactive))

    inactive_candidates.sort(key=lambda entry: entry[2], reverse=True)

    for item, last_date, months_inactive in inactive_candidates[:3]:
        label = _format_budget_item_label(item)
        if last_date is None:
            message = f"{label} kalemi için henüz harcama kaydı yok. İnceleyelim mi?"
        else:
            message = f"{label} kalemi {months_inactive} aydır kullanılmadı, silelim mi?"
        reminders.append(
            DashboardReminder(
                severity="info",
                message=message,
            )
        )

    return reminders


def build_today_panel(
    session: Session,
    *,
    scenario_id: int | None,
    budget_item_id: int | None,
) -> DashboardTodayPanel:
    today = date.today()

    base_stmt = (
        select(Expense, BudgetItem)
        .join(BudgetItem, Expense.budget_item_id == BudgetItem.id)
        .where(Expense.expense_date == today)
    )
    if scenario_id is not None:
        base_stmt = base_stmt.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        base_stmt = base_stmt.where(Expense.budget_item_id == budget_item_id)

    def fetch_entries(stmt) -> list[DashboardTodayEntry]:
        rows = session.exec(stmt.limit(5)).all()
        entries: list[DashboardTodayEntry] = []
        for expense, budget_item in rows:
            entries.append(
                DashboardTodayEntry(
                    id=expense.id,
                    budget_item_id=expense.budget_item_id,
                    budget_item_code=budget_item.code,
                    budget_item_name=budget_item.name,
                    amount=expense.amount,
                    description=expense.description,
                    expense_date=expense.expense_date,
                    status=expense.status,
                )
            )
        return entries

    recorded_stmt = (
        base_stmt.where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
        .order_by(Expense.created_at.desc())
    )
    cancelled_stmt = (
        base_stmt.where(Expense.status == ExpenseStatus.CANCELLED)
        .order_by(Expense.created_at.desc())
    )
    out_of_budget_stmt = (
        base_stmt.where(Expense.is_out_of_budget.is_(True))
        .where(Expense.status == ExpenseStatus.RECORDED)
        .order_by(Expense.created_at.desc())
    )

    return DashboardTodayPanel(
        recorded=fetch_entries(recorded_stmt),
        cancelled=fetch_entries(cancelled_stmt),
        out_of_budget=fetch_entries(out_of_budget_stmt),
    )
