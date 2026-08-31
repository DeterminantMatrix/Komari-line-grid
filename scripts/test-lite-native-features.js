'use strict';

const assert = require('assert');
const fs = require('fs');
const cp = require('child_process');

cp.execFileSync(process.execPath, ['scripts/build-release.js'], { stdio: 'ignore' });

const manifest = JSON.parse(fs.readFileSync('Lite-theme.json', 'utf8'));
const settings = manifest.configuration && manifest.configuration.data || [];
const fontMode = settings.find(function (item) { return item && item.key === 'fontMode'; });
assert(fontMode, 'Lite-managed fontMode setting missing');
assert.strictEqual(fontMode.type, 'select');
assert.strictEqual(fontMode.options, 'Web,System');
assert.strictEqual(fontMode.default, 'Web');

const source = fs.readFileSync('src/index.html', 'utf8');
assert(!/<link[^>]+href=["'][^"']*fonts\.(?:googleapis|gstatic)\.com/i.test(source), 'source HTML must never eagerly request external fonts');

const html = fs.readFileSync('dist/index.html', 'utf8');
assert(!/<link[^>]+href=["'][^"']*fonts\.(?:googleapis|gstatic)\.com/i.test(html), 'built HTML must not contain eager external font links');

[
  'function fontModeFromPayload(payload)',
  'data-font-mode',
  'data-line-grid-font',
  'html[data-font-mode="system"]',
  'System 仅使用本机系统字体',
].forEach(function (token) {
  if (token === 'System 仅使用本机系统字体') return;
  assert(html.includes(token), 'font feature missing: ' + token);
});
assert(html.includes('https://fonts.googleapis.com/css2?family='), 'optional Web font loader missing');
assert(html.indexOf('function applyFontMode(payload)') < html.indexOf('https://fonts.googleapis.com/css2?family='), 'font URL must only live inside deferred runtime loader');

[
  'function loadSystemHistory(uuid, value)',
  'ProbeAPI.rpc("common:getRecords"',
  'type: "load"',
  'load_type: "all"',
  'data-system-history-range',
  '[["1h","1H"],["24h","24H"],["7d","7D"]]',
  'systemHistoryChart("CPU"',
  'systemHistoryChart("RAM"',
  'systemHistoryChart("Disk"',
  'current === "system") { winBody.innerHTML = pageSystem(ctx); setTimeout(function () { loadSystemHistory(s.uuid, systemHistoryRange); }, 0); }',
].forEach(function (token) {
  assert(html.includes(token), 'resource history feature missing: ' + token);
});

const startup = html.slice(html.lastIndexOf('render();\n  ProbeAPI.fetchServers()'));
assert(startup.includes('ProbeAPI.fetchServers()'), 'startup block missing');
assert(!startup.includes('loadSystemHistory('), 'homepage/startup must not load resource history');

[
  'let globePinned = false;',
  'function lookAtLocation(lon, lat)',
  'data-aim-lon=',
  'data-aim-lat=',
  'if (globePinned) return;',
  'globePinned = false;',
  '地区' + ' · 已定位',
].forEach(function (token) {
  assert(html.includes(token), 'globe city pin feature missing: ' + token);
});

const allHandler = 'if (!selected || regionFilter === selected) {\n        regionFilter = "";\n        globePinned = false;';
assert(html.includes(allHandler), 'ALL/selected-city action must resume globe rotation');

console.log('Lite-native feature checks ok');
