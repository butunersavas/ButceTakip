import unittest
from datetime import date
from decimal import Decimal
from io import BytesIO

from fastapi import HTTPException
from openpyxl import Workbook
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from starlette.datastructures import UploadFile

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
from app.services.importer import import_xlsx
from app.routers.plans import (
    convert_plan_to_accrual,
    create_accrual_plan,
    create_manual_plan_entry,
    delete_accrual_plan,
    preview_plan_accrual_conversion,
    update_accrual_plan,
)
from app.schemas import AccrualConversionInput, AccrualPlanInput, PlanManualCreate


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
        self.assertEqual(Decimal("2094.20"), Decimal(str(dashboard.kpi.accrual_plan_amount)))
        self.assertEqual(1, dashboard.kpi.accrual_group_count)
        self.assertEqual(Decimal("2094.20"), Decimal(str(dashboard.kpi.carryover_accrual_amount)))
        self.assertEqual(2, len(dashboard.accruals.items))
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

    def test_normal_plan_conversion_uses_only_selected_row_and_start_month(self) -> None:
        rows = []
        for month, amount in ((1, 10000), (2, 10000), (3, 30000), (4, 10000)):
            row = PlanEntry(
                year=2027,
                month=month,
                amount=amount,
                scenario_id=self.source.id,
                budget_item_id=self.item.id,
                department="Sistem",
            )
            self.session.add(row)
            rows.append(row)
        self.session.commit()
        for row in rows:
            self.session.refresh(row)

        preview = preview_plan_accrual_conversion(
            rows[2].id,
            AccrualConversionInput(start_year=2027, start_month=3, month_count=12),
            self.session,
            self.user,
        )
        self.assertEqual([(2027, 3), (2028, 2)], [
            (preview.entries[0].year, preview.entries[0].month),
            (preview.entries[-1].year, preview.entries[-1].month),
        ])
        self.assertTrue(preview.entries[1].has_existing_plan)

        result = convert_plan_to_accrual(
            rows[2].id,
            AccrualConversionInput(start_year=2027, start_month=3, month_count=12),
            self.session,
            self.user,
        )
        converted = self.session.exec(
            select(PlanEntry)
            .where(PlanEntry.accrual_group_id == result.accrual_group_id)
            .order_by(PlanEntry.year, PlanEntry.month)
        ).all()
        self.assertEqual(12, len(converted))
        self.assertEqual(10, sum(row.year == 2027 for row in converted))
        self.assertEqual(2, sum(row.year == 2028 for row in converted))
        self.assertEqual(Decimal("30000.00"), sum(
            (Decimal(str(row.accrual_amount)) for row in converted), Decimal("0.00")
        ))
        self.assertTrue(all(row.accrual_source_plan_id == rows[2].id for row in converted))
        self.assertIsNone(self.session.get(PlanEntry, rows[2].id))
        for untouched in (rows[0], rows[1], rows[3]):
            persisted = self.session.get(PlanEntry, untouched.id)
            self.assertIsNotNone(persisted)
            self.assertFalse(persisted.is_accrual)
            self.assertIsNone(persisted.accrual_group_id)

        dashboard_2027 = get_dashboard(
            year=2027,
            scenario_id=self.source.id,
            month=None,
            month_list=None,
            budget_item_id=None,
            department=None,
            capex_opex=None,
            effective_primary=False,
            session=self.session,
            _=self.user,
        )
        self.assertEqual(Decimal("55000.00"), Decimal(str(dashboard_2027.kpi.total_plan)))
        self.assertEqual(Decimal("25000.00"), Decimal(str(dashboard_2027.kpi.accrual_plan_amount)))

    def test_conversion_dependency_rolls_back_and_preserves_source(self) -> None:
        source = PlanEntry(
            year=2027,
            month=3,
            amount=30000,
            scenario_id=self.source.id,
            budget_item_id=self.item.id,
            department="Sistem",
        )
        self.session.add(source)
        self.session.flush()
        expense = Expense(
            budget_item_id=self.item.id,
            scenario_id=self.source.id,
            expense_date=date(2027, 3, 1),
            amount=100,
        )
        self.session.add(expense)
        self.session.flush()
        self.session.add(ExpenseAllocation(
            expense_id=expense.id,
            budget_item_id=self.item.id,
            scenario_id=self.source.id,
            year=2027,
            month=3,
            allocated_amount=100,
        ))
        self.session.commit()
        source_id = source.id

        with self.assertRaises(HTTPException) as error:
            convert_plan_to_accrual(
                source_id,
                AccrualConversionInput(start_year=2027, start_month=3, month_count=12),
                self.session,
                self.user,
            )
        self.assertEqual(409, error.exception.status_code)
        self.assertIn("harcama", str(error.exception.detail))
        persisted = self.session.get(PlanEntry, source_id)
        self.assertIsNotNone(persisted)
        self.assertFalse(persisted.is_accrual)
        self.assertEqual(30000, persisted.amount)

    def test_excel_import_stays_normal_then_selected_row_can_be_converted(self) -> None:
        workbook = Workbook()
        sheet = workbook.active
        sheet.append([
            "type", "budget_code", "budget_name", "scenario", "year", "month",
            "amount", "department", "map_category", "map_attribute",
        ])
        for month, amount in ((1, 10000), (2, 10000), (3, 30000), (4, 10000)):
            sheet.append([
                "plan", "TAHAKKUK-IMPORT-TEST", "TAHAKKUK IMPORT TEST", "Import Test",
                2027, month, amount, "Sistem", "capex", "Donanım",
            ])
        buffer = BytesIO()
        workbook.save(buffer)
        buffer.seek(0)

        summary = import_xlsx(
            UploadFile(buffer, filename="tahakkuk-import-test.xlsx"),
            self.session,
        )
        self.assertEqual(4, summary.imported_plans)
        imported = self.session.exec(
            select(PlanEntry)
            .join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id)
            .where(BudgetItem.code == "TAHAKKUK-IMPORT-TEST")
            .order_by(PlanEntry.month)
        ).all()
        self.assertEqual(4, len(imported))
        self.assertTrue(all(not row.is_accrual for row in imported))
        self.assertTrue(all(row.accrual_group_id is None for row in imported))

        march = imported[2]
        result = convert_plan_to_accrual(
            march.id,
            AccrualConversionInput(start_year=2027, start_month=3, month_count=12),
            self.session,
            self.user,
        )
        untouched_ids = {imported[0].id, imported[1].id, imported[3].id}
        untouched = self.session.exec(
            select(PlanEntry).where(PlanEntry.id.in_(untouched_ids))
        ).all()
        self.assertEqual(3, len(untouched))
        self.assertTrue(all(not row.is_accrual for row in untouched))
        converted = self.session.exec(
            select(PlanEntry).where(PlanEntry.accrual_group_id == result.accrual_group_id)
        ).all()
        self.assertEqual(12, len(converted))
        self.assertEqual(Decimal("30000.00"), sum(
            (Decimal(str(row.accrual_amount)) for row in converted), Decimal("0.00")
        ))


if __name__ == "__main__":
    unittest.main()
