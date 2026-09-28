import unittest
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.dependencies import get_write_user
from app.models import (
    BudgetItem,
    BudgetPreparation,
    BudgetPreparationAllocation,
    BudgetPreparationItem,
    PlanEntry,
    Scenario,
    User,
)
from app.routers.budget_preparations import (
    complete_preparation,
    create_item,
    create_preparation,
    delete_preparation,
    get_preparation,
    list_carryovers,
    mark_preparation_ready,
    reopen_preparation,
)
from app.routers.dashboard import get_dashboard
from app.routers.plans import list_plans
from app.schemas import (
    BudgetPreparationAllocationInput,
    BudgetPreparationCreate,
    BudgetPreparationItemInput,
)
from app.services.budget_preparation import (
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

    def test_11_ready_does_not_create_plan_entries(self) -> None:
        draft = self.create_draft()
        self.add_valid_item(draft)
        preparation = mark_preparation_ready(draft.id, self.session, self.user)
        self.assertEqual("READY", preparation.status)
        self.assertEqual([], self.session.exec(select(Scenario)).all())
        self.assertEqual([], self.session.exec(select(PlanEntry)).all())

    def test_12_repeated_ready_is_idempotent(self) -> None:
        draft = self.create_draft()
        self.add_valid_item(draft)
        first = mark_preparation_ready(draft.id, self.session, self.user)
        repeated = mark_preparation_ready(draft.id, self.session, self.user)
        self.assertEqual(first.id, repeated.id)
        self.assertEqual("READY", repeated.status)
        self.assertEqual([], self.session.exec(select(Scenario)).all())
        self.assertEqual([], self.session.exec(select(PlanEntry)).all())

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

    def test_cross_year_ready_keeps_allocations_in_preparation_tables(self) -> None:
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
        preparation = mark_preparation_ready(draft.id, self.session, self.user)
        allocations = self.session.exec(
            select(BudgetPreparationAllocation).where(
                BudgetPreparationAllocation.item_id == result.id
            )
        ).all()
        self.assertEqual("READY", preparation.status)
        self.assertEqual(12, len(allocations))
        self.assertEqual(Decimal("50000.00"), sum(row.amount for row in allocations))
        self.assertEqual(6, sum(row.year == 2027 for row in allocations))
        self.assertEqual(6, sum(row.year == 2028 for row in allocations))
        self.assertEqual([], self.session.exec(select(Scenario)).all())
        self.assertEqual([], self.session.exec(select(PlanEntry)).all())

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

    def test_delete_ready_is_rejected_without_touching_operational_data(self) -> None:
        draft = self.create_draft()
        self.add_valid_item(draft)
        preparation = mark_preparation_ready(draft.id, self.session, self.user)

        with self.assertRaises(HTTPException) as caught:
            delete_preparation(preparation.id, self.session, self.user)

        self.assertEqual(409, caught.exception.status_code)
        self.assertEqual(
            "HAZIR bütçe çalışması silinemez.",
            caught.exception.detail,
        )
        self.assertIsNotNone(self.session.get(BudgetPreparation, preparation.id))
        self.assertEqual([], self.session.exec(select(Scenario)).all())
        self.assertEqual([], self.session.exec(select(PlanEntry)).all())

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

    def _create_cross_year_preparation(self, *, name: str = "TEST01", total: str = "12565.00"):
        draft = self.create_draft()
        self.add_valid_item(
            draft,
            budget_name=name,
            budget_code=None,
            total_amount=Decimal(total),
            distribution_method="EQUAL",
            start_month=3,
            month_count=12,
            allocations=[],
        )
        mark_preparation_ready(draft.id, self.session, self.user)
        return draft

    def test_carryover_discovery_and_ready_has_no_operational_side_effect(self) -> None:
        self._create_cross_year_preparation()
        carryovers = list_carryovers(2028, self.session, self.user)
        self.assertEqual(1, len(carryovers))
        self.assertEqual([1, 2], [row.month for row in carryovers[0].months])
        self.assertEqual(Decimal("2094.20"), carryovers[0].total_amount)

        result = create_preparation(
            BudgetPreparationCreate(year=2028, name="2028 Ana", currency="USD"),
            self.session,
            self.user,
        )
        draft_2028 = self.session.get(BudgetPreparation, result.id)
        self.add_valid_item(
            draft_2028,
            budget_name="TEST01",
            budget_code=None,
            total_amount=Decimal("10000.00"),
            distribution_method="SINGLE_MONTH",
            single_month=3,
            allocations=[],
        )
        scenario_count = len(self.session.exec(select(Scenario)).all())
        plan_count = len(self.session.exec(select(PlanEntry)).all())
        completed = complete_preparation(draft_2028.id, self.session, self.user)
        self.assertEqual("READY", completed.preparation.status)
        self.assertIsNone(completed.scenario_id)
        self.assertEqual(0, completed.created_plan_entries)
        self.assertEqual(scenario_count, len(self.session.exec(select(Scenario)).all()))
        self.assertEqual(plan_count, len(self.session.exec(select(PlanEntry)).all()))

    def test_effective_dashboard_adds_only_primary_carryover_without_double_count(self) -> None:
        budget_item = BudgetItem(code="OPER-PRIMARY", name="Operasyonel Kalem")
        primary_2027 = Scenario(name="2027 Ana", year=2027, is_primary=True)
        alternative_2027 = Scenario(name="2027 Alternatif", year=2027, is_primary=False)
        primary_2028 = Scenario(name="2028 Ana", year=2028, is_primary=True)
        self.session.add(budget_item)
        self.session.add(primary_2027)
        self.session.add(alternative_2027)
        self.session.add(primary_2028)
        self.session.flush()
        self.session.add(PlanEntry(year=2028, month=1, amount=1047.10, scenario_id=primary_2027.id, budget_item_id=budget_item.id))
        self.session.add(PlanEntry(year=2028, month=2, amount=1047.10, scenario_id=primary_2027.id, budget_item_id=budget_item.id))
        self.session.add(PlanEntry(year=2028, month=1, amount=4000.00, scenario_id=alternative_2027.id, budget_item_id=budget_item.id))
        self.session.add(PlanEntry(year=2028, month=3, amount=10000.00, scenario_id=primary_2028.id, budget_item_id=budget_item.id))
        self.session.commit()
        dashboard = get_dashboard(
            year=2028,
            scenario_id=primary_2028.id,
            month=None,
            month_list=None,
            budget_item_id=None,
            department=None,
            capex_opex=None,
            effective_primary=True,
            session=self.session,
            _=self.user,
        )
        self.assertAlmostEqual(10000.00, dashboard.kpi.new_budget_plan_amount, places=2)
        self.assertAlmostEqual(2094.20, dashboard.kpi.carryover_plan_amount, places=2)
        self.assertAlmostEqual(12094.20, dashboard.kpi.total_plan, places=2)
        effective_plans = list_plans(
            year=2028,
            scenario_id=primary_2028.id,
            budget_item_id=None,
            month=None,
            department=None,
            capex_opex=None,
            effective_primary=True,
            session=self.session,
            _=self.user,
        )
        self.assertAlmostEqual(12094.20, sum(row.amount for row in effective_plans), places=2)
        self.assertTrue(any(row.is_carryover and row.source_year == 2027 for row in effective_plans))
        self.assertFalse(any(row.scenario_id == alternative_2027.id for row in effective_plans))


if __name__ == "__main__":
    unittest.main()
