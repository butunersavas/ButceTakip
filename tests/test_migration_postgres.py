from datetime import date
from decimal import Decimal
import unittest
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import text
from sqlmodel import Session

from app import database as database_module
from app.config import Settings
from app.models import (
    BudgetItem,
    PlanAccrual,
    PlanAccrualAllocation,
    PlanEntry,
    QuoteDocument,
    QuoteOfferRevision,
    QuoteProcess,
    QuoteVendorOffer,
    Scenario,
    User,
)


@unittest.skipUnless(
    database_module.engine.dialect.name == "postgresql",
    "Migration integration tests require an isolated PostgreSQL database.",
)
class MigrationPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        database_module.apply_schema_migrations()

    def setUp(self) -> None:
        suffix = uuid4().hex[:10]
        self.session = Session(database_module.engine)
        self.user = User(
            username=f"migration-user-{suffix}",
            email=f"migration-user-{suffix}@example.test",
            hashed_password=f"migration-hash-{suffix}",
            is_admin=True,
            role="custom-admin",
            is_active=False,
        )
        self.scenario = Scenario(
            name=f"Migration Scenario {suffix}",
            year=700000 + int(suffix[:4], 16),
            is_primary=False,
        )
        self.budget_item = BudgetItem(
            code=f"MIG-{suffix}",
            name=f"Migration Budget {suffix}",
        )
        self.session.add_all([self.user, self.scenario, self.budget_item])
        self.session.commit()
        for row in (self.user, self.scenario, self.budget_item):
            self.session.refresh(row)

        self.plan = PlanEntry(
            year=self.scenario.year,
            month=1,
            amount=12345.67,
            scenario_id=self.scenario.id,
            budget_item_id=self.budget_item.id,
            budget_code=self.budget_item.code,
        )
        self.session.add(self.plan)
        self.session.commit()
        self.session.refresh(self.plan)

        self.accrual = PlanAccrual(
            source_plan_id=self.plan.id,
            budget_item_id=self.budget_item.id,
            source_year=self.scenario.year,
            source_scenario_id=self.scenario.id,
            total_amount=Decimal("1000.00"),
            start_year=self.scenario.year,
            start_month=1,
            month_count=1,
            created_by_id=self.user.id,
        )
        self.session.add(self.accrual)
        self.session.commit()
        self.session.refresh(self.accrual)

        self.accrual_allocation = PlanAccrualAllocation(
            accrual_id=self.accrual.id,
            year=self.scenario.year,
            month=1,
            amount=Decimal("1000.00"),
            used_amount=Decimal("125.00"),
        )
        self.quote_process = QuoteProcess(
            quote_no=f"TKL-{suffix}",
            name=f"Migration Quote {suffix}",
            created_by_id=self.user.id,
        )
        self.session.add_all([self.accrual_allocation, self.quote_process])
        self.session.commit()
        self.session.refresh(self.accrual_allocation)
        self.session.refresh(self.quote_process)

        self.vendor_offer = QuoteVendorOffer(
            process_id=self.quote_process.id,
            vendor_name=f"Migration Vendor {suffix}",
            created_by_id=self.user.id,
        )
        self.session.add(self.vendor_offer)
        self.session.commit()
        self.session.refresh(self.vendor_offer)

        self.revision = QuoteOfferRevision(
            vendor_offer_id=self.vendor_offer.id,
            revision_no=1,
            quote_date=date(2026, 11, 5),
            currency="USD",
            total_amount=Decimal("250.00"),
            created_by_id=self.user.id,
        )
        self.session.add(self.revision)
        self.session.commit()
        self.session.refresh(self.revision)

        self.document = QuoteDocument(
            process_id=self.quote_process.id,
            vendor_offer_id=self.vendor_offer.id,
            revision_id=self.revision.id,
            original_name="migration-test.pdf",
            storage_key=f"migration/{suffix}.pdf",
            content_type="application/pdf",
            size_bytes=128,
            sha256="0" * 64,
            uploaded_by_id=self.user.id,
        )
        self.session.add(self.document)
        self.session.commit()
        self.session.refresh(self.document)

    def tearDown(self) -> None:
        self.session.rollback()
        for row in (
            self.document,
            self.revision,
            self.vendor_offer,
            self.quote_process,
            self.accrual_allocation,
            self.accrual,
            self.plan,
            self.budget_item,
            self.scenario,
            self.user,
        ):
            persisted = self.session.get(type(row), row.id)
            if persisted is not None:
                self.session.delete(persisted)
                self.session.flush()
        self.session.commit()
        self.session.close()

    def _snapshot(self) -> dict[str, object]:
        self.session.expire_all()
        user = self.session.get(User, self.user.id)
        scenario = self.session.get(Scenario, self.scenario.id)
        plan = self.session.get(PlanEntry, self.plan.id)
        accrual = self.session.get(PlanAccrual, self.accrual.id)
        allocation = self.session.get(
            PlanAccrualAllocation,
            self.accrual_allocation.id,
        )
        quote = self.session.get(QuoteProcess, self.quote_process.id)
        document = self.session.get(QuoteDocument, self.document.id)
        return {
            "user": (
                user.email,
                user.hashed_password,
                user.is_admin,
                user.role,
                user.is_active,
            ),
            "scenario": (scenario.name, scenario.year, scenario.is_primary),
            "plan": (plan.amount, plan.budget_code),
            "accrual": (accrual.total_amount, accrual.status),
            "allocation": (allocation.amount, allocation.used_amount),
            "quote": (quote.quote_no, quote.name, quote.status),
            "document": (
                document.storage_key,
                document.sha256,
                document.is_active,
            ),
        }

    def test_explicit_migration_preserves_existing_domain_data(self) -> None:
        before = self._snapshot()
        with database_module.engine.begin() as connection:
            connection.execute(text("DELETE FROM app_schema_version WHERE id = 1"))

        database_module.apply_schema_migrations()

        self.assertEqual(before, self._snapshot())
        database_module.validate_database_schema(require_postgresql=True)

    def test_production_startup_is_read_only_for_current_schema(self) -> None:
        before = self._snapshot()
        production_settings = Settings(
            _env_file=None,
            environment="production",
            production_mode_required=True,
            secret_key="Integration-Test-Only-Production-Secret-2026!",
            ADMIN_BOOTSTRAP_ENABLED=False,
        )

        with patch.object(database_module, "settings", production_settings):
            database_module.init_db()

        self.assertEqual(before, self._snapshot())

    def test_version_mismatch_rejects_startup_without_data_changes(self) -> None:
        before = self._snapshot()
        with database_module.engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE app_schema_version "
                    "SET version = 'unexpected-version' WHERE id = 1"
                )
            )

        production_settings = Settings(
            _env_file=None,
            environment="production",
            production_mode_required=True,
            secret_key="Integration-Test-Only-Production-Secret-2026!",
            ADMIN_BOOTSTRAP_ENABLED=False,
        )
        try:
            with patch.object(database_module, "settings", production_settings):
                with self.assertRaises(database_module.SchemaValidationError):
                    database_module.init_db()
            self.assertEqual(before, self._snapshot())
        finally:
            with database_module.engine.begin() as connection:
                connection.execute(
                    text(
                        "UPDATE app_schema_version SET version = :version WHERE id = 1"
                    ),
                    {"version": database_module.CURRENT_SCHEMA_VERSION},
                )


if __name__ == "__main__":
    unittest.main()
