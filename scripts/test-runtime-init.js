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
console.log('runtime initialization smoke test passed');
