# Bütçe Takip Uygulaması

Kurumsal bütçe planlama ve gerçekleşen harcamaları takip etmeye yönelik API ve modern web arayüzü.

## Özellikler
- Senaryolara göre yıl/ay bazlı plan verileri oluşturma ve güncelleme
- Harcamaları kayıt altına alma, iptal etme veya bütçe dışı işaretleme
- Dashboard uç noktası ile Plan vs Gerçekleşen vs Tasarruf (Saving) özetleri
- JSON ve CSV formatında içe aktarma, CSV/XLSX dışa aktarma
- Plan ve harcama verilerini temizleme/sıfırlama uç noktaları
- Kullanıcı kaydı ve JWT tabanlı kimlik doğrulama
- React + Material UI tabanlı dashboard, plan/harcama yönetimi ekranları ve raporlama araçları

## Gerekli Teknolojiler
- Python 3.11
- FastAPI
- PostgreSQL (Docker dağıtımı için)
- SQLite (yerel geliştirme için varsayılan)

## Çalıştırma (Docker Compose)
1. `.env` dosyalarını hızlıca hazırlamak için:
   ```bash
   bash scripts/bootstrap_env.sh
   ```
2. Docker hizmetlerini başlatın:
   ```bash
   docker compose up --build
   ```
3. API `http://<HOST>:8000` adresinden ulaşılabilir. Etkileşimli dokümantasyon için `http://<HOST>:8000/docs` adresini ziyaret edin.
4. Web arayüzüne `http://localhost:5173` adresinden erişebilirsiniz. Arayüz API isteklerini her zaman
   `/api` yoluna yapar; geliştirme ortamında Vite proxy bu istekleri arka uç servisine yönlendirir.
5. PgAdmin arayüzüne `http://localhost:8080` adresinden erişebilirsiniz.

### Şema güncellemeleri

Development/test başlangıcı mevcut kolaylığı koruyarak şemayı otomatik hazırlar. Production API başlangıcı ise hiçbir
DDL/DML çalıştırmaz; yalnız şema sürümünü, tablo/kolon sözleşmesini ve kritik indexleri salt okunur doğrular.

Production migration veya mevcut şemayı sürümleme adımları API başlangıcından ayrı yürütülür. Yedek ve restore provası
tamamlanmadan çalıştırmayın:

```bash
python -m scripts.migrate_database --baseline --backup-confirmed  # şema zaten tam ise
python -m scripts.migrate_database --apply --backup-confirmed     # şema yükseltmesi gerekiyorsa
python -m scripts.migrate_database --check                         # salt okunur son kontrol
```

DB volume silinmez ve `docker compose down -v` kullanılmaz. Ayrıntılı prosedür için `migrations/README.md` dosyasına bakın.

### Docker Compose sorun giderme (yalnız development)

`butce_db` benzeri bir kapsayıcı adının zaten kullanımda olduğuna dair uyarı alırsanız önce ilgili kapsayıcının durdurulup silindiğinden emin olun:

```bash
docker stop butce_db  # çalışıyorsa durdur
docker rm butce_db    # durdurulduysa sil

# kapsayıcı hala çalışıyorsa tek adımda zorla silmek için
docker rm -f butce_db
```

Ardından tekrar `docker compose up --build` komutunu çalıştırabilirsiniz. Aynı hatanın sık yaşanmaması için yeni bir kurulum öncesinde `docker compose down` komutuyla mevcut servisleri kapatmak da yardımcı olur.
Bu adımlar production container'larında uygulanmaz; production DB container'ı/volume'u korunur.

## Geliştirme Ortamı
Yerel geliştirmede aşağıdaki adımları takip edebilirsiniz:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Herhangi bir ortam değişkeni tanımlamazsanız API otomatik olarak kök dizinde `butce_takip.db` isimli SQLite veritabanı
oluşturur. PostgreSQL kullanmak isterseniz `DATABASE_URL` ortam değişkeni ile bağlantı dizesi sağlayabilirsiniz.

