# BütçeTakip — Worklog

## 2026-09-07 — Local / canlı ortam ayrımı
Windows local Docker:
- `butce_frontend` → `localhost:5173`
- `butce_api` → `localhost:8000`
- `butce_db` → host `5433`

Karar: Codex geliştirme/testi önce localde yapar. Local rebuild/recreate canlı deploy değildir. Açık onay olmadan canlıya deploy yapılmaz.

## 2026-09-07 — Canlı admin parola troubleshooting
Gerçek canlı working directory:
`/opt/ButceTakip/images/ButceTakip-main 0104/ButceTakip-main`

Compose project: `butcetakip-main`.

Admin:
- username `admin`
- table `users`
- hash Passlib `bcrypt_sha256`

Canlı admin parolası güncellendi. Doğrudan:
`POST http://127.0.0.1:8000/api/auth/token`
→ `HTTP 200`.

Parolanın kendisi dokümana yazılmaz.

## 2026-09-07 — Frontend API proxy
`getApiBase()` içinde port 5173 olduğunda `hostname:8000/api` zorlaması bulundu.

Frontend `vite preview` ile çalışırken proxy yalnız `server.proxy` altındaydı.

Canlı troubleshooting sırasında hedef:
- browser `/api/...`
- preview proxy `/api -> http://api:8000`

Server üzerinde:
`POST http://127.0.0.1:5173/api/auth/token`
→ `HTTP 200`.

Not: Kullanıcı `localhost:5173` adresinin local geliştirme ortamı olduğunu daha sonra netleştirdi. Bundan sonra localhost ve canlı IP ayrı incelenecek.

## 2026-09-07 — USD standardı / Garanti Takibi
Garanti Takibi → Yazılım fiyatı localde `₺150.058,00` göründü.

Beklenen: `$150.058,00`.

Karar:
- uygulamanın tamamı USD,
- TL/TRY/₺ parasal bağlamda kaldırılacak,
- kur dönüşümü yok.

Codex raporu:
- çalışan local frontend bundle: `index-Dtlkewa8.js`
- USD düzeltmesini içeren yeni build: `index-Cycs1Re5.js`

Codex, “deploy yapma” talimatı nedeniyle çalışan local frontend'i değiştirmedi.

### Önceki pending — bu görevin kapsamı aşağıdaki son kayıtta tamamlandı
Yalnız LOCAL frontend:
1. güncel kaynakla rebuild/recreate,
2. `localhost:5173`,
3. Garanti Takibi → Yazılım,
4. `$150.058,00` benzeri USD gösterimini görsel doğrula,
5. proje genelinde kalan `₺`, `TRY`, `TL` kullanımını raporla.

Canlı deploy yapılmayacak.

## 2026-08 — Kullanılmayacak sebep seti
Kesin UI metinleri:
- `Alımdan Vazgeçildi.`
- `İhtiyaç Kalmadı.`
- `Başka Bütçeden Karşılandı.`
- `Kullanılmayacak.`

Not alanı ve sebebi sonradan değiştirebilme ihtiyacı var.

## 2026-08 — Bekleyen İşlemler / Undo
Akış:
- Harcama Ekle
- Kullanılmayacak
- Talep Oluşturuldu
- Talebi Geri Al
- Bekleme Sebebi: Fatura / Harcama / Her ikisi

Undo için viewer 403, conflict 409, request state geri alma ve loglama üzerinde çalışıldı.

## 2026-08 — Kullanılmayacak tutar seçenekleri
- `Bu Ayın Kalanı`
- `Bütçenin Kalan Tamamı`
- `Özel Tutar`
- `Kalan Kullanılabilir`

## 2026-08 — Bütçe aşım regression
Örnek:
- plan `12.000`
- Ocak `4.500`
- Şubat `2.000`
- Mart `1.000`

Toplam `7.500`; aşım değildir. Yanlış aşım sonucu üretilmemeli.

## 2026-08 — Güvenli deploy yaklaşımı
- `.env` korunur.
- veri/upload/volume korunur.
- `docker compose down -v` yok.
- yalnız gerekli servisler build/recreate.
- DB gereksiz recreate edilmez.
- `docker compose ps` ve log kontrolü yapılır.

## Önceki görev listesi — 2026-09-07 son kaydına bakınız
1. Bu context dosyalarını repo içine ekle.
2. Mevcut local kaynak kodunu oku.
3. USD standardizasyon değişikliklerini doğrula.
4. Yalnız LOCAL frontend'i güncel build ile rebuild/recreate et.
5. `localhost:5173` Garanti Takibi → Yazılım fiyatını `$` ile doğrula.
6. Proje genelinde parasal bağlamda kalan `₺`, `TRY`, `TL` noktalarını raporla.
7. Canlıya deploy yapma.
8. Sonucu bu `WORKLOG.md` dosyasına ekle.

## 2026-09-07 — Kalıcı bağlam kurulumu, LOCAL rebuild ve USD görsel doğrulaması

### Bağlam ve kapsam
- Kullanıcının sağladığı AGENTS.md ve ZIP içindeki PROJECT_CONTEXT.md, BUSINESS_RULES.md, WORKLOG.md dosyalarının tamamı yazma işleminden önce okundu.
- Aktif LOCAL repository container etiketlerinden `C:\ButceTakip_git`, Compose project `butcetakip_git`, Docker context `desktop-linux` olarak doğrulandı.
- Dört dosya bu repository'ye yerleştirildi. AGENTS.md bundan sonraki görevlerde bağlam belgelerinin okunmasını ve anlamlı iş sonunda WORKLOG güncellenmesini zorunlu kılar.
- Önceki repo kurallarının veri yazma onayı, yedek, dry-run, duplicate önleme ve garanti tipi izolasyonu hükümleri BUSINESS_RULES.md bölüm 13'te korundu.
- Uygulama kaynak kodunda bu görevde değişiklik yapılmadı; önceden mevcut kullanıcı değişiklikleri korundu.

### Eski/çelişen bilgiler
- `C:\ButceTakip` ayrı checkout; oradaki önceki genel USD değişiklikleri aktif `C:\ButceTakip_git` reposuna tümüyle uygulanmış sayılmaz.
- İlk belgelerdeki index-Dtlkewa8.js / index-Cycs1Re5.js ve USD pending anlatımı tarihsel kaldı. Aktif kaynak WarrantyTrackingView.tsx:227 zaten USD'dir; önceki local build index-7L9hwp4b.js ve kullanıcı onayı mevcuttur.
- Eski AGENTS.md üç garanti tipi sayıyordu; mevcut UI Donanım, Domain, SSL, Yazılım sekmeleridir.
- Yerel vite.config.ts halen yalnız server.proxy tanımlar; geçmiş preview proxy hedefi yerelde doğrulanmış implementasyon olarak değerlendirilmemeli.
- Ortak currency.ts en-US kullanır; Garanti formatter'ı tr-TR kullanır. USD ortak olsa da sayı biçimi tüm ekranlarda tek helper'a bağlanmış değildir.
- Canlı bilgileri sağlanan dokümanların tarihsel beyanıdır; bu görevde canlı erişimi/doğrulaması yapılmadı.

### LOCAL build ve doğrulama
- Komut: `docker --context desktop-linux compose -p butcetakip_git -f C:\ButceTakip_git\docker-compose.yaml up -d --build --force-recreate --no-deps frontend`.
- Build başarılı; kaynak değişmediğinden Docker npm build katmanını cache'den kullandı. Frontend force-recreate edildi, 5173 portunda running.
- Giriş yapılmış tarayıcıda `http://localhost:5173/warranty-tracking` açıldı, Yazılım seçildi.
- Erişilebilirlik ağacı ve ekran görüntüsünde tek TEST kaydının FİYAT hücresi tam olarak `$150.058,00` olarak doğrulandı.
- API ve DB container kimlikleri ve StartedAt değerleri önce/sonra aynı kaldı; bu servisler recreate edilmedi.
- DB yazımı, tutar dönüşümü, test kaydı ekleme/silme ve canlı deploy yapılmadı.
- Uygulama kodu değişmediğinden backend testleri yeniden çalıştırılmadı; bu görevin doğrulaması LOCAL frontend build, container durumu ve gerçek ekran kontrolüdür.

