import io
from datetime import date

from fastapi import Response
from openpyxl import Workbook
from sqlmodel import Session, select

from app.models import Expense, ExpenseStatus, PlanEntry
from app.services.analytics import compute_quarterly_summary


CURRENCY_SYMBOL = "$"


def _format_currency(value: float) -> str:
    return f"{CURRENCY_SYMBOL}{value:,.2f}"


def export_xlsx(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
) -> Response:
    wb = Workbook()
    plan_sheet = wb.active
    plan_sheet.title = "Plans"
    plan_sheet.append(["Budget Item ID", "Scenario ID", "Year", "Month", "Amount (USD)"])
    plan_query = select(PlanEntry).where(PlanEntry.year == year)
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        plan_query = plan_query.where(PlanEntry.budget_item_id == budget_item_id)
    for plan in session.exec(plan_query).all():
        plan_sheet.append(
            [plan.budget_item_id, plan.scenario_id, plan.year, plan.month, _format_currency(plan.amount)]
        )

    expense_sheet = wb.create_sheet("Expenses")
    expense_sheet.append(
        [
            "Budget Item ID",
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
    expense_query = select(Expense).where(
        Expense.expense_date >= date(year, 1, 1), Expense.expense_date <= date(year, 12, 31)
    )
    if scenario_id is not None:
        expense_query = expense_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        expense_query = expense_query.where(Expense.budget_item_id == budget_item_id)
    for expense in session.exec(expense_query).all():
        expense_sheet.append(
            [
                expense.budget_item_id,
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
    status: ExpenseStatus | None = None,
    out_of_budget: bool | None = None,
    sheet_title: str,
    file_name: str,
) -> Response:
    wb = Workbook()
    sheet = wb.active
    sheet.title = sheet_title
    sheet.append(
        [
            "Budget Item ID",
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
    expense_query = select(Expense).where(
        Expense.expense_date >= date(year, 1, 1), Expense.expense_date <= date(year, 12, 31)
    )
    if scenario_id is not None:
        expense_query = expense_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        expense_query = expense_query.where(Expense.budget_item_id == budget_item_id)
    if status is not None:
        expense_query = expense_query.where(Expense.status == status)
    if out_of_budget is not None:
        expense_query = expense_query.where(Expense.is_out_of_budget == out_of_budget)
    for expense in session.exec(expense_query).all():
        sheet.append(
            [
                expense.budget_item_id,
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
    response.headers["Content-Disposition"] = f"attachment; filename={file_name}"
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
