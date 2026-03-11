#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PATTERNS=(
  'root:4618'
  'cpo5704:584579'
  '121\.148\.127\.135'
)

echo "[check] scanning pkg/ for forbidden development secrets"

found=0
for pattern in "${PATTERNS[@]}"; do
  if grep -RInE --exclude-dir='.git' --exclude='*.bak' --exclude='*.exe' "$pattern" pkg >/tmp/karazhan_secret_scan.txt 2>/dev/null; then
    echo "[check] forbidden pattern detected: $pattern"
    cat /tmp/karazhan_secret_scan.txt
    found=1
  fi
done

rm -f /tmp/karazhan_secret_scan.txt

if [[ "$found" -ne 0 ]]; then
  echo "[check] failed"
  exit 1
fi

echo "[check] passed"