### Proje genelinde para birimi taraması
96 metin dosyası tarandı (kaynak, script, test, yapılandırma ve belgeler). .git, bağımlılıklar, derlenmiş dist/build, cache, .env, uploads/backups ve ikili arşivler kapsam dışı tutuldu; arşiv/DB/secret içerikleri değiştirilmedi.

Düzeltme bekleyen aktif kullanımlar:
1. `frontend/src/components/PurchasePendingView.tsx:77`: formatter `currency: "TRY"`.
2. `app/schemas.py:617`: dashboard satın alma uyarısı `currency: str = "TRY"` varsayılanı.
3. `app/services/warranty_import.py:804`: kullanıcıya gösterilen fiyat hata örneği `₺80.000,00`.

Geriye uyumluluk noktası:
4. `app/schemas.py:79`: eski TRY/TL içeren fiyat metinlerini ayıklayan giriş parser'ı; gösterim veya kur dönüşümü değildir. Kaldırılması eski veri/import uyumluluğunu etkileyebilir.

AGENTS ve docs içindeki TL/TRY/sembol eşleşmeleri kural açıklamaları ve tarihsel örneklerdir; uygulama çıktısı değildir.

### Son durum / pending
- Bağlam dosyaları yerleştirildi; LOCAL rebuild ve Yazılım USD görsel doğrulaması TAMAMLANDI.
- Proje genelindeki üç aktif para birimi kullanımı bu görevde istenen tarama/raporlama kapsamında raporlandı; değiştirilmedi. Uygulamanın tamamının USD olduğu henüz iddia edilmemeli.
- Sayı biçimini ortak helper üzerinden standardize etme ve yerel preview proxy değerlendirmesi ayrı işlerdir.

## 2026-09-07 — Bağlam belgelerinin Git sürümlemesi
- İstenen status, branch, remote ve son beş commit kontrol edildi. Aktif repo C:\ButceTakip_git; branch local-sync-20260629; başlangıç HEAD ed267c8. Kullanıcının yazdığı C:\ButceTakip\_git yolu mevcut değil.
- AGENTS.md değişikliği ve docs/PROJECT_CONTEXT.md, docs/BUSINESS_RULES.md, docs/WORKLOG.md henüz commit edilmemişti. Yalnız bu dört belge commit kapsamına alındı; mevcut uygulama değişiklikleri kapsam dışında korundu.
- origin: https://github.com/SavasButuner-Surat/ButceTakip.git. Fetch denemesi Repository not found hatası verdi; erişim/adres sorunu çözülmeden uzak eşitlik doğrulanamıyor. Normal push da Repository not found hatasıyla başarısız oldu. Yerel belge commit'i oluşturuldu; GitHub'a aktarım için origin adresi veya hesap erişimi düzeltilmeli.
- Belge değişikliği için diff whitespace kontrolü uygulanır; uygulama build/testi gerekli değildir. Canlı deploy, container veya DB işlemi yapılmadı.

## 2026-09-09 — Bekleyen İşlemler tek sıradaki adım modeli

### Kök neden ve düzeltme
- Bekleyen kartları aynı satırdaki bağımsız talep, harcama ve fatura boolean'larını saydığı için bir kayıt birden fazla karta girebiliyordu; tablo da Talep Durumu ve Bekleme Sebebi kolonlarıyla aynı bilgiyi tekrarlıyordu.
- Backend her kayıt için tek `pending_step` üretir: `request_pending` → `expense_pending` → `invoice_pending`. Talep, harcama ve fatura tamamlandığında değer boş kalır ve kayıt listeden çıkar.
- Kart sayaçları ve kart filtreleri aynı `pending_step` alanını kullanır. Böylece üç durum sayısının toplamı `Tümü` sayısına eşittir.
- Talep geçmişi, geri alma endpoint'i, viewer/admin kontrolleri, mevcut harcama/fatura tespiti ve `unused_amount` tabanlı Kullanılmayacak davranışı korundu.

### Arayüz
- Kartlar `Tümü`, `Talep Bekleyen`, `Harcama Bekleyen`, `Fatura Bekleyen` olarak sadeleştirildi; `Talep Oluşturulan` kaldırıldı.
- `Talep Durumu` ve `Bekleme Sebebi` yerine tek `Bekleyen Adım` kolonu ve durum başına tek rozet gösteriliyor.
- İşlem butonları sıradaki adıma göre gösterilir; Talebi Geri Al ve mevcut yetkilendirmeler korunur.

### Test ve LOCAL doğrulama
- Güncel API/frontend Docker imajları başarıyla build edildi; frontend Vite production build başarılı, yalnız mevcut büyük chunk uyarısı var.
- Backend testleri: 42/42 başarılı. Öncelik, tekil sayım, sayaç/filtre uyumu, tamamlanan/tasarruflu kayıt, Kullanılmayacak ve talep geri alma regresyonları kapsandı.
- Mevcut sağlıklı `butce_db` ve `butcetakip_git_db_data` volume'u korunarak yalnız `butce_api` ve `butce_frontend` yeni imajlarla recreate edildi.
- Giriş yapılmış `http://localhost:5173/pending-budget-actions` ekranında kartlar ve `Bekleyen Adım` kolonu doğrulandı. Yerel veri sonucu: `378 = 373 + 4 + 1`; kart tabloları sırasıyla 373, 4 ve 1 kayıt gösterdi. `SOCRadar` aramasında `9 = 9 + 0 + 0` görüldü.
- Canlı deploy, migration, toplu veri güncellemesi, DB/volume silme veya `docker compose down -v` yapılmadı.

## 2026-09-24 — Bütçe Hazırlama modülü

### Kapsam ve veri modeli
- Çalışma alanı `C:\ButceTakip_Codex`, branch `feature/budget-preparation-2027` olarak doğrulandı. Main branch'e geçilmedi.
- Taslakların mevcut Dashboard, Plan ve Harcama sorgularına sızmaması için `budget_preparations`, `budget_preparation_items` ve `budget_preparation_allocations` tabloları eklendi.
- Başlıkta yıl, ad, USD, not, DRAFT/ACTIVE durumu, oluşturan, zaman damgaları ve aktive edilen Scenario bağlantısı tutulur.
- Kalemde bütçe adı/kodu, Decimal toplam, USD, CAPEX/OPEX, departman, `map_attribute` tabanlı Nitelik, not ve dağıtım yöntemi tutulur. Gelecekteki tahakkuk geliştirmesi için nullable `source_year`, `source_plan_id`, `source_budget_item_id` ve `is_carryover` alanları hazırlandı.
- Tek Ay, Eşit ve Özel dağıtım backend'de hesaplanır. Eşit dağıtım kuruş farkını son aya ekler; özel dağıtım taslakta eksik kalabilir.

### Aktivasyon ve yetki
- Final validasyonu ad/yıl/kalem, pozitif toplam, CAPEX/OPEX, departman, Nitelik, aylık toplam ve bütçe kodu çakışmasını kontrol eder; hatalar kalem kimliğiyle UI'ya döner.
- Başarılı finalizasyon tek transaction içinde Scenario, uyumlu BudgetItem ve yalnız pozitif aylar için PlanEntry oluşturur. Taslak ACTIVE olur ve kilitlenir; tekrar finalizasyon duplicate üretmez.
- Mevcut `map_category`, `map_attribute` ve `PlanEntry.department` sözleşmeleri korundu. Viewer/readonly kullanıcılar GET ile görüntüler, bütün mutasyonlarda backend 403 alır.

