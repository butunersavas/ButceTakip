from datetime import date
from io import StringIO
import csv

from sqlmodel import Session, SQLModel, create_engine

from app.models import (
    AssetType,
    BudgetItem,
    CostType,
    Expense,
    ExpenseStatus,
    PlanEntry,
    Scenario,
)
from app.services import exporter


def _setup_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_export_csv_includes_classification_columns():
    with _setup_session() as session:
        scenario = Scenario(name="Temel", year=2024)
        session.add(scenario)
        session.flush()

        budget_item = BudgetItem(
            code="MARKETING",
            name="Marketing Temel",
            map_attribute="Hizmet",
            cost_type=CostType.OPEX,
            asset_type=AssetType.SOFTWARE,
        )
        session.add(budget_item)
        session.flush()

        session.add(
            PlanEntry(
                year=2024,
                month=1,
                amount=15000,
                scenario_id=scenario.id,
                budget_item_id=budget_item.id,
            )
        )

        session.add(
            Expense(
                budget_item_id=budget_item.id,
                scenario_id=scenario.id,
                expense_date=date(2024, 1, 15),
                amount=12000,
                quantity=1,
                unit_price=12000,
                vendor="ACME Ltd",
                description="Reklam harcaması",
                status=ExpenseStatus.RECORDED,
                is_out_of_budget=False,
            )
        )

        session.commit()

        response = exporter.export_csv(session, 2024, scenario.id)
        csv_text = response.body.decode().strip()

    reader = csv.DictReader(StringIO(csv_text))
    assert reader.fieldnames[:7] == [
        "type",
        "budget_code",
        "budget_name",
        "map_attribute",
        "cost_type",
        "asset_type",
        "scenario",
    ]

    rows = list(reader)
    assert any(row["cost_type"] == "opex" for row in rows)
    assert any(row["asset_type"] == "software" for row in rows)
