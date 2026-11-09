-- BütçeTakip Teklif Yönetimi - PostgreSQL 15 - USD-only release
-- Yalnız yeni Teklif tablolarını oluşturur. Genel tarihsel migration çalıştırmaz.
-- Mevcut/yarım Teklif şeması görürse veri veya constraint değiştirmeden durur.
BEGIN;

SELECT pg_advisory_xact_lock(2026110901);

DO $$
DECLARE
    existing_quote_tables TEXT;
BEGIN
    IF to_regclass(format('%I.%I', current_schema(), 'users')) IS NULL
       OR to_regclass(format('%I.%I', current_schema(), 'budget_items')) IS NULL THEN
        RAISE EXCEPTION
            'Teklif migration önkoşulu sağlanmadı: aktif şemada users ve budget_items tabloları bulunmalıdır.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'id'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'budget_items' AND column_name = 'id'
    ) THEN
        RAISE EXCEPTION
            'Teklif migration önkoşulu sağlanmadı: users.id veya budget_items.id kolonu bulunamadı.';
    END IF;

    SELECT string_agg(table_name, ', ' ORDER BY table_name)
    INTO existing_quote_tables
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name IN (
          'quote_number_sequences',
          'quote_processes',
          'quote_process_items',
          'quote_vendor_offers',
          'quote_offer_revisions',
          'quote_offer_items',
          'quote_documents',
          'quote_audit_logs'
      );

    IF existing_quote_tables IS NOT NULL THEN
        RAISE EXCEPTION
            'Teklif tabloları zaten mevcut (%). Migration hiçbir değişiklik yapmadı. Önce 20261109_quote_management_preflight.sql ile para birimi ve şema envanterini raporlayın.',
            existing_quote_tables;
    END IF;
END $$;

CREATE TABLE quote_number_sequences (
    year INTEGER PRIMARY KEY,
    last_value INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0)
);

CREATE TABLE quote_processes (
    id SERIAL PRIMARY KEY,
    quote_no VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(250) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'COLLECTING',
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    preferred_offer_id INTEGER,
    archived_at TIMESTAMP,
    archived_by_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_quote_process_status CHECK (
        status IN ('COLLECTING', 'EVALUATING', 'COMPLETED', 'CANCELLED', 'ARCHIVED')
    )
);

CREATE TABLE quote_process_items (
    id SERIAL PRIMARY KEY,
    process_id INTEGER NOT NULL REFERENCES quote_processes(id),
    budget_item_id INTEGER REFERENCES budget_items(id),
    name VARCHAR(250) NOT NULL,
    product_code VARCHAR(120),
    category VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quote_vendor_offers (
    id SERIAL PRIMARY KEY,
    process_id INTEGER NOT NULL REFERENCES quote_processes(id),
    vendor_name VARCHAR(250) NOT NULL,
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE quote_processes
    ADD CONSTRAINT fk_quote_process_preferred_offer
    FOREIGN KEY (preferred_offer_id) REFERENCES quote_vendor_offers(id);

CREATE TABLE quote_offer_revisions (
    id SERIAL PRIMARY KEY,
    vendor_offer_id INTEGER NOT NULL REFERENCES quote_vendor_offers(id),
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),
    quote_date DATE NOT NULL,
    valid_until DATE,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    total_amount NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    note TEXT,
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_quote_offer_revision_no UNIQUE (vendor_offer_id, revision_no),
    CONSTRAINT ck_quote_revision_dates CHECK (valid_until IS NULL OR valid_until >= quote_date),
    CONSTRAINT ck_quote_revision_currency_usd CHECK (currency = 'USD')
);

CREATE TABLE quote_offer_items (
    id SERIAL PRIMARY KEY,
    revision_id INTEGER NOT NULL REFERENCES quote_offer_revisions(id),
    process_item_id INTEGER REFERENCES quote_process_items(id),
    product_name VARCHAR(250) NOT NULL,
    product_code VARCHAR(120),
    category VARCHAR(100) NOT NULL,
    duration_months INTEGER CHECK (duration_months IS NULL OR duration_months IN (1,6,12,24,36,60)),
    quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(20,4) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(20,2) NOT NULL CHECK (line_total >= 0),
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quote_documents (
    id SERIAL PRIMARY KEY,
    process_id INTEGER NOT NULL REFERENCES quote_processes(id),
    vendor_offer_id INTEGER NOT NULL REFERENCES quote_vendor_offers(id),
    revision_id INTEGER NOT NULL REFERENCES quote_offer_revisions(id),
    original_name VARCHAR(255) NOT NULL,
    storage_key VARCHAR(120) NOT NULL UNIQUE,
    content_type VARCHAR(120) NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    sha256 VARCHAR(64) NOT NULL,
    uploaded_by_id INTEGER NOT NULL REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deactivated_at TIMESTAMP,
    deactivated_by_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quote_audit_logs (
    id SERIAL PRIMARY KEY,
    process_id INTEGER NOT NULL REFERENCES quote_processes(id),
    vendor_offer_id INTEGER REFERENCES quote_vendor_offers(id),
    revision_id INTEGER REFERENCES quote_offer_revisions(id),
    document_id INTEGER REFERENCES quote_documents(id),
    action VARCHAR(80) NOT NULL,
    details TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_quote_processes_status ON quote_processes(status);
CREATE INDEX ix_quote_processes_created_at ON quote_processes(created_at);
CREATE INDEX ix_quote_processes_created_by_id ON quote_processes(created_by_id);
CREATE INDEX ix_quote_process_items_process_id ON quote_process_items(process_id);
CREATE INDEX ix_quote_process_items_budget_item_id ON quote_process_items(budget_item_id);
CREATE INDEX ix_quote_vendor_offers_process_id ON quote_vendor_offers(process_id);
CREATE INDEX ix_quote_offer_revisions_offer_id ON quote_offer_revisions(vendor_offer_id);
CREATE INDEX ix_quote_offer_revisions_currency ON quote_offer_revisions(currency);
CREATE INDEX ix_quote_offer_items_revision_id ON quote_offer_items(revision_id);
CREATE INDEX ix_quote_documents_process_id ON quote_documents(process_id);
CREATE INDEX ix_quote_documents_revision_id ON quote_documents(revision_id);
CREATE INDEX ix_quote_documents_sha256 ON quote_documents(sha256);
CREATE INDEX ix_quote_audit_logs_process_id ON quote_audit_logs(process_id);

COMMIT;
