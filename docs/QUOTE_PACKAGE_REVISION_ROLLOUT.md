# Teklif Paket / Ürün Revizyonu — rollout ve rollback

Tarih: 2026-11-09

Branch: `feature/quote-packages-product-revisions-delete-ui`

Kaynak şema: `20261109_quote_usd_01`

Hedef şema: `20261109_quote_packages_01`

Karar: **NO-GO — Pull Request onayı, production yedeği kopyasında prova ve SSO birleştirme kanıtı bekleniyor.**

Bu geliştirme sırasında production sunucusu `172.24.2.227`, production PostgreSQL,
container, volume, `.env`, secret veya SSO kaynağı üzerinde işlem yapılmamıştır.

## Veri modeli ve uyumluluk

Migration yalnız mevcut Teklif tablolarını genişletir:

- `quote_processes`: süreç türü ve geri alınabilir silme metadata'sı;
- `quote_process_items`: istenen adet/süre ve geçmişi koruyan aktif/pasif metadata;
- `quote_offer_revisions`: düzenleyen ve geri alınabilir silme metadata'sı;
- mevcut `users`, `budget_items`, `plan_entries`, `expenses`, tahakkuk tabloları,
  teklif/revizyon/belge satırları ve `quote_documents` dosyaları korunur.

Backfill, bir aktif kalemi olan mevcut süreçleri `SINGLE`, iki veya daha fazla kalemi
olanları `PACKAGE` olarak sınıflandırır. Parasal değerler değiştirilmez ve kur dönüşümü
yapılmaz. Yeni ve düzenlenen teklifler yalnız `USD` kalır.

## Migration güvenlik sözleşmesi

`migrations/20261109_quote_packages_product_revisions_up.sql`:

1. PostgreSQL advisory transaction lock alır.
2. Aktif şema, zorunlu Teklif tabloları ve tam kaynak sürümü doğrular.
3. Yeni kolonlardan biri önceden/yarım eklenmişse hiçbir değişiklik yapmadan durur.
4. Additive kolonları, constraint ve indexleri ekler; kontrollü sınıflandırma backfill'i yapar.
5. Yalnız başarılı transaction sonunda şema sürümünü hedef sürüme taşır.

Production'da `python -m scripts.migrate_database --apply` bu release için kod
seviyesinde yasaktır. Uygulama başlangıcı da DDL/DML çalıştırmaz; yalnız hedef sürüm,
kolon ve kritik index sözleşmesini salt-okunur doğrular.

Down SQL normal uygulama rollback'i değildir. Paket, kaldırılmış kalem, düzenlenmiş veya
silinmiş revizyon/süreç metadata'sı varsa fail-closed durur. Veri oluştuğunda kolonlar
düşürülmez.

## Production öncesi zorunlu prova

1. Aynı bakım penceresine ait production DB yedeği ve `quote_documents` volume yedeği
   alınır; checksum'lar change ticket'a eklenir.
2. DB yedeği production'dan tamamen izole PostgreSQL 15 kopyasına geri yüklenir.
3. `migrations/20261109_quote_management_preflight.sql` salt-okunur çalıştırılır.
4. Kullanıcı hash/e-posta/rol/aktiflik, bütçe/plan/harcama/tahakkuk sayıları ve seçilmiş
   parasal örneklerin önce görüntüsü alınır.
5. Yeni up SQL tek migration oturumunda çalıştırılır; ikinci çalıştırmanın fail-closed
   olduğu doğrulanır.
6. Aşağıdaki kontrol salt-okunur çalıştırılır:

```bash
python -m scripts.migrate_database --check
```

7. Önce/sonra veri görüntüsü karşılaştırılır. Mevcut iki Teklif süreci, bütün revizyon,
   tercih, belge metadata ve SHA-256 bağları aynı kalmalıdır.
8. Eşlenmiş belge yedeği yeni geçici volume'a geri yüklenir; manifestin tamamı SHA-256
   ile doğrulanır. Production volume prova hedefi olarak kullanılmaz.
9. Paket FortiGate-900G kabul senaryosu ve tek ürün regresyonu staging'de çalıştırılır.

## SSO koruma kapısı

Production API'deki SystemPortal SSO ve compose override'ları GitHub release dışında
yerel özelleştirmeler içerir. Feature branch `app/routers/auth.py` veya SSO endpoint
sözleşmesini değiştirmez. Buna rağmen branch image'ını doğrudan production'da build
etmek yerel SSO farkını kaybettirebilir.

Deploy öncesinde production SSO kaynağı ayrı, yetkili bir çalışma alanında alınmalı;
feature branch ile üç-yollu fark incelenmeli; claim/rol eşlemesi, callback, logout,
secret/env ve rollback davranışı staging'de kanıtlanmalıdır. Bu kanıt olmadan deploy
**NO-GO** kalır.

## Onay sonrası tek kontrollü deploy

1. Çalışan API/frontend image digest, Compose project/working-directory label ve gerçek
   mount adı kaydedilir.
2. Yalnız BütçeTakip API/frontend bakım penceresine alınır. DB container recreate edilmez;
   `docker compose down` ve `down -v` kullanılmaz.
3. Production yedeği/prova onayından sonra up SQL bir kez çalıştırılır.
4. `--check` başarılı olmadan API başlatılmaz.
5. Staging'de kanıtlanmış immutable API, ardından frontend image yalnız `--no-deps`
   ile devreye alınır.
6. Login/SSO, roller, mevcut bütçe/plan/harcama/tahakkuk/raporlar, Teklif listesi,
   karşılaştırma, Excel ve belge SHA-256 erişimi salt-okunur smoke testten geçirilir.

## Rollback

- Uygulama hatasında yalnız API/frontend önceki immutable image digest'lerine döner.
- Additive kolonlar, Teklif verileri ve `quote_documents` volume yerinde kalır.
- Veri kullanılan şemada down SQL çalıştırılmaz.
- DB restore yalnız ayrı onayla, aynı zaman kimliğine ait DB ve belge yedeği birlikte
  kullanılarak yapılır.
- Rollback sonrasında SSO/login, roller ve korunan modüller yeniden doğrulanır.
