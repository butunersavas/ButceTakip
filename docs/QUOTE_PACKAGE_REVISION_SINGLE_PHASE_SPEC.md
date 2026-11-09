# Teklif Yönetimi — Tek ürün / paket, ürün bazlı revizyon, güvenli silme ve firma renkleri

**Tek geliştirme paketi; tek test/kabul akışı; tek kontrollü production deployment.**

## Bağlam ve kaynak
- Repository: `butunersavas/ButceTakip`.
- Çalışma tabanı: `release/quote-management-usd-prod-ready`, commit `320a70c884f3004c56ecda93eb364a0e2c196fc1`.
- Canlı sunucu: `172.24.2.227`, production API/frontend `320a70c`; canlı PostgreSQL şeması `20261109_quote_usd_01`. GitHub'daki release'in **dışında**, sunucudaki canlı API'ye uygulanmış SSO özelleştirmesi ve compose override'ları bulunuyor. Bu Git dalı SSO kodunu taşımıyor; deploy sırasında açıkça korunmalı.
- Mevcut modeller: `QuoteProcess`, `QuoteProcessItem`, `QuoteVendorOffer`, `QuoteOfferRevision`, `QuoteOfferItem`, `QuoteDocument`, `QuoteAuditLog`; `QuoteOfferItem.process_item_id` ürün eşlemesini **zaten destekliyor**. Bunları yeniden icat etme.
- Mevcut üretim verileri korunacak; kullanıcı, bütçe, plan, harcama, teklif, revizyon ve belge metadata'sı kaybolmayacak. Para birimi **USD-only** kalacak.

## 1. Süreç türü ve paket ürünleri
- Yeni süreç oluşturma/düzenlemede görünür ve zorunlu seçim: **Tek Ürün** (`SINGLE`) veya **Paket / Çoklu Ürün** (`PACKAGE`). Form, seçime göre çalışmalı.
- `SINGLE` tam 1 süreç ürünü; `PACKAGE` en az 1, sınırsız sayıda ürün/hizmet satırı. Paket satırında ürün/hizmet adı, ürün kodu, kategori, açıklama, istenen adet ve varsa süre yer almalı. Sıralama/değiştirme/ekleme/çıkarma desteklenmeli.
- Mevcut kayıtlar migration'da otomatik sınıflandırılsın: 1 satırlılar `SINGLE`, 2+ satırlılar `PACKAGE`; hiçbir süreç, firma veya revizyon kaydı silinmesin.
- Fiyatlar süreç ürününde değil, firma revizyon satırında saklanır; paket toplamı seçilen revizyondaki ürün tutarlarının toplamı olarak hesaplanır.
- Geçmiş revizyonun referans verdiği süreç ürünü fiziksel olarak silinmesin. Böyle bir ürün kaldırılıyorsa arşiv/pasif mantığı veya açık veri koruma kuralı kullan. Eski karşılaştırmalar bozulmasın.

## 2. Ürün bazlı revizyon
- Her firma teklifi bir veya daha çok süreç ürününü fiyatlayabilir. Mevcut `process_item_id` ilişkisini kullan.
- **Yeni Revizyon** ekranında `Tüm paket` veya `Belirli ürün(ler)` seçeneği olsun. Belirli ürün seçildiğinde seçilen ürünlerin adet, birim fiyat, ürün kodu, süre, açıklama ve tarih/not alanları düzenlenebilsin.
- Yeni revizyon oluştururken önceki aktif revizyonun **bütün satırlarının snapshot'ını** taşı; yalnız seçilen satırları yeni değerlerle değiştir. Böylece değiştirilmemiş ürünlerin fiyatları ve toplamlar korunur, geçmiş revizyon sabit kalır. Önceki revizyonda olmayan ürünler için `teklif verilmedi` durumu açıkça gösterilmeli; sessizce sıfır fiyat üretilmemeli.
- UI revizyonlarda **hangi ürünlerin değiştiğini** (önceki geçerli revizyonla karşılaştırarak) görsel olarak göstermeli. Revizyon numaraları ve doküman bağları stabil kalmalı. Para birimi sadece USD.
- Tek ürün sürecinde akış mümkün olduğu kadar mevcut form gibi kalmalı.

## 3. Revizyon düzenle / sil
- Her revizyon kartında **Düzenle** ve **Sil**; düzenleme için tarih, geçerlilik, not, ürün satırları, adet/birim fiyat düzeltmeleri. Backend tüm fiyat/ürün ilişkilerini ve toplamı tekrar doğrulasın. İşlem atomic transaction ile sonuçlansın.
- Düzenleme geçmişi `QuoteAuditLog` içerisinde önce/sonra özetleriyle (hassas bilgi sızdırmadan) kayıt altına alınsın; istemci kaynaklı total kabul edilmesin. Revizyon numarası/ID değişmesin.
- Silme **soft delete** olsun: kullanıcı onayı, yazma yetkisi, `deleted_at`, `deleted_by_id`, gerekirse `deleted_reason`. Belge dosyaları fiziksel silinmesin. Silinen revizyon liste, aktif revizyon, karşılaştırma, export ve toplam hesaplarından dışlansın.
- En güncel revizyon silinince firma için sonraki en güncel **silinmemiş** revizyon aktif kabul edilsin. Hiç revizyon kalmazsa firma toplamı boş/teklif yok olsun; varsayılan 0 USD gösterilmesin.
- Admin için geri yükleme endpoint'i ve görünümü olsun; geri yükleme audit kaydı oluştursun. Yarış koşulları, yetkisiz viewer ve başka firmaya ait revision ID'si reddedilsin.

