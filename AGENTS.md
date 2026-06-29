# BütçeTakip - Codex Çalışma Kuralları

Bu repoda çalışırken aşağıdaki kurallar korunmalıdır.

## Kritik güvenlik kuralları

- DB volume silinmez.
- docker compose down -v kullanılmaz.
- docker volume prune kullanılmaz.
- docker system prune --volumes kullanılmaz.
- Veri kaybına neden olacak işlem yapılmaz.
- Bütçe, Harcama, Dashboard, Raporlama ve mutabakat hesapları gereksiz yere değiştirilmez.
- Canlı import veya veri yazma işleminden önce DB yedeği alınmalıdır.
- Import işlemleri önce dry-run / önizleme yapmalıdır.
- Kullanıcı onayı olmadan DB’ye yazılmamalıdır.

## Garanti Takibi kuralları

Garanti Takibi ekranında üç ayrı kayıt tipi vardır:

1. Cihaz
2. Domain
3. Lisans Destek

Bu üç tip birbirine karıştırılmamalıdır.

### Cihaz alanları

- Alınan Kurum
- Ürün
- Marka
- Model
- Seri No
- Demirbaş
- Ekspres Servis Kodu
- Ordered Product Model
- Fiyat
- Gönderim Tarihi
- Destek Sonu Tarihi
- End of Service Life
- Durum
- Not

### Domain alanları

- DOMAİN ADLARI
- SÖZLEŞME BİTİŞ TARİHİ
- SÖZLEŞME KALAN GÜN SAYISI
- İLGİLİ FİRMA
- HİZMET ALINAN HOSTİNG FİRMASI

### Lisans Destek alanları

- Alınan Kurum
- Ürün
- Lisans Adedi
- Fiyat
- Alım Tarihi
- Bitiş Tarihi
- Destek Kalan Gün
- Garanti Süresi Uzatma İşlemi Yapıldı Mı?

## Şablon ve import kuralları

- Şablon İndir butonu aktif seçili tipe göre çalışmalıdır.
- Cihaz seçiliyse Cihaz şablonu inmeli.
- Domain seçiliyse Domain şablonu inmeli.
- Lisans Destek seçiliyse Lisans Destek şablonu inmeli.
- Her üç şablonda aynı Cihaz başlıkları gelmemelidir.
- Import işlemi seçili tipe göre yapılmalıdır.
- Cihaz import bilgileri Domain veya Lisans Destek tarafına yansımamalıdır.
- Domain import bilgileri Cihaz veya Lisans Destek tarafına yansımamalıdır.
- Lisans Destek import bilgileri Cihaz veya Domain tarafına yansımamalıdır.
- Duplicate kayıtlar tekrar eklenmemelidir.

## Ekran kuralları

- Kayıt Ekle butonu hangi tip seçiliyse o tipe ait formu açmalıdır.
- Tablo kolonları seçili tipe göre değişmelidir.
- Kendisine ait olmayan bilgiler farklı sekmelerde görünmemelidir.
- Bilgi ve görüntü kirliliği oluşturulmamalıdır.