### API ve arayüz
- `/api/budget-preparations` altında liste/oluşturma, detay/güncelleme/silme, kalem CRUD, metadata ve `/{id}/complete` endpointleri eklendi.
- Sol menü ve `/budget-preparation` route'u eklendi. Liste ekranında ad/kod araması, yıl/durum filtreleri ve taslak özetleri; detay ekranında üst kartlar, başlık otomatik kaydı, kalem filtreleri, 12 aylık özel dağıtım, canlı toplam/kalan ve final hata yönlendirmesi bulunur.
- Departman ve Nitelik mevcut verilerden önerilir; serbest girişle ileride eklenecek değerler desteklenir. ACTIVE bütçede düzenleme ve silme kontrolleri kaldırılır, alanlar kilitlenir.

### Test ve LOCAL doğrulama
- İzole SQLite backend testleri: 57/57 başarılı; bunun 15'i yeni Bütçe Hazırlama regresyonudur.
- Frontend production build başarılı: 12.905 modül. Mevcut yaklaşık 2 MB ana chunk uyarısı devam eder.
- Geçici SQLite DB ve 5174/8002 portlarıyla gerçek tarayıcı doğrulaması yapıldı: taslak oluşturma, özel dağıtım `$50.000 + $70.000 = $120.000`, ACTIVE kilidi ve Plan Yönetimi'nde 2027 Scenario altında Ocak/Şubat PlanEntry satırları doğrulandı. Son temiz tarayıcı konsolunda hata yoktu.
- Geçici test süreçleri, SQLite DB, loglar, Python bağımlılıkları ve build çıktısı kaldırıldı. Docker Desktop çalışmadığı için proje container'ları build/recreate edilmedi; mevcut local DB/container/volume değişmedi.
- Production sunucuya/DB'ye/container'lara erişilmedi, production deploy ve main merge yapılmadı.

### 2026-09-24 — Pre-merge güvenlik ve geri bildirim iyileştirmeleri
- FastAPI `detail` değerleri string, nesne veya validation error dizisi olduğunda güvenli düz metne dönüştürülür; React'e nesne/dizi verilmez. Validation alan yolları kullanıcıya okunabilir etiketlerle gösterilir.
- Başlık otomatik kaydı ve `Taslağı Kaydet` için görünür başarı/hata bildirimi eklendi. Taslak tamamlama, kalem kaydetme/silme ve taslak silme sonuçları da kullanıcıya bildirilir.
- Taslak kaydetme/tamamlama ile kalem kaydetme/silme mutation'ları sürerken ilgili butonlar devre dışı bırakılır; tekrarlı UI istekleri engellenir.
- Yeni bütçe formu aynı yıl için DRAFT veya ACTIVE bütçe varsa bilgi uyarısı gösterir; mevcut Scenario davranışı korunur ve oluşturma engellenmez.
- Dashboard'un mevcut `scenarioId` sorgu akışına görünür Scenario seçimi bağlandı. Yıl değişince uygun Scenario seçilir; aynı yıldaki kullanıcı seçimi sorgu yenilenmelerinde korunur.
- Backend regresyon testleri 57/57 başarılıdır. Frontend production build 12.905 modülle başarılıdır; mevcut büyük ana chunk uyarısı devam eder.
- İzole local tarayıcı testinde 2027 bütçesi ACTIVE yapıldı. Plan Yönetimi'ndeki Ocak `$50.000` ve Şubat `$70.000` PlanEntry toplamı `$120.000`; Dashboard'da 2027 ve `Codex 2027 Browser Test (2027)` Scenario seçiliyken `Toplam Plan` `$120.000,00` olarak doğrulandı. Aynı yıl ACTIVE bütçe uyarısı ve taslak/kalem kayıt başarı bildirimleri de görüldü.
- Geçici local API/frontend süreçleri, SQLite DB, loglar, bağımlılıklar ve build çıktısı temizlendi. Production deploy, production DB/container değişikliği ve main merge yapılmadı.

### 2026-09-24 — Scenario tutarlılığı, çapraz yıl ve hazırlama UX devamı
- Dashboard'da açıkça seçilen `Tüm Scenario'lar` kalıcı bir kullanıcı tercihi olarak korunur. `/dashboard/risky-items` artık optional `scenario_id` alır; kalan bütçe ve aşım hesapları aynı Scenario kapsamını kullanır. İki Scenario'lu regresyon testleri filtreli ve tüm-Scenario davranışını kapsar.
- Bütçe Hazırlama'da kullanıcıdan bütçe kodu istenmez ve kod gösterilmez; backend mevcut kodları korur, yeni kalemlere `PREP-{yıl}-{taslak}-{sıra}` biçiminde iç kod üretir. Departman ve Nitelik zorunlu dropdown oldu; varsayılan kurumsal değerlerle mevcut metadata büyük/küçük harf duyarsız canonical birleştirilir.
- Tahakkuk dağılımı allocation bazında yıl taşır. Eşit dağıtım 1–36 ay destekler; örneğin Temmuz 2027 / 12 ay Temmuz-Aralık 2027 ve Ocak-Haziran 2028 olarak kuruş kaybetmeden bölünür. SQLite ve PostgreSQL için mevcut allocation kayıtlarını hazırlık yılıyla backfill eden, eski tekil kısıtı yıl+ay kısıtına yükselten şema geçişi eklendi.
- Aktivasyon PlanEntry yılını allocation yılından alır. Plan ekranı URL'deki yıl/Scenario seçimini uygular ve Scenario tanım yılından sonraki carry-over PlanEntry yıllarında açık kullanıcı seçimini korur. Tamamlama sonrası cache'ler invalid edilir ve `Plan Yönetiminde Gör` aksiyonu sunulur.
- Kalem dağıtım alanı kurumsal kart/panel, responsive dönem blokları, yıl başlıkları ve başarı/uyarı özetiyle yenilendi. Bütçe Hazırlama tablosu ortak `useSortableRows` hook'u ile metin, durum ve tutar kolonlarında sıralanır. Planlar, Harcamalar, Bekleyen İşlemler, Garanti, Satın Alma ve Kullanıcılar ekranlarındaki DataGrid native sıralama/pagination davranışı korunarak denetlendi; işlem/ikon kolonları bilinçli olarak sıralama dışıdır.
- Garanti araması cihaz, domain, SSL ve servis kayıtlarının tümünü aynı anda tarar; global sonuçta tür kolonu gösterilir. Arama temizlendiğinde seçili garanti sekmesi korunur.
- İzole backend testleri 61/61 başarılıdır. Frontend production build 12.905 modülle başarılıdır; mevcut büyük chunk uyarısı sürer.
- İzole local tarayıcıda bütçe kodu alanının bulunmadığı, Sistem/Yazılım dropdownları, Temmuz 2027 + 12 ay `$50.000` dağılımının 2027/2028 blokları, ACTIVE sonrası 2027 Plan `$24.999,96` ve Dashboard `$24.999,96`, 2028 carry-over Plan `$25.000,04`, Plan deep-link aksiyonu ve `Tüm Scenario'lar` seçiminin yenilemede korunması doğrulandı. Global garanti araması Donanım ve Yazılım türlerindeki iki `NEEDLE` kaydını birlikte buldu; temizlemeden sonra Yazılım sekmesi korundu.
- Production deploy, production DB/container işlemi, push veya main merge yapılmadı.

