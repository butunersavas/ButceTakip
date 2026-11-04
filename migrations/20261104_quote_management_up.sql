-- BütçeTakip Teklif Yönetimi - PostgreSQL 15
-- Hazırlık migration'idir. Production ortamında otomatik çalıştırılmaz.
BEGIN;

CREATE TABLE IF NOT EXISTS quote_number_sequences (
    year INTEGER PRIMARY KEY,
    last_value INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0)
);

CREATE TABLE IF NOT EXISTS quote_processes (
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

CREATE TABLE IF NOT EXISTS quote_process_items (
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

CREATE TABLE IF NOT EXISTS quote_vendor_offers (
    id SERIAL PRIMARY KEY,
    process_id INTEGER NOT NULL REFERENCES quote_processes(id),
    vendor_name VARCHAR(250) NOT NULL,
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_quote_process_preferred_offer'
    ) THEN
        ALTER TABLE quote_processes
            ADD CONSTRAINT fk_quote_process_preferred_offer
            FOREIGN KEY (preferred_offer_id) REFERENCES quote_vendor_offers(id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS quote_offer_revisions (
    id SERIAL PRIMARY KEY,
    vendor_offer_id INTEGER NOT NULL REFERENCES quote_vendor_offers(id),
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),
    quote_date DATE NOT NULL,
    valid_until DATE,
    currency VARCHAR(3) NOT NULL CHECK (currency IN ('TRY', 'USD', 'EUR')),
    total_amount NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    note TEXT,
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_quote_offer_revision_no UNIQUE (vendor_offer_id, revision_no),
    CONSTRAINT ck_quote_revision_dates CHECK (valid_until IS NULL OR valid_until >= quote_date)
);

CREATE TABLE IF NOT EXISTS quote_offer_items (
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

CREATE TABLE IF NOT EXISTS quote_documents (
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

CREATE TABLE IF NOT EXISTS quote_audit_logs (
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

CREATE INDEX IF NOT EXISTS ix_quote_processes_status ON quote_processes(status);
CREATE INDEX IF NOT EXISTS ix_quote_processes_created_at ON quote_processes(created_at);
CREATE INDEX IF NOT EXISTS ix_quote_process_items_process_id ON quote_process_items(process_id);
CREATE INDEX IF NOT EXISTS ix_quote_process_items_budget_item_id ON quote_process_items(budget_item_id);
CREATE INDEX IF NOT EXISTS ix_quote_vendor_offers_process_id ON quote_vendor_offers(process_id);
CREATE INDEX IF NOT EXISTS ix_quote_offer_revisions_offer_id ON quote_offer_revisions(vendor_offer_id);
CREATE INDEX IF NOT EXISTS ix_quote_offer_revisions_currency ON quote_offer_revisions(currency);
CREATE INDEX IF NOT EXISTS ix_quote_offer_items_revision_id ON quote_offer_items(revision_id);
CREATE INDEX IF NOT EXISTS ix_quote_documents_process_id ON quote_documents(process_id);
CREATE INDEX IF NOT EXISTS ix_quote_documents_revision_id ON quote_documents(revision_id);
CREATE INDEX IF NOT EXISTS ix_quote_documents_sha256 ON quote_documents(sha256);
CREATE INDEX IF NOT EXISTS ix_quote_audit_logs_process_id ON quote_audit_logs(process_id);

COMMIT;
