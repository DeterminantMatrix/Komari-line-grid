#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node --check "$ROOT/dist/js/charts.js"
node --check "$ROOT/dist/js/komari-api.js"
node --check "$ROOT/dist/js/app.js"
node "$ROOT/scripts/test-api.js"
for f in css/app.css js/charts.js js/komari-api.js js/app.js; do
  grep -q "./$f" "$ROOT/dist/index.html" || { echo "missing index reference: $f" >&2; exit 1; }
done
python3 - <<'PY' "$ROOT/komari-theme.json" "$ROOT/dist/metadata/nodes.json"
import json,sys
for p in sys.argv[1:]:
    with open(p,encoding='utf-8') as f: json.load(f)
print('json ok')
PY
printf 'all checks passed\n'
