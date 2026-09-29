import unittest
from datetime import date
from decimal import Decimal
from io import BytesIO

from fastapi import HTTPException
from openpyxl import Workbook
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from starlette.datastructures import UploadFile

from app.main import app
from app.models import (
    BudgetItem,
    Expense,
    ExpenseAccrualUsage,
    ExpenseAllocation,
    ExpenseStatus,
    PlanAccrual,
    PlanAccrualAllocation,
    PlanEntry,
    Scenario,
    User,
)
from app.routers.dashboard import get_dashboard
from app.routers.expenses import _fetch_expense_read
from app.routers.expenses import get_expense_accrual_availability
from app.routers.plans import (
    _fetch_plan_read,
    create_domain_accrual,
    reverse_domain_accrual,
    preview_domain_accrual,
)
from app.schemas import AccrualConversionInput
from app.services.accruals import apply_expense_accrual_usage
from app.services.importer import import_xlsx


class PlanAccrualReservationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.user = User(username="accrual-admin", hashed_password="test", is_admin=True)
        self.source_scenario = Scenario(name="Temel", year=2027, is_primary=True)
        self.target_scenario = Scenario(name="Temel", year=2028, is_primary=True)
        self.item = BudgetItem(
            code="TAHAKKUK-TEST",
            name="Tahakkuk Test",
            map_category="capex",
            map_attribute="Donanım",
        )
        self.session.add_all([self.user, self.source_scenario, self.target_scenario, self.item])
        self.session.commit()
        for row in (self.user, self.source_scenario, self.target_scenario, self.item):
            self.session.refresh(row)
        self.source_plan = PlanEntry(
            year=2027,
            month=12,
            amount=Decimal("120000.00"),
            scenario_id=self.source_scenario.id,
            budget_item_id=self.item.id,
            budget_code=self.item.code,
            department="Sistem",
        )
        self.session.add(self.source_plan)
        self.session.commit()
        self.session.refresh(self.source_plan)

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def conversion(self, amount="12000.00", month_count=3) -> AccrualConversionInput:
        return AccrualConversionInput(
            total_amount=Decimal(amount),
            start_year=2027,
            start_month=12,
            month_count=month_count,
        )

    def create_accrual(self, amount="12000.00", month_count=3):
        return create_domain_accrual(
            self.source_plan.id,
            self.conversion(amount, month_count),
            self.session,
            self.user,
        )

    def test_routes_expose_only_domain_accrual_endpoints(self) -> None:
        paths = {route.path for route in app.routes}
        self.assertIn("/api/plans/{plan_id}/convert-to-accrual", paths)
        self.assertIn("/api/plans/accruals/carryover", paths)
        self.assertNotIn("/api/plans/accruals", paths)

    def test_cross_year_distribution_preserves_plan_and_reserves_future_amount(self) -> None:
        original_plan_count = len(self.session.exec(select(PlanEntry)).all())
        result = self.create_accrual()
        self.assertEqual(Decimal("12000.00"), result.total_amount)
        self.assertEqual(
            [(2027, 12), (2028, 1), (2028, 2)],
            [(row.year, row.month) for row in result.allocations],
        )
        self.assertEqual(
            Decimal("12000.00"),
            sum((row.amount for row in result.allocations), Decimal("0.00")),
        )
        self.assertEqual(Decimal("8000.00"), result.carryover_amount)
        self.assertEqual(original_plan_count, len(self.session.exec(select(PlanEntry)).all()))
        preserved = self.session.get(PlanEntry, self.source_plan.id)
        self.assertEqual(Decimal("120000.00"), Decimal(str(preserved.amount)))
        plan_read = _fetch_plan_read(self.session, self.source_plan.id)
        self.assertTrue(plan_read.has_accrual)
        self.assertEqual(Decimal("8000.00"), plan_read.plan_accrual_future_reserved)
        self.assertEqual(112000.0, plan_read.scope_available_amount)

    def test_decimal_distribution_puts_remainder_in_last_month(self) -> None:
        result = self.create_accrual("100.00")
        self.assertEqual(
            [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")],
            [row.amount for row in result.allocations],
        )

    def test_amount_cannot_exceed_remaining_source_budget(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            preview_domain_accrual(
                self.source_plan.id,
                self.conversion("120000.01"),
                self.session,
                self.user,
            )
        self.assertEqual(400, raised.exception.status_code)

    def test_excel_import_remains_normal_and_is_not_duplicated_by_accrual(self) -> None:
        workbook = Workbook()
        sheet = workbook.active
        sheet.append([
            "type", "budget_code", "budget_name", "scenario", "year", "month",
            "amount", "department", "map_category", "map_attribute",
        ])
        for month in (1, 2, 3):
            sheet.append([
                "plan", "TAHAKKUK-IMPORT-TEST", "Tahakkuk Import Test", "Import Test",
                2027, month, 10000, "Sistem", "capex", "Donanım",
            ])
        buffer = BytesIO()
        workbook.save(buffer)
        buffer.seek(0)
        summary = import_xlsx(
            UploadFile(buffer, filename="tahakkuk-import-test.xlsx"),
            self.session,
        )
        self.assertEqual(3, summary.imported_plans)
        imported = self.session.exec(
            select(PlanEntry)
            .join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id)
            .where(BudgetItem.code == "TAHAKKUK-IMPORT-TEST")
            .order_by(PlanEntry.month)
        ).all()
        self.assertEqual(3, len(imported))
        self.assertTrue(all(not row.is_accrual for row in imported))
        before_ids = [row.id for row in imported]
        create_domain_accrual(
            imported[0].id,
            AccrualConversionInput(
                total_amount=Decimal("6000.00"),
                start_year=2027,
                start_month=1,
                month_count=3,
            ),
            self.session,
            self.user,
        )
        after = self.session.exec(
            select(PlanEntry).where(PlanEntry.id.in_(before_ids)).order_by(PlanEntry.id)
        ).all()
        self.assertEqual(before_ids, [row.id for row in after])
        self.assertTrue(all(not row.is_accrual for row in after))

    def test_unused_accrual_can_be_reversed_without_touching_plan(self) -> None:
        result = self.create_accrual()
        reverse_domain_accrual(result.id, self.session, self.user)
        self.assertIsNone(self.session.get(PlanAccrual, result.id))
        self.assertIsNotNone(self.session.get(PlanEntry, self.source_plan.id))

    def test_zero_usage_rows_and_normal_operational_records_do_not_block_reverse(self) -> None:
        result = self.create_accrual("3900.00", 4)
        allocation = self.session.exec(
            select(PlanAccrualAllocation)
            .where(PlanAccrualAllocation.accrual_id == result.id)
            .order_by(PlanAccrualAllocation.year, PlanAccrualAllocation.month)
        ).first()
        expense = Expense(
            budget_item_id=self.item.id,
            budget_code=self.item.code,
            scenario_id=self.target_scenario.id,
            expense_date=date(2028, 1, 15),
            amount=100.0,
            status=ExpenseStatus.RECORDED,
            is_out_of_budget=False,
        )
        self.session.add(expense)
        self.session.flush()
        expense_allocation = ExpenseAllocation(
            expense_id=expense.id,
            budget_item_id=self.item.id,
            scenario_id=self.target_scenario.id,
            year=2028,
            month=1,
            allocated_amount=100.0,
        )
        self.session.add(expense_allocation)
        self.session.flush()
        self.session.add(ExpenseAccrualUsage(
            expense_id=expense.id,
            expense_allocation_id=expense_allocation.id,
            accrual_allocation_id=allocation.id,
            amount=Decimal("0.00"),
        ))
        self.session.commit()

        reverse_domain_accrual(result.id, self.session, self.user)

        self.assertIsNone(self.session.get(PlanAccrual, result.id))
        self.assertIsNotNone(self.session.get(PlanEntry, self.source_plan.id))
        self.assertIsNotNone(self.session.get(Expense, expense.id))
        self.assertIsNotNone(self.session.get(ExpenseAllocation, expense_allocation.id))
        self.assertEqual([], self.session.exec(select(ExpenseAccrualUsage)).all())

    def test_one_dollar_usage_blocks_reverse(self) -> None:
        result = self.create_accrual("3900.00", 4)
        allocation = self.session.exec(
            select(PlanAccrualAllocation)
            .where(PlanAccrualAllocation.accrual_id == result.id)
            .order_by(PlanAccrualAllocation.year, PlanAccrualAllocation.month)
        ).first()
        allocation.used_amount = Decimal("1.00")
        self.session.add(allocation)
        self.session.commit()

        with self.assertRaises(HTTPException) as raised:
            reverse_domain_accrual(result.id, self.session, self.user)

        self.assertEqual(409, raised.exception.status_code)
        self.assertEqual(
            "Bu tahakkuktan harcama yapıldığı için geri alınamaz.",
            raised.exception.detail,
        )
        self.assertIsNotNone(self.session.get(PlanAccrual, result.id))

    def test_expense_uses_carryover_first_then_current_budget_and_blocks_reverse(self) -> None:
        result = self.create_accrual("6000.00", 2)
        self.session.add(PlanEntry(
            year=2028,
            month=1,
            amount=4000.0,
            scenario_id=self.target_scenario.id,
            budget_item_id=self.item.id,
            budget_code=self.item.code,
            department="Sistem",
        ))
        expense = Expense(
            budget_item_id=self.item.id,
            budget_code=self.item.code,
            scenario_id=self.target_scenario.id,
            expense_date=date(2028, 1, 15),
            amount=5000.0,
            quantity=1,
            unit_price=5000.0,
            status=ExpenseStatus.RECORDED,
            is_out_of_budget=False,
        )
        self.session.add(expense)
        self.session.flush()
        expense_allocation = ExpenseAllocation(
            expense_id=expense.id,
            budget_item_id=self.item.id,
            scenario_id=self.target_scenario.id,
            year=2028,
            month=1,
            allocated_amount=5000.0,
        )
        self.session.add(expense_allocation)
        self.session.flush()
        used = apply_expense_accrual_usage(
            self.session,
            expense=expense,
            expense_allocations=[expense_allocation],
            funding_source="automatic",
        )
        self.session.commit()
        self.assertEqual(Decimal("3000.00"), used)
        availability = get_expense_accrual_availability(
            budget_item_id=self.item.id,
            year=2028,
            scenario_id=self.target_scenario.id,
            session=self.session,
            _=self.user,
        )
        self.assertEqual(Decimal("3000.00"), availability.total_amount)
        self.assertEqual(Decimal("3000.00"), availability.used_amount)
        self.assertEqual(Decimal("0.00"), availability.remaining_amount)
        usages = self.session.exec(
            select(ExpenseAccrualUsage).where(ExpenseAccrualUsage.expense_id == expense.id)
        ).all()
        self.assertEqual(
            Decimal("3000.00"),
            sum((row.amount for row in usages), Decimal("0.00")),
        )
        expense_read = _fetch_expense_read(self.session, expense.id)
        self.assertEqual(3000.0, expense_read.accrual_used_amount)
        self.assertEqual(2000.0, expense_read.current_budget_amount)
        dashboard = get_dashboard(
            year=2028,
            scenario_id=self.target_scenario.id,
            month=None,
            month_list=None,
            budget_item_id=None,
            department=None,
            capex_opex=None,
            effective_primary=False,
            session=self.session,
            _=self.user,
        )
        self.assertEqual(7000.0, dashboard.kpi.total_plan)
        self.assertEqual(5000.0, dashboard.kpi.total_actual)
        self.assertEqual(2000.0, dashboard.kpi.total_remaining)
        self.assertEqual(0.0, dashboard.kpi.total_overrun)
        with self.assertRaises(HTTPException) as raised:
            reverse_domain_accrual(result.id, self.session, self.user)
        self.assertEqual(409, raised.exception.status_code)
        self.assertEqual(
            "Bu tahakkuktan harcama yapıldığı için geri alınamaz.",
            raised.exception.detail,
        )

    def test_current_budget_source_keeps_normal_expense_allocation_unchanged(self) -> None:
        self.create_accrual("6000.00", 2)
        expense = Expense(
            budget_item_id=self.item.id,
            budget_code=self.item.code,
            scenario_id=self.target_scenario.id,
            expense_date=date(2028, 1, 15),
            amount=2500.0,
            status=ExpenseStatus.RECORDED,
            is_out_of_budget=False,
        )
        self.session.add(expense)
        self.session.flush()
        allocation = ExpenseAllocation(
            expense_id=expense.id,
            budget_item_id=self.item.id,
            scenario_id=self.target_scenario.id,
            year=2028,
            month=1,
            allocated_amount=2500.0,
        )
        self.session.add(allocation)
        self.session.flush()
        used = apply_expense_accrual_usage(
            self.session,
            expense=expense,
            expense_allocations=[allocation],
            funding_source="current",
        )
        self.assertEqual(Decimal("0.00"), used)
        self.assertEqual(2500.0, allocation.allocated_amount)
        self.assertEqual([], self.session.exec(
            select(ExpenseAccrualUsage).where(ExpenseAccrualUsage.expense_id == expense.id)
        ).all())

    def test_dashboard_effective_budget_adds_carryover_once(self) -> None:
        self.create_accrual("6000.00", 2)
        self.session.add(PlanEntry(
            year=2028,
            month=1,
            amount=10000.0,
            scenario_id=self.target_scenario.id,
            budget_item_id=self.item.id,
            budget_code=self.item.code,
            department="Sistem",
        ))
        self.session.commit()
        result = get_dashboard(
            year=2028,
            scenario_id=self.target_scenario.id,
            month=None,
            month_list=None,
            budget_item_id=None,
            department=None,
            capex_opex=None,
            effective_primary=False,
            session=self.session,
            _=self.user,
        )
        self.assertEqual(10000.0, result.kpi.new_budget_plan_amount)
        self.assertEqual(3000.0, result.kpi.carryover_plan_amount)
        self.assertEqual(13000.0, result.kpi.effective_plan_amount)
        self.assertEqual(13000.0, result.kpi.total_plan)


if __name__ == "__main__":
    unittest.main()
