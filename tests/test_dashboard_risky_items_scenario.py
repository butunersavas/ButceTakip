import unittest
from datetime import date

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.models import BudgetItem, Expense, ExpenseStatus, PlanEntry, Scenario
from app.routers.dashboard import get_risky_budget_items


class DashboardRiskyItemsScenarioTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)

        scenario_a = Scenario(name="Scenario A", year=2027)
        scenario_b = Scenario(name="Scenario B", year=2027)
        budget_item = BudgetItem(code="RISK-2027", name="Riskli Kalem")
        self.session.add(scenario_a)
        self.session.add(scenario_b)
        self.session.add(budget_item)
        self.session.commit()
        self.session.refresh(scenario_a)
        self.session.refresh(scenario_b)
        self.session.refresh(budget_item)

        self.scenario_a_id = scenario_a.id
        self.scenario_b_id = scenario_b.id
        self.session.add(
            PlanEntry(
                year=2027,
                month=1,
                amount=100,
                scenario_id=scenario_a.id,
                budget_item_id=budget_item.id,
                budget_code=budget_item.code,
            )
        )
        self.session.add(
            PlanEntry(
                year=2027,
                month=1,
                amount=200,
                scenario_id=scenario_b.id,
                budget_item_id=budget_item.id,
                budget_code=budget_item.code,
            )
        )
        self.session.add(
            Expense(
                budget_item_id=budget_item.id,
                scenario_id=scenario_a.id,
                budget_code=budget_item.code,
                expense_date=date(2027, 1, 15),
                amount=90,
                status=ExpenseStatus.RECORDED,
                is_out_of_budget=False,
            )
        )
        self.session.add(
            Expense(
                budget_item_id=budget_item.id,
                scenario_id=scenario_b.id,
                budget_code=budget_item.code,
                expense_date=date(2027, 1, 16),
                amount=170,
                status=ExpenseStatus.RECORDED,
                is_out_of_budget=False,
            )
        )
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def risky_items(self, scenario_id: int | None):
        return get_risky_budget_items(
            year=2027,
            scenario_id=scenario_id,
            month=None,
            month_list=None,
            department=None,
            capex_opex=None,
            session=self.session,
            _=None,
        )

    def test_selected_scenario_only_uses_its_plan_and_actual(self) -> None:
        scenario_a_items = self.risky_items(self.scenario_a_id)
        scenario_b_items = self.risky_items(self.scenario_b_id)

        self.assertEqual(1, len(scenario_a_items))
        self.assertEqual(100, scenario_a_items[0].plan)
        self.assertEqual(90, scenario_a_items[0].actual)
        self.assertEqual(0.9, scenario_a_items[0].ratio)

        self.assertEqual(1, len(scenario_b_items))
        self.assertEqual(200, scenario_b_items[0].plan)
        self.assertEqual(170, scenario_b_items[0].actual)
        self.assertEqual(0.85, scenario_b_items[0].ratio)

    def test_missing_scenario_keeps_all_scenario_behavior(self) -> None:
        items = self.risky_items(None)

        self.assertEqual(2, len(items))
        self.assertEqual([100, 200], sorted(item.plan for item in items))
        self.assertEqual([90, 170], sorted(item.actual for item in items))


if __name__ == "__main__":
    unittest.main()
