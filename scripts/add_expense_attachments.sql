CREATE TABLE IF NOT EXISTS expense_attachments (
    id INTEGER PRIMARY KEY,
    expense_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    uploaded_by TEXT NULL,
    FOREIGN KEY(expense_id) REFERENCES expenses(id)
);

CREATE INDEX IF NOT EXISTS ix_expense_attachments_expense_id
    ON expense_attachments(expense_id);

CREATE INDEX IF NOT EXISTS ix_expense_attachments_uploaded_at
    ON expense_attachments(uploaded_at);