### 2026-09-25 — Plan deep-link filtreleri ve güvenli taslak silme
- Bütçe Hazırlama içindeki `Plan Yönetiminde Gör` geçişi kaynak işareti taşır. Plan ekranı yalnız bu akışta önceki Bütçe Kalemi, CAPEX/OPEX, Ay, Departman, kart ve sayfa daraltmalarını temizler; hedef yıl ile Scenario korunur. Normal Plan Yönetimi açılışlarının kalıcı filtre davranışı değişmedi.
- Bütçe Hazırlama liste kartlarına yalnız DRAFT ve yazma yetkili kullanıcılar için çöp kutusu aksiyonu eklendi. Onay penceresi bütçe adını, kalıcı silmeyi ve işlemin geri alınamayacağını açıkça belirtir; işlem sürerken butonlar kilitlenir, başarı/hata sonucu görünür şekilde bildirilir ve liste cache'i yenilenir. ACTIVE kartlarda silme aksiyonu gösterilmez.
- Backend silme endpoint'i DRAFT dışındaki çalışmaları `409 Aktifleştirilmiş bütçe çalışması silinemez.` ile reddeder. DRAFT silme; allocation, item ve preparation kayıtlarını tek transaction içinde kaldırır, hata durumunda rollback yapar. Mevcut yazma yetkisi bağımlılığı viewer için 403, bulunmayan kayıt için 404 davranışını korur; Scenario ve PlanEntry kayıtlarına dokunulmaz.
- İzole backend testleri 65/65 başarılıdır. Yeni regresyonlar DRAFT alt kayıtlarının silinmesini, ACTIVE reddinde Scenario/PlanEntry korunmasını, viewer 403 ve bulunmayan kayıt 404 sonuçlarını kapsar.
- Frontend production build 12.906 modülle başarılıdır; yalnız mevcut büyük chunk uyarısı sürer.
- İzole local tarayıcıda ACTIVE kartta silme aksiyonu olmadığı, DRAFT kartta onay penceresi, İptal akışında kaydın korunması, onaylanan silmede kartın kaybolması ve `Bütçe çalışması silindi.` bildiriminin görünür kalması doğrulandı. Plan ekranında önceden seçilmiş Ocak + Capex daraltması `Plan Yönetiminde Gör` geçişinde temizlendi; 2027 ve `Bilgi Teknolojileri 2027` Scenario korundu, altı PlanEntry ve toplam `$300.000,00` yeniden gösterildi.
- Production deploy, production DB/container işlemi, push veya main merge yapılmadı.

### 2026-09-25 — Ana Bütçe, revizyon ve efektif devir zinciri
- Scenario'ya yıl bazlı `is_primary` alanı ve aynı yılda yalnız bir Ana Bütçe'ye izin veren koşullu unique index eklendi. Mevcut şemada tek Scenario bulunan yıllar otomatik Ana Bütçe olur; birden çok Scenario bulunan yıllarda rastgele seçim yapılmaz. `Ana Bütçe Yap` işlemi aynı yılın seçimini transaction içinde atomik değiştirir.
- PLANLANDI bütçeler için `Revizyon Oluştur`, başlık/kalem/allocation verilerini yeni bir DRAFT çalışmaya kopyalar; Scenario veya PlanEntry üretmez. ACTIVE teknik durumu arayüzde PLANLANDI olarak gösterilir.
- Hedef yıla önceki Ana Bütçe Scenario'larından taşan PlanEntry kayıtları salt okunur devir olarak keşfedilir. Aynı kalem için devreden/yeni/toplam etki gösterilir ve planlamadan önce açık kullanıcı onayı istenir; yeni bütçe kayıtlarına devir otomatik kopyalanmaz ve iki kez sayılmaz.
- Dashboard ve Plan Yönetimi normal yıl akışında Ana Bütçe'yi varsayılan seçer. Efektif-primary sorgusu hedef yılın Ana Bütçesi ile önceki Ana Bütçelerden o yıla taşan kayıtları birleştirir; tüm-Scenario seçimi yalnız karşılaştırma görünümü olarak açıkça etiketlenir. Bütçe Hazırlama Dashboard deep-link'i hedef yıl/Scenario'yu korurken eski daraltıcı filtreleri temizler.
- Bütçe Hazırlama API hataları string, nesne ve FastAPI validation dizileri için güvenli Türkçe metne çevrilir. Beklenen devir `409` onayı lokal işleyicide tutulur; global bildirimin `[object Object]` göstermesi engellendi. Başlık/taslak/kalem işlemlerinde görünür geri bildirim ve mutation süresince çift istek engeli bulunur.
- İzole backend regresyon paketi 69/69 başarılıdır. Yeni testler Ana Bütçe tekilliği/değişimi, başka yıl izolasyonu, DRAFT revizyon kopyası, devir keşfi ve onayı, non-primary dışlama, Dashboard/Plan efektif toplamı ve tekrar saymama davranışlarını kapsar.
- Frontend production build 12.906 modülle başarılıdır; yalnız mevcut yaklaşık 2 MB ana chunk uyarısı sürer.
- İzole local tarayıcıda PLANLANDI/ANA BÜTÇE etiketleri, Ana Bütçe değiştirme onayı, revizyonun DRAFT kopyası, 2027 Mart–2028 Şubat TEST01 dağılımından 2028'e devreden `$2.094,20`, aynı kalem uyarısı/onayı, mavi ve ortalı ay kartı, Dashboard deep-link'i ve Dashboard/Plan toplamının `$12.094,20` olması doğrulandı. Düzeltme sonrası `[object Object]` görünmedi.
- Geçici local API/frontend süreçleri, SQLite DB, loglar, Python bağımlılıkları ve build çıktıları görev sonunda temizlendi. Production deploy, production DB/container işlemi, push veya main merge yapılmadı.

### 2026-09-25 — PostgreSQL Ana Bütçe geçişi, Dashboard kapsamı ve kurumsal onaylar
- Gerçek local PostgreSQL üzerinde `POST /api/budget-preparations/1/primary` önce `409` ile tekrar üretildi. Kök neden aynı transaction flush'ında eski ve yeni `is_primary` değerlerinin PostgreSQL partial unique index tarafından güvenli sırada uygulanmamasıydı. Yıl Scenario kayıtları `FOR UPDATE` ile kilitli kalırken eski primary kayıtları önce `false` yapılıp flush edilir, ardından hedef `true` yapılıp ikinci kez flush edilerek commit edilir. Scenario create/update primary akışlarına da aynı demote-flush sırası eklendi.
- PostgreSQL'e özel regresyon testi geçici bir yılda A → B ve B → A geçişlerini yapar; her adımda eski primary'nin kapandığını, yenisinin açıldığını ve primary sayısının tam bir olduğunu doğrular. Local tarayıcı isteği `200 OK` döndü; Bilgi Teknolojileri 2027 kartı anında `ANA BÜTÇE` oldu, TEST BUTCE 001 aksiyonu geri geldi ve yenilemede durum korundu.
- Dashboard'daki `$0` kök nedeni manuel Scenario/yıl seçiminde localStorage'dan kalan ay, dönem, departman, bütçe kalemi, CAPEX/OPEX ve açık detay filtrelerinin korunmasıydı. Deep-link, manuel Scenario, yıl değişimi ve sıfırlama artık ortak `applyDashboardScope` üzerinden aynı scope ve daraltıcı filtre temizliğini uygular. Açık kullanıcı seçimi korunurken normal menü girişi güncel Ana Bütçe'ye döner. Plan Yönetimi de normal girişte güncel Ana Bütçe'yi varsayılan seçer; diğer PLANLANDI Scenario manuel seçilebilir.
- Ortak MUI `ConfirmDialog` ve promise tabanlı provider eklendi. Bütçe Hazırlama kalem/taslak/liste silme akışları mutation sürerken kapanmaz ve tekrar gönderilemez. Plan, aktarım, kullanılmayacak bilgi, harcama/ek, garanti, import restore ve temizlik onaylarındaki native `window.confirm` kullanımları aynı kurumsal bileşene taşındı. `frontend/src` audit'inde `window.confirm/alert/prompt` veya çıplak `confirm/alert/prompt` çağrısı kalmadı.
- Local browser doğrulamasında Dashboard normal giriş ve Plan Yönetimi 2027 için `Bilgi Teknolojileri 2027 · ANA BÜTÇE` ile `$300.000,00` / `$300,000.00` gösterdi. TEST BUTCE 001 manuel seçiminde iki ekranda da efektif toplam `$14.913,50` / `$14,913.50` oldu. TEST Scenario'da Ocak filtresiyle oluşan `$0,00`, Bilgi Teknolojileri Scenario'suna geçişte filtre temizlenerek `$300.000,00` oldu. `Dashboard'da Gör` deep-link'i aynı `$300.000,00` sonucu verdi.
- DRAFT revizyon tarayıcıdan oluşturuldu. Kalem ve taslak silme aksiyonlarında browser-native dialog olmadığı, uygulama içi geri alınamaz uyarılı dialog açıldığı ve İptal'in kayıtları koruduğu doğrulandı. Kullanıcı onayı sonrası `TEST` kalemi silindi, satır kayboldu ve `Bütçe kalemi silindi.` Snackbar'ı göründü. Taslak silme ilk PostgreSQL denemesinde çocuk item kayıtlarının parent'tan sonra silinmesi nedeniyle foreign-key hatası verdi; allocation → flush → item → flush → preparation sırası uygulanarak düzeltildi. İkinci denemede revizyon taslağı silindi ve listeye dönüldü.
- Backend local PostgreSQL regresyon paketi 70/70 başarılıdır. Frontend production build 12.908 modülle başarılıdır; mevcut yaklaşık 2 MB ana chunk uyarısı sürer. `git diff --check` temizdir.
- Yalnız local API/frontend container'ları güncellendi; DB container/volume silinmedi veya recreate edilmedi. Production deploy, production DB/container işlemi, push ve main merge yapılmadı.

