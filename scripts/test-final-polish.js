#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { slimApp } = require('./slim-app');
const { slimDemo } = require('./slim-demo');
const { slimCss } = require('./slim-css');
const { fixApp } = require('./runtime-fixes');
const { fixAppTimeAxis } = require('./time-axis-fix');
const { refineLatency } = require('./refine-v051-latency');
const { refineApp } = require('./refine-v051-app');
const { refineAppVisual, refineCssVisual } = require('./refine-v051-visual');
const { refineCss } = require('./refine-v051-runtime');
const { refineFinalApp, refineFinalCss } = require('./refine-v051-final');
const { refineDeadCodeApp } = require('./refine-v051-deadcode');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

let app = refineLatency(fixAppTimeAxis(fixApp(slimDemo(slimApp(fs.readFileSync('dist/js/app.js', 'utf8'))))));
app = app
  .replace(/Powered by Komari Monitor/g, 'Line Grid · Lite')
  .replace(/Line Grid · Komari \/ Lite/g, 'Line Grid · Lite')
  .replace(/Komari RPC2/g, 'Lite RPC2')
  .replace(/komari-rpc2/g, 'lite-rpc2')
  .replace(/Komari/g, 'Lite');
app = refineDeadCodeApp(refineFinalApp(refineAppVisual(refineApp(app))));

for (const required of [
  'function anomalyDetails(server)',
  "key: 'resource'",
  'function anomalyBadgeHTML(server)',
  'node-alert is-',
  '高资源 ',
  'function financeSummaryHTML(rows, masked)',
  '月均总计',
  '年化预算',
  '剩余价值',
  '到期风险',
  '原始账单',
  'expiry-cell',
  'slab-grid slab-grid-final',
  'VPS / 地区 / ASN / 服务商'
]) assert(app.includes(required), 'final app polish missing: ' + required);

for (const forbidden of [
  'function nfmt(',
  'function monthlyCostText(',
  'function expiryShortText(',
  'function hexToRgba(',
  'function parseColor(',
  'const HOMES =',
  'const CYCLE ='
]) assert(!app.includes(forbidden), 'proven-dead runtime code survived: ' + forbidden);

const css = refineFinalCss(refineCssVisual(refineCss(slimCss(fs.readFileSync('dist/css/app.css', 'utf8')))));
for (const required of [
  '.finance-summary',
  '.node-alert.is-bad',
  '.slab-grid-final',
  '.spec article:nth-last-child(-n+4)',
  '.page-ping .targets',
  '.page-traffic .day-grid',
  '.page-system .spec'
]) assert(css.includes(required), 'final CSS polish missing: ' + required);

console.log('final v0.5.1 polish checks passed');
