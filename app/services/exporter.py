import csv
import io
from datetime import date
from typing import Literal

from fastapi import Response
from openpyxl import Workbook
from sqlmodel import Session, exists, select

from app.models import BudgetItem, Expense, ExpenseStatus, PlanEntry, PurchaseFormStatus, Scenario
from app.services.analytics import compute_quarterly_summary
from app.schemas import PurchaseFormPreparedReportItem


CURRENCY_SYMBOL = "$"

EXPORT_HEADERS = [
    "type",
    "budget_code",
    "budget_name",
    "scenario",
    "year",
    "month",
    "amount",
    "date",
    "quantity",
    "unit_price",
    "vendor",
    "description",
    "out_of_budget",
    "capex_opex",
    "asset_type",
]


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


def _get_scenario_map(session: Session) -> dict[int, Scenario]:
    return {scenario.id: scenario for scenario in session.exec(select(Scenario)).all()}


def _append_plan_rows(
    sheet,
    plans: list[PlanEntry],
    budget_items: dict[int, BudgetItem],
    scenarios: dict[int, Scenario],
):
    for plan in plans:
        budget_item = budget_items.get(plan.budget_item_id)
        scenario = scenarios.get(plan.scenario_id) if plan.scenario_id else None
        sheet.append(
            [
                "plan",
                budget_item.code if budget_item else "",
                budget_item.name if budget_item else "",
                scenario.name if scenario else "",
                plan.year,
                plan.month,
                plan.amount,
                "",
                "",
                "",
                "",
                "",
                "false",
                budget_item.map_category if budget_item and budget_item.map_category else "",
                budget_item.map_attribute if budget_item and budget_item.map_attribute else "",
            ]
        )


def _append_expense_rows(
    sheet,
    expenses: list[Expense],
    budget_items: dict[int, BudgetItem],
    scenarios: dict[int, Scenario],
):
    for expense in expenses:
        budget_item = budget_items.get(expense.budget_item_id)
        scenario = scenarios.get(expense.scenario_id) if expense.scenario_id else None
        sheet.append(
            [
                "expense",
                budget_item.code if budget_item else "",
                budget_item.name if budget_item else "",
                scenario.name if scenario else "",
                expense.expense_date.year,
                expense.expense_date.month,
                expense.amount,
                expense.expense_date.isoformat(),
                expense.quantity,
                expense.unit_price,
                expense.vendor or "",
                expense.description or "",
                "true" if expense.is_out_of_budget else "false",
                budget_item.map_category if budget_item and budget_item.map_category else "",
                budget_item.map_attribute if budget_item and budget_item.map_attribute else "",
            ]
        )


def get_purchase_forms_prepared(
    session: Session,
    year: int,
    scenario_id: int | None = None,
) -> list[PurchaseFormPreparedReportItem]:
    query = (
        select(
            PurchaseFormStatus.budget_item_id,
            BudgetItem.code,
            BudgetItem.name,
            PurchaseFormStatus.year,
            PurchaseFormStatus.month,
        )
        .join(BudgetItem, BudgetItem.id == PurchaseFormStatus.budget_item_id)
        .where(PurchaseFormStatus.year == year)
        .where(PurchaseFormStatus.is_prepared.is_(True))
    )

    if scenario_id is not None:
        query = query.where(
            exists(
                select(PlanEntry.id)
                .where(PlanEntry.budget_item_id == PurchaseFormStatus.budget_item_id)
                .where(PlanEntry.year == year)
                .where(PlanEntry.scenario_id == scenario_id)
            )
        )

    rows = session.exec(query.order_by(PurchaseFormStatus.month, BudgetItem.code)).all()
    return [
        PurchaseFormPreparedReportItem(
            budget_item_id=budget_item_id,
            budget_code=code,
            budget_name=name,
            year=form_year,
            month=month,
            scenario_id=scenario_id if scenario_id is not None else None,
        )
        for budget_item_id, code, name, form_year, month in rows
    ]


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
            "map_category",
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
            "client_hostname",
            "kaydi_giren_kullanici",
        ]
    )

    plan_query = select(PlanEntry).where(PlanEntry.year == year)
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        plan_query = plan_query.where(PlanEntry.budget_item_id == budget_item_id)
    for plan in session.exec(plan_query).all():
        budget_item = budget_items.get(plan.budget_item_id)
        map_attribute = budget_item.map_attribute if budget_item else ""
        map_category = budget_item.map_category if budget_item else ""
        writer.writerow(
            [
                "plan",
                plan.budget_item_id,
                map_category or "",
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
        budget_item = budget_items.get(expense.budget_item_id)
        map_attribute = budget_item.map_attribute if budget_item else ""
        map_category = budget_item.map_category if budget_item else ""
        writer.writerow(
            [
                "expense",
                expense.budget_item_id,
                map_category or "",
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
                expense.client_hostname or "",
                expense.kaydi_giren_kullanici or "",
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
    plan_sheet.title = "BudgetData"
    plan_sheet.append(EXPORT_HEADERS)
    budget_items = _get_budget_item_map(session)
    scenarios = _get_scenario_map(session)
    plan_query = select(PlanEntry).where(PlanEntry.year == year)
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        plan_query = plan_query.where(PlanEntry.budget_item_id == budget_item_id)
    plans = session.exec(plan_query).all()
    _append_plan_rows(plan_sheet, plans, budget_items, scenarios)

    expenses = _get_expenses(session, year, scenario_id, budget_item_id)
    _append_expense_rows(plan_sheet, expenses, budget_items, scenarios)
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
    scenarios = _get_scenario_map(session)
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
    sheet.append(EXPORT_HEADERS)
    _append_expense_rows(sheet, filtered, budget_items, scenarios)

    output = io.BytesIO()
    wb.save(output)
    response = Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


def export_purchase_forms_prepared_xlsx(
    session: Session,
    year: int,
    scenario_id: int | None = None,
) -> Response:
    items = get_purchase_forms_prepared(session, year, scenario_id)
    wb = Workbook()
    sheet = wb.active
    sheet.title = "PreparedPurchaseForms"
    sheet.append([
        "Budget Code",
        "Budget Name",
        "Year",
        "Month",
        "Scenario ID",
    ])

    for item in items:
        sheet.append(
            [
                item.budget_code,
                item.budget_name,
                item.year,
                item.month,
                item.scenario_id or "",
            ]
        )

    output = io.BytesIO()
    wb.save(output)
    response = Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response.headers["Content-Disposition"] = (
        f"attachment; filename=purchase_forms_prepared_{year}.xlsx"
    )
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
