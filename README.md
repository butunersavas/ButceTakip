# Bütçe Takip Uygulaması

Kurumsal bütçe planlama ve gerçekleşen harcamaları takip etmeye yönelik API uygulaması.

## Özellikler
- Senaryolara göre yıl/ay bazlı plan verileri oluşturma ve güncelleme
- Harcamaları kayıt altına alma, iptal etme veya bütçe dışı işaretleme
- Dashboard uç noktası ile Plan vs Gerçekleşen vs Tasarruf (Saving) özetleri
- JSON ve CSV formatında içe aktarma, CSV/XLSX dışa aktarma
- Plan ve harcama verilerini temizleme/sıfırlama uç noktaları
- Kullanıcı kaydı ve JWT tabanlı kimlik doğrulama

## Gerekli Teknolojiler
- Python 3.11
- FastAPI
- PostgreSQL

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
4. PgAdmin arayüzüne `http://localhost:8080` adresinden erişebilirsiniz.

## Geliştirme Ortamı
Yerel geliştirmede aşağıdaki adımları takip edebilirsiniz:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Örnek CSV Şablonu
```
type,budget_code,budget_name,scenario,year,month,amount,date,quantity,unit_price,vendor,description,out_of_budget
plan,MARKETING,Marketing Temel,Temel,2024,1,15000,,,,,
expense,MARKETING,Marketing Temel,Temel,2024,,12000,2024-01-15,1,12000,ACME Ltd,Reklam harcaması,false
```