### Varsayılan yönetici hesabı oluşturma

Yalnız tamamen boş bir kullanıcı tablosundaki ilk kurulum için `.env` dosyasında bootstrap'ı bilinçli olarak açın. Gerçek
e-posta ve güçlü parolayı private ortam/secret yönetimi üzerinden sağlayın; bu değerleri kaynak koda veya Git'e yazmayın:

```env
ADMIN_BOOTSTRAP_ENABLED=true
DEFAULT_ADMIN_EMAIL=
DEFAULT_ADMIN_PASSWORD=
# İsteğe bağlı
DEFAULT_ADMIN_FULL_NAME=Admin Kullanıcı
DEFAULT_ADMIN_ROLE=admin
```

Bootstrap herhangi bir kullanıcı varsa hiçbir hesabı değiştirmez. Production API startup'ında otomatik bootstrap tamamen
yasaktır; `ADMIN_BOOTSTRAP_ENABLED=false` olmalıdır. Production'da ilk hesap veya kontrollü reset yalnız aşağıdaki açık
komutla ve yetkili operatör tarafından yapılır.

#### Admin hesabını sıfırlama (opsiyonel)

Admin hesabını bilinçli olarak oluşturmak veya parolasını resetlemek için e-posta adresini açıkça verin. Parola komut satırına
yazılmaz; script parolayı gizli terminal girdisiyle ister:

```bash
docker compose exec api python scripts/reset_admin.py \
  --email admin@example.com \
  --full-name "Admin Kullanıcı" \
  --username admin
```

### Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Varsayılan olarak arayüz `http://localhost:5173` portundan yayına alınır. API çağrıları `/api` yoluna yapılır
ve Vite geliştirme sunucusu bu istekleri backend'e proxy eder. Proxy hedefini değiştirmek isterseniz
`VITE_API_PROXY_TARGET` değişkenini kullanabilirsiniz. Örnek değerler için `frontend/.env.example` dosyasını
`.env` olarak kopyalayabilirsiniz.

### Production compose güvenlik kapısı

Production çalıştırmalarında temel compose dosyası tek başına kullanılmaz; `docker-compose.production.yaml` override'ı
zorunludur. Override `APP_ENV=production`, `PRODUCTION_MODE_REQUIRED=true` ve kapalı bootstrap değerlerini sabitler;
gerekli secret ve DB değişkenleri eksikse Compose API'yi oluşturmadan hata verir. Değerleri yazdırmadan sözdizimi kontrolü:

```bash
docker compose -f docker-compose.yaml -f docker-compose.production.yaml config --quiet
```

### Nginx reverse proxy + SSL (opsiyonel)

Üretimde HTTPS ile çalıştırmak için Docker Compose içinde opsiyonel bir Nginx servisi bulunur. Aşağıdaki gibi başlatabilirsiniz:

```bash
docker compose --profile nginx up --build
```

Nginx, `/` isteklerini frontend'e, `/api` isteklerini API'ye yönlendirir. TLS sertifikaları için
`nginx/certs/fullchain.pem` ve `nginx/certs/privkey.pem` dosyalarını eklemeniz gerekir.

Geliştirme için self-signed sertifika üretmek isterseniz:

```bash
mkdir -p nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/certs/privkey.pem \
  -out nginx/certs/fullchain.pem \
  -subj "/CN=localhost"
```

Gerçek domain için Let's Encrypt sertifikalarını kullanabilirsiniz (ör. certbot ile).

### LAN'dan erişim notu

- Backend dokümantasyonu `http://<LAN_IP>:8000/docs` üzerinden erişilebilir olmalıdır.
- Frontend `http://<LAN_IP>:5173` üzerinden erişilebilir olmalıdır.
- Windows Firewall inbound kurallarında `TCP 5173` ve `TCP 8000` portlarını açmanız gerekebilir.

