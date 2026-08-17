#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/komari-line-grid.zip"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rm -f "$OUT"
mkdir -p "$TMP/dist"
cp "$ROOT/komari-theme.json" "$TMP/komari-theme.json"
cp -a "$ROOT/dist/." "$TMP/dist/"
node "$ROOT/scripts/inline-release.js" "$TMP/dist/index.html" "$ROOT"
(
  cd "$TMP"
  zip -qr "$OUT" komari-theme.json dist
)
printf '%s\n' "$OUT"
