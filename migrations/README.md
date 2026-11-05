# Veritabanı migration çalışma modeli

Production API başlangıcı şema değiştirmez. Başlangıç yalnız:

- PostgreSQL kullanıldığını,
- `app_schema_version` kaydının bu sürümle eşleştiğini,
- modelde beklenen tablo ve kolonların bulunduğunu,
- kritik unique indexlerin bulunduğunu

salt okunur olarak doğrular. Uyuşmazlıkta API, herhangi bir DDL/DML çalıştırmadan durur.

## Açık migration akışı

1. Production'dan bağımsız staging kopyasında migration ve uygulama regresyonlarını çalıştır.
2. Production DB yedeğini al ve geri yükleme provasını doğrula.
3. Production compose override ile `APP_ENV=production` ve
   `PRODUCTION_MODE_REQUIRED=true` kullanıldığını doğrula.
4. Mevcut şema tüm tablo/kolon/index sözleşmesini zaten karşılıyorsa, hiçbir tarihsel
   DDL/DML yükseltmesi çalıştırmadan sürüm işaretini oluştur:

   `python -m scripts.migrate_database --baseline --backup-confirmed`

5. Şema eksikse API kapalıyken veya onaylı bakım penceresinde migration container'ını
   tek örnek olarak çalıştır:

   `python -m scripts.migrate_database --apply --backup-confirmed`

6. Yazma yapmayan kontrolü çalıştır:

   `python -m scripts.migrate_database --check`

7. Ancak kontrol başarılıysa API'yi başlat.

Migration PostgreSQL advisory lock kullanır. Mevcut `create_all` ve kontrollü şema yükseltmeleri
yalnız bu açık komutta çalışır; sürüm kaydı tüm adımlar başarıyla tamamlandıktan sonra yazılır.
Bir adım hata verirse sürüm güncellenmez ve API fail-closed kalır.
`--baseline` yalnız salt-okunur sözleşme kontrolü başarılıysa sürüm tablosunu/yazısını oluşturur;
mevcut uygulama tablolarına DDL veya DML uygulamaz.

## İlk admin ve reset

Production API startup'ında admin bootstrap yasaktır. İlk hesap oluşturma veya kontrollü reset,
şema doğrulamasından sonra yetkili operatör tarafından `reset_admin.py` ile açıkça çalıştırılır.
Parola komut satırına yazılmaz; araç gizli terminal girdisi kullanır.

## Rollback

- Uygulama rollback'i yalnız şema geriye uyumluysa önceki image/config sürümüne dönüşle yapılır.
- Şema rollback'i otomatik değildir. Veri içeren tablolar düşürülmez veya temizlenmez.
- Geriye uyumsuz bir durum oluşursa onaylı DB yedeğinden geri yükleme gerekir.
- Teklif Yönetimi down SQL'i veri bulunduğunda bilinçli olarak durur; bu güvenlik kuralı korunur.
