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

echo "[deploy] health check: 127.0.0.1:8080"
curl -fsS http://127.0.0.1:8080/ >/dev/null

echo "[deploy] health check: host routed http://127.0.0.1/"
curl -fsS -H "Host: ${PROD_DOMAIN}" http://127.0.0.1/ >/dev/null

trap - ERR
echo "[deploy] success"
