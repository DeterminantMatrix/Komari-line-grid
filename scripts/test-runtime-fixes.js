#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const { slimApp } = require('./slim-app');
const { slimDemo } = require('./slim-demo');
const { fixApp, fixCharts, fixAdapter, fixLite } = require('./runtime-fixes');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const app = fixApp(slimDemo(slimApp(fs.readFileSync('dist/js/app.js', 'utf8'))));
assert(app.includes('value < 86400'), 'uptime formatter did not become numeric-safe');
assert(!app.includes('sec / U.DAY'), 'NaN-prone uptime formatter survived');
assert(app.includes('idleMs: 64'), 'Medium globe redraw cadence not fixed');
assert(app.includes('dt * 0.0075'), 'globe rotation speed not fixed');
assert(app.includes('无限流量，无需额度预测'), 'unlimited traffic forecast copy missing');
assert(app.includes('!limit ? "无限流量"'), 'unlimited node reset label is not explicit');
assert(app.includes('无限流量 · 不设重置'), 'unlimited traffic cycle semantics missing');
assert(app.includes("unlimitedTraffic ? '不重置'"), 'unlimited traffic cycle card is not explicit');
assert(!app.includes('无限额'), 'obsolete unlimited-quota wording survived');
assert(app.includes("'已有 ' + ctx.last7.length + ' 天历史'"), 'traffic history count label missing');
assert(app.includes('["IPv4", s.ipv4 || "—"]'), 'System page still masks backend-authorized IPv4');
assert(app.includes('class="node-ip"'), 'node list IP display missing');
assert(app.includes('? ("运行 " + fmtDays(s.uptime))'), 'detail uptime wording not fixed');
assert(!app.includes('function maskIP('), 'redundant theme IP masker survived');

const adapterSource = fixAdapter(fs.readFileSync('dist/js/lite-adapter.js', 'utf8'));
const adapterSandbox = { window: {}, console, Date, Math, JSON, Number, String, Object, Array, RegExp, Map };
vm.createContext(adapterSandbox);
vm.runInContext(adapterSource, adapterSandbox, { filename: 'lite-adapter.fixed.js' });
const L = adapterSandbox.window.LiteAdapt;
const adminSnap = L.snapshot({
  n: { uuid: 'n', name: 'N', ipv4: '203.1.2.3', ipv6: '2001:4860:4860::8888', weight: 1, created_at: '2026-01-01T00:00:00Z' },
}, {
  n: { online: true, uptime: 90061, connections: 13, connections_udp: 3, net_total_up: 1, net_total_down: 2, ping: {} },
}, {}, {});
const admin = adminSnap.servers[0];
assert(admin.ipv4 === '203.1.2.3', 'admin IPv4 was re-masked by theme');
assert(admin.ipv6 === '2001:4860:4860::8888', 'admin IPv6 was re-masked by theme');
assert(admin.uptime === 90061, 'Lite uptime was not preserved');
assert(admin.connections_tcp === 10 && admin.connections_udp === 3, 'TCP/UDP connection split is incorrect');
const guestSnap = L.snapshot({
  g: { uuid: 'g', name: 'G', ipv4: '203.*.*.*', weight: 1, created_at: '2026-01-01T00:00:00Z' },
}, {}, {}, {});
assert(guestSnap.servers[0].ipv4 === '203.*.*.*', 'backend guest mask must be preserved verbatim');

const chartSource = fixCharts(fs.readFileSync('dist/js/charts.js', 'utf8'));
const chartSandbox = {
  window: {},
  document: { documentElement: { getAttribute() { return 'dark'; } } },
  getComputedStyle() { return { getPropertyValue() { return ''; } }; },
  Number, Math, String, Object, Array, RegExp, Date,
};
vm.createContext(chartSandbox);
vm.runInContext(chartSource, chartSandbox, { filename: 'charts.fixed.js' });
const svg = chartSandbox.window.ProbeCharts.bars([{ total: 100, date: '08-31' }], { w: 960, h: 220 });
const widthMatch = svg.match(/width="([0-9.]+)"/);
const xMatch = svg.match(/x="([0-9.]+)"/);
assert(widthMatch && Number(widthMatch[1]) <= 56.01, 'single traffic bar is still too wide');
assert(xMatch && Number(xMatch[1]) > 800, 'single recent traffic day should occupy the rightmost 7-day slot');

const lite = fixLite(fs.readFileSync('dist/js/lite.js', 'utf8'));
assert(!lite.includes('Lite 后端 · 当前账期'), 'obsolete traffic source copy survived');
assert(!lite.includes('normalizeLiteTrafficUI'), 'obsolete traffic DOM rewrite survived');
assert(!lite.includes('setTextIfChanged'), 'obsolete traffic text mutation helper survived');

console.log('screenshot regression fixes passed');
