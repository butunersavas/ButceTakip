# BütçeTakip — Proje Bağlamı

## Amaç
Kurumsal bütçe planlama, harcama yönetimi, satın alma takibi, garanti/destek takibi ve raporlama uygulaması.

## Teknoloji
- FastAPI
- SQLModel
- React + MUI
- Vite
- PostgreSQL 15
- Docker Compose

## Ana modüller
- Dashboard
- Plan Yönetimi
- Bekleyen İşlemler / Satın Alma ve Harcama Bekleyen
- Harcama Yönetimi
- Satın Alma Takibi
- Garanti Takibi
- Raporlama
- Kullanıcı/yetki

## Local geliştirme
Windows/Docker:
- `butce_frontend` → `localhost:5173`
- `butce_api` → `localhost:8000`
- `butce_db` → host `5433` → container `5432`

Local DB canlı DB'den bağımsızdır. Canlı admin parolası değişikliği local admin'i değiştirmez.

## Canlı
- IP: `172.24.2.128`
- Frontend: `172.24.2.128:5173`
- API: `172.24.2.128:8000`
- DB host port: `5433`
- Compose project: `butcetakip-main`
- Working dir: `/opt/ButceTakip/images/ButceTakip-main 0104/ButceTakip-main`
- Containers: `butce_frontend`, `butce_api`, `butce_db`

Eski compose klasörleri bulunabilir. Container label'lardaki gerçek working directory doğrulanmadan deploy yapılmamalı.

## Authentication
- Admin username: `admin`
- User table: `users`
- Passlib `CryptContext`
- Default hash: `bcrypt_sha256`
- `bcrypt` desteklenir.
- Local ve canlı admin hash'leri ayrı DB'lerdedir.
- Parola/secret bu dokümana yazılmaz.

## API base / Vite proxy geçmişi
Frontend'de `VITE_API_BASE_URL` ve geriye dönük `VITE_API_BASE` kullanımı var.

Geçmişte `getApiBase()` port `5173` olduğunda API'yi doğrudan `hostname:8000/api` adresine zorlayan fallback içeriyordu.

Frontend container `vite preview` ile çalışırken proxy yalnız `server.proxy` altındaydı. Login troubleshooting sırasında hedef:
- browser yalnız `/api/...` çağırır,
- Vite preview proxy `/api -> http://api:8000` yapar.

Canlıda frontend proxy üzerinden admin login testi `HTTP 200` döndü.

## Dashboard
Konuşulan/uygulanan özetler:
- Toplam Plan
- Gerçekleşen
- Kalan
- Tasarruf
- Aşım
- Bekleyen/Talep kartları
- Riskteki Kalemler
- Top 10 Aşım
- Trend

Kart tıklamaları ilgili kayıtları filtrelemeli ve liste toplamlarıyla tutarlı olmalı.

## Plan Yönetimi
- Tek tablo yaklaşımı
- yıl/ay/departman filtreleri
- kartlardan filtreleme
- pagination
- 10–500 rows per page
- Excel export
- plan güncelleme
- Kullanılmayacak sebebini sonradan değiştirme
- satın alma tamamlandığında Plan tarafında satın alındı bilgisinin güncellenmesi

## Bekleyen İşlemler
Hedef akış:
- Harcama Ekle
- Kullanılmayacak
- Talep Oluşturuldu
- Talebi Geri Al

Bekleme sebebi:
- Fatura
- Harcama
- Her ikisi

Talebi Geri Al için daha önce viewer 403, conflict 409, request state geri alma ve log/audit davranışları hedeflendi.

## Satın Alma
Bilinen durum akışı:
1. SK Yönetim İmza
2. SK Satın Alma
3. BCC Yönetim İmza
4. Sipariş Bekleniyor
5. Tamamlandı

`Tamamlandı` Plan tarafında `Satın alındı = Evet` ile tutarlı olmalı.

## Garanti Takibi
En az şu sekmeler mevcut:
- Donanım
- Domain
- SSL
- Yazılım

Kayıt ekleme, şablon indirme, Excel import, arama, durum kartları, kalan gün, düzenleme/silme davranışları bulunuyor.

2026-09-07 itibarıyla localde Garanti Takibi → Yazılım fiyatı hâlâ `₺` ile görüldü. Codex USD değişikliğinin yeni build'de olduğunu fakat çalışan local frontend'in eski build kullandığını raporladı.

## Para birimi
Tüm uygulama USD standardına çekiliyor:
- Dashboard
- Plan
- Harcama
- Bekleyen
- Satın Alma
- Garanti
- Raporlama
- Excel import/export
- form label/placeholder
- backend default currency

Numeric tutarlar kurla dönüştürülmez.

## Deploy güvenliği
- `.env` korunur.
- Veri/upload/volume overwrite edilmez.
- `docker compose down -v` kullanılmaz.
- Yalnız gerekli servisler build/recreate edilir.
- DB gereksiz yere recreate edilmez.
- `docker compose ps` ve loglar kontrol edilir.

## 2026-09-07 — LOCAL kaynak doğrulaması
- Aktif checkout: `C:\ButceTakip_git`; Compose project: `butcetakip_git`; Docker context: `desktop-linux` (yerel named pipe). Container etiketleriyle doğrulandı.
- `C:\ButceTakip` ayrı checkout'tur; buradaki değişiklikler aktif LOCAL frontend'e kendiliğinden yansımaz.
- Yukarıdaki USD pending bilgisi tarihsel nottur: Yazılım formatter'ı artık `tr-TR` / `USD`; önceki LOCAL build `index-7L9hwp4b.js` olarak doğrulandı ve kullanıcı sonucu onayladı. Bu görevde yeniden doğrulanır.
- Yerel vite.config.ts yalnızca server.proxy tanımlar; preview proxy hedefinin yerelde tamamlandığı varsayılmamalı.
- Canlı ortam bilgileri kullanıcı tarafından sağlanan geçmiş bağlamdır; bu görevde canlıya bağlanılarak doğrulanmadı.
- Repo'nun eski AGENTS.md dosyasındaki üç tip ifadesi güncel değildir: mevcut UI Donanım, Domain, SSL, Yazılım sekmelerini içerir.
- USD henüz proje genelinde tamamlanmamıştır; kalan kullanım noktaları WORKLOG kaydında listelenir.
