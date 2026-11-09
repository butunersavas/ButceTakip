# Teklif Yönetimi — Production Release Hazırlığı

Tarih: 2026-11-09

Release branch: `release/quote-management-usd-prod-ready`

Şema sürümü: `20261109_quote_usd_01`

Karar: **NO-GO (production kanıtları bekleniyor)**

Bu belge yalnız BütçeTakip API ve frontend servislerini kapsar. SystemPortal,
Ürün Çıkış, Bulgu Takip, Sürüm Yönetimi ve Saha Network kapsam dışıdır. Bu çalışma
sırasında production bağlantısı, production migration, deploy, volume veya `.env`
değişikliği yapılmamıştır.

## Giderilen önceki engeller

1. Release, SystemPortal SSO commit'i `ea0ae8f` yerine SSO öncesi `df116cd`
   tabanından ayrı worktree ve branch üzerinde hazırlanmıştır. Teklif Yönetimi,
   admin/startup güvenliği ve frontend bağımlılık güvenliği tabanda korunur; SSO
   dosyaları release farkında yoktur. React Router güvenlik güncellemesi ayrıca
   `7.18.5` sürümüne sabitlenmiş ve SSO kodu olmadan yeniden test edilmiştir.
2. Yeni firma teklifi ve revizyonları frontend ve Pydantic doğrulamasında yalnız
   `USD` gönderir/kabul eder. PostgreSQL/SQLModel şemasında
   `ck_quote_revision_currency_usd` constraint'i vardır. EUR ve TRY oluşturma
   seçenekleri kaldırılmıştır; tutarlar dönüştürülmez.
3. Genel `--apply` yerine yalnız sekiz yeni Teklif tablosunu oluşturan
   `migrations/20261109_quote_management_usd_only_up.sql` hazırlanmıştır. Dosya
   `users` ve `budget_items` önkoşullarını doğrular, transaction-scoped advisory
   lock alır ve herhangi bir mevcut Teklif tablosu görürse değişiklik yapmadan durur.
4. `migrations/20261109_quote_management_preflight.sql`, aktif şema/search path,
   şema sürümü, korunan ana tablo sayıları, mevcut Teklif tabloları, para birimi
   dağılımı, non-USD kayıt sayısı ve currency constraint'lerini salt-okunur raporlar.
   Mevcut EUR/TRY kayıtları dönüştürülmez veya silinmez.
5. Compose'da `quote_documents` named volume'unun API içinde
   `/app/data/quote_documents` yoluna bağlanması korunmuştur. Ayrı yedekleme ve
   izole restore provası prosedürü `docs/QUOTE_DOCUMENTS_BACKUP_RESTORE.md` içindedir.

## Migration kullanımı

Production'da bu sıra ancak aşağıdaki GO kapıları tamamlandıktan sonra uygulanır:

```bash
psql "$PGURL" -X -v ON_ERROR_STOP=1 -f migrations/20261109_quote_management_preflight.sql
psql "$PGURL" -X -v ON_ERROR_STOP=1 -f migrations/20261109_quote_management_usd_only_up.sql
python -m scripts.migrate_database --baseline --backup-confirmed
python -m scripts.migrate_database --check
```

`--baseline`, yalnız uygulamanın bütün tablo/kolon/index sözleşmesi salt-okunur
doğrulamadan geçtiğinde `20261109_quote_usd_01` sürüm işaretini yazar; tarihsel DDL/DML
çalıştırmaz. Herhangi bir başka şema farkında işlem durur. `--apply` bu release için
kullanılmaz.

Down SQL otomatik rollback değildir. Herhangi bir Teklif tablosunda veri varsa
fail-closed durur. Normal uygulama rollback'i önceki immutable API/frontend image'larına
dönüştür; additive Teklif tabloları ve belge volume'u yerinde bırakılır.

## Yerel doğrulama kanıtı

- Hedefli backend ve migration sözleşme paketi: 13/13 başarılı.
- Teklif API route denetimi: tüm GET endpoint'leri mevcut authenticated kullanıcı
  kontrolünü, tüm POST/PUT/PATCH/DELETE endpoint'leri mevcut `get_write_user`
  kontrolünü kullanır. Viewer mutasyonları 403 olarak kalır.
- Tam backend paketi: 105 başarılı + 6 PostgreSQL-özel skip. Aynı altı test izole
  PostgreSQL 15 üzerinde ayrıca 6/6 başarılıdır.
- Frontend regresyonları: 18/18 başarılı. USD sabiti ve EUR/TRY seçeneğinin
  bulunmaması ayrıca test edilir.
- Vite production build: 2.344 modül ile başarılı. Yaklaşık 2,14 MB ana chunk
  uyarısı sürer.
- İzole, host portu ve volume'u olmayan PostgreSQL 15.19 provasında sekiz Teklif
  tablosu oluşturuldu; `users`, `budget_items`, `plan_entries` ve `expenses` örnek
  satır sayıları/tutarları değişmedi. USD insert başarılı, EUR insert constraint ile
  reddedildi. İkinci migration ve veri varken down migration fail-closed durdu.
- Bu izole boş şema provası production yedeğinden geri yüklenmiş kopya provası
  değildir ve GO kapısını kapatmaz.
- Birleşik development + production Compose config, yalnız doğrulama amaçlı sahte
  environment değerleri ve `--no-env-resolution --quiet` ile başarılıdır.
- Geçici SQLite, localhost API/frontend ve sentetik admin ile gerçek tarayıcı
  kabulünde `TKL-2026-0001` oluşturuldu. Firma teklif formunda para birimi
  değiştirilemez `USD` alanı olarak görüldü; `$12.500,00` teklif başarıyla kaydedildi
  ve detayda USD simgesiyle görüntülendi. Geçici süreçler ve test DB'si kaldırıldı.
