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
        cargo \
        rustc \
    && rm -rf /var/lib/apt/lists/*

# Kurumsal ağlarda PyPI TLS incelemesi yapılıyorsa ek kök sertifikaları 
# `docker/certs/` dizinine `.crt` uzantısıyla kopyalayarak build sırasında 
# güvenilen sertifikalara ekleyebilirsiniz.
COPY docker/certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates

COPY requirements.txt ./
RUN pip install --no-cache-dir \
    --trusted-host pypi.org \
    --trusted-host files.pythonhosted.org \
    --trusted-host pypi.python.org \
    -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
