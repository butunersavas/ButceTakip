-- Normal uygulama rollback'inde çalıştırılmaz; önceki image additive kolonları görmezden gelir.
-- Yalnız yeni özelliklere ait hiçbir veri kullanılmadıysa şemayı eski sürüme döndürür.
BEGIN;

SELECT pg_advisory_xact_lock(2026110902);

DO $$
DECLARE
    current_version TEXT;
BEGIN
    SELECT version INTO current_version FROM app_schema_version WHERE id = 1;
    IF current_version IS DISTINCT FROM '20261109_quote_packages_01' THEN
        RAISE EXCEPTION 'Beklenmeyen şema sürümü: %. Down migration durduruldu.', current_version;
    END IF;

    IF EXISTS (SELECT 1 FROM quote_processes WHERE process_type <> 'SINGLE' OR deleted_at IS NOT NULL)
       OR EXISTS (
            SELECT 1 FROM quote_process_items
            WHERE requested_quantity <> 1 OR requested_duration_months IS NOT NULL
               OR is_active IS NOT TRUE OR removed_at IS NOT NULL OR removed_by_id IS NOT NULL
       )
       OR EXISTS (
            SELECT 1 FROM quote_offer_revisions
            WHERE updated_by_id IS NOT NULL OR deleted_at IS NOT NULL
               OR deleted_by_id IS NOT NULL OR deleted_reason IS NOT NULL
       ) THEN
        RAISE EXCEPTION 'Yeni paket/revizyon/silme verisi bulundu; veri koruma kuralı gereği down migration durduruldu.';
    END IF;
END $$;

DROP INDEX ix_quote_offer_revisions_deleted_at;
DROP INDEX ix_quote_process_items_is_active;
DROP INDEX ix_quote_processes_deleted_at;
DROP INDEX ix_quote_processes_process_type;

ALTER TABLE quote_offer_revisions
    DROP COLUMN deleted_reason,
    DROP COLUMN deleted_by_id,
    DROP COLUMN deleted_at,
    DROP COLUMN updated_by_id;

ALTER TABLE quote_process_items
    DROP CONSTRAINT ck_quote_process_item_requested_duration,
    DROP CONSTRAINT ck_quote_process_item_requested_quantity,
    DROP COLUMN removed_by_id,
    DROP COLUMN removed_at,
    DROP COLUMN is_active,
    DROP COLUMN requested_duration_months,
    DROP COLUMN requested_quantity;

ALTER TABLE quote_processes
    DROP CONSTRAINT ck_quote_process_type,
    DROP COLUMN deleted_reason,
    DROP COLUMN deleted_by_id,
    DROP COLUMN deleted_at,
    DROP COLUMN process_type;

UPDATE app_schema_version
SET version = '20261109_quote_usd_01', updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

COMMIT;
