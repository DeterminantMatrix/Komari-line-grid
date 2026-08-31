#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const { slimApp } = require('./slim-app');
const { slimDemo } = require('./slim-demo');
const { fixApp, fixCharts } = require('./runtime-fixes');
const { fixAppTimeAxis, fixChartsTimeAxis } = require('./time-axis-fix');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const app = fixAppTimeAxis(fixApp(slimDemo(slimApp(fs.readFileSync('dist/js/app.js', 'utf8')))));
assert(app.includes('function pingWindowDomain()'), 'shared latency time domain missing');
assert(app.includes('opt.domainStart = domain.start'), 'latency charts do not receive fixed domain start');
assert(app.includes('opt.domainEnd = domain.end'), 'latency charts do not receive fixed domain end');
assert(app.includes('t: p && p.t != null ? Number(p.t) : null'), 'cached latency timestamps are discarded');
assert(app.includes('t: b.t'), 'live bucket timestamps are discarded');

const chartSource = fixChartsTimeAxis(fixCharts(fs.readFileSync('dist/js/charts.js', 'utf8')));
const sandbox = {
  window: {},
  document: { documentElement: { getAttribute() { return 'dark'; } } },
  getComputedStyle() { return { getPropertyValue() { return ''; } }; },
  Number, Math, String, Object, Array, RegExp, Date,
};
vm.createContext(sandbox);
vm.runInContext(chartSource, sandbox, { filename: 'charts.time-axis.js' });
const C = sandbox.window.ProbeCharts;

function firstMultiX(svg) {
  const m = svg.match(/class="chart-hit"[^>]*cx="([0-9.]+)"/);
  return m ? Number(m[1]) : NaN;
}

function firstSparkX(svg) {
  const m = svg.match(/data-pts="([^"]+)"/);
  if (!m) return NaN;
  const first = m[1].split(';')[0].split(',')[0];
  return Number(first);
}

const now = Date.parse('2026-08-31T12:00:00Z');
const day = 86400000;
const hour = 3600000;

// A VPS created two days ago must occupy only the rightmost ~2/7 of a 7D chart.
const sevenStart = now - 7 * day;
const recentTwoDays = [
  { t: now - 2 * day, value: 90 },
  { t: now - day, value: 100 },
  { t: now, value: 110 },
];
const multi7 = C.multiSpark([
  { key: '1', label: '上海电信', points: recentTwoDays },
], { w: 960, h: 220, showYAxis: true, showXAxis: true, domainStart: sevenStart, domainEnd: now, xLabels: ['08-24', '08-28', '08-31'] });
const multi7x = firstMultiX(multi7);
assert(Number.isFinite(multi7x) && multi7x > 650, '7D multi-series data was stretched to the left edge instead of preserving five empty days');

const spark7 = C.spark(recentTwoDays.map((p) => ({ v: p.value, t: p.t })), { w: 960, h: 220, showYAxis: true, showXAxis: true, domainStart: sevenStart, domainEnd: now, xLabels: ['08-24', '08-28', '08-31'] });
const spark7x = firstSparkX(spark7);
assert(Number.isFinite(spark7x) && spark7x > 650, '7D single-series data was stretched to the left edge instead of preserving five empty days');

// The same rule applies to 24H: two hours of data belong at the far right, not across the whole day.
const dayStart = now - 24 * hour;
const recentTwoHours = [
  { t: now - 2 * hour, value: 40 },
  { t: now - hour, value: 42 },
  { t: now, value: 41 },
];
const multi24 = C.multiSpark([
  { key: '1', label: '上海电信', points: recentTwoHours },
], { w: 960, h: 220, showYAxis: true, showXAxis: true, domainStart: dayStart, domainEnd: now, xLabels: ['12:00', '00:00', '12:00'] });
assert(firstMultiX(multi24) > 850, '24H sparse history was stretched across the full day');

// Without an explicit domain, generic charts retain their historical data-bound behavior.
const generic = C.multiSpark([
  { key: '1', label: 'generic', points: recentTwoDays },
], { w: 960, h: 220, showYAxis: true, showXAxis: true });
assert(firstMultiX(generic) < 100, 'generic multiSpark behavior unexpectedly changed without a fixed domain');

console.log('truthful latency time-axis tests passed');