### 2026-09-28 — Bütçe Hazırlama operasyonel plandan ayrıştırıldı
- Bütçe Hazırlama kullanıcı akışı yalnız `TASLAK` ve `HAZIR` durumlarına indirildi. Eski `ACTIVE` kayıtlar arayüzde `HAZIR` görünür; aynı kayıt `Düzenlemeye Aç` ile tekrar `DRAFT` olur. PLANLANDI, ANA BÜTÇE, primary değiştirme, revizyon kopyası ve Plan/Dashboard deep-link aksiyonları hazırlama ekranından kaldırıldı.
- Yeni `/ready` ve `/reopen` işlemleri yalnız `BudgetPreparation` kayıtlarını günceller. Geriye uyumlu `/complete` endpoint'i de Scenario/PlanEntry üretmeden HAZIR sonucunu döndürür. Hazırlama servisindeki Scenario/BudgetItem/PlanEntry oluşturan aktivasyon kaldırıldı; metadata ve detay oluşturma operasyonel tablolara başvurmaz.
- Carry-over uyarısı yalnız `BudgetPreparation`, `BudgetPreparationItem` ve `BudgetPreparationAllocation` tablolarından hesaplanır. Önceki yıl TASLAK, HAZIR ve tarihsel ACTIVE çalışmaların hedef yıla dağıtılmış pozitif allocation tutarları bilgi amaçlı gösterilir; Scenario/PlanEntry okunmaz ve operasyonel Plan/Dashboard hesapları değiştirilmez.
- Detay ve liste ekranlarına gerçek `.xlsx` dışa aktarımı eklendi. Dosya mevcut import sözleşmesindeki 16 kolonu aynı sırayla üretir; her allocation ayrı satırdır, yıl/ay/tutar/adet/birim fiyat hücreleri numeriktir ve çapraz yıl kayıtları korunur. Üretilen dosyanın mevcut importer tarafından 12 Plan satırı olarak okunabildiği izole regression testiyle doğrulandı.
- FastAPI string/nesne/validation-array hata detayları güvenli Türkçe metne çevrilir; `[object Object]` React'e render edilmez. Taslak kayıt, HAZIR, yeniden açma, kalem işlemleri ve dışa aktarım sırasında ilgili butonların pending kilitleri korunur.
- Backend regression: yerel PostgreSQL Compose ağı üzerinde 71/71 başarılı. Ayrıştırma testi create/add/distribute/ready/export/reopen/edit boyunca Scenario sayısı, PlanEntry sayısı ve Dashboard `Toplam Plan` değerinin değişmediğini doğrular. PostgreSQL primary testi artık operasyonel Scenario router'ını doğrudan sınar.
- Frontend production build başarılı: 12.908 modül; yalnız mevcut yaklaşık 2 MB ana chunk uyarısı sürer. `git diff --check` temizdir.
- Yerel Docker tarayıcı kabulünde 2027 hazırlama allocation'larından 2028'e devreden `$10.652,50`, eşleşen `testo1` kaleminde devreden/yeni/toplam etki uyarısı, HAZIR, aynı id üzerinde Düzenlemeye Aç, indirilmiş Excel ve okunabilir validation mesajı doğrulandı. Dashboard 2028 `Toplam Plan` `$10.652,50` kaldı; SQL baseline/sonuç `Scenario=3`, `PlanEntry=18`, `2028 toplam=10652.5` olarak eşitti. Geçici id=14 hazırlama kaydı ve indirilen test Excel dosyası temizlendi.
- Yalnız local API/frontend imajları build edilip recreate edildi; DB container/volume korunmuştur. Production deploy, production DB/container işlemi, push veya main merge yapılmadı.

### 2026-09-28 — Bütçe Hazırlama kaldırıldı, tahakkuk Plan Yönetimi'ne taşındı
- Sol menü, React route'ları, `BudgetPreparationView`, hazırlama router/service/export kaynakları ve eski hazırlama akışı testleri kaldırıldı. `/api/budget-preparations` artık uygulamaya kayıtlı değildir. Tarihsel `budget_preparations`, `budget_preparation_items` ve `budget_preparation_allocations` modelleri, tabloları ve verileri korunmuştur; DROP/veri migration'ı yapılmadı.
- `PlanEntry` için geriye uyumlu nullable `accrual_group_id`, `accrual_amount`, `accrual_source_year`, `accrual_source_month` ile default-false `is_accrual` alanları eklendi. Şema yükseltmesi yalnız kolon ve grup index'i ekler; eski satırlar değişmez.
- Plan Yönetimi > Yeni Plan Ekle formuna `Tek Ay` ve `Tahakkuklu Dağıtım` seçenekleri eklendi. Tahakkuk formu toplam tutar, başlangıç yıl/ayı ve 1–36 ay sayısını alır; responsive yıl/ay kartları ile toplam, dağıtılan ve sıfır kalan önizlemesi gösterir.
- Backend dağılımı float ile bölmez; toplamı integer cent'e çevirir, taban cent tutarını aylara verir ve kalanı son aya ekler. `12.565,00 / 12` için 11 ay `$1.047,08`, son ay `$1.047,12` ve kesin `$12.565,00` üretilir.
- Her ay gerçek `PlanEntry` olur. Yıl aşımında kaynak Scenario adı hedef yılda case-insensitive aranır; varsa reuse edilir, yoksa PostgreSQL transaction advisory lock altında güvenli oluşturulur. Böylece Mart 2027 / 12 ay dağılımı 2027'de 10, 2028'de 2 satır ve her satırda hedef yılın Scenario'sunu üretir.
- Aynı dönem/bütçe kalemi/Scenario/departman çakışmasında mevcut `merge` veya `separate` seçimi korunur. Merge edilen satırda tahakkuk katkısı `accrual_amount` ile ayrı tutulur; grup silindiğinde önceki plan tutarı korunur. Grup düzenleme her zaman güvenli ayrı satırlar olarak yeniden dağıtılır.
- Tahakkuk satırındaki düzenleme tüm grubu açar; silme kurumsal `ConfirmDialog` ile tüm grubu hedefler. Her iki işlem transaction içindedir. Herhangi bir grup döneminde doğrudan veya allocation üzerinden bağlı harcama varsa edit/delete `409` ile engellenir. Tek satırlık genel PUT/DELETE endpoint'leri de tahakkuk satırını grup akışı dışında değiştirmeyi reddeder.
- Plan tablosunda kaynak yıldaki satırlar `Tahakkuklu`, sonraki yıl satırları `2027'den Devreden` badge'i alır. Dashboard ve Plan sorguları yalnız normal `PlanEntry` üzerinden çalışır; hazırlama tablolarını okumaz.
- Backend regression paketi 52 testte başarılı, 1 PostgreSQL primary testi kullanımda olan test yılı nedeniyle skip oldu. Yeni testler tek ay davranışı, 12 aylık/cross-year cent dağılımı, son ay remainder, Scenario create/reuse, grup kimliği, carry-over bilgisi, merge/separate güvenliği, grup edit/delete, expense engeli, Dashboard 2028 toplamı, route kaldırma ve hazırlama tablo bağımsızlığını kapsar.
- Frontend production build 2.293 modülle başarılıdır; yalnız mevcut yaklaşık 1,98 MB ana chunk uyarısı sürer. `git diff --check` temizdir.
- Gerçek local PostgreSQL ve tarayıcı kabulünde `TAHAKKUK TEST`, CAPEX, Sistem, Donanım, Mart 2027, 12 ay ve `$12.565,00` kaydedildi. SQL sonucu 12 satır, 2027=10, 2028=2, toplam `12565.00`; 2028 Plan Yönetimi Ocak/Şubat badge'leri ve Dashboard `Yeni $2.094,20 + Devreden $10.652,50 = $12.746,70` doğrulandı. Hazırlama tablo sayıları önce/sonra `1|1|12` kaldı.
- Kabul testi grubu (UUID `2974369a-e9ab-40f7-b6ae-cfbf3fbf8da7`), yalnız ona ait 12 PlanEntry, boşta kalan test BudgetItem ve testte oluşturulan boş 2028 Scenario transaction içinde temizlendi. Mevcut kullanıcı verisine dokunulmadı; test kayıtları kalıcı değildir.
- Yalnız `C:\ButceTakip_Codex` local API/frontend imajları build edilip recreate edildi; DB container ve volume korunmuştur. Production bağlantısı/deploy, push ve main merge yapılmadı.

