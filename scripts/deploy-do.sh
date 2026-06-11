#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/reader/app}"
BRANCH="${BRANCH:-Maple/ai-book-v2}"
REPO="${REPO:-https://github.com/Maple0517/reader-next.git}"

if [[ ! -d "$APP_DIR/.git" ]]; then
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

mkdir -p /opt/reader/storage /opt/reader/caddy-data /opt/reader/caddy-config
if [[ ! -f .env.prod ]]; then
  cp .env.prod.example .env.prod
  secure_key="$(openssl rand -hex 32)"
  invite_code="$(openssl rand -hex 8)"
  sed -i "s/^SECURE_KEY=.*/SECURE_KEY=${secure_key}/" .env.prod
  sed -i "s/^INVITE_CODE=.*/INVITE_CODE=${invite_code}/" .env.prod
  chmod 600 .env.prod
  echo "Created .env.prod with generated SECURE_KEY and INVITE_CODE=${invite_code}"
fi

docker compose -f docker-compose.prod.yml up -d --build

docker compose -f docker-compose.prod.yml ps
