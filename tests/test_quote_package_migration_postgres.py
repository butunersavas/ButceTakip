import os
from pathlib import Path
import unittest
from uuid import uuid4
from decimal import Decimal

import psycopg2


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DATABASE_URL = os.getenv("QUOTE_PACKAGE_MIGRATION_DATABASE_URL")


@unittest.skipUnless(
    DATABASE_URL,
    "Quote package migration integration test requires an isolated PostgreSQL database.",
)
class QuotePackageMigrationPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"quote_package_{uuid4().hex[:12]}"
        self.connection = psycopg2.connect(DATABASE_URL)
        self.connection.autocommit = True
        with self.connection.cursor() as cursor:
            cursor.execute(f'CREATE SCHEMA "{self.schema}"')
            cursor.execute(f'SET search_path TO "{self.schema}"')
            cursor.execute(
                "CREATE TABLE users ("
                "id SERIAL PRIMARY KEY, username TEXT NOT NULL, hashed_password TEXT NOT NULL"
                ")"
            )
            cursor.execute(
                "CREATE TABLE budget_items (id SERIAL PRIMARY KEY, code TEXT, name TEXT)"
            )
            cursor.execute(
                "CREATE TABLE app_schema_version ("
                "id INTEGER PRIMARY KEY, version VARCHAR(64) NOT NULL, "
                "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"
                ")"
            )
            cursor.execute(
                "INSERT INTO app_schema_version (id, version) "
                "VALUES (1, '20261109_quote_usd_01')"
            )
            cursor.execute(
                (REPOSITORY_ROOT / "migrations" / "20261109_quote_management_usd_only_up.sql")
                .read_text(encoding="utf-8")
            )
            cursor.execute(
                "INSERT INTO users (username, hashed_password) VALUES ('existing', 'stable-hash')"
            )
            cursor.execute(
                "INSERT INTO quote_processes (quote_no, name, created_by_id) VALUES "
                "('TKL-2026-0001', 'Tek ürün', 1), ('TKL-2026-0002', 'Paket', 1)"
            )
            cursor.execute(
                "INSERT INTO quote_process_items "
                "(process_id, name, category, sort_order) VALUES "
                "(1, 'Cihaz', 'Donanım', 0), "
                "(2, 'Cihaz', 'Donanım', 0), "
                "(2, 'Lisans', 'Lisans Uzatma', 1)"
            )
            cursor.execute(
                "INSERT INTO quote_vendor_offers (process_id, vendor_name, created_by_id) "
                "VALUES (2, 'TürkTelekom', 1)"
            )
            cursor.execute(
                "INSERT INTO quote_offer_revisions "
                "(vendor_offer_id, revision_no, quote_date, currency, total_amount, created_by_id) "
                "VALUES (1, 1, DATE '2026-11-09', 'USD', 12500.00, 1)"
            )
            cursor.execute(
                "INSERT INTO quote_offer_items "
                "(revision_id, process_item_id, product_name, category, quantity, unit_price, line_total) "
                "VALUES (1, 2, 'Cihaz', 'Donanım', 1, 10000, 10000), "
                "(1, 3, 'Lisans', 'Lisans Uzatma', 1, 2500, 2500)"
            )
            cursor.execute(
                "INSERT INTO quote_documents "
                "(process_id, vendor_offer_id, revision_id, original_name, storage_key, "
                "content_type, size_bytes, sha256, uploaded_by_id) VALUES "
                "(2, 1, 1, 'teklif.pdf', 'stable/test.pdf', 'application/pdf', 10, %s, 1)",
                ("a" * 64,),
            )

    def tearDown(self) -> None:
        try:
            with self.connection.cursor() as cursor:
                cursor.execute("ROLLBACK")
                cursor.execute("SET search_path TO public")
                cursor.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
        finally:
            self.connection.close()

    def _execute_file(self, name: str) -> None:
        with self.connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{self.schema}"')
            cursor.execute((REPOSITORY_ROOT / "migrations" / name).read_text(encoding="utf-8"))

    def test_migration_classifies_existing_processes_and_preserves_all_records(self) -> None:
        self._execute_file("20261109_quote_packages_product_revisions_up.sql")
        with self.connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{self.schema}"')
            cursor.execute("SELECT quote_no, process_type FROM quote_processes ORDER BY id")
            self.assertEqual(
                [("TKL-2026-0001", "SINGLE"), ("TKL-2026-0002", "PACKAGE")],
                cursor.fetchall(),
            )
            cursor.execute(
                "SELECT COUNT(*), SUM(total_amount) FROM quote_offer_revisions"
            )
            self.assertEqual((1, Decimal("12500.00")), cursor.fetchone())
            cursor.execute("SELECT COUNT(*) FROM quote_offer_items")
            self.assertEqual(2, cursor.fetchone()[0])
            cursor.execute("SELECT COUNT(*), MIN(sha256) FROM quote_documents")
            self.assertEqual((1, "a" * 64), cursor.fetchone())
            cursor.execute("SELECT hashed_password FROM users WHERE id = 1")
            self.assertEqual("stable-hash", cursor.fetchone()[0])
            cursor.execute("SELECT version FROM app_schema_version WHERE id = 1")
            self.assertEqual("20261109_quote_packages_01", cursor.fetchone()[0])

        with self.assertRaises(psycopg2.Error):
            self._execute_file("20261109_quote_packages_product_revisions_up.sql")
        with self.connection.cursor() as cursor:
            cursor.execute("ROLLBACK")
        with self.assertRaises(psycopg2.Error):
            self._execute_file("20261109_quote_packages_product_revisions_down.sql")
        with self.connection.cursor() as cursor:
            cursor.execute("ROLLBACK")

        with self.connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{self.schema}"')
            cursor.execute("SELECT COUNT(*) FROM quote_processes")
            self.assertEqual(2, cursor.fetchone()[0])
            cursor.execute("SELECT COUNT(*) FROM quote_offer_revisions")
            self.assertEqual(1, cursor.fetchone()[0])


if __name__ == "__main__":
    unittest.main()
