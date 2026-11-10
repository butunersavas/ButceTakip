-- BütçeTakip Teklif Yönetimi - paket, ürün bazlı revizyon ve geri alınabilir silme
-- Kaynak sürüm: 20261109_quote_usd_01
-- Hedef sürüm: 20261109_quote_packages_01
-- PostgreSQL 15; yalnız mevcut Teklif tablolarını additive olarak genişletir.
BEGIN;

SELECT pg_advisory_xact_lock(2026110902);

DO $$
DECLARE
    current_version TEXT;
    required_table TEXT;
BEGIN
    IF to_regclass(format('%I.%I', current_schema(), 'app_schema_version')) IS NULL THEN
        RAISE EXCEPTION 'app_schema_version bulunamadı; paket migration hiçbir değişiklik yapmadı.';
    END IF;

    SELECT version INTO current_version FROM app_schema_version WHERE id = 1;
    IF current_version IS DISTINCT FROM '20261109_quote_usd_01' THEN
        RAISE EXCEPTION
            'Beklenmeyen şema sürümü: %, beklenen 20261109_quote_usd_01. Migration hiçbir değişiklik yapmadı.',
            current_version;
    END IF;

    FOREACH required_table IN ARRAY ARRAY[
        'quote_processes', 'quote_process_items', 'quote_vendor_offers',
        'quote_offer_revisions', 'quote_offer_items', 'quote_documents', 'quote_audit_logs'
    ] LOOP
        IF to_regclass(format('%I.%I', current_schema(), required_table)) IS NULL THEN
            RAISE EXCEPTION 'Zorunlu Teklif tablosu eksik: %. Migration hiçbir değişiklik yapmadı.', required_table;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (
            (table_name = 'quote_processes' AND column_name IN ('process_type', 'deleted_at', 'deleted_by_id', 'deleted_reason'))
            OR (table_name = 'quote_process_items' AND column_name IN ('requested_quantity', 'requested_duration_months', 'is_active', 'removed_at', 'removed_by_id'))
            OR (table_name = 'quote_offer_revisions' AND column_name IN ('updated_by_id', 'deleted_at', 'deleted_by_id', 'deleted_reason'))
          )
    ) THEN
        RAISE EXCEPTION 'Paket migration kolonlarından en az biri zaten var; kısmi/beklenmeyen şema nedeniyle işlem durduruldu.';
    END IF;
END $$;

ALTER TABLE quote_processes
    ADD COLUMN process_type VARCHAR(16),
    ADD COLUMN deleted_at TIMESTAMP,
    ADD COLUMN deleted_by_id INTEGER REFERENCES users(id),
    ADD COLUMN deleted_reason TEXT;

UPDATE quote_processes process
SET process_type = CASE
    WHEN (SELECT COUNT(*) FROM quote_process_items item WHERE item.process_id = process.id) <= 1
        THEN 'SINGLE'
    ELSE 'PACKAGE'
END;

ALTER TABLE quote_processes
    ALTER COLUMN process_type SET DEFAULT 'SINGLE',
    ALTER COLUMN process_type SET NOT NULL,
    ADD CONSTRAINT ck_quote_process_type CHECK (process_type IN ('SINGLE', 'PACKAGE'));

ALTER TABLE quote_process_items
    ADD COLUMN requested_quantity NUMERIC(16,4) NOT NULL DEFAULT 1,
    ADD COLUMN requested_duration_months INTEGER,
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN removed_at TIMESTAMP,
    ADD COLUMN removed_by_id INTEGER REFERENCES users(id),
    ADD CONSTRAINT ck_quote_process_item_requested_quantity CHECK (requested_quantity > 0),
    ADD CONSTRAINT ck_quote_process_item_requested_duration CHECK (
        requested_duration_months IS NULL OR requested_duration_months IN (1,6,12,24,36,60)
    );

ALTER TABLE quote_offer_revisions
    ADD COLUMN updated_by_id INTEGER REFERENCES users(id),
    ADD COLUMN deleted_at TIMESTAMP,
    ADD COLUMN deleted_by_id INTEGER REFERENCES users(id),
    ADD COLUMN deleted_reason TEXT;

CREATE INDEX ix_quote_processes_process_type ON quote_processes(process_type);
CREATE INDEX ix_quote_processes_deleted_at ON quote_processes(deleted_at);
CREATE INDEX ix_quote_process_items_is_active ON quote_process_items(is_active);
CREATE INDEX ix_quote_offer_revisions_deleted_at ON quote_offer_revisions(deleted_at);

UPDATE app_schema_version
SET version = '20261109_quote_packages_01', updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

COMMIT;
