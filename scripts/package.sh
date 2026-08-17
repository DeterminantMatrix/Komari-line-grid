#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/komari-line-grid.zip"
rm -f "$OUT"
cd "$ROOT"
zip -qr "$OUT" komari-theme.json dist
printf '%s\n' "$OUT"