- `npm audit --omit=dev`, Router ayrıştırmasından sonra yalnız doğrudan `xlsx`
  paketinde bir yüksek bulgu raporlar. Registry paketinde otomatik düzeltme yoktur;
  kontrollü kütüphane değişimi ve Excel import/export regresyonu ayrı bir güvenlik
  kapısıdır. Otomatik `npm audit fix` çalıştırılmamıştır.

## Production'da salt-okunur tamamlanacak kontroller

Production erişimi bu çalışmada kullanılmadı. Aşağıdaki çıktılar change ticket'a
eklenmeden ilerlenmez:

```bash
docker inspect butce_api --format 'project={{ index .Config.Labels "com.docker.compose.project" }} working_dir={{ index .Config.Labels "com.docker.compose.project.working_dir" }} service={{ index .Config.Labels "com.docker.compose.service" }} image={{.Image}}'
docker inspect butce_frontend --format 'project={{ index .Config.Labels "com.docker.compose.project" }} working_dir={{ index .Config.Labels "com.docker.compose.project.working_dir" }} service={{ index .Config.Labels "com.docker.compose.service" }} image={{.Image}}'
docker inspect butce_api --format '{{json .Mounts}}'
docker compose -p butcetakip-main config --services
docker compose -p butcetakip-main ps
```

Doğrulanacaklar:

- Compose project, working directory ve `api`/`frontend` service label'ları;
- çalışan API/frontend image ID ve mümkünse immutable repo digest'leri;
- `/app/data/quote_documents` hedefindeki gerçek named volume adı ve yazma izinleri;
- gerçek production DB aktif şeması, `search_path`, `app_schema_version`, zorunlu
  tablo/kolon/index sözleşmesi ve varsa non-USD Teklif kayıt sayısı;
- migration öncesi/sonrası `users`, `budget_items`, `plan_entries`, `expenses`,
  tahakkuk tabloları ve Teklif tabloları satır sayıları; kullanıcı hash/e-posta/rol/
  aktiflik alanları ile parasal örneklerin eşitliği.

## Zorunlu production-yedeği provası

1. Tutarlı production DB yedeği ile aynı bakım penceresi kimliğine ait Teklif volume
   yedeğini al.
2. Production'dan tamamen izole PostgreSQL 15 kopyasına DB yedeğini geri yükle.
3. Preflight SQL'i çalıştır ve çıktıyı kaydet. Mevcut Teklif tablosu varsa fresh-create
   migration'ını çalıştırma; non-USD ve şema farkını raporla, ayrı migration kararı al.
4. Teklif tabloları yoksa USD-only up SQL'i uygula; global `--baseline`, `--check`,
   login, mevcut bütçe/plan/harcama/tahakkuk/rapor ve Teklif smoke testlerini yap.
5. Korunan tablo sayıları, kullanıcı yetki alanları ve parasal örnekleri önce/sonra
   karşılaştır.
6. Eşlenmiş belge arşivini yeni geçici volume'a geri yükle ve tüm SHA-256 manifestini
   doğrula. Production volume'u prova hedefi olarak kullanma.

## Onay sonrası yalnız BütçeTakip dağıtım planı

1. Bakım penceresinde label, image ID/digest, health, DB/volume backup kimliği ve
   checksum'ları kaydet.
2. Yalnız BütçeTakip `api` ve `frontend` servislerini durdur. `db` servisine ve başka
   Compose project'lerine dokunma; `docker compose down` veya `down -v` kullanma.
3. Staging'de kanıtlanan modüle özel SQL'i tek migration örneğiyle çalıştır; ardından
   `--baseline` ve salt-okunur `--check` başarılı değilse API'yi başlatma.
4. Aynı immutable release image'larıyla yalnız `api`, sonra `frontend` servisini
   `--no-deps` ile recreate et. DB container'ını recreate etme.
5. API volume mount'unu, health/logları, login ve mevcut kullanıcı rollerini doğrula.
   Bütçe, plan, harcama, tahakkuk ve rapor ekranlarında salt-okunur smoke test yap.
   Açık izin olmadan production Teklif/test kaydı oluşturma.

Örnek servis sınırı:

```bash
docker compose -p butcetakip-main up -d --no-deps api
docker compose -p butcetakip-main up -d --no-deps frontend
```

## Rollback

- Uygulama hatasında yalnız `api` ve `frontend` önceki kaydedilmiş immutable image
  ID/digest'lerine döndürülür. DB ve named volume korunur.
- Teklif tabloları additive olduğu için önceki uygulama bunları görmezden gelir.
  Teklif verisi veya dosyası oluştuysa down SQL çalıştırılmaz.
- DB restore ancak ayrıca onaylanmış durumda, aynı zaman kimliğine ait DB ve Teklif
  belge yedeği birlikte kullanılarak yapılır.
- Rollback sonrası health/login, mevcut roller ve bütçe/plan/harcama verileri yeniden
  salt-okunur doğrulanır.

## Kalan GO engelleri

1. Gerçek production label/image/mount ve DB preflight çıktıları alınmadı.
2. Production yedeğinden geri yüklenmiş izole PostgreSQL kopyasında migration provası
   yapılmadı.
3. Gerçek `quote_documents` yedeği yeni geçici volume'a geri yüklenip SHA-256 ile
   doğrulanmadı.
4. Release image'ları immutable digest ile staging'de mevcut modüller ve kullanıcı
   rolleri dahil smoke testten geçmedi.
5. Düzeltmesi bulunmayan `xlsx` production bağımlılığı için kabul/mitigasyon veya
   uyumlu kütüphane değişimi onaylanmadı.

Bu beş kanıt tamamlanana kadar güncel karar **NO-GO**'dur.
