-- Acil uygulama rollback'i için bu dosya çalıştırılmaz; önceki image'a dönülür.
-- Şema kaldırma yalnız Teklif tablolarının tamamı boşsa ve ayrıca onaylanmışsa mümkündür.
BEGIN;

SELECT pg_advisory_xact_lock(2026110901);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM quote_number_sequences LIMIT 1)
       OR EXISTS (SELECT 1 FROM quote_processes LIMIT 1)
       OR EXISTS (SELECT 1 FROM quote_process_items LIMIT 1)
       OR EXISTS (SELECT 1 FROM quote_vendor_offers LIMIT 1)
       OR EXISTS (SELECT 1 FROM quote_offer_revisions LIMIT 1)
       OR EXISTS (SELECT 1 FROM quote_offer_items LIMIT 1)
       OR EXISTS (SELECT 1 FROM quote_documents LIMIT 1)
       OR EXISTS (SELECT 1 FROM quote_audit_logs LIMIT 1) THEN
        RAISE EXCEPTION 'Teklif verisi bulundu; veri koruma kuralı gereği rollback durduruldu.';
    END IF;
END $$;

ALTER TABLE quote_processes DROP CONSTRAINT fk_quote_process_preferred_offer;
DROP TABLE quote_audit_logs;
DROP TABLE quote_documents;
DROP TABLE quote_offer_items;
DROP TABLE quote_offer_revisions;
DROP TABLE quote_vendor_offers;
DROP TABLE quote_process_items;
DROP TABLE quote_processes;
DROP TABLE quote_number_sequences;

COMMIT;