## 4. Süreç silme / geri yükleme
- Teklif listesinde ve detayında **Sil** butonu; numara/ad gösteren açık onay diyaloğu; yanlış açılmış süreci kullanıcı listesinden kaldır.
- Veri veya belge varsa **soft delete**; ilişkili teklifler, revizyonlar, belge metadata'sı ve audit geçmişi korunmalı. Hiç ilişkili veri yoksa bile tutarlılık için aynı silme semantiği kullanılabilir.
- Default liste/özet/Excel/filtre/karşılaştırma silinmiş süreçleri dışlar. Admin için `Silinen Teklifler` + **Geri Al**. Doğrudan URL/API ile silinmiş kayda erişim yetkiye göre 404/403; belge endpoint'i de bunu atlamamalı.
- İptal (`CANCELLED`), arşiv (`ARCHIVED`) ve silindi durumları birbirinden bağımsız anlam taşısın; mevcut iptal/arşiv kayıtlarına dokunma.

## 5. Firma renkleri
- Firma ismi liste, detay, karşılaştırma ve revizyon kartında okunaklı ve belirgin **renkli chip**.
- Firma adını normalize edip deterministik (her yeniden yüklemede aynı) paletle eşleştir; mümkünse aynı süreç içindeki farklı firmalara farklı palet renkleri ata. Rastgele renk ve DB migrasyonu gerektirmez.
- Açık/koyu mod ve WCAG kontrastını gözet; sadece renk değil isim de daima görünür. Birden fazla firma yan yana kolay ayırt edilmeli.

## 6. Migrate / güvenlik / uyumluluk
- Yeni **açık, versiyonlu, idempotent veya fail-closed** PostgreSQL 15 migration tasarla: `20261109_quote_usd_01` -> yeni sürüm; mevcut quote kayıtlarını koruyan `ADD COLUMN`, gerekli index/constraint, kontrollü backfill; `users`, `budget_items`, `plan_entries`, `expenses` ve tahakkuk tablolarını değiştirme.
- Uygulama başlangıcı DDL/DML çalıştırmasın; şema sözleşmesini doğrulasın. Generic `--apply` ile production'a otomatik dokunma. Eski DB/volume yedeği ve rollback gerektiğinde korunmalı.
- `get_write_user` ve admin/viewer yetki sınırlarını koru; viewer hiçbir create/update/delete/restore yapamasın. Kimlik/rol ve SSO endpoint sözleşmelerini değiştirme.
- Canlıda yerel SSO override ve `app/routers/auth.py` özelleştirmesi var: tek başına GitHub release'i production'da build etmek SSO'yu kaybettirebilir. SSO'yu değiştirip prod'a sürme; birleştirme gereksinimini belgede açıkça belirt. `.env` veya secret commit etme.
- `quote_documents` named volume, yüklenen PDF/XLS/XLSX ve SHA256 doğrulaması korunur. Belge bağlı revizyon soft delete edilse de dosya fiziksel silinmez.
- Mevcut raporlar/Excel export/filtreler/karşılaştırma, mevcut 2 teklif süreci gibi kayıtlarla geriye uyumlu olmalı.

## 7. UI kabul senaryosu
- **Paket FortiGate-900G**: birden fazla kalem (cihaz, lisanslar, hizmet) ekle. TürkTelekom ve F1 Teknoloji gibi iki farklı firma ayrı renklerde. Her firma tüm veya bazı satırları fiyatlayabilir.
- TürkTelekom'un yalnız lisans fiyatı değiştiğinde yeni revizyon önceki diğer kalemleri korur; toplam doğru yeniden hesaplanır. Önceki revizyonda eski değer görüntülenir.
- Revizyonu düzelt, sil, tekrar geri yükle; her işlem audit kaydı üretir, belge bağlantıları korunur, karşılaştırma doğru revizyona döner.
- Tek ürün teklifi eskisi gibi çalışır.
- Bir süreci sil; özet/listeden kaybolur; admin geri getirir; ilgili belge metadata'sı ve teklif numarası korunur.

## 8. Teslim / kalite kapısı
- Tek bir feature branch üzerinde migration + backend + frontend + test + dokümantasyon **birlikte** geliştirilir.
- Backend testleri: create/edit/delete/restore ve yetkiler, paket ürün eşleme, snapshot, Decimal toplam, missing item, audit, document integrity, mevcut veriye migration; PostgreSQL 15 prod-yedeği kopyasında migration provası.
- Frontend testleri: tek/paket form geçişi, firmaya sabit renk, ürün bazlı revizyon, düzenle/sil onayı, geri alma, karşılaştırma ve eski ekranlar. `npm run build`, mevcut `node --test`/pytest komutları.
- Tam değişen dosyalar ve sonuçlar raporlansın; migration up/down stratejisi ve rollout/rollback dokümanı güncellensin.
- Production sunucu `172.24.2.227`, Docker/container/volume/.env/SSO ve gerçek DB **değiştirilmesin**; testler ve PR onayı sonrası ayrı, tek kontrollü canlı deploy.
