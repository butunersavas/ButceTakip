-- Güvenli rollback: teklif verisi varsa bilinçli olarak DURUR ve hiçbir tabloyu silmez.
-- Yalnızca migration henüz kullanılmamış/boş ise uygulanabilir.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM quote_processes LIMIT 1)
       OR EXISTS (SELECT 1 FROM quote_vendor_offers LIMIT 1)
       OR EXISTS (SELECT 1 FROM quote_offer_revisions LIMIT 1)
       OR EXISTS (SELECT 1 FROM quote_documents LIMIT 1) THEN
        RAISE EXCEPTION 'Teklif verisi bulundu; veri koruma kuralı gereği rollback durduruldu.';
    END IF;
END $$;

ALTER TABLE quote_processes DROP CONSTRAINT IF EXISTS fk_quote_process_preferred_offer;
DROP TABLE IF EXISTS quote_audit_logs;
DROP TABLE IF EXISTS quote_documents;
DROP TABLE IF EXISTS quote_offer_items;
DROP TABLE IF EXISTS quote_offer_revisions;
DROP TABLE IF EXISTS quote_vendor_offers;
DROP TABLE IF EXISTS quote_process_items;
DROP TABLE IF EXISTS quote_processes;
DROP TABLE IF EXISTS quote_number_sequences;

COMMIT;
