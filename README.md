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
1. `.env.example` dosyasını `.env` olarak kopyalayın ve gerekli değerleri güncelleyin:
   ```bash
   cp .env.example .env
   ```
2. Docker hizmetlerini başlatın:
   ```bash
   docker compose up --build
   ```
3. API `http://localhost:8000` adresinden ulaşılabilir. Etkileşimli dokümantasyon için `http://localhost:8000/docs` adresini ziyaret edin.
4. Web arayüzüne `http://localhost:5173` adresinden erişebilirsiniz.
4. PgAdmin arayüzüne `http://localhost:8080` adresinden erişebilirsiniz.

## Geliştirme Ortamı
Yerel geliştirmede aşağıdaki adımları takip edebilirsiniz:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Herhangi bir ortam değişkeni tanımlamazsanız API otomatik olarak kök dizinde `butce_takip.db` isimli SQLite veritabanı
oluşturur. PostgreSQL kullanmak isterseniz `DATABASE_URL` ortam değişkeni ile bağlantı dizesi sağlayabilirsiniz.

### Varsayılan yönetici hesabı oluşturma

İlk kullanıcıyı elle oluşturmak istemiyorsanız `.env` dosyasına aşağıdaki değişkenleri ekleyerek uygulama her başlatıldığında
hesabın otomatik olarak var olduğundan emin olabilirsiniz:

```env
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=GucluBirSifre123!
# İsteğe bağlı
DEFAULT_ADMIN_FULL_NAME=Admin Kullanıcı
DEFAULT_ADMIN_ROLE=admin
```

E-posta ve parola değerleri sağlandığında veritabanında kayıt bulunmuyorsa kullanıcı otomatik oluşturulur. Parola yalnızca ilk
oluşturma sırasında kullanılır; ileride değiştirmek isterseniz API üzerindeki kullanıcı uç noktalarını veya veritabanını
kullanabilirsiniz.

### Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Varsayılan olarak arayüz `http://localhost:5173` portundan yayına alınır. API adresi `.env` dosyasında `VITE_API_URL` değişkeni ile değiştirilebilir (varsayılan: `http://localhost:8000`).
Örnek değerler için `frontend/.env.example` dosyasını `.env` olarak kopyalayabilirsiniz.

## Örnek CSV Şablonu
```
type,budget_code,budget_name,scenario,year,month,amount,date,quantity,unit_price,vendor,description,out_of_budget
plan,MARKETING,Marketing Temel,Temel,2024,1,15000,,,,,
expense,MARKETING,Marketing Temel,Temel,2024,,12000,2024-01-15,1,12000,ACME Ltd,Reklam harcaması,false
```