### 2026-09-28 — Dashboard Toplam Tasarruf hotfix'i
- Dashboard tasarruf tutarları, `/dashboard/over-budget` özetindeki `negotiated_saving_total` ve `other_saving_total` alanlarından; bunlar yoksa normalize KPI karşılıklarından alınır. Toplam Tasarruf yalnız bu iki bileşenin toplamıdır; eski `total_saving_total` alanına güvenilmez ve çift sayım yapılmaz.
- Pazarlıklı, Optimizasyon ve Toplam Tasarruf kartları aynı hesaplama sonucunu kullanır. Toplam kartının açıklaması `Pazarlıklı + Optimizasyon Tasarrufu` oldu; Toplam Tasarruf detay özeti ve Dashboard genel Excel özetindeki değer de aynı birleşik toplam kaynağına bağlandı.
- Regresyon testi `$592.957,20 + $519.773,99 = $1.112.731,19` örneğini ve normalize KPI fallback'ini doğruladı: 2/2 başarılı. Mevcut backend/tahakkuk paketi 52 testte başarılı, 1 PostgreSQL testi kullanımda olan test yılı nedeniyle skip oldu.
- Frontend production build 2.294 modülle başarılıdır; yalnız mevcut yaklaşık 1,98 MB ana chunk uyarısı sürer. `git diff --check` temizdir. Production deploy, push ve main merge yapılmadı.

### 2026-09-29 — Mevcut planı tahakkuka çevirme ve Dashboard tahakkuk görünümü
- Plan Yönetimi'ndeki normal satırlara `Tahakkuka Çevir` işlemi eklendi. Seçilen tek satırın değiştirilemeyen toplam tutarı, başlangıç yıl/ayı ve 1–36 ay sayısıyla atomik olarak ayrı bir tahakkuk grubuna dönüştürülür; aynı bütçe kaleminin diğer normal ayları korunur.
- Önizleme yıl bazında gruplanır, hedef dönemde mevcut plan varsa uyarı verir ve dönüşüm her zaman ayrı PlanEntry satırları oluşturur. Mart 2027 / 12 ay dağılımı Mart-Aralık 2027 ile Ocak-Şubat 2028'i üretir; integer-cent dağıtımı kuruş farkını son aya ekler.
- Kaynak plan kimliği tahakkuk grubunda korunur. Harcama/allocation, aktarım, kullanılmayacak tutar, satın alma durumu/talebi, hazırlama referansı veya ek/dosya bağı bulunan kaynaklar 409 ile engellenir; transaction rollback kaynak satırı korur. Grup edit/delete işlemleri aynı bağımlılık güvenliğini kullanır.
- Plan tablosunda ayrı `Plan Tipi` kolonu Normal, TAHAKKUKLU ve devreden rozetlerini gösterir. Tahakkuk detay penceresi grup kimliği, kaynak plan, toplam, başlangıç, ay sayısı ve aylık dağılımı gösterir.
- Dashboard'a filtrelerle uyumlu `Tahakkuklu Plan` kartı, detay penceresi ve Excel sheet'i eklendi. Tahakkuk tutarı Toplam Plan'ın alt kümesidir ve tekrar eklenmez; 2027/2028 carry-over ayrımı ayrı raporlanır.
- Backend regression paketi 55 testte başarılı, kullanımda olan PostgreSQL test yılı nedeniyle 1 test skip oldu. Dashboard tasarruf testleri 2/2, tahakkuk dağıtım testleri 2/2 başarılıdır. Frontend production build 2.297 modülle başarılıdır; mevcut yaklaşık 2 MB chunk uyarısı sürer.
- Gerçek local PostgreSQL ve tarayıcı kabulünde 4 normal Excel planı içe aktarıldı; yalnız Mart `$30.000` satırı 12 aya çevrildi. Dashboard 2027'de Toplam Plan `$55.000`, Tahakkuklu Plan `$25.000`; 2028'de `$5.000` devreden gösterdi. Grup detay ve düzenleme kaydı doğrulandı; test planları, Scenario'lar, BudgetItem, kullanıcı ve geçici XLSX tamamen temizlendi.
- Yalnız local API/frontend imajları build edilip recreate edildi; DB container/volume korunmuştur. Production deploy, production DB/container işlemi, push ve main merge yapılmadı.

