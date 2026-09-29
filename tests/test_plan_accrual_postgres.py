import unittest
from datetime import date
from decimal import Decimal

from sqlmodel import Session, SQLModel, select

from app.database import engine
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
from app.routers.plans import create_domain_accrual, reverse_domain_accrual
from app.schemas import AccrualConversionInput
from app.services.accruals import apply_expense_accrual_usage


@unittest.skipUnless(
    engine.dialect.name == "postgresql",
    "PostgreSQL tahakkuk entegrasyon testi yalnız PostgreSQL bağlantısında çalışır.",
)
class PlanAccrualPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        SQLModel.metadata.create_all(engine)
        self.session = Session(engine)
        self.source_scenario = Scenario(name="Accrual PG", year=2097, is_primary=False)
        self.target_scenario = Scenario(name="Accrual PG", year=2098, is_primary=False)
        self.item = BudgetItem(code="ACCRUAL-PG-REGRESSION", name="Accrual PG Regression")
        self.user = User(username="accrual-pg-admin", hashed_password="unused", is_admin=True)
        self.session.add_all([self.source_scenario, self.target_scenario, self.item, self.user])
        self.session.commit()
        for row in (self.source_scenario, self.target_scenario, self.item, self.user):
            self.session.refresh(row)
        self.source_plan = PlanEntry(
            year=2097,
            month=12,
            amount=10000,
            scenario_id=self.source_scenario.id,
            budget_item_id=self.item.id,
            budget_code=self.item.code,
        )
        self.session.add(self.source_plan)
        self.session.commit()
        self.session.refresh(self.source_plan)

    def tearDown(self) -> None:
        try:
            expense = getattr(self, "expense", None)
            if expense and expense.id:
                for row in self.session.exec(
                    select(ExpenseAccrualUsage).where(ExpenseAccrualUsage.expense_id == expense.id)
                ).all():
                    self.session.delete(row)
                for row in self.session.exec(
                    select(ExpenseAllocation).where(ExpenseAllocation.expense_id == expense.id)
                ).all():
                    self.session.delete(row)
                persisted_expense = self.session.get(Expense, expense.id)
                if persisted_expense:
                    self.session.delete(persisted_expense)
            accrual_id = getattr(self, "accrual_id", None)
            if accrual_id:
                for row in self.session.exec(
                    select(PlanAccrualAllocation).where(
                        PlanAccrualAllocation.accrual_id == accrual_id
                    )
                ).all():
                    self.session.delete(row)
                persisted_accrual = self.session.get(PlanAccrual, accrual_id)
                if persisted_accrual:
                    self.session.delete(persisted_accrual)
            persisted_plan = self.session.get(PlanEntry, self.source_plan.id)
            if persisted_plan:
                self.session.delete(persisted_plan)
            for row in (self.source_scenario, self.target_scenario, self.item, self.user):
                persisted = self.session.get(type(row), row.id)
                if persisted:
                    self.session.delete(persisted)
            self.session.commit()
        finally:
            self.session.close()

    def test_create_and_consume_are_transactional_on_postgresql(self) -> None:
        accrual = create_domain_accrual(
            self.source_plan.id,
            AccrualConversionInput(
                total_amount=Decimal("2000.00"),
                start_year=2097,
                start_month=12,
                month_count=2,
            ),
            self.session,
            self.user,
        )
        self.accrual_id = accrual.id
        self.assertEqual(1, len(self.session.exec(select(PlanEntry)).all()))
        expense = Expense(
            budget_item_id=self.item.id,
            budget_code=self.item.code,
            scenario_id=self.target_scenario.id,
            expense_date=date(2098, 1, 1),
            amount=1500,
            status=ExpenseStatus.RECORDED,
            is_out_of_budget=False,
        )
        self.session.add(expense)
        self.session.flush()
        self.expense = expense
        allocation = ExpenseAllocation(
            expense_id=expense.id,
            budget_item_id=self.item.id,
            scenario_id=self.target_scenario.id,
            year=2098,
            month=1,
            allocated_amount=1500,
        )
        self.session.add(allocation)
        self.session.flush()
        used = apply_expense_accrual_usage(
            self.session,
            expense=expense,
            expense_allocations=[allocation],
            funding_source="automatic",
        )
        self.session.commit()
        self.assertEqual(Decimal("1000.00"), used)
        self.assertEqual(1, len(self.session.exec(select(ExpenseAccrualUsage)).all()))
        self.assertEqual(accrual.id, self.session.exec(select(PlanAccrual.id)).one())

    def test_zero_usage_reverse_respects_postgresql_foreign_keys(self) -> None:
        accrual = create_domain_accrual(
            self.source_plan.id,
            AccrualConversionInput(
                total_amount=Decimal("2000.00"),
                start_year=2097,
                start_month=12,
                month_count=2,
            ),
            self.session,
            self.user,
        )
        self.accrual_id = accrual.id
        accrual_allocation = self.session.exec(
            select(PlanAccrualAllocation)
            .where(PlanAccrualAllocation.accrual_id == accrual.id)
            .order_by(PlanAccrualAllocation.year, PlanAccrualAllocation.month)
        ).first()
        expense = Expense(
            budget_item_id=self.item.id,
            budget_code=self.item.code,
            scenario_id=self.target_scenario.id,
            expense_date=date(2098, 1, 1),
            amount=100,
            status=ExpenseStatus.RECORDED,
            is_out_of_budget=False,
        )
        self.session.add(expense)
        self.session.flush()
        self.expense = expense
        expense_allocation = ExpenseAllocation(
            expense_id=expense.id,
            budget_item_id=self.item.id,
            scenario_id=self.target_scenario.id,
            year=2098,
            month=1,
            allocated_amount=100,
        )
        self.session.add(expense_allocation)
        self.session.flush()
        self.session.add(ExpenseAccrualUsage(
            expense_id=expense.id,
            expense_allocation_id=expense_allocation.id,
            accrual_allocation_id=accrual_allocation.id,
            amount=Decimal("0.00"),
        ))
        self.session.commit()

        reverse_domain_accrual(accrual.id, self.session, self.user)

        self.assertIsNone(self.session.get(PlanAccrual, accrual.id))
        self.assertIsNotNone(self.session.get(PlanEntry, self.source_plan.id))
        self.assertIsNotNone(self.session.get(Expense, expense.id))
        self.assertIsNotNone(self.session.get(ExpenseAllocation, expense_allocation.id))
        self.assertEqual([], self.session.exec(select(ExpenseAccrualUsage)).all())


if __name__ == "__main__":
    unittest.main()
