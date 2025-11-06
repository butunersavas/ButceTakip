# Kurumsal Kök Sertifikaları

Bu dizini Docker imajı build edilirken kurumsal ağınızdaki SSL/TLS incelemesini
imaj içine tanıtmak için kullanabilirsiniz.

1. IT ekibinizden `.crt` uzantılı kök/ara sertifika dosyalarını alın.
2. Bu dizine kopyalayın (`docker/certs/<kurum-adi>.crt`).
3. İmajı yeniden oluşturun:
   ```bash
   docker compose build --no-cache api
   ```

`Dockerfile`, burada bulunan tüm `.crt` dosyalarını `/usr/local/share/ca-certificates/`
altına kopyalar ve `update-ca-certificates` komutu ile sistemin güvenilen
sertifikaları arasına ekler. Ek bir ayara gerek kalmadan `pip install`
komutları bu sertifikaları kullanır.