### 2026-09-29 — Tahakkuk rezervi ayrı domaine taşındı
- Tahakkuk artık normal `PlanEntry` satırları üretmez. Kaynak planı değiştirmeden `PlanAccrual` ve aylık `PlanAccrualAllocation` kayıtları oluşturulur; `Numeric/Decimal` dağıtımı kuruş farkını son aya verir. Eski `Tahakkuka Çevir` akışı `Tahakkuk Oluştur` olarak yenilendi ve import yalnız normal plan üretmeye devam eder.
- Gelecek yıllara düşen allocation toplamı kaynak planın kullanılabilir bakiyesinden rezerv olarak düşülür; toplam plan değişmez. Plan tablosunda tek normal satır, `Tahakkuk Var · $X Devreden` chip'i, detay/dağılım dialog'u ve sonraki yıl için ayrı `Devreden Tahakkuklar` bölümü bulunur.
- Kullanılmamış tahakkuk kurumsal `ConfirmDialog` ile geri alınabilir; kullanım varsa `409 Bu tahakkuktan harcama yapıldığı için geri alınamaz.` döner. Normal PlanEntry satırlarına geri alma sırasında dokunulmaz.
- Harcama formu devreden tahakkuk toplam/kullanılan/kalan uyarısını ve `Harcama Kaynağı` seçimini gösterir. Otomatik kaynak önce devredeni tüketir, kalan kısmı cari bütçeye bırakır; `ExpenseAccrualUsage` kayıtları allocation bazında transaction içinde kullanımı izler ve güncelleme/silmede bakiyeyi geri bırakır.
- Dashboard kartı `Devreden Tahakkuk` adını kullanır; toplam/kullanılan/kalan değerlerini gösterir. Efektif Toplam Plan yeni bütçe + devreden tahakkuktur ve bir kez sayılır. Carryover kullanılan harcamalar gerçekleşen/kalan/aşım uzlaştırmasına yeniden atanarak yalancı aşım üretmez; Toplam Tasarruf hotfix'i korunmuştur.
- İzole backend regresyonları SQLite'ta 55/55 başarılı (2 PostgreSQL-only skip); tahakkuk odaklı paket 9/9 ve izole PostgreSQL transaction testleri 2/2 başarılıdır. Dashboard tasarruf 2/2, tahakkuk dağıtım 2/2 geçti. Frontend production build 2.296 modülle başarılıdır; yalnız mevcut yaklaşık 2 MB chunk uyarısı sürer. `git diff --check` temizdir.
- Local PostgreSQL + tarayıcı kabulünde kaynak plan `$120.000` korunarak `$12.000` tahakkuk oluşturuldu; 2028'e `$8.000` devretti. 2028 normal bütçe `$5.000` ve harcama `$9.000` için otomatik split `$8.000 devreden + $1.000 cari` oldu. Dashboard efektif plan `$13.000`, gerçekleşen `$9.000`, kalan `$4.000`, aşım `$0` gösterdi. Göreve ait fixture'lar ve önceki duplicate tahakkuk kabul gruplarındaki 24 açık test satırı hedefli temizlendi; diğer local veriye ve DB volume'a dokunulmadı.
- Yalnız `C:\ButceTakip_Codex` local API/frontend imajları build edilip recreate edildi. Production bağlantısı/deploy, push ve main merge yapılmadı.

### 2026-09-29 — Tahakkuk geri alma ve Dashboard iptal mutabakatı
- Harcama formundaki `Harcama Kaynağı` seçimi yalnız pozitif devreden tahakkuk bakiyesi olduğunda gösterilir; bakiye yokken normal harcama akışı değişmez.
- Tahakkuk geri alma kontrolü hem allocation `used_amount` toplamını hem de `ExpenseAccrualUsage.amount` toplamını kilitli sorgularla değerlendirir. Pozitif kullanım aynı kesin `409 Bu tahakkuktan harcama yapıldığı için geri alınamaz.` sonucunu verir; sıfır tutarlı kullanım satırları PostgreSQL foreign-key sırasına uygun olarak usage → flush → allocation → flush → tahakkuk biçiminde silinir. Kaynak `PlanEntry`, normal `Expense` ve `ExpenseAllocation` kayıtları korunur.
- Dashboard ana `İptal Edilen Bütçe`, yalnız `Alımdan Vazgeçildi` nedenli kullanılmayacak PlanEntry tutarından hesaplanır. İptal edilmiş harcamalar ana iptal toplamına katılmaz. Kart, popup, Bütçe Özeti, Mutabakat ve İptal Detayı aynı canonical veri kümesini kullanır ve çift sayım yapmaz.
- Exact regresyon senaryosunda plan `$7.381.640,40`, gerçekleşen `$2.701.693,62`, kalan `$1.253.979,59`, pazarlıklı `$592.957,20`, optimizasyon `$1.507.773,99`, iptal `$1.325.236,00`, fark `$0,00` ve birleşik tasarruf `$2.100.731,19` olarak doğrulandı. Ek üç iptal edilmiş harcamanın ana iptal tutarını artırmadığı ve detay toplamının kartla eşit olduğu test edildi.
- İzole PostgreSQL üzerinde tam backend paketi 59/59 başarılıdır. Frontend Dashboard tasarruf testleri 2/2, tahakkuk dağıtım testleri 2/2 başarılıdır. Frontend production build 2.296 modülle başarılıdır; yalnız mevcut büyük chunk uyarısı sürer.
- Local PostgreSQL + tarayıcı kabulünde tahakkuk id=2 için `$3.900` toplam, `$0` kullanım ve `$975` devreden fixture'ı kullanıcı onayıyla geri alındı. Tahakkuk ve dağıtım sayıları sıfıra inerken kaynak plan id=108 korunmuş (`0 / 0 / 1`); Plan ekranında tahakkuk chip'i kalktı ve kullanılabilir bakiye `$975` arttı.
- Yalnız local API/frontend imajları build edilip recreate edildi; DB container/volume korunmuştur. Production bağlantısı/deploy, push ve main merge yapılmadı.

### 2026-09-30 — Plan ve Dashboard devreden tahakkuk mutabakatı
- Plan Yönetimi üst özetleri normal planı `Yeni Plan`, önceki yıllardan gelen allocation toplamını `Devreden Tahakkuk` ve ikisinin toplamını `Efektif Toplam Bütçe` olarak ayrı gösterir. Devreden kartında kullanılan ve kalan tutar; kaynak yılda ise gelecek yıllara ayrılan `Tahakkuk Rezervi` ayrıca görünür. Kalan kullanılabilir; efektif toplamdan harcama, kullanılmayacak, iptal ve gelecek yıl rezervi bir kez düşülerek hesaplanır.
- `/plans/accruals/carryover` yılın yanında Bütçe Kalemi, ay, hedef Scenario, departman ve CAPEX/OPEX filtrelerini uygular. Ay filtresinde yalnız ilgili allocation; toplam/kullanılan/kalan ve detay listesine girer. Plan sorgu cache'i tahakkuk oluşturma ve geri alma sonrasında yenilenir.
- Dashboard `Devreden Tahakkuk` kartı kaynak yılları, kalem sayısını, kullanılan ve kalan tutarı gösterir; mevcut tıklanabilir allocation detayı korunur. Toplam Plan `Yeni Plan + Devreden Tahakkuk` olmaya devam eder ve tahakkuk normal PlanEntry olarak kopyalanmaz.
- Kaynak yıl Dashboard mutabakatında gelecek yıllara ayrılan tutar ayrı `Tahakkuk Rezervi` kategorisidir. Toplam Plan değişmez; rezerv Kalan Kullanılabilir'den düşülür. Genel/Capex/Opex/Sınıflandırılmamış mutabakat ve Excel özetleri aynı rezerv alanlarını kullanır; mutabakat farkı sıfır kalır.
- Exact regression: kaynak yıl plan `$50.000`, gelecek yıl rezervi `$8.000`, kaynak yıl kalan `$42.000`; hedef yıl yeni plan `$5.000`, devreden `$8.000`, efektif plan `$13.000`; devredenden `$3.000` harcama sonrası toplam/kullanılan/kalan `$8.000 / $3.000 / $5.000`, efektif kalan `$10.000` olarak doğrulandı. Ocak filtresi yalnız `$4.000 / $3.000 / $1.000` allocation'ını döndürdü ve farklı departman boş sonuç verdi.
- İzole PostgreSQL tam backend paketi 60/60, odaklı tahakkuk paketi 12/12 ve frontend regresyonları 4/4 başarılıdır. Frontend production build 2.296 modülle başarılıdır; yalnız mevcut büyük chunk uyarısı sürer. `git diff --check` temizdir.
- Local API/frontend imajları build edilip recreate edildi; konteynerler sağlıklı başladı. Tarayıcı oturumu login ekranına döndüğü için parola/secret kullanılmadan görsel kabul durduruldu. Production bağlantısı/deploy, push ve main merge yapılmadı.

