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
# 프론트 dist는 dev 머신에서 빌드·커밋되어 커밋에 포함된다. 이 서버는 빌드하지 않으므로
# 작업트리가 더러워지지 않지만, 과거 빌드 잔재가 남아 pull을 막는 일이 없도록 방어적으로 정리한다.
git checkout -- frontend/dist 2>/dev/null || true
git pull --ff-only

echo "[deploy] checking forbidden secrets"
bash scripts/check_no_dev_secrets.sh

# NOTE: 프론트엔드(frontend/dist)는 개발 머신에서 빌드·커밋한 산출물을 그대로 사용한다.
# 이 서버에서 npm run build 를 돌리면 커밋된 dist/index.html 이 새 타임스탬프로 덮어써져
# 작업트리가 더러워지고 다음 git pull 이 실패하므로, 여기서는 프론트를 빌드하지 않는다.

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
