#!/usr/bin/env bash
set -euo pipefail

node --check dist/js/charts.js
node --check dist/js/komari-api.js
node --check dist/js/app.js
node scripts/test-api.js

node - <<'NODE'
const fs=require('fs');
for(const f of ['komari-theme.json','dist/metadata/nodes.json','dist/metadata/nodes.json.example']) JSON.parse(fs.readFileSync(f,'utf8'));
const html=fs.readFileSync('dist/index.html','utf8');
for(const ref of ['./css/app.css','./js/charts.js','./js/komari-api.js','./js/app.js']) if(!html.includes(ref)) throw new Error('missing '+ref);
const app=fs.readFileSync('dist/js/app.js','utf8');
if(!app.includes('layoutGlobeLabels')) throw new Error('globe collision layout missing');
if(!app.includes('patchLiveDOM')) throw new Error('incremental live patching missing');
if(!app.includes('Powered by Komari Monitor')) throw new Error('Komari attribution missing');
if(/setInterval\([^\n]*render\s*,\s*2000/.test(app)) throw new Error('2s full render regression');
const api=fs.readFileSync('dist/js/komari-api.js','utf8');
if(!api.includes("year >= 2100")) throw new Error('sentinel expiry normalization missing');
const snap=api.slice(api.indexOf('function snapshot()'),api.indexOf('function applyLatest'));
if(snap.includes('loadTraffic(')) throw new Error('traffic history must not block initial snapshot');
if(!api.includes("RPC timeout: ")) throw new Error('RPC timeout guard missing');
if(!app.includes('refreshLive();\n      refreshTraffic();')) throw new Error('background refresh bootstrap missing');
if(!app.includes('__KOMARI_LINE_GRID_APP_STARTED__')) throw new Error('startup marker missing');
if(!app.includes('Komari RPC2 适配器未加载')) throw new Error('API startup guard missing');
if(!html.includes('Line Grid 主脚本未启动')) throw new Error('static startup watchdog missing');
console.log('json/ui invariants ok');
NODE

echo 'all checks passed'
