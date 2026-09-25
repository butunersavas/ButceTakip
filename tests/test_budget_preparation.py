import unittest
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.dependencies import get_write_user
from app.models import (
    BudgetPreparation,
    BudgetPreparationAllocation,
    BudgetPreparationItem,
    PlanEntry,
    Scenario,
    User,
)
from app.routers.budget_preparations import (
    create_item,
    create_preparation,
    delete_preparation,
    get_preparation,
)
from app.routers.dashboard import get_dashboard
from app.schemas import (
    BudgetPreparationAllocationInput,
    BudgetPreparationCreate,
    BudgetPreparationItemInput,
)
from app.services.budget_preparation import (
    activate_preparation,
    build_allocation_amounts,
    validate_preparation_for_completion,
)


class BudgetPreparationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.user = User(
            id=1,
            username="editor",
            hashed_password="test",
            role="user",
            is_active=True,
        )
        self.viewer = User(
            id=2,
            username="viewer",
            hashed_password="test",
            role="viewer",
            is_active=True,
        )
        self.session.add(self.user)
        self.session.add(self.viewer)
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def create_draft(self) -> BudgetPreparation:
        result = create_preparation(
            BudgetPreparationCreate(
                year=2027,
                name="2027 Bilgi Teknolojileri Bütçesi",
                currency="USD",
                note="Test taslağı",
            ),
            self.session,
            self.user,
        )
        return self.session.get(BudgetPreparation, result.id)

    def valid_item_payload(self, **overrides) -> BudgetPreparationItemInput:
        data = {
            "budget_name": "Sunucu Alımı",
            "budget_code": "BT-2027-001",
            "total_amount": Decimal("120000.00"),
            "currency": "USD",
            "capex_opex": "CAPEX",
            "department": "Sistem-Network",
            "map_attribute": "Donanım",
            "description": "Yeni sunucular",
            "distribution_method": "CUSTOM",
            "allocations": [
                BudgetPreparationAllocationInput(month=1, amount=Decimal("50000.00")),
                BudgetPreparationAllocationInput(month=2, amount=Decimal("70000.00")),
            ],
        }
        data.update(overrides)
        return BudgetPreparationItemInput(**data)

    def add_valid_item(self, draft: BudgetPreparation, **overrides):
        return create_item(
            draft.id,
            self.valid_item_payload(**overrides),
            self.session,
            self.user,
        )

    def test_01_create_draft_budget(self) -> None:
        draft = self.create_draft()
        self.assertEqual("DRAFT", draft.status)
        self.assertEqual(2027, draft.year)
        self.assertEqual("USD", draft.currency)

    def test_02_read_draft_again(self) -> None:
        draft = self.create_draft()
        result = get_preparation(draft.id, self.session, self.user)
        self.assertEqual(draft.id, result.id)
        self.assertEqual("2027 Bilgi Teknolojileri Bütçesi", result.name)

    def test_03_add_budget_item(self) -> None:
        draft = self.create_draft()
        result = self.add_valid_item(draft)
        self.assertEqual("BT-2027-001", result.budget_code)
        self.assertEqual(2, len(result.allocations))

    def test_04_single_month_distribution(self) -> None:
        payload = self.valid_item_payload(
            total_amount=Decimal("1200000.00"),
            distribution_method="SINGLE_MONTH",
            single_month=3,
            allocations=[],
        )
        self.assertEqual({(2027, 3): Decimal("1200000.00")}, build_allocation_amounts(payload))

    def test_05_equal_distribution_preserves_total_and_rounding(self) -> None:
        payload = self.valid_item_payload(
            total_amount=Decimal("100.00"),
            distribution_method="EQUAL",
            start_month=5,
            month_count=3,
            allocations=[],
        )
        amounts = build_allocation_amounts(payload)
        self.assertEqual(Decimal("100.00"), sum(amounts.values()))
        self.assertEqual(Decimal("33.34"), amounts[(2027, 7)])

    def test_06_custom_distribution(self) -> None:
        amounts = build_allocation_amounts(self.valid_item_payload())
        self.assertEqual(Decimal("50000.00"), amounts[(2027, 1)])
        self.assertEqual(Decimal("70000.00"), amounts[(2027, 2)])

    def test_equal_distribution_can_cross_year_and_preserves_cents(self) -> None:
        payload = self.valid_item_payload(
            budget_code=None,
            total_amount=Decimal("50000.00"),
            distribution_method="EQUAL",
            start_month=7,
            month_count=12,
            allocations=[],
        )
        amounts = build_allocation_amounts(payload, 2027)
        self.assertEqual(12, len(amounts))
        self.assertEqual(Decimal("50000.00"), sum(amounts.values()))
        self.assertEqual({2027, 2028}, {year for year, _ in amounts})
        self.assertIn((2028, 6), amounts)

    def test_07_completion_rejects_distribution_mismatch(self) -> None:
        draft = self.create_draft()
        self.add_valid_item(
            draft,
            allocations=[
                BudgetPreparationAllocationInput(month=1, amount=Decimal("10.00"))
            ],
        )
        errors = validate_preparation_for_completion(self.session, draft)
        self.assertTrue(any(error.field == "allocations" for error in errors))

    def test_08_completion_rejects_missing_department(self) -> None:
        draft = self.create_draft()
        self.add_valid_item(draft, department=None)
        errors = validate_preparation_for_completion(self.session, draft)
        self.assertTrue(any(error.field == "department" for error in errors))

    def test_09_completion_rejects_missing_capex_opex(self) -> None:
        draft = self.create_draft()
        self.add_valid_item(draft, capex_opex=None)
        errors = validate_preparation_for_completion(self.session, draft)
        self.assertTrue(any(error.field == "capex_opex" for error in errors))

    def test_10_completion_rejects_missing_attribute(self) -> None:
        draft = self.create_draft()
        self.add_valid_item(draft, map_attribute=None)
        errors = validate_preparation_for_completion(self.session, draft)
        self.assertTrue(any(error.field == "map_attribute" for error in errors))

    def test_11_successful_completion_creates_plan_entries(self) -> None:
        draft = self.create_draft()
        self.add_valid_item(draft)
        preparation, scenario_id, created_count = activate_preparation(
            self.session, draft.id
        )
        plans = self.session.exec(
            select(PlanEntry).where(PlanEntry.scenario_id == scenario_id)
        ).all()
        self.assertEqual("ACTIVE", preparation.status)
        self.assertEqual(2, created_count)
        self.assertEqual([1, 2], [plan.month for plan in plans])

    def test_12_repeated_completion_is_idempotent(self) -> None:
        draft = self.create_draft()
        self.add_valid_item(draft)
        _, scenario_id, _ = activate_preparation(self.session, draft.id)
        _, repeated_scenario_id, repeated_count = activate_preparation(
            self.session, draft.id
        )
        plans = self.session.exec(
            select(PlanEntry).where(PlanEntry.scenario_id == scenario_id)
        ).all()
        self.assertEqual(scenario_id, repeated_scenario_id)
        self.assertEqual(0, repeated_count)
        self.assertEqual(2, len(plans))

    def test_13_viewer_cannot_write(self) -> None:
        with self.assertRaises(HTTPException) as caught:
            get_write_user(self.viewer)
        self.assertEqual(403, caught.exception.status_code)

    def test_draft_does_not_create_plan_entries(self) -> None:
        draft = self.create_draft()
        self.add_valid_item(draft)
        self.assertEqual([], self.session.exec(select(PlanEntry)).all())

    def test_item_allocations_are_persisted(self) -> None:
        draft = self.create_draft()
        result = self.add_valid_item(draft)
        rows = self.session.exec(
            select(BudgetPreparationAllocation).where(
                BudgetPreparationAllocation.item_id == result.id
            )
        ).all()
        self.assertEqual(Decimal("120000.00"), sum(row.amount for row in rows))

    def test_cross_year_activation_creates_plan_entries_in_each_year(self) -> None:
        draft = self.create_draft()
        result = self.add_valid_item(
            draft,
            budget_code=None,
            total_amount=Decimal("50000.00"),
            distribution_method="EQUAL",
            start_month=7,
            month_count=12,
            allocations=[],
        )
        self.assertTrue(result.budget_code.startswith("PREP-2027-"))
        preparation, scenario_id, created_count = activate_preparation(self.session, draft.id)
        plans = self.session.exec(
            select(PlanEntry).where(PlanEntry.scenario_id == scenario_id)
        ).all()
        self.assertEqual("ACTIVE", preparation.status)
        self.assertEqual(12, created_count)
        self.assertEqual(Decimal("50000.00"), sum(Decimal(str(plan.amount)) for plan in plans))
        self.assertEqual(6, sum(plan.year == 2027 for plan in plans))
        self.assertEqual(6, sum(plan.year == 2028 for plan in plans))
        dashboard = get_dashboard(
            year=2027,
            scenario_id=scenario_id,
            month=None,
            month_list=None,
            budget_item_id=None,
            department=None,
            capex_opex=None,
            session=self.session,
            _=self.user,
        )
        expected_2027 = sum(plan.amount for plan in plans if plan.year == 2027)
        self.assertAlmostEqual(expected_2027, dashboard.kpi.total_plan, places=2)

    def test_delete_draft_removes_items_and_allocations(self) -> None:
        draft = self.create_draft()
        item = self.add_valid_item(draft)
        allocation_ids = [row.id for row in self.session.exec(
            select(BudgetPreparationAllocation).where(
                BudgetPreparationAllocation.item_id == item.id
            )
        ).all()]

        delete_preparation(draft.id, self.session, self.user)

        self.assertIsNone(self.session.get(BudgetPreparation, draft.id))
        self.assertIsNone(self.session.get(BudgetPreparationItem, item.id))
        self.assertTrue(all(
            self.session.get(BudgetPreparationAllocation, allocation_id) is None
            for allocation_id in allocation_ids
        ))

    def test_delete_active_is_rejected_without_touching_plan_data(self) -> None:
        draft = self.create_draft()
        self.add_valid_item(draft)
        preparation, scenario_id, _ = activate_preparation(self.session, draft.id)
        plan_ids = [row.id for row in self.session.exec(
            select(PlanEntry).where(PlanEntry.scenario_id == scenario_id)
        ).all()]

        with self.assertRaises(HTTPException) as caught:
            delete_preparation(preparation.id, self.session, self.user)

        self.assertEqual(409, caught.exception.status_code)
        self.assertEqual(
            "Aktifleştirilmiş bütçe çalışması silinemez.",
            caught.exception.detail,
        )
        self.assertIsNotNone(self.session.get(BudgetPreparation, preparation.id))
        self.assertIsNotNone(self.session.get(Scenario, scenario_id))
        self.assertTrue(all(self.session.get(PlanEntry, plan_id) is not None for plan_id in plan_ids))

    def test_viewer_cannot_delete_preparation(self) -> None:
        draft = self.create_draft()
        with self.assertRaises(HTTPException) as caught:
            authorized_user = get_write_user(self.viewer)
            delete_preparation(draft.id, self.session, authorized_user)
        self.assertEqual(403, caught.exception.status_code)
        self.assertIsNotNone(self.session.get(BudgetPreparation, draft.id))

    def test_delete_missing_preparation_returns_404(self) -> None:
        with self.assertRaises(HTTPException) as caught:
            delete_preparation(999999, self.session, self.user)
        self.assertEqual(404, caught.exception.status_code)


if __name__ == "__main__":
    unittest.main()
