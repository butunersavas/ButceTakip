-- Adds the SSL warranty item type to the existing PostgreSQL enum.
-- Safe/idempotent: does not drop tables, truncate data, or touch volumes.
-- Run once before creating/importing SSL warranty records in environments
-- where warranty_items.type is backed by the warrantyitemtype enum.

ALTER TYPE warrantyitemtype ADD VALUE IF NOT EXISTS 'SSL';
