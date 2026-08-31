#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for file in dist/js/*.js scripts/build-release.js scripts/slim-app.js scripts/test-adapter.js scripts/test-lite.js; do
  node --check "$file"
done
node scripts/test-adapter.js
node scripts/test-lite.js
node scripts/build-release.js >/dev/null
node scripts/build-release.js --check

node - <<'NODE'
const fs=require('fs');
for(const f of ['Lite-theme.json','dist/metadata/nodes.json','dist/metadata/nodes.json.example']) JSON.parse(fs.readFileSync(f,'utf8'));
if(fs.existsSync('komari-theme.json')) throw new Error('v0.5.1+ must be Lite-only; komari-theme.json must not exist');
if(fs.existsSync('dist/js/komari.js')) throw new Error('legacy Komari adapter must be removed');
if(!fs.existsSync('dist/js/lite-adapter.js')) throw new Error('Lite adapter missing');
const lite=JSON.parse(fs.readFileSync('Lite-theme.json','utf8'));
if(lite.short!=='line-grid') throw new Error('theme short mismatch');
if(lite.version!=='0.5.1') throw new Error('Lite-only development branch must be v0.5.1');
if(!lite.navigation) throw new Error('Lite navigation missing');
if(lite.navigation.server_detail!=='/node/{uuid}/overview') throw new Error('Lite detail navigation mismatch');
if(lite.navigation.server_network!=='/network/node/{uuid}/ping') throw new Error('Lite network navigation mismatch');
if(lite.navigation.ping_task_parameter!=='ping_task') throw new Error('Lite ping task parameter mismatch');
if(String(lite.navigation.server_detail).includes('#') || String(lite.navigation.server_network).includes('#')) throw new Error('Lite navigation must not use fragments');
const forbiddenTrafficKeys=new Set(['trafficResetDay','billingTimeZone','trafficResetOverrides']);
const cfg=lite.configuration && lite.configuration.data || [];
const found=cfg.filter(x=>x && forbiddenTrafficKeys.has(x.key)).map(x=>x.key);
if(found.length) throw new Error('Lite manifest must not own traffic-cycle settings: '+found.join(','));
if(cfg.some(x=>String(x && x.type || '').toLowerCase()==='textbox' && JSON.stringify(x).includes('admin-reset-editor'))) throw new Error('Lite manifest still embeds the reset editor');
if(fs.existsSync('dist/admin-reset-editor.html')) throw new Error('theme-owned traffic reset editor must be removed');
const offline=cfg.find(x=>x.key==='offlineServerPosition');
if(!offline || offline.default!=='Keep') throw new Error('Lite default node order must preserve backend order');
const geo=cfg.find(x=>x.key==='geoIpProvider');
if(!geo || geo.default!=='ip.sb') throw new Error('GeoIP provider default missing');
const fallback=cfg.find(x=>x.key==='geoIpFallback');
if(!fallback || fallback.default!==false) throw new Error('GeoIP fallback default must be false');

const adapter=fs.readFileSync('dist/js/lite-adapter.js','utf8');
for(const token of ['global.LiteAdapt','effective_traffic_limit','effective_traffic_type','lite_native_period','mergeMetricTraffic']) {
  if(!adapter.includes(token)) throw new Error('Lite adapter missing '+token);
}
for(const forbidden of ['trafficResetOverrides','trafficResetDay','billingWindow(','linegrid:return:','mergeTrafficHistory','global.KomariAdapt']) {
  if(adapter.includes(forbidden)) throw new Error('Lite adapter contains legacy logic: '+forbidden);
}

const liteShim=fs.readFileSync('dist/js/lite.js','utf8');
for(const token of ['navigationHashFromPath','normalizeNavigationPath','normalizeLegacyReturnHash','ping_task','data-latency-target','setTextIfChanged','applyLiteDisplayWindows','liteDisplayWindow','removeLegacyReturnUI','Line Grid · Lite']) {
  if(!liteShim.includes(token)) throw new Error('Lite runtime bridge missing '+token);
}
for(const forbidden of ['trafficResetOverrides','trafficResetDay','admin-reset-editor','admin:editClient','applyLiteNodeMetadata','sortLiteServers',"rpc('common:getNodes'"]) {
  if(liteShim.includes(forbidden)) throw new Error('Lite runtime contains redundant/legacy logic: '+forbidden);
}
if(/traffic-forecast[\s\S]{0,180}\.hidden\s*=\s*true/.test(liteShim)) throw new Error('Lite runtime must not hide Traffic forecast UI');
if(/quota-reset[\s\S]{0,180}\.hidden\s*=\s*true/.test(liteShim)) throw new Error('Lite runtime must not hide reset countdown UI');

