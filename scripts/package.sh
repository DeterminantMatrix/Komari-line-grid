#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
node scripts/build-release.js >/dev/null
VERSION="$(node -p "require('./Lite-theme.json').version")"; OUT="komari-line-grid-v${VERSION}.zip"; rm -f "$OUT"
zip -q "$OUT" Lite-theme.json preview.svg dist/index.html; printf '%s\n' "$OUT"
