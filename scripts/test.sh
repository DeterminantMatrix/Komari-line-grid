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
for(const f of ['Lite-theme.json','komari-theme.json','dist/metadata/nodes.json','dist/metadata/nodes.json.example']) JSON.parse(fs.readFileSync(f,'utf8'));
const lite=JSON.parse(fs.readFileSync('Lite-theme.json','utf8'));
const legacy=JSON.parse(fs.readFileSync('komari-theme.json','utf8'));
if(lite.short!=='line-grid' || legacy.short!=='line-grid') throw new Error('theme short mismatch');
if(lite.version!==legacy.version) throw new Error('Lite/Komari manifest version mismatch');
if(!lite.navigation || !lite.navigation.server_detail) throw new Error('Lite navigation missing');
const liteConfig=lite.configuration && lite.configuration.data || [];
if(liteConfig.some(x=>x.key==='trafficResetOverrides' || x.key==='billingTimeZone')) throw new Error('Lite manifest must use Lite-native traffic-cycle settings');
const legacyConfig=legacy.configuration && legacy.configuration.data || [];
const tz=legacyConfig.find(x=>x.key==='billingTimeZone');
if(!tz || tz.default!=='Asia/Shanghai') throw new Error('legacy billingTimeZone default missing');
const geo=liteConfig.find(x=>x.key==='geoIpProvider');
if(!geo || geo.default!=='ip.sb') throw new Error('GeoIP provider default missing');
const fallback=liteConfig.find(x=>x.key==='geoIpFallback');
if(!fallback || fallback.default!==false) throw new Error('GeoIP fallback default must be false');
const html=fs.readFileSync('dist/index.html','utf8');
if(!html.includes(`name="line-grid-version" content="${lite.version}"`)) throw new Error('release version marker missing');
if(!html.includes('Powered by Komari Monitor')) throw new Error('legacy attribution missing');
if(!html.includes('RPC2')) throw new Error('RPC2 integration missing');
if(/(?:src|href)="\.\/(?:js|css)\//.test(html)) throw new Error('release index must be self-contained');
if(/data-inline-(?:src|href|metadata)=/.test(html)) throw new Error('release contains unresolved inline marker');
if(!html.includes('data:image/png;base64,')) throw new Error('release grain image is not inlined');
const editor=fs.readFileSync('dist/admin-reset-editor.html','utf8');
for(const token of ['admin:listClients','admin:editClient','traffic_reset_day']) if(!editor.includes(token)) throw new Error('Lite reset editor missing '+token);
for(const forbidden of ['parent.document','/api/admin/theme/settings?theme=line-grid']) if(editor.includes(forbidden)) throw new Error('Lite reset editor still depends on legacy admin DOM/settings: '+forbidden);
console.log('json/ui invariants ok');
NODE

./scripts/package.sh >/dev/null
python3 - <<'PY'
import json
from zipfile import ZipFile
version=json.load(open('Lite-theme.json'))['version']
name=f'komari-line-grid-v{version}.zip'
required={'Lite-theme.json','komari-theme.json','preview.svg','dist/index.html','dist/css/app.css','dist/js/app.js','dist/js/komari.js','dist/js/enrich.js','dist/js/lite.js','dist/admin-reset-editor.html','dist/metadata/nodes.json'}
with ZipFile(name) as z:
    names=set(z.namelist())
    missing=sorted(required-names)
    if missing: raise SystemExit('release missing '+', '.join(missing))
    lite=json.loads(z.read('Lite-theme.json'))
    legacy=json.loads(z.read('komari-theme.json'))
    if lite['short'] != legacy['short']: raise SystemExit('zip manifest short mismatch')
    html=z.read('dist/index.html').decode('utf-8')
    if f'content="{version}"' not in html: raise SystemExit('zip index version mismatch')
    editor=z.read('dist/admin-reset-editor.html').decode('utf-8')
    if 'admin:editClient' not in editor: raise SystemExit('zip reset editor is not Lite-native')
print('zip complete')
PY

echo 'all checks passed'
