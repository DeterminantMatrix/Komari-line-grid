const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('src/app.js', 'utf8');
const cut = source.indexOf('/* lite.js */');
if (cut < 0) throw new Error('lite runtime marker missing');
const prefix = source.slice(0, cut);
const storage = new Map();
const documentElement = { setAttribute() {}, getAttribute() { return null; }, style: {} };
const document = {
  documentElement,
  readyState: 'complete',
  hidden: false,
  body: { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } },
  getElementById() { return null; },
  createElement() { return { setAttribute() {}, addEventListener() {}, querySelector() { return null; }, classList: { toggle() {} } }; },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  querySelectorAll() { return []; },
};
const context = {
  console,
  document,
  location: { hostname: 'theme.test', origin: 'https://theme.test', pathname: '/', search: '', hash: '' },
  localStorage: {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  },
  matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; },
  fetch() { return Promise.reject(new Error('network disabled in runtime init test')); },
  setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, Map, Set, WeakMap, URL, URLSearchParams, AbortController, Intl, Date, Math, Number, String, Object, Array, JSON, RegExp,
  encodeURIComponent, decodeURIComponent,
  CustomEvent: function CustomEvent() {},
  performance: { now() { return 0; } },
  requestAnimationFrame() { return 0; },
  cancelAnimationFrame() {},
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(prefix, context, { filename: 'src/app.js' });
if (!context.ProbeAPI || typeof context.ProbeAPI.fetchServers !== 'function' || typeof context.ProbeAPI.rpc !== 'function') {
  throw new Error('ProbeAPI runtime initialization failed');
}

function assertOrder(actual, expected, label) {
  const a = actual.map(String).join(',');
  const e = expected.map(String).join(',');
  if (a !== e) throw new Error(label + ': expected ' + e + ', got ' + a);
}
const pingRaw = {
  tasks: [
    { id: 30, name: '沪日IPLC', weight: 0 },
    { id: 99, name: '广港IX', weight: 1 },
    { id: 10, name: '上海电信 V6', weight: 2 },
    { id: 20, name: '上海电信', weight: 3 },
  ],
  records: [
    { client: 'node-1', task_id: 20, time: '2026-09-01T00:00:00Z', value: 76 },
    { client: 'node-1', task_id: 30, time: '2026-09-01T00:00:01Z', value: 28 },
    { client: 'node-1', task_id: 10, time: '2026-09-01T00:00:02Z', value: 51 },
  ],
};
const pingPayload = {
  servers: [{
    uuid: 'node-1', online: true,
    ping: [
      { key: '20', label: '上海电信', current_ms: 76, buckets: [] },
      { key: '10', label: '上海电信 V6', current_ms: 51, buckets: [] },
      { key: '30', label: '沪日IPLC', current_ms: 28, buckets: [] },
    ],
  }],
};
context.LiteAdapt.mergePingHistory(pingPayload, pingRaw);
assertOrder(pingPayload.servers[0].ping.map(p => p.key), ['30', '10', '20'], 'history task order');
const series = context.LiteAdapt.pingSeries(pingRaw, 'node-1', 'all');
assertOrder(series.seriesByTask.map(p => p.key), ['30', '10', '20'], 'series task order');
if (!series.series.length || String(series.series[0].task_id) !== '30') throw new Error('all target did not select first backend-ordered task');
context.LiteAdapt.mergeLatest(pingPayload, {
  'node-1': {
    online: true,
    time: '2026-09-01T00:01:00Z',
    ping: {
      '20': { name: '上海电信', latest: 77, loss: 0 },
      '10': { name: '上海电信 V6', latest: 52, loss: 0 },
      '30': { name: '沪日IPLC', latest: 29, loss: 0 },
    },
  },
});
assertOrder(pingPayload.servers[0].ping.map(p => p.key), ['30', '10', '20'], 'live refresh task order');

console.log('runtime initialization smoke test passed');
