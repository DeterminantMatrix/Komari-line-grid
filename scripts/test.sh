#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for file in dist/js/*.js scripts/build-release.js scripts/test-adapter.js scripts/test-timezone.js scripts/test-lite.js; do
  node --check "$file"
done
node scripts/test-adapter.js
node scripts/test-timezone.js
node scripts/test-lite.js
node scripts/build-release.js >/dev/null
node scripts/build-release.js --check

node - <<'NODE'
const fs=require('fs');
for(const f of ['Lite-theme.json','komari-theme.json','dist/metadata/nodes.json','dist/metadata/nodes.json.example']) JSON.parse(fs.readFileSync(f,'utf8'));
const lite=JSON.parse(fs.readFileSync('Lite-theme.json','utf8'));
const legacy=JSON.parse(fs.readFileSync('komari-theme.json','utf8'));
if(lite.short!=='line-grid' || legacy.short!=='line-grid') throw new Error('theme short mismatch');
if(lite.version!==legacy.version) throw new Error('Lite/Komari manifest version mismatch');
if(!lite.navigation) throw new Error('Lite navigation missing');
if(lite.navigation.server_detail!=='/node/{uuid}/overview') throw new Error('Lite detail navigation mismatch');
if(lite.navigation.server_network!=='/network/node/{uuid}/ping') throw new Error('Lite network navigation mismatch');
if(lite.navigation.ping_task_parameter!=='ping_task') throw new Error('Lite ping task parameter mismatch');
if(String(lite.navigation.server_detail).includes('#') || String(lite.navigation.server_network).includes('#')) throw new Error('Lite navigation must not use fragments');
const forbiddenTrafficKeys=new Set(['trafficResetDay','billingTimeZone','trafficResetOverrides']);
for(const [name,manifest] of [['Lite',lite],['legacy',legacy]]) {
  const cfg=manifest.configuration && manifest.configuration.data || [];
  const found=cfg.filter(x=>x && forbiddenTrafficKeys.has(x.key)).map(x=>x.key);
  if(found.length) throw new Error(name+' manifest must not own traffic-cycle settings: '+found.join(','));
  if(cfg.some(x=>String(x && x.type || '').toLowerCase()==='textbox' && JSON.stringify(x).includes('admin-reset-editor'))) {
    throw new Error(name+' manifest still embeds the reset editor');
  }
}
if(fs.existsSync('dist/admin-reset-editor.html')) throw new Error('theme-owned traffic reset editor must be removed');
const liteConfig=lite.configuration && lite.configuration.data || [];
const offline=liteConfig.find(x=>x.key==='offlineServerPosition');
if(!offline || offline.default!=='Keep') throw new Error('Lite default node order must preserve backend order');
const geo=liteConfig.find(x=>x.key==='geoIpProvider');
if(!geo || geo.default!=='ip.sb') throw new Error('GeoIP provider default missing');
const fallback=liteConfig.find(x=>x.key==='geoIpFallback');
if(!fallback || fallback.default!==false) throw new Error('GeoIP fallback default must be false');
const liteShim=fs.readFileSync('dist/js/lite.js','utf8');
for(const token of ['navigationHashFromPath','normalizeNavigationPath','ping_task','data-latency-target','Line Grid · Komari / Lite','setTextIfChanged','applyLiteNodeMetadata','liteDisplayWindow']) {
  if(!liteShim.includes(token)) throw new Error('Lite compatibility shim missing '+token);
}
for(const forbidden of ['trafficResetOverrides','trafficResetDay','admin-reset-editor','admin:editClient']) {
  if(liteShim.includes(forbidden)) throw new Error('Lite runtime reintroduced theme-owned traffic reset state: '+forbidden);
}
if(/traffic-forecast[\s\S]{0,180}\.hidden\s*=\s*true/.test(liteShim)) throw new Error('Lite runtime must not hide Traffic forecast UI');
if(/quota-reset[\s\S]{0,180}\.hidden\s*=\s*true/.test(liteShim)) throw new Error('Lite runtime must not hide reset countdown UI');
const api=fs.readFileSync('dist/js/api.js','utf8');
for(const forbidden of ['KomariAdapt.billingWindow','trafficResetOverrides','billing_timezone = \'Asia/Shanghai\'']) {
  if(api.includes(forbidden)) throw new Error('Lite API path still owns traffic-cycle semantics: '+forbidden);
}
const html=fs.readFileSync('dist/index.html','utf8');
if(!html.includes(`name="line-grid-version" content="${lite.version}"`)) throw new Error('release version marker missing');
if(!html.includes('<title>Line Grid</title>')) throw new Error('neutral Line Grid title missing');
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
version=json.load(open('Lite-theme.json'))['version']
name=f'komari-line-grid-v{version}.zip'
required={'Lite-theme.json','komari-theme.json','preview.svg','dist/index.html','dist/css/app.css','dist/js/app.js','dist/js/komari.js','dist/js/enrich.js','dist/js/lite.js','dist/metadata/nodes.json'}
with ZipFile(name) as z:
    names=set(z.namelist())
    missing=sorted(required-names)
    if missing: raise SystemExit('release missing '+', '.join(missing))
    if 'dist/admin-reset-editor.html' in names: raise SystemExit('release must not ship a theme-owned reset editor')
    lite=json.loads(z.read('Lite-theme.json'))
    legacy=json.loads(z.read('komari-theme.json'))
    if lite['short'] != legacy['short']: raise SystemExit('zip manifest short mismatch')
    if '#' in lite['navigation']['server_detail'] or '#' in lite['navigation']['server_network']:
        raise SystemExit('zip Lite navigation contains fragment')
    html=z.read('dist/index.html').decode('utf-8')
    if f'content="{version}"' not in html: raise SystemExit('zip index version mismatch')
print('zip complete')
PY

echo 'all checks passed'
