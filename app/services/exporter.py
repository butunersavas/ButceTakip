import csv
import io
from datetime import date
from typing import Literal

from fastapi import Response
from openpyxl import Workbook
from sqlmodel import Session, select

from app.models import BudgetItem, Expense, ExpenseStatus, PlanEntry
from app.services.analytics import compute_quarterly_summary


CURRENCY_SYMBOL = "$"


def _format_currency(value: float) -> str:
    return f"{CURRENCY_SYMBOL}{value:,.2f}"


def _get_expenses(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
) -> list[Expense]:
    query = select(Expense).where(
        Expense.expense_date >= date(year, 1, 1),
        Expense.expense_date <= date(year, 12, 31),
    )
    if scenario_id is not None:
        query = query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        query = query.where(Expense.budget_item_id == budget_item_id)
    query = query.order_by(Expense.expense_date)
    return session.exec(query).all()


def _get_budget_item_map(session: Session) -> dict[int, BudgetItem]:
    return {item.id: item for item in session.exec(select(BudgetItem)).all()}


def export_csv(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
) -> Response:
    output = io.StringIO()
    writer = csv.writer(output)
    budget_items = _get_budget_item_map(session)
    writer.writerow(
        [
            "type",
            "budget_item_id",
            "map_attribute",
            "scenario_id",
            "year",
            "month",
            "amount",
            "currency",
            "status",
            "is_out_of_budget",
            "expense_date",
            "vendor",
            "description",
        ]
    )

    plan_query = select(PlanEntry).where(PlanEntry.year == year)
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        plan_query = plan_query.where(PlanEntry.budget_item_id == budget_item_id)
    for plan in session.exec(plan_query).all():
        map_attribute = budget_items.get(plan.budget_item_id).map_attribute if plan.budget_item_id in budget_items else ""
        writer.writerow(
            [
                "plan",
                plan.budget_item_id,
                map_attribute or "",
                plan.scenario_id,
                plan.year,
                plan.month,
                _format_currency(plan.amount),
                "USD",
                "",
                "",
                "",
                "",
                "",
            ]
        )

    expenses = _get_expenses(session, year, scenario_id, budget_item_id)
    for expense in expenses:
        map_attribute = (
            budget_items.get(expense.budget_item_id).map_attribute
            if expense.budget_item_id in budget_items
            else ""
        )
        writer.writerow(
            [
                "expense",
                expense.budget_item_id,
                map_attribute or "",
                expense.scenario_id,
                expense.expense_date.year,
                expense.expense_date.month,
                _format_currency(expense.amount),
                "USD",
                expense.status.value,
                str(expense.is_out_of_budget).lower(),
                expense.expense_date.isoformat(),
                expense.vendor or "",
                expense.description or "",
            ]
        )
    response = Response(content=output.getvalue(), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=budget_export.csv"
    return response


def export_xlsx(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
) -> Response:
    wb = Workbook()
    plan_sheet = wb.active
    plan_sheet.title = "Plans"
    plan_sheet.append([
        "Budget Item ID",
        "Map Nitelik",
        "Scenario ID",
        "Year",
        "Month",
        "Amount (USD)",
    ])
    budget_items = _get_budget_item_map(session)
    plan_query = select(PlanEntry).where(PlanEntry.year == year)
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        plan_query = plan_query.where(PlanEntry.budget_item_id == budget_item_id)
    for plan in session.exec(plan_query).all():
        map_attribute = budget_items.get(plan.budget_item_id).map_attribute if plan.budget_item_id in budget_items else ""
        plan_sheet.append(
            [
                plan.budget_item_id,
                map_attribute or "",
                plan.scenario_id,
                plan.year,
                plan.month,
                _format_currency(plan.amount),
            ]
        )

    expense_sheet = wb.create_sheet("Expenses")
    expense_sheet.append(
        [
            "Budget Item ID",
            "Map Nitelik",
            "Scenario ID",
            "Date",
            "Amount (USD)",
            "Quantity",
            "Unit Price",
            "Vendor",
            "Description",
            "Status",
            "Out of Budget",
        ]
    )
    expenses = _get_expenses(session, year, scenario_id, budget_item_id)
    for expense in expenses:
        map_attribute = (
            budget_items.get(expense.budget_item_id).map_attribute
            if expense.budget_item_id in budget_items
            else ""
        )
        expense_sheet.append(
            [
                expense.budget_item_id,
                map_attribute or "",
                expense.scenario_id,
                expense.expense_date.isoformat(),
                _format_currency(expense.amount),
                expense.quantity,
                expense.unit_price,
                expense.vendor or "",
                expense.description or "",
                expense.status.value,
                expense.is_out_of_budget,
            ]
        )
    output = io.BytesIO()
    wb.save(output)
    response = Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response.headers["Content-Disposition"] = "attachment; filename=budget_export.xlsx"
    return response


def export_filtered_expenses_xlsx(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    *,
    filter_type: Literal["out_of_budget", "cancelled"],
) -> Response:
    expenses = _get_expenses(session, year, scenario_id, budget_item_id)
    budget_items = _get_budget_item_map(session)
    if filter_type == "out_of_budget":
        filtered = [expense for expense in expenses if expense.is_out_of_budget]
        sheet_title = "OutOfBudgetExpenses"
        filename = f"out_of_budget_expenses_{year}.xlsx"
    else:
        filtered = [expense for expense in expenses if expense.status == ExpenseStatus.CANCELLED]
        sheet_title = "CancelledExpenses"
        filename = f"cancelled_expenses_{year}.xlsx"

    wb = Workbook()
    sheet = wb.active
    sheet.title = sheet_title
    sheet.append(
        [
            "Budget Item ID",
            "Map Nitelik",
            "Scenario ID",
            "Date",
            "Amount (USD)",
            "Quantity",
            "Unit Price",
            "Vendor",
            "Description",
            "Status",
            "Out of Budget",
        ]
    )
    for expense in filtered:
        map_attribute = (
            budget_items.get(expense.budget_item_id).map_attribute
            if expense.budget_item_id in budget_items
            else ""
        )
        sheet.append(
            [
                expense.budget_item_id,
                map_attribute or "",
                expense.scenario_id,
                expense.expense_date.isoformat(),
                _format_currency(expense.amount),
                expense.quantity,
                expense.unit_price,
                expense.vendor or "",
                expense.description or "",
                expense.status.value,
                expense.is_out_of_budget,
            ]
        )

    output = io.BytesIO()
    wb.save(output)
    response = Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


def export_quarterly_csv(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
) -> Response:
    summary = compute_quarterly_summary(session, year, scenario_id, budget_item_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "quarter",
            "planned",
            "actual",
            "saving",
            "out_of_budget",
            "cancelled",
        ]
    )
    for entry in summary:
        writer.writerow(
            [
                f"Q{entry.quarter}",
                _format_currency(entry.planned),
                _format_currency(entry.actual),
                _format_currency(entry.saving),
                _format_currency(entry.out_of_budget),
                _format_currency(entry.cancelled),
            ]
        )
    response = Response(content=output.getvalue(), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=quarterly_summary.csv"
    return response


def export_quarterly_xlsx(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
) -> Response:
    summary = compute_quarterly_summary(session, year, scenario_id, budget_item_id)
    wb = Workbook()
    sheet = wb.active
    sheet.title = "Quarterly Summary"
    sheet.append([
        "Quarter",
        "Planned (USD)",
        "Actual (USD)",
        "Saving (USD)",
        "Out of Budget (USD)",
        "Cancelled (USD)",
    ])
    for entry in summary:
        sheet.append(
            [
                f"Q{entry.quarter}",
                _format_currency(entry.planned),
                _format_currency(entry.actual),
                _format_currency(entry.saving),
                _format_currency(entry.out_of_budget),
                _format_currency(entry.cancelled),
            ]
        )
    output = io.BytesIO()
    wb.save(output)
    response = Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response.headers["Content-Disposition"] = "attachment; filename=quarterly_summary.xlsx"
    return response