> **PowerShell Kullanıcılarına Not**
>
> - `npm run dev` komutunu çalıştırdıktan sonra başka bir komut (ör. `curl`) yazacaksanız yeni bir terminal sekmesi açın veya
>   aynı pencerede komutu tamamen bitirdikten sonra yazın. Yan yana yazıldığında PowerShell bunu tek bir komut sanarak
>   `npm run devcurl` gibi hatalara yol açar.
> - Linux/macOS için verilen çok satırlı `curl` örneklerindeki `\` karakteri PowerShell’de satır devamı olarak çalışmaz.
>   Komutu tek satırda yazabilir ya da aşağıdaki `Invoke-RestMethod` örneğinde olduğu gibi PowerShell sözdizimini
>   kullanabilirsiniz:
>
>   ```powershell
>   Invoke-RestMethod -Method Post `
>       -Uri "http://<HOST>:8000/auth/register" `
>       -ContentType "application/json" `
>       -Body '{"email":"yeni.admin@local","full_name":"Yeni Admin","password":"DahaGucluSifre456!"}'
>   ```
>
>   Alternatif olarak Windows’ta yer alan klasik `curl.exe` uygulamasını tek satırda çalıştırabilirsiniz:
>
>   ```powershell
>   curl.exe -X POST "http://<HOST>:8000/auth/register" -H "Content-Type: application/json" -d '{"email":"yeni.admin@local","full_name":"Yeni Admin","password":"DahaGucluSifre456!"}'
>   ```

## Örnek CSV Şablonu
```
type,budget_code,budget_name,scenario,year,month,amount,date,quantity,unit_price,vendor,description,out_of_budget,map_category,map_attribute
plan,MARKETING,Marketing Temel,Temel,2026,1,15000,,,,,,,false,CAPEX,Donanım
expense,MARKETING,Marketing Temel,Temel,2026,,12000,2026-01-15,1,12000,ACME Ltd,Reklam harcaması,false,OPEX,Yazılım
```

> `map_category` sütununda CAPEX/OPEX bilgisi, `map_attribute` sütununda ise Donanım/Yazılım/Hizmet gibi nitelikler tutulur. Başlıklar "Map-Capex or Opex", "Capex_Opex", "Nitelik" gibi benzer ifadelerle de yazılabilir.

### 2026 planı için hazır CSV

`data/butce_plan_2026.csv` dosyası yukarıdaki şablona göre düzenlenmiş ve sorudaki satır/sütun tablosu baz alınarak hazırlanmış tüm plan kayıtlarını içerir. Dosyayı içe aktararak 2026 yılındaki her ay için CAPEX/OPEX kırılımlı bütçe kalemlerini doğrudan sisteme yükleyebilirsiniz.

Kaynağı güncellemek veya farklı biçimlerde yeniden üretmek isterseniz `scripts/generate_budget_csv.py` betiğini çalıştırmanız yeterlidir:

```bash
python scripts/generate_budget_csv.py
```

Betik aynı klasördeki ham tablo metnini parse ederek `data/butce_plan_2026.csv` dosyasını yeniden oluşturur.

## Pivot tablo (Row Labels) XLSX dosyaları

Qlik veya benzeri raporlama araçlarından çıkan ve satırlarda harcama kalemi isimleri, sütunlarda ise ay bazlı plan tutarları
bulunan pivot tablolardaki XLSX dosyaları doğrudan içe aktarılabilir. Dosyada `Row Labels` başlığının ve ayları temsil eden
(`Oct-23`, `Jan-24` vb.) sütunların bulunması yeterlidir. Plan satırlarının “Type” sütununda `Plan` yazıyorsa yalnızca plan
verileri içe alınır; diğer satırlar atlanır. Map Attribute/Map Nitelik bilgisi varsa ilgili bütçe kalemine otomatik olarak
bağlanır.
