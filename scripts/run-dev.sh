#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.dev"
if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE=".env.dev.example"
fi

set -a
source "$ENV_FILE"
set +a

mkdir -p "${STORAGE_DIR:-dev-storage}" "${ASSETS_DIR:-dev-storage/assets}"

cargo build

exec env \
  SERVER_HOST="${SERVER_HOST:-0.0.0.0}" \
  SERVER_PORT="${SERVER_PORT:-18080}" \
  DATABASE_URL="${DATABASE_URL:-sqlite:dev-storage/reader.db?mode=rwc}" \
  STORAGE_DIR="${STORAGE_DIR:-dev-storage}" \
  ASSETS_DIR="${ASSETS_DIR:-dev-storage/assets}" \
  WEB_ROOT="${WEB_ROOT:-frontend/dist}" \
  LOG_LEVEL="${LOG_LEVEL:-info}" \
  REQUEST_TIMEOUT_SECS="${REQUEST_TIMEOUT_SECS:-15}" \
  SECURE="${SECURE:-false}" \
  SECURE_KEY="${SECURE_KEY:-}" \
  INVITE_CODE="${INVITE_CODE:-}" \
  USER_LIMIT="${USER_LIMIT:-50}" \
  USER_BOOK_LIMIT="${USER_BOOK_LIMIT:-2000}" \
  target/debug/reader-next
