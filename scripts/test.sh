#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
node --check src/app.js; node --check scripts/build-release.js; node scripts/build-release.js >/dev/null; node scripts/build-release.js --check >/dev/null
node - <<'NODE'
const fs=require('fs'), m=JSON.parse(fs.readFileSync('Lite-theme.json','utf8')), s=fs.readFileSync('src/app.js','utf8'), c=fs.readFileSync('src/style.css','utf8'), h=fs.readFileSync('dist/index.html','utf8');
if(!/^\d+\.\d+\.\d+$/.test(m.version)||!h.includes(`name="line-grid-version" content="${m.version}"`)) throw new Error('version mismatch');
for(const p of ['dist/js','dist/css','dist/img','dist/metadata']) if(fs.existsSync(p)) throw new Error('legacy tree '+p);
for(const t of ['ProbeConfig','LINE_GRID_METADATA','loadMetadata(','metadataFor(','query.get(\'api\')','ProbeDemo']) if(s.includes(t)) throw new Error('legacy '+t);
if(!s.includes("function rpcUrl() {\n    return '/api/rpc2';")) throw new Error('RPC2 path');
const ap=[...s.matchAll(/[\"'](\/api\/[^\"']+)/g)].map(x=>x[1]); if(ap.some(x=>x!='/api/rpc2')) throw new Error('unexpected API');
for(const t of ['common:getNodes','common:getNodesLatestStatus','common:getPublicInfo','common:getRecords','public:queryMetrics','common:getMe','const SYSTEM_HISTORY_TTL_MS = 90000','Date.now() - cached.at < SYSTEM_HISTORY_TTL_MS','globe-selected-ring','globe-selected-core','if (globePinned) return;']) if(!(s+c).includes(t)) throw new Error('missing '+t);
if(/<link[^>]+fonts\.(?:googleapis|gstatic)\.com/i.test(h)||!s.includes('https://fonts.googleapis.com/css2?family=')||!c.includes('html[data-font-mode="system"]')) throw new Error('font mode');
const startup=s.slice(s.lastIndexOf('render();\n  ProbeAPI.fetchServers()')); if(!startup.includes('ProbeAPI.fetchServers()')||startup.includes('loadSystemHistory(')) throw new Error('history not lazy');
if(/data-inline-(?:src|href)=/.test(h)||/(?:src|href)="\.\/(?:app\.(?:js|css)|src\/)/.test(h)||!h.includes('data:image/png;base64,')) throw new Error('not self-contained');
console.log('flattened Lite-only runtime checks passed');
NODE
./scripts/package.sh >/dev/null
python3 - <<'PY'
import json
from zipfile import ZipFile
v=json.load(open('Lite-theme.json'))['version']; n=f'komari-line-grid-v{v}.zip'; req={'Lite-theme.json','preview.svg','dist/index.html'}
with ZipFile(n) as z:
    assert set(z.namelist())==req
    assert f'content="{v}"' in z.read('dist/index.html').decode()
print('minimal release package ok')
PY
echo 'all checks passed'