const api=fs.readFileSync('dist/js/api.js','utf8');
if(!api.includes('LiteAdapt.snapshot')) throw new Error('API does not use Lite adapter');
for(const forbidden of ['KomariAdapt','applyLiteNativeSemantics','restoreLiteNativePeriod','mergeTrafficHistory','admin:getClient','admin:editClient','saveReturnRoutes','linegrid:return:']) {
  if(api.includes(forbidden)) throw new Error('Lite API path contains legacy/admin write logic: '+forbidden);
}
for(const required of ['common:getNodes','common:getNodesLatestStatus','common:getPublicInfo','common:getRecords','public:queryMetrics','common:getMe']) {
  if(!api.includes(required)) throw new Error('Lite API path missing '+required);
}

const source=fs.readFileSync('src/index.html','utf8');
if(!source.includes('dist/js/lite-adapter.js') || source.includes('dist/js/komari.js')) throw new Error('source index adapter wiring is not Lite-only');
const html=fs.readFileSync('dist/index.html','utf8');
if(!html.includes(`name="line-grid-version" content="${lite.version}"`)) throw new Error('release version marker missing');
if(!html.includes('<title>Line Grid</title>')) throw new Error('Line Grid title missing');
if(!html.includes('RPC2')) throw new Error('RPC2 integration missing');
if(/(?:src|href)="\.\/(?:js|css)\//.test(html)) throw new Error('release index must be self-contained');
if(/data-inline-(?:src|href|metadata)=/.test(html)) throw new Error('release contains unresolved inline marker');
if(!html.includes('data:image/png;base64,')) throw new Error('release grain image is not inlined');
for(const forbidden of ['linegrid:return:','line-grid-return-routes-v1','data-route-','saveReturnRoutes','三网回程','保存到 Komari','Powered by Komari Monitor','连接 Komari','Komari 数据读取失败','按 Komari 历史记录']) {
  if(html.includes(forbidden)) throw new Error('shipped Lite runtime still contains legacy Return/Komari UI: '+forbidden);
}
if(!html.includes('Line Grid · Lite')) throw new Error('Lite-only runtime attribution missing');
console.log('Lite-only json/ui invariants ok');
NODE

./scripts/package.sh >/dev/null
python3 - <<'PY'
import json
from zipfile import ZipFile
version=json.load(open('Lite-theme.json'))['version']
name=f'komari-line-grid-v{version}.zip'
required={'Lite-theme.json','preview.svg','dist/index.html'}
with ZipFile(name) as z:
    names=set(z.namelist())
    missing=sorted(required-names)
    if missing: raise SystemExit('release missing '+', '.join(missing))
    extras=sorted(names-required)
    if extras: raise SystemExit('Lite-only release contains redundant files: '+', '.join(extras))
    if 'komari-theme.json' in names: raise SystemExit('Lite-only release must not ship komari-theme.json')
    lite=json.loads(z.read('Lite-theme.json'))
    if '#' in lite['navigation']['server_detail'] or '#' in lite['navigation']['server_network']:
        raise SystemExit('zip Lite navigation contains fragment')
    html=z.read('dist/index.html').decode('utf-8')
    if f'content="{version}"' not in html: raise SystemExit('zip index version mismatch')
    if 'data-inline-src=' in html or 'data-inline-href=' in html or 'data-inline-metadata=' in html:
        raise SystemExit('zip index is not self-contained')
    for forbidden in ('linegrid:return:','line-grid-return-routes-v1','data-route-','saveReturnRoutes','三网回程','保存到 Komari'):
        if forbidden in html: raise SystemExit('zip runtime contains legacy Return code: '+forbidden)
print('Lite-only minimal zip complete')
PY

echo 'all checks passed'
