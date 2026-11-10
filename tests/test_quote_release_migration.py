from pathlib import Path
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = REPOSITORY_ROOT / "migrations"


class QuoteReleaseMigrationTests(unittest.TestCase):
    def test_forward_migration_is_quote_only_and_usd_only(self) -> None:
        sql = (
            MIGRATIONS / "20261109_quote_management_usd_only_up.sql"
        ).read_text(encoding="utf-8")
        normalized = " ".join(sql.upper().split())

        self.assertIn("CHECK (CURRENCY = 'USD')", normalized)
        self.assertIn("PG_ADVISORY_XACT_LOCK(2026110901)", normalized)
        self.assertNotIn("CREATE TABLE IF NOT EXISTS", normalized)
        self.assertNotIn("SQLMODEL", normalized)
        self.assertNotIn("APP_SCHEMA_VERSION", normalized)
        for protected_table in ("USERS", "BUDGET_ITEMS", "PLAN_ENTRIES", "EXPENSES"):
            self.assertNotIn(f"ALTER TABLE {protected_table}", normalized)
            self.assertNotIn(f"DROP TABLE {protected_table}", normalized)
            self.assertNotIn(f"DELETE FROM {protected_table}", normalized)
            self.assertNotIn(f"UPDATE {protected_table}", normalized)

    def test_preflight_is_read_only_and_reports_non_usd_inventory(self) -> None:
        sql = (
            MIGRATIONS / "20261109_quote_management_preflight.sql"
        ).read_text(encoding="utf-8")
        normalized = " ".join(sql.upper().split())

        self.assertIn("BEGIN TRANSACTION READ ONLY", normalized)
        self.assertIn("NON_USD_REVISION_COUNT", normalized)
        self.assertIn("CURRENCY IS DISTINCT FROM 'USD'", normalized)
        self.assertNotIn("INSERT INTO", normalized)
        self.assertNotIn("UPDATE ", normalized)
        self.assertNotIn("DELETE FROM", normalized)
        self.assertNotIn("CREATE TABLE", normalized)
        self.assertNotIn("ALTER TABLE", normalized)

    def test_down_migration_refuses_to_remove_any_quote_data(self) -> None:
        sql = (
            MIGRATIONS / "20261109_quote_management_usd_only_down.sql"
        ).read_text(encoding="utf-8")
        normalized = " ".join(sql.upper().split())

        for table in (
            "QUOTE_NUMBER_SEQUENCES",
            "QUOTE_PROCESSES",
            "QUOTE_PROCESS_ITEMS",
            "QUOTE_VENDOR_OFFERS",
            "QUOTE_OFFER_REVISIONS",
            "QUOTE_OFFER_ITEMS",
            "QUOTE_DOCUMENTS",
            "QUOTE_AUDIT_LOGS",
        ):
            self.assertIn(f"EXISTS (SELECT 1 FROM {table} LIMIT 1)", normalized)

    def test_package_migration_is_additive_versioned_and_fail_closed(self) -> None:
        up_sql = (
            MIGRATIONS / "20261109_quote_packages_product_revisions_up.sql"
        ).read_text(encoding="utf-8")
        normalized = " ".join(up_sql.upper().split())

        self.assertIn("20261109_QUOTE_USD_01", normalized)
        self.assertIn("20261109_QUOTE_PACKAGES_01", normalized)
        self.assertIn("PG_ADVISORY_XACT_LOCK(2026110902)", normalized)
        self.assertIn("ADD COLUMN PROCESS_TYPE", normalized)
        self.assertIn("ADD COLUMN REQUESTED_QUANTITY", normalized)
        self.assertIn("ADD COLUMN DELETED_AT", normalized)
        self.assertIn("COUNT(*) FROM QUOTE_PROCESS_ITEMS", normalized)
        self.assertIn("THEN 'SINGLE' ELSE 'PACKAGE'", normalized)
        for protected_table in ("USERS", "BUDGET_ITEMS", "PLAN_ENTRIES", "EXPENSES"):
            self.assertNotIn(f"ALTER TABLE {protected_table}", normalized)
            self.assertNotIn(f"DELETE FROM {protected_table}", normalized)
            self.assertNotIn(f"UPDATE {protected_table}", normalized)

    def test_package_down_migration_refuses_when_new_data_exists(self) -> None:
        down_sql = (
            MIGRATIONS / "20261109_quote_packages_product_revisions_down.sql"
        ).read_text(encoding="utf-8")
        normalized = " ".join(down_sql.upper().split())

        self.assertIn("PROCESS_TYPE <> 'SINGLE'", normalized)
        self.assertIn("IS_ACTIVE IS NOT TRUE", normalized)
        self.assertIn("DELETED_AT IS NOT NULL", normalized)
        self.assertIn("DOWN MIGRATION DURDURULDU", normalized)


if __name__ == "__main__":
    unittest.main()
