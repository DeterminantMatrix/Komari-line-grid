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
console.log('json/ui invariants ok');
NODE

echo 'all checks passed'
