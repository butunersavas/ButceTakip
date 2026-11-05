# Canlı SSO entegrasyonu teknik kontrol listesi

Bu belge bir SSO implementasyonu değildir. Canlıdaki özelleştirmeler bu Git dalında
bulunmadığı için kod, sağlayıcı, claim veya kullanıcı eşleme davranışı varsayılmaz.
Amaç, yetkili kaynak kod ve ortam bilgileri erişilebilir olduğunda entegrasyonu güvenli
ve izlenebilir biçimde değerlendirmektir.

## 1. Kaynak ve sahiplik doğrulaması

- Canlı SSO kodunun yetkili kaynak deposunu, commit SHA'sını ve teknik sahibini doğrula.
- Canlı container/image digest'i ile kaynak commit arasındaki ilişkiyi kayda al.
- Reverse proxy, identity provider ve uygulama tarafındaki SSO parçalarını ayrı ayrı envanterle.
- Secret, sertifika, client secret, token veya kullanıcı verisini herkese açık repoya kopyalama.
- Bu dal ile canlı SSO kaynağı arasındaki farkı salt-okunur diff üzerinden incele; eksik kodu tahmin etme.

## 2. Kimlik sağlayıcı sözleşmesi

- Kullanılan protokolü ve akışı doğrula: OIDC/OAuth2, SAML veya proxy-header tabanlı erişim.
- Issuer/entity ID, discovery/metadata kaynağı, authorization/token/userinfo endpoint'leri ve
  imza algoritmalarını yetkili konfigürasyonla karşılaştır.
- Redirect/callback ve logout URL'lerinin development, test ve production için ayrı kayıtlı
  olduğunu doğrula.
- JWKS veya imza sertifikası rotasyonu, cache süresi, saat kayması ve hata davranışını test et.
- Gerekli scope/claim listesini en az yetkiyle sınırla; gereksiz profil verisi isteme.

## 3. Kullanıcı ve yetki eşleme

- Kalıcı kullanıcı anahtarını doğrula; e-posta veya görünen adın değişmez kimlik olduğu varsayımını yapma.
- Admin, user ve viewer rollerinin hangi doğrulanmış claim/grup değerlerinden geldiğini belgeleyip test et.
- Eksik, bilinmeyen veya çelişkili claim durumunda erişimin fail-closed olduğunu doğrula.
- Pasif/silinmiş kullanıcı, grup üyeliği kaybı ve oturum iptali davranışlarını kapsa.
- Mevcut yerel admin/JWT akışıyla birlikte çalışma veya cutover kararını ürün sahibi ve güvenlik
  onayıyla kesinleştir; bu dalda varsayılan bir fallback üretme.

## 4. Secret ve ortam yönetimi

- Client secret, sertifika özel anahtarı ve benzeri değerleri yalnız onaylı secret store/env enjeksiyonu
  üzerinden sağla; kaynak, image katmanı, log veya frontend bundle içine koyma.
- Production `SECRET_KEY` değerinin ortama özel, güçlü ve rotasyon planına sahip olduğunu doğrula.
- SSO ve JWT anahtar rotasyonunun mevcut oturumlara etkisini ve geri dönüş adımını belgeleyip prova et.
- Debug loglarında token, authorization code, cookie, claim veya kişisel veri bulunmadığını kontrol et.

## 5. Güvenlik kontrolleri

- `state`, `nonce`, PKCE, redirect allowlist, CSRF, session fixation ve replay kontrollerini kullanılan
  protokole göre doğrula.
- Cookie bayraklarını production TLS topolojisinde doğrula: `Secure`, `HttpOnly`, `SameSite`, domain ve path.
- Host/proxy header güveni, TLS sonlandırma noktası ve forwarded-header allowlist'ini sınırla.
- Başarısız giriş, yetkisiz rol ve sağlayıcı kesintisinde hassas bilgi içermeyen hata üretildiğini doğrula.
- Rate limit, audit kaydı, saat senkronizasyonu ve güvenlik izleme/uyarılarını kontrol et.

## 6. Test ve devreye alma kapıları

- Önce production'dan izole test identity provider ve test kullanıcı/gruplarıyla doğrula.
- Başarılı giriş, logout, token süresi, rol değişimi, pasif kullanıcı, eksik claim, yanlış audience/issuer,
  imza/JWKS rotasyonu ve sağlayıcı kesintisi senaryolarını çalıştır.
- Mevcut `/api/auth/token`, JWT doğrulama ve API response sözleşmesinde planlanan farkları açıkça listele;
  geriye uyumluluk kararı olmadan sözleşmeyi değiştirme.
- Authenticated frontend smoke ve backend yetki testlerini admin/user/viewer için ayrı kanıtla.
- Güvenlik incelemesi, ürün sahibi onayı, yedek/rollback planı ve bakım penceresi olmadan production'a geçme.
- Deploy sonrası login, rol, logout, audit ve health kontrollerini yap; sorun halinde önceden doğrulanmış
  image/config sürümüne dön.

## Bu dalın sınırı

- SSO kodu eklenmedi, kaldırılmadı veya taşınmadı.
- Canlı SSO konfigürasyonu, secret'ı, container'ı ve identity provider'ı incelenmedi/değiştirilmedi.
- Bu kontrol listesi tamamlanmış production kabulü değil, ayrı entegrasyon çalışmasının giriş kapısıdır.
