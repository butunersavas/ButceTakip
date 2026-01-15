#!/usr/bin/env bash
set -e

if [ ! -f .env ] || [ ! -s .env ]; then
  echo ".env missing/empty -> copying from .env.example"
  cp .env.example .env
fi

if [ ! -f frontend/.env ] || [ ! -s frontend/.env ]; then
  echo "frontend/.env missing/empty -> creating minimal file"
  cat > frontend/.env <<EOF_INNER
# optional: VITE_API_BASE for localhost dev
VITE_API_BASE=/api
VITE_PROXY_TARGET=http://localhost:8000
EOF_INNER
fi
