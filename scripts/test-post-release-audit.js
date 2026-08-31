'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const cp = require('child_process');
const { hardenEnrich } = require('./hardening-v056');

async function testEnrich() {
  const source = hardenEnrich(fs.readFileSync('dist/js/enrich.js', 'utf8'));
  const storage = new Map();
  const context = {
    window: {},
    localStorage: {
      getItem: function (key) { return storage.has(key) ? storage.get(key) : null; },
      setItem: function (key, value) { storage.set(key, String(value)); },
    },
    fetch: async function (url) {
      const text = String(url);
      if (text.indexOf('open.er-api.com') >= 0) {
        return { ok: true, json: async function () { return { rates: { USD: 0.14, EUR: 0.12, HKD: 1.1, GBP: 0.1, SGD: 0.18, KRW: 190, AUD: 0.21 } }; } };
      }
      if (text.indexOf('api.ip.sb') >= 0) {
        return { ok: true, json: async function () { return { latitude: 1.3, longitude: 103.8, city: 'Singapore', country_code: 'SG', asn: 64500, organization: 'Example' }; } };
      }
      return { ok: false, json: async function () { return {}; } };
    },
    AbortController: global.AbortController,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Map: Map,
    Promise: Promise,
    Date: Date,
    Math: Math,
    Number: Number,
    String: String,
    JSON: JSON,
    encodeURIComponent: encodeURIComponent,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const enrich = context.window.LineGridEnrich;
  assert(enrich, 'LineGridEnrich missing');
  assert.strictEqual(enrich.normalizeCurrency('SGD'), 'SGD');
  assert.strictEqual(enrich.normalizeCurrency('KRW'), 'KRW');
  assert.strictEqual(enrich.normalizeCurrency('not-a-code'), '');
  assert.strictEqual(enrich.toCNY(10, 'ZZZ', { CNY: 1 }), null, 'unknown rate must never be treated as CNY');

  const fx = await enrich.getDailyExchangeRates();
  assert.strictEqual(fx.rates.SGD, 0.18, 'dynamic SGD rate must be retained');
  assert.strictEqual(fx.rates.KRW, 190, 'dynamic KRW rate must be retained');
  assert(Math.abs(enrich.toCNY(18, 'SGD', fx.rates) - 100) < 1e-9, 'SGD conversion mismatch');

  const enabled = { enable_ip_geo_asn: true, geo_ip_provider: 'ip.sb', geo_ip_fallback: false, servers: [{ uuid: 'node-1', _lookup_ip: '8.8.8.8', region_city: '' }] };
  await enrich.enrichNodes(enabled);
  assert.strictEqual(enabled.servers[0].region_city, 'Singapore');

  const disabled = { enable_ip_geo_asn: false, servers: [{ uuid: 'node-1', _lookup_ip: '', region_city: '' }] };
  await enrich.enrichNodes(disabled);
  assert.strictEqual(disabled.servers[0].region_city, '', 'disabled GeoIP must not reuse browser cache');
}

function testFinalRuntime() {
  cp.execFileSync(process.execPath, ['scripts/build-release.js'], { stdio: 'ignore' });
  const html = fs.readFileSync('dist/index.html', 'utf8');
  const required = [
    "linegrid:fx:cny:v2",
    "return /^[A-Z]{3}$/.test(s) ? s : '';",
    "lastPayload._ping_history_status = 'unavailable'",
    "{ compact: true }",
    'statusTick % 30 === 0',
    "value.indexOf('.') >= 0",
    'row.monthly != null && Number.isFinite(Number(row.monthly))',
    ".filter(function (value) { return value != null && value !== ''; })",
    'const pings = server && server.online && Array.isArray(server.ping)',
    '状态时间',
    'setInterval(renderFoot, 10000);',
    'const chartPointCache = new WeakMap();',
  ];
  required.forEach(function (token) {
    assert(html.includes(token), 'final runtime missing hardening token: ' + token);
  });
  const forbidden = [
    'setInterval(renderFoot, 1000);',
    "return FX_DEFAULT[s] != null ? s : 'CNY';",
    'if (Number.isFinite(Number(row.monthly)))',
    'let pollHandle = null;',
  ];
  forbidden.forEach(function (token) {
    assert(!html.includes(token), 'final runtime still contains pre-audit behavior: ' + token);
  });

  const enrichStart = html.indexOf('async function enrichNodes(payload)');
  const enrichEnd = html.indexOf('function normalizeCurrency', enrichStart);
  const enrichBody = html.slice(enrichStart, enrichEnd);
  assert(enrichBody.indexOf('payload.enable_ip_geo_asn !== true') < enrichBody.indexOf('payload.servers.forEach'), 'GeoIP disable gate must run before cached enrichment');
}

(async function () {
  await testEnrich();
  testFinalRuntime();
  console.log('post-release audit checks ok');
})().catch(function (error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
