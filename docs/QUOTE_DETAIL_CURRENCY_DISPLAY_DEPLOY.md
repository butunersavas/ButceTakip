# Teklif Detay Para Birimi Görünümü — Deploy ve Rollback

Tarih: 2026-11-12

Değişiklik kapsamı: yalnız `Teklif Yönetimi > Teklif Detay` modalının frontend
görüntülemesi. Backend, migration, production DB, `quote_documents` volume'u ve
diğer modüllerin para birimi davranışı değişmez.

## Mevcut karar

**NO-GO — production erişimi ve release kapıları tamamlanmadı.**

- PR #308 açıktır ve merge edilmemiştir; doğrulanan remote head
  `003bddfe627a51aac422adeafed4f22cf2961236` değerindedir.
- `docs/QUOTE_MANAGEMENT_PRODUCTION_READINESS.md` içindeki DB + belge volume
  yedek/restore, SSO override birleştirme ve immutable staging smoke kapıları
  henüz kapanmamıştır.
- Güncel proje bağlamı production hedefini `172.24.2.128`, eski paket rollout
  belgesi ise `172.24.2.227` olarak belirtir. Gerçek hedef yetkili envanter ve
  çalışan container label'larıyla doğrulanmadan deploy yapılmaz.
- 2026-11-12 kontrolünde `172.24.2.128` üzerindeki 22, 5173, 8000 ve 5433 TCP
  portlarına erişilemedi; frontend ve API health yanıtı alınamadı.

## GO öncesi salt-okunur kontrol

Yetkili ağ/VPN ve SSH erişimi sağlandıktan sonra gerçek hedefte:

```bash
docker inspect butce_frontend --format 'project={{ index .Config.Labels "com.docker.compose.project" }} working_dir={{ index .Config.Labels "com.docker.compose.project.working_dir" }} service={{ index .Config.Labels "com.docker.compose.service" }} image={{.Image}}'
docker inspect butce_api --format 'project={{ index .Config.Labels "com.docker.compose.project" }} working_dir={{ index .Config.Labels "com.docker.compose.project.working_dir" }} service={{ index .Config.Labels "com.docker.compose.service" }} image={{.Image}}'
docker compose -p butcetakip-main ps
curl --fail --show-error --silent http://127.0.0.1:8000/api/health
curl --fail --show-error --silent http://127.0.0.1:5173/
```

Şunlar ayrıca change kaydına eklenir:

1. çalışan frontend image ID/digest ve release commit'i;
2. production'ın PR #308 ile gereken API/şema sözleşmesine gerçekten sahip olduğu
   kanıtı (`app_schema_version=20261109_quote_packages_01` ve `/api/market-rates`);
3. mevcut, doğrulanmış DB ve `quote_documents` yedek kimlikleri/checksum'ları ile
   son restore prova sonucu;
4. önceki frontend image'ına dönebilen rollback etiketi;
5. gerçek Compose project/working-directory/service label'ları.

Bu kanıtlardan biri eksikse deploy yapılmaz.

## Yalnız frontend deploy

Bu değişiklik için API veya DB restart/recreate gerekmez. Önce çalışan frontend
image'ı geri dönüş için etiketlenir:

```bash
PREVIOUS_FRONTEND_IMAGE="$(docker inspect butce_frontend --format '{{.Image}}')"
ROLLBACK_TAG="butcetakip-frontend:rollback-$(date +%Y%m%d-%H%M%S)"
docker image tag "$PREVIOUS_FRONTEND_IMAGE" "$ROLLBACK_TAG"
```

Kaynak release/PR ve üretilecek image aynı incelenmiş commit'e sabitlendikten sonra,
doğrulanmış gerçek Compose çalışma dizininde yalnız frontend build/recreate edilir:

```bash
docker compose -p butcetakip-main \
  -f docker-compose.yaml -f docker-compose.production.yaml \
  build frontend
docker compose -p butcetakip-main \
  -f docker-compose.yaml -f docker-compose.production.yaml \
  up -d --no-deps frontend
```

`api`, `db` ve diğer Compose project'lerine dokunulmaz. `docker compose down`,
`down -v`, migration, DB reset/recreate/restart ve volume işlemi yapılmaz.

## Deploy sonrası sağlık ve smoke

```bash
docker compose -p butcetakip-main ps frontend api db
docker logs --since 10m butce_frontend
curl --fail --show-error --silent http://127.0.0.1:5173/
curl --fail --show-error --silent http://127.0.0.1:8000/api/health
curl --fail --show-error --silent http://127.0.0.1:8000/api/market-rates
```

Yetkili, mevcut bir Teklif kaydı salt-okunur açılarak şu kontroller yapılır:

- modal ilk açılışta USD;
- TRY seçildiğinde firma/revizyon toplamı, birim fiyat ve satır tutarı aynı
  görüntüleme para biriminde;
- kur kaynağı ve tarihi görünür;
- geçerli kur yoksa dönüşüm gereken tutarlar `—`, uydurma değer yok;
- modal kapanıp açıldığında yeniden USD;
- karşılaştırma ve belge sekmeleri çalışır; production test kaydı oluşturulmaz.

Önce/sonra container ID, image ID, StartedAt, health ve smoke sonucu change kaydına
eklenir. DB container kimliği/StartedAt değeri değişmemelidir.

## Rollback

Frontend smoke veya health başarısızsa, deploy sırasında kaydedilen
`$ROLLBACK_TAG` değerini kullanan geçici bir Compose override ile yalnız frontend
önceki image'a döndürülür:

```yaml
services:
  frontend:
    image: <ROLLBACK_TAG>
```

```bash
docker compose -p butcetakip-main \
  -f docker-compose.yaml -f docker-compose.production.yaml \
  -f docker-compose.rollback.yaml \
  up -d --no-deps --no-build frontend
```

Rollback sonrasında frontend/API health ve Teklif Detay USD görünümü tekrar
doğrulanır. DB/volume restore edilmez; çünkü bu değişiklik şema veya veri yazmaz.
