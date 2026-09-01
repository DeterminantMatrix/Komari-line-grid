#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
node --check src/app.js; node --check src/native-data.js; node --check scripts/build-release.js; node scripts/test-runtime-init.js; node scripts/test-rpc-batch.js; node scripts/build-release.js >/dev/null; node scripts/build-release.js --check >/dev/null
node - <<'NODE'
const fs=require('fs'), m=JSON.parse(fs.readFileSync('Lite-theme.json','utf8')), s=fs.readFileSync('src/app.js','utf8'), n=fs.readFileSync('src/native-data.js','utf8'), c=fs.readFileSync('src/style.css','utf8'), h=fs.readFileSync('dist/index.html','utf8');
if(!/^\d+\.\d+\.\d+$/.test(m.version)||!h.includes(`name="line-grid-version" content="${m.version}"`)) throw new Error('version mismatch');
for(const p of ['dist/js','dist/css','dist/img','dist/metadata']) if(fs.existsSync(p)) throw new Error('legacy tree '+p);
if(fs.existsSync('src/correctness.js')) throw new Error('temporary correctness layer still present');
for(const t of ['ProbeConfig','LINE_GRID_METADATA','loadMetadata(','metadataFor(','query.get(\'api\')','ProbeDemo']) if(s.includes(t)) throw new Error('legacy '+t);
if(!s.includes("function rpcUrl() {\n    return '/api/rpc2';")) throw new Error('RPC2 path');
if(!s.includes('function rpcBatch(calls, timeoutMs)')||!s.includes('fetchBootstrap: fetchBootstrap')) throw new Error('RPC batch API missing');
if(!n.includes('function runBatch(calls, timeoutMs)')||!n.includes('originalRpcBatch')) throw new Error('native RPC batch reuse missing');
if(!s.includes('function patchDOMNode(current, next)')||!s.includes('function patchElementFromHTML(current, html)')||!s.includes('function patchInnerHTML(target, html)')) throw new Error('DOM patch helpers missing');
if(!s.includes('if (domPatchActive) patchInnerHTML(main, html)')||!s.includes('patchInnerHTML(winBody')||!s.includes('patchInnerHTML(foot')) throw new Error('DOM patch coverage missing');
if(s.includes('el.outerHTML = nodeMarkup(view, item)')||s.includes('fleet.outerHTML = fleetStrip()')) throw new Error('live subtree replacement regression');
if(!s.includes("server.online ? fmtDays(server.uptime) : lastSeenText(server)")) throw new Error('display-level live signature missing');
const idleStart=s.indexOf('(function startGlobeIdle()'); const bootStart=s.indexOf('function boot()', idleStart); const idle=idleStart>=0&&bootStart>idleStart?s.slice(idleStart,bootStart):'';
if(!idle.includes('setTimeout(tick')||idle.includes('requestAnimationFrame(frame)')||!idle.includes('globeViewportReady()')||!idle.includes('schedule(500)')) throw new Error('Globe idle scheduler regression');
const ap=[...s.matchAll(/[\"'](\/api\/[^\"']+)/g)].map(x=>x[1]); if(ap.some(x=>x!='/api/rpc2')) throw new Error('unexpected API');
for(const t of ['common:getNodes','common:getNodesLatestStatus','common:getPublicInfo','common:getRecords','public:queryMetrics','const SYSTEM_HISTORY_TTL_MS = 90000','Date.now() - cached.at < SYSTEM_HISTORY_TTL_MS','globe-selected-ring','globe-selected-core']) if(!(s+c).includes(t)) throw new Error('missing '+t);
for(const t of [
  "public:getMe",
  "public:getPublicPingTasks",
  "public:getPingMetricStats",
  "'ping.latency_ms'",
  "'ping.loss'",
  "'cpu.usage'",
  "'memory.used'",
  "'disk.used'",
  "admin:getBillingServers",
  "maxCount: -1",
  "originalMergePingHistory",
  "shanghaiDayOfMonth",
  "common:getNodesLatestStatus', { compact: true }",
  "version: '0.6.5'"
]) if(!n.includes(t)) throw new Error('missing native data guard '+t);
if(!n.includes("return originalFetchSeries.call(api, uuid, range, target);")) throw new Error('native Ping fallback arguments');
if(n.includes('liveAt > metricAt') || n.includes('keepNewerLive')) throw new Error('node status timestamp must not gate Metric Store Ping refresh');
if(!n.includes('Metric Store is the primary Ping source here.')) throw new Error('native Ping authority guard missing');
if(!n.includes('function pingLatencyPoints(latencySeries, lossSeries)')||!n.includes("metric_keys: ['ping.latency_ms', 'ping.loss']")||!n.includes('lossValue > 0')) throw new Error('Ping loss gap guard missing');
if(!n.includes("payload._billing_source = 'lite-native'")) throw new Error('Lite Billing source missing');
for(const t of ['public:getPingMetricStats','public:getPublicPingTasks','cpu.usage','admin:getBillingServers','LineGridNativeData']) if(!h.includes(t)) throw new Error('native data layer not inlined: '+t);
if(h.includes('correctness.js')) throw new Error('stale correctness script in release');
if(/<link[^>]+fonts\.(?:googleapis|gstatic)\.com/i.test(h)||!s.includes('https://fonts.googleapis.com/css2?family=')||!c.includes('html[data-font-mode="system"]')) throw new Error('font mode');
const startup=s.slice(s.lastIndexOf('function boot()')); if(!startup.includes('ProbeAPI.fetchBootstrap')||!startup.includes('Promise.allSettled(hydrationTasks)')||!startup.includes('DOMContentLoaded')||startup.includes('loadSystemHistory(')) throw new Error('batched lazy startup missing');
if(/data-inline-(?:src|href)=/.test(h)||/(?:src|href)="\.\/(?:app\.(?:js|css)|native-data\.js|src\/)/.test(h)||!h.includes('data:image/png;base64,')) throw new Error('not self-contained');
if(/电信\|telecom|移动\|mobile|联通\|unicom/.test(s.slice(s.indexOf('function multiSpark'), s.indexOf('function ruler', s.indexOf('function multiSpark')) > -1 ? s.indexOf('function ruler', s.indexOf('function multiSpark')) : s.length))) throw new Error('ping color tied to provider label');
if(!s.includes("const palette = ['#e2ad45', '#58a6ff', '#e06c75', '#65c18c', '#b48ead', '#d08770'];")) throw new Error('multi-series palette');
if(!s.includes('const palette = ["#e2ad45", "#58a6ff", "#e06c75", "#65c18c", "#b48ead", "#d08770"];')) throw new Error('single-series palette');
if(!s.includes('if (key === "latency") { const v = pingMs(server); return v == null ? null : v; }')) throw new Error('latency null sentinel');
if(!s.includes('return aMissing ? 1 : -1;')) throw new Error('latency missing-last sort');
console.log('Lite-native runtime checks passed');
NODE
python3 - <<'PY'
import os
p='preview.webp'
data=open(p,'rb').read(12)
assert data[:4] == b'RIFF' and data[8:12] == b'WEBP', 'preview is not WebP'
size=os.path.getsize(p)
assert 10_000 <= size <= 500_000, f'preview size out of range: {size} bytes'
print(f'preview guard ok: {size} bytes')
PY
./scripts/package.sh >/dev/null
python3 - <<'PY'
import json
from zipfile import ZipFile
v=json.load(open('Lite-theme.json'))['version']; n=f'komari-line-grid-v{v}.zip'; req={'Lite-theme.json','preview.webp','dist/index.html'}
with ZipFile(n) as z:
    assert set(z.namelist())==req
    html=z.read('dist/index.html').decode()
    assert f'content="{v}"' in html
    assert 'LineGridNativeData' in html
print('minimal release package ok')
PY
echo 'all checks passed'
