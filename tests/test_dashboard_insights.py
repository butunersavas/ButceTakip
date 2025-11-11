import sys
from datetime import date
from pathlib import Path

import pytest
from sqlmodel import Session, SQLModel, create_engine

# Ensure the application package is importable when running tests directly
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import app.services.dashboard_insights as dashboard_insights
from app.models import BudgetItem, Expense, ExpenseStatus, PlanEntry, Scenario
from app.services.analytics import MonthlyAggregate
from app.services.dashboard_insights import build_dashboard_reminders, build_today_panel


@pytest.fixture()
def fixed_today(monkeypatch):
    class FixedDate(date):
        @classmethod
        def today(cls) -> "FixedDate":  # type: ignore[override]
            return cls(2023, 12, 15)

    monkeypatch.setattr(dashboard_insights, "date", FixedDate)
    return FixedDate.today()


@pytest.fixture()
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_build_dashboard_reminders_flags_missing_invoices(session: Session, fixed_today: date):
    scenario = Scenario(name="Varsayılan", year=fixed_today.year)
    budget_item = BudgetItem(code="ELK-001", name="Elektrik")
    session.add(scenario)
    session.add(budget_item)
    session.commit()
    session.refresh(scenario)
    session.refresh(budget_item)

    session.add(
        PlanEntry(
            year=fixed_today.year,
            month=11,
            amount=1250.0,
            scenario_id=scenario.id,
            budget_item_id=budget_item.id,
        )
    )
    session.commit()

    monthly = [
        MonthlyAggregate(month=11, planned=1250.0, actual=0.0),
    ]

    reminders = build_dashboard_reminders(
        session,
        year=fixed_today.year,
        scenario_id=None,
        budget_item_id=None,
        monthly=monthly,
    )

    november_warning = next(
        (reminder for reminder in reminders if reminder.message == "Kasım faturaları girilmedi"),
        None,
    )
    assert november_warning is not None
    assert november_warning.severity == "warning"


def test_build_dashboard_reminders_suggests_inactive_budget_items(session: Session, fixed_today: date):
    scenario = Scenario(name="Varsayılan", year=fixed_today.year)
    budget_item = BudgetItem(code="PRS-001", name="Basınç Sensörü")
    session.add(scenario)
    session.add(budget_item)
    session.commit()
    session.refresh(scenario)
    session.refresh(budget_item)

    session.add(
        PlanEntry(
            year=fixed_today.year,
            month=7,
            amount=980.0,
            scenario_id=scenario.id,
            budget_item_id=budget_item.id,
        )
    )
    session.commit()

    session.add(
        Expense(
            budget_item_id=budget_item.id,
            scenario_id=scenario.id,
            expense_date=date(2023, 8, 10),
            amount=250.0,
            status=ExpenseStatus.RECORDED,
            is_out_of_budget=False,
        )
    )
    session.commit()

    reminders = build_dashboard_reminders(
        session,
        year=fixed_today.year,
        scenario_id=None,
        budget_item_id=None,
        monthly=[MonthlyAggregate(month=7, planned=980.0, actual=250.0)],
    )

    suggestion = next(
        (
            reminder
            for reminder in reminders
            if "Basınç Sensörü" in reminder.message and "kullanılmadı" in reminder.message
        ),
        None,
    )
    assert suggestion is not None
    assert suggestion.severity == "info"
    assert suggestion.message.endswith("silelim mi?")


def test_build_today_panel_groups_entries_by_status(session: Session, fixed_today: date):
    scenario = Scenario(name="Varsayılan", year=fixed_today.year)
    budget_item = BudgetItem(code="PRS-002", name="Yakıt Pompası")
    session.add(scenario)
    session.add(budget_item)
    session.commit()
    session.refresh(scenario)
    session.refresh(budget_item)

    today = fixed_today
    session.add_all(
        [
            Expense(
                budget_item_id=budget_item.id,
                scenario_id=scenario.id,
                expense_date=today,
                amount=150.0,
                status=ExpenseStatus.RECORDED,
                is_out_of_budget=False,
            ),
            Expense(
                budget_item_id=budget_item.id,
                scenario_id=scenario.id,
                expense_date=today,
                amount=45.0,
                status=ExpenseStatus.RECORDED,
                is_out_of_budget=True,
            ),
            Expense(
                budget_item_id=budget_item.id,
                scenario_id=scenario.id,
                expense_date=today,
                amount=60.0,
                status=ExpenseStatus.CANCELLED,
                is_out_of_budget=False,
            ),
            Expense(
                budget_item_id=budget_item.id,
                scenario_id=scenario.id,
                expense_date=date(2023, 12, 10),
                amount=99.0,
                status=ExpenseStatus.RECORDED,
                is_out_of_budget=False,
            ),
        ]
    )
    session.commit()

    panel = build_today_panel(
        session,
        scenario_id=scenario.id,
        budget_item_id=None,
    )

    assert len(panel.recorded) == 1
    assert len(panel.cancelled) == 1
    assert len(panel.out_of_budget) == 1
    assert panel.recorded[0].amount == 150.0
    assert panel.out_of_budget[0].amount == 45.0
    assert panel.cancelled[0].status == ExpenseStatus.CANCELLED
