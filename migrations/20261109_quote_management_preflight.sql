\set ON_ERROR_STOP on
\pset pager off

-- Salt-okunur production/staging envanteri. Bu dosya DDL veya DML çalıştırmaz.
BEGIN TRANSACTION READ ONLY;

SELECT
    current_database() AS database_name,
    current_user AS database_user,
    current_schema() AS active_schema,
    current_setting('search_path') AS search_path,
    version() AS postgres_version;

WITH expected(table_name) AS (
    VALUES
        ('users'),
        ('budget_items'),
        ('plan_entries'),
        ('expenses'),
        ('quote_number_sequences'),
        ('quote_processes'),
        ('quote_process_items'),
        ('quote_vendor_offers'),
        ('quote_offer_revisions'),
        ('quote_offer_items'),
        ('quote_documents'),
        ('quote_audit_logs')
)
SELECT
    table_name,
    to_regclass(format('%I.%I', current_schema(), table_name)) IS NOT NULL AS exists_in_active_schema
FROM expected
ORDER BY table_name;

SELECT to_regclass(format('%I.%I', current_schema(), 'app_schema_version')) IS NOT NULL AS has_schema_version \gset
\if :has_schema_version
SELECT id, version, updated_at FROM app_schema_version ORDER BY id;
\else
SELECT 'app_schema_version tablosu yok' AS schema_version_status;
\endif

SELECT to_regclass(format('%I.%I', current_schema(), 'users')) IS NOT NULL AS has_users \gset
\if :has_users
SELECT 'users' AS table_name, count(*) AS row_count FROM users;
\endif

SELECT to_regclass(format('%I.%I', current_schema(), 'budget_items')) IS NOT NULL AS has_budget_items \gset
\if :has_budget_items
SELECT 'budget_items' AS table_name, count(*) AS row_count FROM budget_items;
\endif

SELECT to_regclass(format('%I.%I', current_schema(), 'plan_entries')) IS NOT NULL AS has_plan_entries \gset
\if :has_plan_entries
SELECT 'plan_entries' AS table_name, count(*) AS row_count FROM plan_entries;
\endif

SELECT to_regclass(format('%I.%I', current_schema(), 'expenses')) IS NOT NULL AS has_expenses \gset
\if :has_expenses
SELECT 'expenses' AS table_name, count(*) AS row_count FROM expenses;
\endif

SELECT to_regclass(format('%I.%I', current_schema(), 'quote_offer_revisions')) IS NOT NULL AS has_quote_revisions \gset
\if :has_quote_revisions
SELECT currency, count(*) AS revision_count
FROM quote_offer_revisions
GROUP BY currency
ORDER BY currency;

SELECT count(*) AS non_usd_revision_count
FROM quote_offer_revisions
WHERE currency IS DISTINCT FROM 'USD';

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = to_regclass(format('%I.%I', current_schema(), 'quote_offer_revisions'))
ORDER BY conname;
\else
SELECT 'Teklif revizyon tablosu yok; mevcut EUR/TRY teklifi bulunamaz.' AS currency_inventory_status;
\endif

WITH quote_tables(table_name) AS (
    VALUES
        ('quote_number_sequences'),
        ('quote_processes'),
        ('quote_process_items'),
        ('quote_vendor_offers'),
        ('quote_offer_revisions'),
        ('quote_offer_items'),
        ('quote_documents'),
        ('quote_audit_logs')
)
SELECT
    table_name,
    COALESCE(
        (
            SELECT n_live_tup
            FROM pg_stat_user_tables
            WHERE schemaname = current_schema() AND relname = table_name
        ),
        0
    ) AS estimated_rows
FROM quote_tables
ORDER BY table_name;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND (
    (table_name = 'quote_processes' AND column_name IN (
        'process_type', 'deleted_at', 'deleted_by_id', 'deleted_reason'
    ))
    OR (table_name = 'quote_process_items' AND column_name IN (
        'requested_quantity', 'requested_duration_months', 'is_active',
        'removed_at', 'removed_by_id'
    ))
    OR (table_name = 'quote_offer_revisions' AND column_name IN (
        'updated_by_id', 'deleted_at', 'deleted_by_id', 'deleted_reason'
    ))
  )
ORDER BY table_name, ordinal_position;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = current_schema()
  AND indexname IN (
    'ix_quote_processes_process_type',
    'ix_quote_processes_deleted_at',
    'ix_quote_process_items_is_active',
    'ix_quote_offer_revisions_deleted_at'
  )
ORDER BY tablename, indexname;

ROLLBACK;
