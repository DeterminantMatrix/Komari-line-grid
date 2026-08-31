#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -p "require('./Lite-theme.json').version")"
OUT="$ROOT/komari-line-grid-v${VERSION}.zip"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
node scripts/build-release.js >/dev/null
rm -f "$OUT"
mkdir -p "$TMP/dist"
cp "$ROOT/Lite-theme.json" "$TMP/Lite-theme.json"
cp "$ROOT/preview.svg" "$TMP/preview.svg"
cp -a "$ROOT/dist/." "$TMP/dist/"
(
  cd "$TMP"
  if command -v zip >/dev/null 2>&1; then
    zip -qr "$OUT" Lite-theme.json preview.svg dist
  else
    python3 -m zipfile -c "$OUT" Lite-theme.json preview.svg dist
  fi
)
printf '%s\n' "$OUT"
