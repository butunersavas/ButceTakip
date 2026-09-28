from __future__ import annotations

from io import BytesIO
import re
import unicodedata

from openpyxl import Workbook
from openpyxl.styles import Font
from sqlmodel import Session, select

from app.models import BudgetPreparation, BudgetPreparationAllocation, BudgetPreparationItem


BUDGET_PREPARATION_EXPORT_HEADERS = [
    "type", "budget_code", "budget_name", "scenario", "year", "month",
    "amount", "date", "quantity", "unit_price", "vendor", "description",
    "department", "out_of_budget", "capex_opex", "asset_type",
]


def _safe_filename_part(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Za-z0-9]+", "_", ascii_value).strip("_") or "Butce"


def budget_preparation_export_filename(preparation: BudgetPreparation) -> str:
    return f"Butce_Hazirlama_{preparation.year}_{_safe_filename_part(preparation.name)}.xlsx"


def build_budget_preparation_export(session: Session, preparation: BudgetPreparation) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Örnek"
    worksheet.append(BUDGET_PREPARATION_EXPORT_HEADERS)
    for cell in worksheet[1]:
        cell.font = Font(bold=True)

    items = session.exec(
        select(BudgetPreparationItem)
        .where(BudgetPreparationItem.preparation_id == preparation.id)
        .order_by(BudgetPreparationItem.id)
    ).all()
    for item in items:
        allocations = session.exec(
            select(BudgetPreparationAllocation)
            .where(BudgetPreparationAllocation.item_id == item.id)
            .order_by(BudgetPreparationAllocation.year, BudgetPreparationAllocation.month)
        ).all()
        for allocation in allocations:
            amount = float(allocation.amount)
            worksheet.append([
                "plan", item.budget_code, item.budget_name, "Temel",
                int(allocation.year), int(allocation.month), amount, None, 1,
                amount, None, item.description or item.budget_name,
                item.department, "YANLIŞ",
                "Capex" if (item.capex_opex or "").upper() == "CAPEX" else "Opex",
                item.map_attribute,
            ])

    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = worksheet.dimensions
    for column in ("G", "J"):
        for cell in worksheet[column][1:]:
            cell.number_format = "0.00"
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()
