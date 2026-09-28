import unittest
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import (
    BudgetItem,
    BudgetPreparation,
    BudgetPreparationAllocation,
    BudgetPreparationItem,
    Expense,
    ExpenseAllocation,
    PlanEntry,
    Scenario,
    User,
)
from app.main import app
from app.routers.dashboard import get_dashboard
from app.routers.plans import (
    create_accrual_plan,
    create_manual_plan_entry,
    delete_accrual_plan,
    update_accrual_plan,
)
from app.schemas import AccrualPlanInput, PlanManualCreate


class PlanAccrualTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.user = User(username="accrual-admin", hashed_password="test", is_admin=True)
        self.source = Scenario(name="Temel", year=2027, is_primary=True)
        self.item = BudgetItem(
            code="TAHAKKUK-TEST",
            name="TAHAKKUK TEST",
            map_category="capex",
            map_attribute="Donanım",
        )
        self.session.add(self.user)
        self.session.add(self.source)
        self.session.add(self.item)
        self.session.commit()
        self.session.refresh(self.source)
        self.session.refresh(self.item)

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def payload(self, **overrides) -> AccrualPlanInput:
        values = {
            "total_amount": Decimal("12565.00"),
            "start_year": 2027,
            "start_month": 3,
            "month_count": 12,
            "scenario_id": self.source.id,
            "budget_item_id": self.item.id,
            "department": "Sistem",
            "merge_mode": "separate",
        }
        values.update(overrides)
        return AccrualPlanInput(**values)

    def test_budget_preparation_routes_are_not_registered(self) -> None:
        paths = {route.path for route in app.routes}
        self.assertFalse(any(path.startswith("/api/budget-preparations") for path in paths))

    def test_single_month_plan_keeps_existing_behavior(self) -> None:
        result = create_manual_plan_entry(
            PlanManualCreate(
                year=2027,
                month=4,
                amount=500,
                scenario_id=self.source.id,
                budget_item_id=self.item.id,
                department="Sistem",
                merge_mode="separate",
            ),
            self.session,
            self.user,
        )
        self.assertEqual((2027, 4, 500.0), (result.year, result.month, result.amount))
        self.assertFalse(result.is_accrual)

    def test_cross_year_decimal_group_scenarios_dashboard_and_preparation_independence(self) -> None:
        preparation_counts = (
            len(self.session.exec(select(BudgetPreparation)).all()),
            len(self.session.exec(select(BudgetPreparationItem)).all()),
            len(self.session.exec(select(BudgetPreparationAllocation)).all()),
        )

        result = create_accrual_plan(self.payload(), self.session, self.user)
        rows = self.session.exec(
            select(PlanEntry)
            .where(PlanEntry.accrual_group_id == result.accrual_group_id)
            .order_by(PlanEntry.year, PlanEntry.month)
        ).all()

        self.assertEqual(12, len(rows))
        self.assertEqual(10, sum(row.year == 2027 for row in rows))
        self.assertEqual(2, sum(row.year == 2028 for row in rows))
        self.assertEqual(Decimal("12565.00"), sum(
            (Decimal(str(row.accrual_amount)) for row in rows), Decimal("0.00")
        ))
        self.assertEqual(Decimal("1047.08"), Decimal(str(rows[0].accrual_amount)))
        self.assertEqual(Decimal("1047.12"), Decimal(str(rows[-1].accrual_amount)))
        self.assertEqual(1, len({row.accrual_group_id for row in rows}))
        self.assertTrue(all(row.is_accrual for row in rows))
        self.assertTrue(all(row.department == "Sistem" for row in rows))

        target = self.session.exec(select(Scenario).where(Scenario.year == 2028)).one()
        self.assertEqual("Temel", target.name)
        self.assertTrue(all(row.scenario_id == target.id for row in rows if row.year == 2028))
        carryover_reads = [row for row in result.entries if row.year == 2028]
        self.assertTrue(all(row.is_carryover for row in carryover_reads))
        self.assertTrue(all(row.source_year == 2027 for row in carryover_reads))

        dashboard = get_dashboard(
            year=2028,
            scenario_id=target.id,
            month=None,
            month_list=None,
            budget_item_id=None,
            department=None,
            capex_opex=None,
            effective_primary=False,
            session=self.session,
            _=self.user,
        )
        self.assertAlmostEqual(Decimal("2094.20"), Decimal(str(dashboard.kpi.total_plan)), places=2)
        self.assertEqual(preparation_counts, (
            len(self.session.exec(select(BudgetPreparation)).all()),
            len(self.session.exec(select(BudgetPreparationItem)).all()),
            len(self.session.exec(select(BudgetPreparationAllocation)).all()),
        ))

    def test_target_scenario_is_reused_without_duplicate(self) -> None:
        target = Scenario(name="Temel", year=2028, is_primary=True)
        self.session.add(target)
        self.session.commit()
        result = create_accrual_plan(self.payload(), self.session, self.user)
        rows = self.session.exec(
            select(PlanEntry).where(PlanEntry.accrual_group_id == result.accrual_group_id)
        ).all()
        self.assertEqual(1, len(self.session.exec(
            select(Scenario).where(Scenario.year == 2028, Scenario.name == "Temel")
        ).all()))
        self.assertTrue(all(row.scenario_id == target.id for row in rows if row.year == 2028))

    def test_merge_preserves_existing_amount_when_group_is_deleted(self) -> None:
        existing = PlanEntry(
            year=2027,
            month=3,
            amount=100,
            scenario_id=self.source.id,
            budget_item_id=self.item.id,
            department="Sistem",
        )
        self.session.add(existing)
        self.session.commit()
        result = create_accrual_plan(
            self.payload(total_amount=Decimal("120.00"), month_count=1, merge_mode="merge"),
            self.session,
            self.user,
        )
        self.session.refresh(existing)
        self.assertEqual(220.0, existing.amount)
        self.assertEqual(Decimal("120.00"), existing.accrual_amount)

        delete_accrual_plan(result.accrual_group_id, self.session, self.user)
        self.session.refresh(existing)
        self.assertEqual(100.0, existing.amount)
        self.assertFalse(existing.is_accrual)
        self.assertIsNone(existing.accrual_group_id)

    def test_group_edit_redistributes_all_rows_and_delete_removes_group(self) -> None:
        created = create_accrual_plan(self.payload(), self.session, self.user)
        updated = update_accrual_plan(
            created.accrual_group_id,
            self.payload(total_amount=Decimal("100.00"), start_month=12, month_count=3),
            self.session,
            self.user,
        )
        self.assertEqual(3, len(updated.entries))
        self.assertEqual([(2027, 12), (2028, 1), (2028, 2)], [
            (row.year, row.month) for row in updated.entries
        ])
        self.assertEqual(Decimal("100.00"), updated.total_amount)

        delete_accrual_plan(created.accrual_group_id, self.session, self.user)
        self.assertEqual([], self.session.exec(
            select(PlanEntry).where(PlanEntry.accrual_group_id == created.accrual_group_id)
        ).all())

    def test_expense_dependency_blocks_group_edit_and_delete(self) -> None:
        created = create_accrual_plan(self.payload(), self.session, self.user)
        first = self.session.exec(
            select(PlanEntry)
            .where(PlanEntry.accrual_group_id == created.accrual_group_id)
            .order_by(PlanEntry.year, PlanEntry.month)
        ).first()
        expense = Expense(
            budget_item_id=self.item.id,
            scenario_id=first.scenario_id,
            expense_date=date(first.year, first.month, 1),
            amount=10,
        )
        self.session.add(expense)
        self.session.flush()
        self.session.add(ExpenseAllocation(
            expense_id=expense.id,
            budget_item_id=self.item.id,
            scenario_id=first.scenario_id,
            year=first.year,
            month=first.month,
            allocated_amount=10,
        ))
        self.session.commit()

        with self.assertRaises(HTTPException) as edit_error:
            update_accrual_plan(created.accrual_group_id, self.payload(), self.session, self.user)
        self.assertEqual(409, edit_error.exception.status_code)
        with self.assertRaises(HTTPException) as delete_error:
            delete_accrual_plan(created.accrual_group_id, self.session, self.user)
        self.assertEqual(409, delete_error.exception.status_code)
        self.assertEqual(12, len(self.session.exec(
            select(PlanEntry).where(PlanEntry.accrual_group_id == created.accrual_group_id)
        ).all()))


if __name__ == "__main__":
    unittest.main()
