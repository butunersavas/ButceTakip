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
