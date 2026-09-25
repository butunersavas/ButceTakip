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
