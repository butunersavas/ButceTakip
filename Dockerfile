FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_TRUSTED_HOST="pypi.org files.pythonhosted.org pypi.python.org"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        ca-certificates \
        curl \
        openssl \
        cargo \
        rustc \
    && rm -rf /var/lib/apt/lists/*

# Kurumsal ağlarda PyPI TLS incelemesi yapılıyorsa ek kök sertifikaları 
# `docker/certs/` dizinine `.crt` uzantısıyla kopyalayarak build sırasında 
# güvenilen sertifikalara ekleyebilirsiniz.
COPY docker/certs/ /usr/local/share/ca-certificates/
RUN set -eux; \
    cert_dir=/usr/local/share/ca-certificates; \
    if [ -d "$cert_dir" ]; then \
        find "$cert_dir" -type f \( -iname '*.pem' -o -iname '*.cer' \) -print0 | \
        while IFS= read -r -d '' cert; do \
            target="${cert%.*}.crt"; \
            if openssl x509 -in "$cert" -noout >/dev/null 2>&1; then \
                cp "$cert" "$target"; \
            elif openssl x509 -inform DER -in "$cert" -out "$target" >/dev/null 2>&1; then \
                :; \
            else \
                echo "Skipping certificate: $cert" >&2; \
            fi; \
        done; \
    fi; \
    update-ca-certificates; \
    ln -sf /etc/ssl/certs/ca-certificates.crt "$cert_dir"/ca-certificates.crt

ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    PIP_CERT=/etc/ssl/certs/ca-certificates.crt

COPY requirements.txt ./
RUN pip install --no-cache-dir \
    --trusted-host pypi.org \
    --trusted-host files.pythonhosted.org \
    --trusted-host pypi.python.org \
    -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
