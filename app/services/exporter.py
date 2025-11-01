import csv
import io
from datetime import date
from typing import Literal

from fastapi import Response
from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from sqlmodel import Session, select

from app.models import Expense, ExpenseStatus, PlanEntry
from app.services.analytics import compute_quarterly_summary


CURRENCY_SYMBOL = "$"


def _format_currency(value: float) -> str:
    return f"{CURRENCY_SYMBOL}{value:,.2f}"


def _ensure_option_sheet(workbook: Workbook) -> str:
    sheet_name = "_Options"
    if sheet_name in workbook.sheetnames:
        sheet = workbook[sheet_name]
    else:
        sheet = workbook.create_sheet(sheet_name)
        sheet.sheet_state = "hidden"
        sheet["A1"] = "Harcama Türü"
        sheet["A2"] = "OPEX"
        sheet["A3"] = "CAPEX"
        sheet["B1"] = "Kategori"
        sheet["B2"] = "Yazılım"
        sheet["B3"] = "Donanım"
        sheet["B4"] = "Hizmet"
        sheet["B5"] = "Bakım"
    return sheet_name


def _add_category_validations(workbook: Workbook, sheet, type_col: int, category_col: int) -> None:
    last_row = sheet.max_row
    if last_row <= 1:
        return
    options_sheet = _ensure_option_sheet(workbook)
    type_letter = get_column_letter(type_col)
    category_letter = get_column_letter(category_col)
    type_range = f"{type_letter}2:{type_letter}{last_row}"
    category_range = f"{category_letter}2:{category_letter}{last_row}"

    type_validation = DataValidation(
        type="list",
        formula1=f"={options_sheet}!$A$2:$A$3",
        allow_blank=True
    )
    category_validation = DataValidation(
        type="list",
        formula1=f"={options_sheet}!$B$2:$B$5",
        allow_blank=True
    )

    sheet.add_data_validation(type_validation)
    sheet.add_data_validation(category_validation)
    type_validation.add(type_range)
    category_validation.add(category_range)


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


def export_csv(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
) -> Response:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "type",
            "budget_item_id",
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
        writer.writerow(
            [
                "plan",
                plan.budget_item_id,
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
        writer.writerow(
            [
                "expense",
                expense.budget_item_id,
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
            "Harcama Türü",
            "Kategori",
        ]
    )
    expenses = _get_expenses(session, year, scenario_id, budget_item_id)
    for expense in expenses:
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
                "",
                "",
            ]
        )
    _add_category_validations(
        wb,
        expense_sheet,
        expense_sheet.max_column - 1,
        expense_sheet.max_column,
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
            "Scenario ID",
            "Date",
            "Amount (USD)",
            "Quantity",
            "Unit Price",
            "Vendor",
            "Description",
            "Status",
            "Out of Budget",
            "Harcama Türü",
            "Kategori",
        ]
    )
    for expense in filtered:
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
                "",
                "",
            ]
        )

    _add_category_validations(
        wb,
        sheet,
        sheet.max_column - 1,
        sheet.max_column,
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
