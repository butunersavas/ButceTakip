# BütçeTakip — Codex Çalışma Talimatları

Bu repository kurumsal **BütçeTakip / Bütçe Yönetimi** uygulamasıdır.

## Her görevden önce zorunlu okuma
1. `AGENTS.md`
2. `docs/PROJECT_CONTEXT.md`
3. `docs/BUSINESS_RULES.md`
4. `docs/WORKLOG.md` dosyasının en güncel bölümü
5. Değişiklik yapılacak mevcut kaynak kod

Mevcut kodu incelemeden eski mimari veya davranış varsayma.

## Ortamları kesin ayır

### LOCAL / geliştirme
- Frontend: `http://localhost:5173`
- API: `http://localhost:8000`
- PostgreSQL host portu: `5433`
- Container'lar: `butce_frontend`, `butce_api`, `butce_db`

Local rebuild/recreate **canlı deploy değildir**.

### CANLI / production
Bilinen canlı ortam:
- Sunucu IP: `172.24.2.128`
- Frontend: `http://172.24.2.128:5173`
- API: port `8000`
- DB host portu: `5433`
- Compose project: `butcetakip-main`
- Working directory: `/opt/ButceTakip/images/ButceTakip-main 0104/ButceTakip-main`

Kullanıcı açıkça “canlıya deploy et” demeden canlı sunucuya, canlı DB'ye, canlı container'lara veya canlı `.env` dosyasına dokunma.

## Veri güvenliği
- `docker compose down -v` kullanma.
- DB volume silme.
- Gerçek veriyi test amacıyla silme.
- `.env`, parola, token veya secret commit etme.
- Admin parolasını kaynak koda yazma.
- Mevcut parasal değerleri kurla dönüştürme.

## Çalışma yaklaşımı
- Önce mevcut implementasyonu bul.
- Frontend + backend + import/export + raporlama kullanım noktalarını birlikte ara.
- Ortak helper/service varsa tekrar kullan.
- UI'da buton gizlemek backend yetkilendirmesinin yerine geçmez.
- Hesaplama değişikliklerinde regression senaryosu ekle.
- Build başarılı olsa bile davranışı local uygulamada doğrula.

## Para birimi standardı
BütçeTakip'in standart para birimi **USD**'dir.
- UI: `$`
- Default currency gerekiyorsa: `USD`
- `TL`, `TRY`, `₺` parasal bağlamda kalmamalı.
- Türkçe sayı biçimi kullanılabilir: `$150.058,00`
- Numeric değer değişmez; kur dönüşümü yapılmaz.
- `tr-TR` sayı/tarih biçimi için kullanılabilir.

## Görev sonunda
1. Değiştirilen dosyaları raporla.
2. Kök nedeni ve düzeltmeyi özetle.
3. Test/build sonucunu yaz.
4. Pending konuları belirt.
5. `docs/WORKLOG.md` içine tarihli kayıt ekle.
6. Kullanıcı açıkça istemedikçe canlı deploy yapma.
