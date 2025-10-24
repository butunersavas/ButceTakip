import csv
import io
import json
from datetime import date

from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.models import BudgetItem, Expense, PlanEntry, Scenario
from app.schemas import ImportSummary


def _ensure_budget_item(session: Session, code: str, name: str | None = None) -> BudgetItem:
    item = session.exec(select(BudgetItem).where(BudgetItem.code == code)).first()
    if item:
        return item
    if not name:
        raise HTTPException(status_code=400, detail=f"Missing name for budget item {code}")
    item = BudgetItem(code=code, name=name)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


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
            item = _ensure_budget_item(session, entry["budget_code"], entry.get("budget_name"))
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
        item = _ensure_budget_item(session, item_code, months.get("name"))
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
        try:
            entry_type = row.get("type", "plan").lower()
            if entry_type == "plan":
                item = _ensure_budget_item(session, row["budget_code"], row.get("budget_name"))
                scenario = _get_or_create_scenario(session, row.get("scenario"), int(row["year"]))
                plan = PlanEntry(
                    year=int(row["year"]),
                    month=int(row["month"]),
                    amount=float(row["amount"]),
                    scenario_id=scenario.id,
                    budget_item_id=item.id,
                )
                session.add(plan)
                session.commit()
                summary.imported_plans += 1
            elif entry_type == "expense":
                item = _ensure_budget_item(session, row["budget_code"], row.get("budget_name"))
                scenario = _get_or_create_scenario(session, row.get("scenario"), int(row["year"]))
                expense = Expense(
                    budget_item_id=item.id,
                    scenario_id=scenario.id,
                    expense_date=date.fromisoformat(row["date"]),
                    amount=float(row["amount"]),
                    quantity=float(row.get("quantity", 1) or 1),
                    unit_price=float(row.get("unit_price", 0) or 0),
                    vendor=row.get("vendor"),
                    description=row.get("description"),
                    is_out_of_budget=row.get("out_of_budget", "false").lower() == "true",
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
