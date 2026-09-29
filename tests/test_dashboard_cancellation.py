import unittest
from datetime import date

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.models import (
    BudgetItem,
    Expense,
    ExpenseStatus,
    PlanEntry,
    PurchaseFormStatusExt,
    Scenario,
    User,
)
from app.routers.dashboard import get_dashboard, get_overbudget


class DashboardCancellationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.user = User(username="dashboard-admin", hashed_password="test", is_admin=True)
        self.scenario = Scenario(name="Dashboard 2028", year=2028, is_primary=True)
        self.session.add_all([self.user, self.scenario])
        self.session.commit()
        self.session.refresh(self.user)
        self.session.refresh(self.scenario)

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def add_plan(
        self,
        code: str,
        amount: float,
        *,
        unused_amount: float = 0,
        unused_reason: str | None = None,
    ) -> BudgetItem:
        item = BudgetItem(code=code, name=code, map_category="capex")
        self.session.add(item)
        self.session.flush()
        self.session.add(PlanEntry(
            year=2028,
            month=1,
            amount=amount,
            scenario_id=self.scenario.id,
            budget_item_id=item.id,
            budget_code=code,
            department="Sistem",
            unused_amount=unused_amount,
            unused_reason=unused_reason,
        ))
        return item

    def test_canonical_cancelled_budget_excludes_cancelled_expenses_and_reconciles(self) -> None:
        negotiated_item = self.add_plan("NEG", 3_294_650.82)
        self.add_plan(
            "OPT",
            1_507_773.99,
            unused_amount=1_507_773.99,
            unused_reason="unused",
        )
        cancelled_item = self.add_plan(
            "CANCEL",
            1_325_236.00,
            unused_amount=1_325_236.00,
            unused_reason="purchase_cancelled",
        )
        self.add_plan("REMAIN", 1_253_979.59)
        self.session.add(PurchaseFormStatusExt(
            budget_code="NEG",
            year=2028,
            month=1,
            scenario_id=self.scenario.id,
            department="Sistem",
            is_form_prepared=True,
        ))
        self.session.add(Expense(
            budget_item_id=negotiated_item.id,
            budget_code="NEG",
            scenario_id=self.scenario.id,
            expense_date=date(2028, 1, 15),
            amount=2_701_693.62,
            status=ExpenseStatus.RECORDED,
            is_out_of_budget=False,
        ))
        for day in (16, 17, 18):
            self.session.add(Expense(
                budget_item_id=cancelled_item.id,
                budget_code="CANCEL",
                scenario_id=self.scenario.id,
                expense_date=date(2028, 1, day),
                amount=89_200.00,
                status=ExpenseStatus.CANCELLED,
                is_out_of_budget=False,
            ))
        self.session.commit()

        dashboard = get_dashboard(
            year=2028,
            scenario_id=self.scenario.id,
            month=None,
            month_list=None,
            budget_item_id=None,
            department=None,
            capex_opex=None,
            effective_primary=False,
            session=self.session,
            _=self.user,
        )
        self.assertEqual(7_381_640.40, dashboard.reconciliation.total_plan_amount)
        self.assertEqual(2_701_693.62, dashboard.kpi.total_actual)
        self.assertEqual(1_253_979.59, dashboard.kpi.total_remaining)
        self.assertEqual(592_957.20, dashboard.kpi.total_negotiated_saving)
        self.assertEqual(1_507_773.99, dashboard.kpi.total_other_saving)
        self.assertEqual(2_100_731.19, dashboard.kpi.total_combined_saving)
        self.assertEqual(1_325_236.00, dashboard.kpi.total_cancelled)
        self.assertEqual(0, dashboard.reconciliation.reconciliation_difference)

        details = get_overbudget(
            year=2028,
            scenario_id=self.scenario.id,
            months=None,
            month=None,
            month_list=None,
            start_month=None,
            end_month=None,
            budget_item_id=None,
            budget_code=None,
            department=None,
            capex_opex=None,
            session=self.session,
            _=self.user,
        )
        self.assertEqual(1, len(details.cancelled_items))
        self.assertEqual(
            dashboard.kpi.total_cancelled,
            sum(item.unused_amount for item in details.cancelled_items),
        )
        self.assertEqual(1_507_773.99, details.summary.other_saving_total)


if __name__ == "__main__":
    unittest.main()
