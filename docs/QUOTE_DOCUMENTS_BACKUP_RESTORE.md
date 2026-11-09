# Teklif Belgeleri Volume Yedekleme ve Geri Yükleme

Tarih: 2026-11-09
Kapsam: Yalnız BütçeTakip API'nin `/app/data/quote_documents` mount'u

`quote_documents` veritabanı yedeğinin parçası değildir. Teklif belge metadata'sı
PostgreSQL'de, PDF/XLS/XLSX içeriği named volume'da tutulur. DB ve volume yedekleri
aynı bakım penceresi kimliğiyle birlikte saklanmalı ve birlikte geri yüklenmelidir.

## 1. Salt-okunur production envanteri

Aşağıdaki komutlar production sunucusunda yalnız bilgi okur. Beklenen Compose project
adı `butcetakip-main` ve çalışma dizini
`/opt/ButceTakip/images/ButceTakip-main 0104/ButceTakip-main` olsa da label çıktısı
doğrulanmadan bu değerler doğru kabul edilmez.

```bash
docker inspect butce_api --format 'project={{ index .Config.Labels "com.docker.compose.project" }} working_dir={{ index .Config.Labels "com.docker.compose.project.working_dir" }} service={{ index .Config.Labels "com.docker.compose.service" }} image={{.Image}}'
docker inspect butce_frontend --format 'project={{ index .Config.Labels "com.docker.compose.project" }} working_dir={{ index .Config.Labels "com.docker.compose.project.working_dir" }} service={{ index .Config.Labels "com.docker.compose.service" }} image={{.Image}}'
docker inspect butce_api --format '{{json .Mounts}}'
docker inspect butce_api --format '{{range .Mounts}}{{if eq .Destination "/app/data/quote_documents"}}{{.Type}} {{.Name}} {{.Destination}} rw={{.RW}}{{end}}{{end}}'
docker image inspect "$(docker inspect butce_api --format '{{.Image}}')" --format 'api_image={{.Id}} created={{.Created}} repo_digests={{json .RepoDigests}}'
docker image inspect "$(docker inspect butce_frontend --format '{{.Image}}')" --format 'frontend_image={{.Id}} created={{.Created}} repo_digests={{json .RepoDigests}}'
```

Çıktıda mount tipi `volume`, hedef `/app/data/quote_documents` ve `rw=true`
olmalıdır. Volume adı inspect çıktısından alınır; tahmin edilmez.

```bash
QUOTE_VOLUME="$(docker inspect butce_api --format '{{range .Mounts}}{{if eq .Destination "/app/data/quote_documents"}}{{.Name}}{{end}}{{end}}')"
test -n "$QUOTE_VOLUME"
docker volume inspect "$QUOTE_VOLUME"
docker exec butce_api sh -c 'test -d /app/data/quote_documents && test -r /app/data/quote_documents && test -w /app/data/quote_documents'
```

Son komut dosya oluşturmaz; yalnız dizinin varlığını ve izinlerini sınar.

## 2. Onaylı bakım penceresinde yedekleme

Bu bölüm salt-okunur değildir. Yalnız production değişikliği için ayrıca onay, aynı
zaman kimliğine ait doğrulanmış DB yedeği ve bakım penceresi varken çalıştırılır.
`db` servisi veya başka Compose project'leri durdurulmaz.

```bash
cd '/opt/ButceTakip/images/ButceTakip-main 0104/ButceTakip-main'
BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="/opt/ButceTakip/backups/quote-documents/$BACKUP_ID"
QUOTE_VOLUME="$(docker inspect butce_api --format '{{range .Mounts}}{{if eq .Destination "/app/data/quote_documents"}}{{.Name}}{{end}}{{end}}')"
API_IMAGE="$(docker inspect butce_api --format '{{.Image}}')"
test -n "$QUOTE_VOLUME"
mkdir -p "$BACKUP_DIR"

docker compose -p butcetakip-main stop api
docker run --rm \
  --mount type=volume,src="$QUOTE_VOLUME",dst=/source,readonly \
  --mount type=bind,src="$BACKUP_DIR",dst=/backup \
  --entrypoint sh "$API_IMAGE" \
  -c 'cd /source && find . -type f -exec sha256sum {} + | sort > /backup/files.sha256 && tar -czf /backup/quote_documents.tar.gz .'
sha256sum "$BACKUP_DIR/quote_documents.tar.gz" > "$BACKUP_DIR/quote_documents.tar.gz.sha256"
```

API, migration/deploy adımına geçilmeyecekse kaydedilmiş mevcut image ile yeniden
başlatılır. DB yedeğinin kimliği ve checksum'ı aynı `$BACKUP_ID` manifestine eklenir.

## 3. İzole geri yükleme provası

Production volume hedef olarak kullanılmaz. Yeni ve açıkça geçici bir volume oluşturulur.
Gerçek dosya sayısı, arşiv checksum'ı ve dosya SHA-256 manifesti doğrulanır.

```bash
RESTORE_VOLUME="butcetakip_quote_restore_${BACKUP_ID}"
case "$RESTORE_VOLUME" in butcetakip_quote_restore_*) ;; *) exit 1 ;; esac

docker volume create "$RESTORE_VOLUME"
docker run --rm \
  --mount type=volume,src="$RESTORE_VOLUME",dst=/restore \
  --mount type=bind,src="$BACKUP_DIR",dst=/backup,readonly \
  --entrypoint sh "$API_IMAGE" \
  -c 'cd /restore && tar -xzf /backup/quote_documents.tar.gz && sha256sum -c /backup/files.sha256'

docker run --rm \
  --mount type=volume,src="$RESTORE_VOLUME",dst=/restore,readonly \
  --entrypoint sh "$API_IMAGE" \
  -c 'find /restore -type f -print | sort; test -r /restore'
```

Kanıtlar alındıktan sonra yalnız adı `butcetakip_quote_restore_` ile başlayan bu geçici
prova volume'u ayrıca onaylanarak kaldırılabilir. Production `quote_documents` volume'u
silinmez, yeniden adlandırılmaz veya üstüne açılmaz.

## 4. Gerçek geri yükleme

Gerçek geri yükleme otomatik rollback adımı değildir. Ayrı onay, API'nin kapalı olması,
aynı `$BACKUP_ID` değerine ait DB ve volume yedeklerinin doğrulanması ve hedef volume'un
inspect ile yeniden teyidi gerekir. Mevcut production volume'un üstüne açmak yerine önce
yeni volume'a geri yükleme, checksum doğrulaması ve Compose mount'unu kontrollü değiştirme
tercih edilir.

## GO kapısı

Bu prosedür production yedeğiyle izole ortamda baştan sona çalıştırılıp dosya manifesti
doğrulanana kadar Teklif Yönetimi için karar **NO-GO** kalır.