### 2026-09-30 — Kaynak yıl taahhüdü ve sarkan tahakkuk ayrımı
- Tahakkuk nihai olarak kaynak bütçe yılına ait kesinleşmiş yükümlülük olarak modellenir. Açık tutarın tamamı kaynak yılın `Kalan Kullanılabilir` bakiyesinden düşer; onaylı `Toplam Bütçe` değişmez ve yalnız gerçek Expense kayıtları `Gerçekleşen` sayılır.
- Sonraki yıla düşen allocation'lar `Sarkan Tahakkuk` adıyla bilgi/ödeme takibi için gösterilir. Seçilen yılın normal `Toplam Plan` veya `Kalan Bütçe` tutarına eklenmez. Önceki yıl tahakkukundan yapılan ödeme Expense listesinde kalır, `ExpenseAccrualUsage` ile tahakkuk bakiyesini azaltır ve hedef yılın normal bütçe analitiğine girmez.
- Expense üzerinde `funding_source`, `budget_source_year` ve dönem bilgileri kalıcılaştırıldı. `ExpensePeriodAllocation` tek ana Expense'in 1–36 aylık hizmet dönemini yıl aşarak izler; ikinci Expense üretmez ve hedef yıl bütçesini tüketmez. Harcama formu sarkan bakiyesi olan kalemleri dropdown içinde işaretler, kaynağı yalnız bakiye varsa gösterir ve `Tahakkuklu / Dönemsel Harcama` alanlarını sunar.
- Plan Yönetimi'nde `Yeni Plan`/`Efektif Toplam Bütçe` kaldırıldı; `Toplam Bütçe`, `Gerçekleşen`, `Açık Tahakkuk / Taahhüt`, `Sarkan Tahakkuk` ve `Kalan Kullanılabilir` ayrıştırıldı. Tahakkuk detayı tam aylık dağılımı ve gelecek yıl satırlarında kaynak bütçe chip'ini gösterir. Dashboard kartları istenen ilk üç satır sırasına alındı; sarkan detay ve Excel adları aynı kurala geçirildi.
- Kullanılmayacak sebep seçeneklerine DB değerlerini değiştirmeden küçük, italik ve soluk `İptal'e Gider` / `Optimizasyon'a Gider` yardımcı metinleri eklendi. Toplam Tasarruf formülü `Pazarlıklı + Optimizasyon` ve canonical İptal mutabakatı korunmuştur.
- Tahakkuk odaklı SQLite paketi 13/13, PostgreSQL transaction paketi 2/2 ve tam backend paketi 60 başarılı + kullanımda olan test yılı nedeniyle 1 skip sonucuyla geçti. Dashboard tasarruf 2/2, tahakkuk dağıtım 2/2 geçti. Frontend production build 2.296 modülle başarılıdır; yalnız mevcut büyük chunk uyarısı sürer.
- Yalnız local API şema yükseltmesi/recreate işlemi yapıldı; DB volume korunmuştur. Production bağlantısı/deploy, push ve main merge yapılmadı.

### 2026-09-30 — Tahakkuk aylık etiketleri ve yıllık kullanılabilir bütçe özeti
- Plan Yönetimi `TAHAKKUK VAR` chip'i artık yalnız `source_plan_id` satırına bağlanmaz. Aktif `PlanAccrualAllocation`, kaynak yıl/Scenario/bütçe kalemi/departman ile satır yıl/ayı üzerinden eşleşir; yalnız allocation bulunan kaynak yıl aylarında görünür ve tooltip'te `Bu aya düşen: $...` tutarını gösterir. Gelecek yıl allocation'ları normal plan satırına kopyalanmaz, yalnız `Sarkan Tahakkuk` bölümünde kalır.
- Chip görünürlüğü finansal hesabı çoğaltmaz. Açık tahakkuk rezervi yalnız gerçek kaynak plan satırında bir kez toplanır; Toplam Plan değişmez ve Kalan Kullanılabilir rezerv kadar azalır.
- `Tahakkuk Oluştur` dialog'u tek ayın plan tutarı yerine seçili yıl/Scenario/bütçe kalemi/departman kapsamındaki `Yıllık Planlanan Bütçe`, transfer sonrası `Güncel Toplam Bütçe`, `Harcanan`, `Açık Tahakkuk` ve `Kalan Kullanılabilir` özetini gösterir. Tahakkuk üst sınırı aynı kalan kullanılabilir değerdir.
- 12 x `$9.375 = $112.500` regresyonunda Nisan-Aralık kaynak yılındaki dokuz satır chip aldı, Ocak-Mart almadı; sonraki yıl Ocak-Mart yalnız sarkan tahakkuk dağılımında göründü. Yıllık dialog özeti `$112.500` döndü ve rezerv toplamı bir kez sayıldı.
- Tam backend paketi 62 başarılı + kullanımda olan güvenli PostgreSQL yılı nedeniyle 1 skip; PostgreSQL tahakkuk transaction testleri 2/2 başarılıdır. Frontend Dashboard tasarruf 2/2 ve tahakkuk dağıtım/UI 4/4 geçti. Docker production build 2.296 modülle başarılıdır; yalnız mevcut yaklaşık 2 MB chunk uyarısı sürer. Local API/frontend yeni image'larla recreate edildi ve sağlıklı çalıştı.
- Local browser kabulünde Dashboard kart sırası ve `Pazarlıklı + Optimizasyon Tasarrufu`, kaynak yıl Toplam Plan/Açık Tahakkuk/Kalan Kullanılabilir ayrımı, sonraki yıl normal Toplam Plan'a eklenmeyen `$54.875` sarkan tutar, aylık `$9.375` chip tooltip'i, sarkan bakiye için Alert + Harcama Kaynağı ve tek Expense/12 ay dönemsel bilgilendirmesi doğrulandı. Form kaydedilmedi ve local veriye yeni kayıt eklenmedi.
- Production bağlantısı/deploy, production DB işlemi, push ve main merge yapılmadı.

### 2026-09-30 — Seçili yıl Tahakkuk kartı ve Dashboard Excel paritesi
- Dashboard ve Plan Yönetimi ana kartı `TAHAKKUK` olarak standardize edildi. Tutar, seçilen yıldaki aktif `PlanAccrualAllocation` toplamıdır; kaynak yıl ve sonraki yıl payları ayrı görünür, normal Toplam Plan'a eklenmez. Kaynak yıl kullanımı normal gerçekleşene ikinci kez katılmaz; yalnız gerçek carryover kullanımı takip alanlarında kalır.
- Haziran 2026 başlangıçlı 12 x `$9.375` senaryosunda Dashboard ve Plan Yönetimi 2026 için `$65.625`, 2027 için `$46.875` gösterir. Plan chip tooltip'i `Bu aya düşen tahakkuk: $...` oldu; detay ve Excel `Tahakkuk Detayı` adını ve kaynak bütçe yılını kullanır.
- Dashboard genel Excel'den mükerrer `Kullanılmayacak Bütçe Detayı` worksheet'i kaldırıldı. Tarayıcıdan indirilen rapor yeniden açılarak 13 worksheet denetlendi; Tahakkuk kartı ve yedi detay satırı toplamı `$65.625`, numeric hücre tipleri sayısal ve mutabakat farkı `$0` bulundu.
- Excel auditinde bulunan Kalan Bütçe parite hatası giderildi: kaynak yıl açık tahakkuk rezervi artık `/dashboard/overbudget` kalan detay satırlarından da düşülür. Böylece kart, popup ve Excel Kalan Bütçe Detayı aynı canonical toplamı kullanır; örnek fixture'da üçü de `$0` oldu.
- Canonical İptal kuralı korundu: yalnız `Alımdan Vazgeçildi` plan tutarı sayılır, iptal Expense'ler eklenmez; kart ve detay toplamı `$1.325.236,00` regresyonunda eşittir. Local DB'de aktif `purchase_cancelled` fixture bulunmadığı için yeni kalıcı kullanıcı verisi oluşturulmadı.
- Tam backend paketi 63 başarılı + 1 güvenli skip; frontend regresyonları 7/7 başarılıdır. Local PostgreSQL tahakkuk paketi son frontend/backend değişikliklerinden önce 2/2 geçti; kullanıcı isteğiyle son tekrar çalıştırması yapılmadı. Docker production build 2.296 modülle başarılıdır; local API/frontend recreate edildi. Production bağlantısı/deploy, push ve main merge yapılmadı.
