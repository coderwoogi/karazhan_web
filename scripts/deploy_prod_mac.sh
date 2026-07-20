#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SERVICE_LABEL="com.karazhan.server"
SERVICE_TARGET="gui/$(id -u)/${SERVICE_LABEL}"
BUILD_OUTPUT="karazhan_server"
TEMP_OUTPUT="${BUILD_OUTPUT}.new"
BACKUP_DIR="releases"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_PATH="${BACKUP_DIR}/${BUILD_OUTPUT}.${TIMESTAMP}.bak"
PROD_DOMAIN="${KARAZHAN_PROD_DOMAIN:-karazhan.kro.kr}"
APP_PORT="${PORT:-80}"

mkdir -p "$BACKUP_DIR"

rollback() {
  if [[ -f "$BACKUP_PATH" ]]; then
    echo "[deploy] rolling back binary"
    cp "$BACKUP_PATH" "$BUILD_OUTPUT"
    launchctl kickstart -k "$SERVICE_TARGET"
  fi
}

trap 'echo "[deploy] failed"; rollback' ERR

echo "[deploy] pulling latest code"
git pull --ff-only

echo "[deploy] checking forbidden secrets"
bash scripts/check_no_dev_secrets.sh

# frontend/dist 는 git 추적 대상이 아니다(.gitignore). 각 머신이 직접 빌드해 생성한다.
echo "[deploy] installing frontend dependencies"
(
  cd frontend
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
)

echo "[deploy] building react frontend"
(
  cd frontend
  npm run build
)

echo "[deploy] building new binary"
go build -o "$TEMP_OUTPUT" main.go

if [[ -f "$BUILD_OUTPUT" ]]; then
  echo "[deploy] backing up current binary -> $BACKUP_PATH"
  cp "$BUILD_OUTPUT" "$BACKUP_PATH"
fi

echo "[deploy] promoting new binary"
mv "$TEMP_OUTPUT" "$BUILD_OUTPUT"
chmod +x "$BUILD_OUTPUT"

echo "[deploy] restarting launchctl service"
launchctl kickstart -k "$SERVICE_TARGET"

echo "[deploy] waiting for service startup"
sleep 3

echo "[deploy] health check: 127.0.0.1:${APP_PORT}"
curl -fsS "http://127.0.0.1:${APP_PORT}/" >/dev/null

echo "[deploy] health check: host routed http://127.0.0.1/"
curl -fsS -H "Host: ${PROD_DOMAIN}" http://127.0.0.1/ >/dev/null

trap - ERR
echo "[deploy] success"
