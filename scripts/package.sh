#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/komari-line-grid.zip"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rm -f "$OUT"
mkdir -p "$TMP/dist"
cp "$ROOT/komari-theme.json" "$TMP/komari-theme.json"
cp "$ROOT/preview.svg" "$TMP/preview.svg"
cp -a "$ROOT/dist/." "$TMP/dist/"
(
  cd "$TMP"
  if command -v zip >/dev/null 2>&1; then
    zip -qr "$OUT" komari-theme.json preview.svg dist
  else
    python3 -m zipfile -c "$OUT" komari-theme.json preview.svg dist
  fi
)
printf '%s\n' "$OUT"
