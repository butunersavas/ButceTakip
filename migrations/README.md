# Veritabanı migration çalışma modeli

## Teklif Yönetimi release akışı (2026-11-09)

Bu release için genel `python -m scripts.migrate_database --apply` **kullanılmaz**.
Teklif Yönetimi yalnız aşağıdaki açık, modüle özel PostgreSQL dosyalarıyla hazırlanır:

1. Salt-okunur şema, satır sayısı ve para birimi envanteri:

   `psql "$PGURL" -X -v ON_ERROR_STOP=1 -f migrations/20261109_quote_management_preflight.sql`

2. Yalnız yeni Teklif tablolarını oluşturan USD-only migration:

   `psql "$PGURL" -X -v ON_ERROR_STOP=1 -f migrations/20261109_quote_management_usd_only_up.sql`

3. Uygulamanın bütün şema sözleşmesi eksiksizse, tarihsel migration çalıştırmadan
   release sürüm işaretini yaz:

   `python -m scripts.migrate_database --baseline --backup-confirmed`

4. Salt-okunur son kontrol:

   `python -m scripts.migrate_database --check`

Forward SQL aktif şemada herhangi bir Teklif tablosu görürse durur. Mevcut EUR/TRY
kayıtlarını dönüştürmez, silmez veya constraint'i zorla değiştirmez; önce preflight
çıktısı raporlanmalı ve mevcut şemaya özel ayrı bir karar alınmalıdır. Production
yedeğinden geri yüklenmiş izole PostgreSQL kopyasında başarılı prova ve geri yükleme
kanıtı olmadan bu komutlar production'da çalıştırılmaz.

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

5. Teklif Yönetimi dışındaki bir release'te şema eksikse API kapalıyken veya onaylı
   bakım penceresinde migration container'ını tek örnek olarak çalıştır:

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
