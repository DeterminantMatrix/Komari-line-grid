#!/usr/bin/env bash
set -euo pipefail

for file in dist/js/*.js; do
  node --check "$file"
done

node - <<'NODE'
const fs=require('fs');
for(const f of ['komari-theme.json','dist/metadata/nodes.json','dist/metadata/nodes.json.example']) JSON.parse(fs.readFileSync(f,'utf8'));
const html=fs.readFileSync('dist/index.html','utf8');
if(!html.includes('<title>Komari Monitor</title>')) throw new Error('title missing');
if(!html.includes('window.LINE_GRID_METADATA')) throw new Error('metadata bootstrap missing');
if(!html.includes('Powered by Komari Monitor')) throw new Error('Komari attribution missing');
if(!html.includes('RPC2')) throw new Error('RPC2 integration missing');
if(/(?:src|href)="\.\/(?:js|css)\//.test(html)) throw new Error('index must be self-contained');
console.log('json/ui invariants ok');
NODE

./scripts/package.sh >/dev/null
python3 - <<'PY'
from zipfile import ZipFile

required = {
    'komari-theme.json',
    'preview.svg',
    'dist/index.html',
    'dist/css/app.css',
    'dist/metadata/nodes.json',
}
with ZipFile('komari-line-grid.zip') as archive:
    names = set(archive.namelist())
    missing = sorted(required - names)
    if missing:
        raise SystemExit('release missing ' + ', '.join(missing))
    html = archive.read('dist/index.html').decode('utf-8')
    if any(marker in html for marker in ('src="./js/', 'href="./css/')):
        raise SystemExit('release index is not self-contained')
print('release package is complete and self-contained')
PY

echo 'all checks passed'
