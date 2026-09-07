# BütçeTakip — İş Kuralları

## 1. Para Birimi
Standart para birimi **USD**.

Beklenen:
- `$150.058,00`
- `$80.000,00`
- `$1.000.000,00`

Parasal bağlamda `₺`, `TL`, `TRY` kullanılmamalı.

Numeric değer aynen korunur:
- DB: `150058`
- eski: `₺150.058,00`
- yeni: `$150.058,00`

Kur dönüşümü yapılmaz.

Kapsam: Dashboard, Plan, Harcama, Bekleyen, Satın Alma, Garanti, Raporlama, Excel, form/dialog ve backend default currency.

## 2. Plan bütçesi ve aylara dağıtım
Regression örneği:
- Toplam plan: `12.000`
- Ocak: `4.500`
- Şubat: `2.000`
- Mart: `1.000`

Toplam `7.500` olduğundan **aşım değildir**. Uygulama bu senaryoda yanlış aşım üretmemeli.

Genel hesap:
- toplam planı,
- aylık dağılımı,
- mevcut harcamaları,
- ilgili Kullanılmayacak tutarlarını

iki kez saymadan tutarlı değerlendirmeli.

Bir plana birden fazla harcama girildiğinde önceki harcamalar mutlaka hesaba katılmalı. Negatif kullanılabilir bakiye oluşmamalı.

## 3. Kullanılmayacak sebebi
UI metinleri tam olarak:
- `Alımdan Vazgeçildi.`
- `İhtiyaç Kalmadı.`
- `Başka Bütçeden Karşılandı.`
- `Kullanılmayacak.`

Not alanı:
- kaydedilmeli,
- tekrar açıldığında görünmeli,
- yetkili kullanıcı güncelleyebilmeli.

Sebep de sonradan değiştirilebilmeli.

## 4. Kullanılmayacak tutar seçenekleri
- `Bu Ayın Kalanı`
- `Bütçenin Kalan Tamamı`
- `Özel Tutar`
- bilgi olarak `Kalan Kullanılabilir`

`Bu Ayın Kalanı`: ilgili ayın gerçek kullanılabilir kalanı.

`Bütçenin Kalan Tamamı`: plan genelindeki gerçek kullanılabilir kalan.

`Özel Tutar`:
- kullanılabilir kalandan büyük olamaz,
- negatif olamaz,
- aynı bakiye iki kez tüketilemez,
- frontend + backend validation olmalı.

## 5. Kullanılmayacak kaydın listelerdeki davranışı
Kullanılmayacak kayıt:
- Satın Alma Bekleyen'e gelmemeli.
- Harcama Bekleyen'e gelmemeli.
- Bekleyen kart sayılarını yanlış artırmamalı.
- Satın alma akışına girmemeli.
- Dashboard hesaplarını yanlış etkilememeli.

## 6. Bekleyen İşlemler
Aksiyonlar:
- Harcama Ekle
- Kullanılmayacak
- Talep Oluşturuldu
- Talebi Geri Al

Bekleme sebebi:
- Fatura
- Harcama
- Her ikisi

Talep Oluşturuldu refresh sonrası korunmalı.

Talebi Geri Al:
- doğru bekleyen duruma döndürmeli,
- kart/listeleri güncellemeli,
- viewer yapamamalı,
- backend yetki kontrolü olmalı,
- geçersiz state kontrollü hata vermeli,
- mümkünse audit/log bırakmalı.

Daha önce hedeflenen davranış:
- viewer: `403`
- state conflict: `409`
- request flag geri alma: `{requested: false}` benzeri update

## 7. Harcama
Yeni harcama:
- önceki harcamaları hesaba katmalı,
- kullanılabilir kalanı doğru hesaplamalı,
- aynı plana çoklu harcamayı desteklemeli,
- UI ve backend aynı iş kuralını uygulamalı.

Client-side kontrol tek başına yeterli değil.

## 8. Satın Alma
Statü akışı:
1. `SK Yönetim İmza`
2. `SK Satın Alma`
3. `BCC Yönetim İmza`
4. `Sipariş Bekleniyor`
5. `Tamamlandı`

Tamamlandı → Plan `Satın alındı = Evet`.

Kullanılmayacak kayıt satın alma bekleyen akışında görünmemeli.

## 9. Dashboard
- Kart sayıları liste sonucuyla tutarlı olmalı.
- Kart tıklaması doğru filtreyi uygulamalı.
- Yıl/ay/departman filtreleri kart + listeyi aynı etkilemeli.
- Talep/Kullanılmayacak değişikliklerinden sonra stale veri kalmamalı.

## 10. Yetkilendirme
Viewer mutasyon yapamamalı:
- Plan değiştirme
- Harcama değiştirme
- Kullanılmayacak
- Talep Oluşturuldu
- Talebi Geri Al
- Silme
- satın alma durumu değiştirme

Backend de yetki kontrolü yapmalı.

## 11. Excel
- Export ekran filtresi ve USD standardıyla tutarlı olmalı.
- Numeric hücreler gereksiz string'e dönüştürülmemeli.
- Import numeric tutarı kurla çevirmemeli.
- Şablonda TL/TRY/₺ sabit metni kalmamalı.

## 12. Test güvenliği
Gerçek veriyi bozacak test yapılmaz. Localde gerekirse `TEST` kayıt kullanılabilir. Canlıda açık onay olmadan test kaydı oluşturulmaz/değiştirilmez.

## 13. Korunan veri ve garanti import kuralları
- Kullanıcı onayı olmadan DB'ye yazılmaz. Canlı import/veri yazma öncesinde DB yedeği alınır; import önce dry-run/önizleme ile kontrol edilir.
- Garanti sekmeleri birbirine karıştırılmaz. Form, tablo kolonları, şablon ve import aktif tipe göre çalışır; başka tipe ait bilgiler yansıtılmaz.
- Duplicate kayıtlar tekrar eklenmez. Mevcut hesaplar gereksiz yere değiştirilmez.
- Bu hükümler önceki repo AGENTS.md dosyasındaki veri ve tip izolasyonu kurallarını korur; eski üç tip listesi mevcut dört sekmeye uyarlanmıştır.
