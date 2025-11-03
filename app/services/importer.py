import csv
import io
import json
from datetime import date, datetime
from typing import Any

from openpyxl import load_workbook

from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.models import BudgetItem, Expense, PlanEntry, Scenario
from app.schemas import ImportSummary


def _normalize_key(key: str) -> str:
    return (
        key.strip().lower().replace(" ", "").replace("-", "").replace("_", "")
        if key
        else ""
    )


def _normalize_record(data: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for raw_key, value in data.items():
        if raw_key is None:
            continue
        normalized_key = _normalize_key(str(raw_key))
        if normalized_key and normalized_key not in normalized:
            normalized[normalized_key] = value
    return normalized


def _ensure_budget_item(
    session: Session,
    code: str,
    name: str | None = None,
    map_attribute: str | None = None,
) -> BudgetItem:
    item = session.exec(select(BudgetItem).where(BudgetItem.code == code)).first()
    if item:
        updated = False
        if name and item.name != name:
            item.name = name
            updated = True
        if map_attribute and item.map_attribute != map_attribute:
            item.map_attribute = map_attribute
            updated = True
        if updated:
            session.add(item)
            session.commit()
            session.refresh(item)
        return item
    if not name:
        raise HTTPException(status_code=400, detail=f"Missing name for budget item {code}")
    item = BudgetItem(code=code, name=name, map_attribute=map_attribute)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def _extract_map_attribute(data: dict[str, Any]) -> str | None:
    normalized = _normalize_record(data)
    for key in ("mapattribute", "mapnitelik"):
        if key not in normalized:
            continue
        value = normalized[key]
        stripped = value.strip() if isinstance(value, str) else str(value).strip()
        if stripped:
            return stripped
    return None


def _coerce_str(value: Any, field: str) -> str:
    if value is None:
        raise ValueError(f"Missing value for {field}")
    if isinstance(value, str):
        text = value.strip()
    else:
        text = str(value).strip()
    if not text:
        raise ValueError(f"Missing value for {field}")
    return text


def _coerce_int(value: Any, field: str) -> int:
    if value is None:
        raise ValueError(f"Missing value for {field}")
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).strip()
    if not text:
        raise ValueError(f"Missing value for {field}")
    return int(text)


def _coerce_float(value: Any, field: str) -> float:
    if value is None:
        raise ValueError(f"Missing value for {field}")
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        raise ValueError(f"Missing value for {field}")
    return float(text)


def _coerce_date(value: Any, field: str) -> date:
    if value is None:
        raise ValueError(f"Missing value for {field}")
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        raise ValueError(f"Missing value for {field}")
    return date.fromisoformat(text)


def _get_value(data: dict[str, Any], *keys: str) -> Any:
    normalized = _normalize_record(data)
    for key in keys:
        normalized_key = _normalize_key(key)
        if normalized_key in normalized:
            value = normalized[normalized_key]
            if isinstance(value, str):
                stripped = value.strip()
                if stripped:
                    return stripped
                continue
            if value not in (None, ""):
                return value
    return None


