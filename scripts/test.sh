#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for file in dist/js/*.js scripts/build-release.js scripts/test-adapter.js scripts/test-timezone.js; do
  node --check "$file"
done
node scripts/test-adapter.js
node scripts/test-timezone.js
node scripts/build-release.js >/dev/null
node scripts/build-release.js --check

node - <<'NODE'
const fs=require('fs');
for(const f of ['komari-theme.json','dist/metadata/nodes.json','dist/metadata/nodes.json.example']) JSON.parse(fs.readFileSync(f,'utf8'));
const manifest=JSON.parse(fs.readFileSync('komari-theme.json','utf8'));
if(manifest.version!=='0.4.3') throw new Error('manifest version must be 0.4.3');
const config=manifest.configuration && manifest.configuration.data || [];
const tz=config.find(x=>x.key==='billingTimeZone');
if(!tz || tz.default!=='Asia/Shanghai') throw new Error('billingTimeZone default missing');
const geo=config.find(x=>x.key==='geoIpProvider');
if(!geo || geo.default!=='ip.sb') throw new Error('GeoIP provider default missing');
const fallback=config.find(x=>x.key==='geoIpFallback');
if(!fallback || fallback.default!==false) throw new Error('GeoIP fallback default must be false');
const html=fs.readFileSync('dist/index.html','utf8');
if(!html.includes('name="line-grid-version" content="0.4.3"')) throw new Error('release version marker missing');
if(!html.includes('Powered by Komari Monitor')) throw new Error('Komari attribution missing');
if(!html.includes('RPC2')) throw new Error('RPC2 integration missing');
if(/(?:src|href)="\.\/(?:js|css)\//.test(html)) throw new Error('release index must be self-contained');
if(/data-inline-(?:src|href|metadata)=/.test(html)) throw new Error('release contains unresolved inline marker');
if(!html.includes('data:image/png;base64,')) throw new Error('release grain image is not inlined');
console.log('json/ui invariants ok');
NODE

./scripts/package.sh >/dev/null
python3 - <<'PY'
import json
from zipfile import ZipFile
version=json.load(open('komari-theme.json'))['version']
name=f'komari-line-grid-v{version}.zip'
required={'komari-theme.json','preview.svg','dist/index.html','dist/css/app.css','dist/js/app.js','dist/js/komari.js','dist/js/enrich.js','dist/admin-reset-editor.html','dist/metadata/nodes.json'}
with ZipFile(name) as z:
    names=set(z.namelist())
    missing=sorted(required-names)
    if missing: raise SystemExit('release missing '+', '.join(missing))
    html=z.read('dist/index.html').decode('utf-8')
    if f'content="{version}"' not in html: raise SystemExit('zip index version mismatch')
print('zip complete')
PY

echo 'all checks passed'