def import_json(file: UploadFile, session: Session) -> ImportSummary:
    try:
        payload = json.loads(file.file.read().decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON file") from exc

    summary = ImportSummary()
    if isinstance(payload, dict) and "plans" in payload:
        summary.imported_plans += _import_plan_list(payload["plans"], session)
    elif isinstance(payload, dict) and "year" in payload and "items" in payload:
        summary.imported_plans += _import_year_month_structure(payload, session)
    elif isinstance(payload, list):
        summary.imported_plans += _import_plan_list(payload, session)
    else:
        raise HTTPException(status_code=400, detail="Unsupported JSON schema")
    summary.message = "JSON import completed"
    return summary


def _import_plan_list(data: list[dict], session: Session) -> int:
    imported = 0
    for entry in data:
        try:
            map_attribute = _extract_map_attribute(entry)
            item = _ensure_budget_item(
                session, entry["budget_code"], entry.get("budget_name"), map_attribute
            )
            scenario = _get_or_create_scenario(
                session, entry.get("scenario"), int(entry.get("year"))
            )
            plan = PlanEntry(
                year=int(entry["year"]),
                month=int(entry["month"]),
                amount=float(entry["amount"]),
                scenario_id=scenario.id,
                budget_item_id=item.id,
            )
            session.add(plan)
            session.commit()
            imported += 1
        except Exception:
            session.rollback()
    return imported


def _import_year_month_structure(data: dict, session: Session) -> int:
    imported = 0
    year = int(data["year"])
    scenario = _get_or_create_scenario(session, data.get("scenario"), year)
    for item_code, months in data.get("items", {}).items():
        item = _ensure_budget_item(
            session, item_code, months.get("name"), _extract_map_attribute(months)
        )
        for month_str, amount in months.get("plan", {}).items():
            plan = PlanEntry(
                year=year,
                month=int(month_str),
                amount=float(amount),
                scenario_id=scenario.id,
                budget_item_id=item.id,
            )
            session.add(plan)
            session.commit()
            imported += 1
    return imported


def _get_or_create_scenario(session: Session, scenario_name: str | None, year: int) -> Scenario:
    if scenario_name:
        scenario = session.exec(
            select(Scenario).where(Scenario.name == scenario_name).where(Scenario.year == year)
        ).first()
        if scenario:
            return scenario
        scenario = Scenario(name=scenario_name, year=year)
        session.add(scenario)
        session.commit()
        session.refresh(scenario)
        return scenario
    scenario = session.exec(select(Scenario).where(Scenario.year == year)).first()
    if scenario:
        return scenario
    scenario = Scenario(name=f"Default {year}", year=year)
    session.add(scenario)
    session.commit()
    session.refresh(scenario)
    return scenario


def import_csv(file: UploadFile, session: Session) -> ImportSummary:
    try:
        content = file.file.read().decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded") from exc
    reader = csv.DictReader(io.StringIO(content))
    summary = ImportSummary()
    for row in reader:
        normalized_row = {key: value for key, value in row.items() if key is not None}
        try:
            entry_type_raw = _get_value(normalized_row, "type")
            entry_type = str(entry_type_raw).lower() if entry_type_raw is not None else "plan"
            map_attribute = _extract_map_attribute(normalized_row)
            if entry_type == "plan":
                budget_code = _coerce_str(
                    _get_value(normalized_row, "budget_code", "budget code", "kod"),
                    "budget_code",
                )
                budget_name = _get_value(normalized_row, "budget_name", "budget name", "ad")
                year_value = _coerce_int(
                    _get_value(normalized_row, "year", "yıl"),
                    "year",
                )
                scenario_name = _get_value(normalized_row, "scenario", "senaryo")
                item = _ensure_budget_item(session, budget_code, budget_name, map_attribute)
                scenario = _get_or_create_scenario(session, scenario_name, year_value)
                month_value = _coerce_int(
                    _get_value(normalized_row, "month", "ay"),
                    "month",
                )
                amount_value = _coerce_float(
                    _get_value(normalized_row, "amount", "tutar"),
                    "amount",
                )
                plan = PlanEntry(
                    year=year_value,
                    month=month_value,
                    amount=amount_value,
                    scenario_id=scenario.id,
                    budget_item_id=item.id,
                )
                session.add(plan)
                session.commit()
                summary.imported_plans += 1
            elif entry_type == "expense":
                budget_code = _coerce_str(
                    _get_value(normalized_row, "budget_code", "budget code", "kod"),
                    "budget_code",
                )
                budget_name = _get_value(normalized_row, "budget_name", "budget name", "ad")
                year_value = _coerce_int(
                    _get_value(normalized_row, "year", "yıl"),
                    "year",
                )
                scenario_name = _get_value(normalized_row, "scenario", "senaryo")
                item = _ensure_budget_item(session, budget_code, budget_name, map_attribute)
                scenario = _get_or_create_scenario(session, scenario_name, year_value)
                amount_value = _coerce_float(
                    _get_value(normalized_row, "amount", "tutar"),
                    "amount",
                )
                quantity_value = _get_value(normalized_row, "quantity", "adet")
                unit_price_value = _get_value(normalized_row, "unit_price", "birim fiyat")
                date_value = _get_value(normalized_row, "date", "tarih")
                expense = Expense(
                    budget_item_id=item.id,
                    scenario_id=scenario.id,
                    expense_date=_coerce_date(date_value, "date"),
                    amount=amount_value,
                    quantity=(
                        float(quantity_value) if quantity_value not in (None, "") else 1.0
                    ),
                    unit_price=(
                        float(unit_price_value)
                        if unit_price_value not in (None, "")
                        else 0.0
                    ),
                    vendor=_get_value(normalized_row, "vendor", "satıcı"),
                    description=_get_value(normalized_row, "description", "açıklama"),
                    is_out_of_budget=(
                        str(_get_value(normalized_row, "out_of_budget", "bütçe_dışı") or "false")
                        .lower()
                        == "true"
                    ),
                )
                session.add(expense)
                session.commit()
                summary.imported_expenses += 1
            else:
                summary.skipped_rows += 1
        except Exception:
            session.rollback()
            summary.skipped_rows += 1
    summary.message = "CSV import completed"
    return summary


def import_xlsx(file: UploadFile, session: Session) -> ImportSummary:
    try:
        file.file.seek(0)
        workbook = load_workbook(file.file, data_only=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid XLSX file") from exc

    sheet = workbook.active
    if sheet is None:
        raise HTTPException(status_code=400, detail="XLSX file does not contain any sheets")

    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="XLSX file is empty")

    headers: list[str] = []
    for cell in rows[0]:
        if cell is None:
            headers.append("")
        elif isinstance(cell, str):
            headers.append(cell.strip().lower())
        else:
            headers.append(str(cell).strip().lower())

    summary = ImportSummary()
    for values in rows[1:]:
        row: dict[str, Any] = {}
        for index, header in enumerate(headers):
            if not header:
                continue
            row[header] = values[index] if index < len(values) else None
        if not row:
            continue
        entry_type = str(row.get("type") or "plan").lower()
        map_attribute = _extract_map_attribute(row)
        try:
            budget_code = _coerce_str(
                _get_value(row, "budget_code", "budget code", "kod"),
                "budget_code",
            )
            budget_name = _get_value(row, "budget_name", "budget name", "ad")
            scenario_name = _get_value(row, "scenario", "senaryo")
            year_value = _coerce_int(_get_value(row, "year", "yıl"), "year")

            if entry_type == "plan":
                month_value = _coerce_int(_get_value(row, "month", "ay"), "month")
                amount_value = _coerce_float(_get_value(row, "amount", "tutar"), "amount")
                item = _ensure_budget_item(session, budget_code, budget_name, map_attribute)
                scenario = _get_or_create_scenario(session, scenario_name, year_value)
                plan = PlanEntry(
                    year=year_value,
                    month=month_value,
                    amount=amount_value,
                    scenario_id=scenario.id,
                    budget_item_id=item.id,
                )
                session.add(plan)
                session.commit()
                summary.imported_plans += 1
            elif entry_type == "expense":
                item = _ensure_budget_item(session, budget_code, budget_name, map_attribute)
                scenario = _get_or_create_scenario(session, scenario_name, year_value)
                amount_value = _coerce_float(_get_value(row, "amount", "tutar"), "amount")
                quantity_value = _get_value(row, "quantity", "adet")
                unit_price_value = _get_value(row, "unit_price", "birim fiyat")
                date_value = _get_value(row, "date", "tarih")
                expense = Expense(
                    budget_item_id=item.id,
                    scenario_id=scenario.id,
                    expense_date=_coerce_date(date_value, "date"),
                    amount=amount_value,
                    quantity=float(quantity_value) if quantity_value not in (None, "") else 1.0,
                    unit_price=float(unit_price_value) if unit_price_value not in (None, "") else 0.0,
                    vendor=_get_value(row, "vendor", "satıcı"),
                    description=_get_value(row, "description", "açıklama"),
                    is_out_of_budget=str(_get_value(row, "out_of_budget", "bütçe_dışı") or "false").lower()
                    == "true",
                )
                session.add(expense)
                session.commit()
                summary.imported_expenses += 1
            else:
                summary.skipped_rows += 1
        except Exception:
            session.rollback()
            summary.skipped_rows += 1

    summary.message = "XLSX import completed"
    return summary
