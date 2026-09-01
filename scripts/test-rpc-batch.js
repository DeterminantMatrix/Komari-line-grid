const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('src/app.js', 'utf8');
const start = source.indexOf('/* api.js */');
const cut = source.indexOf('/* lite.js */');
if (start < 0 || cut < 0 || cut <= start) throw new Error('api runtime markers missing');
let fetchCount = 0;
const context = {
  console,
  document: { hidden: false, addEventListener() {}, removeEventListener() {} },
  location: { origin: 'https://theme.test' },
  fetch(url, options) {
    fetchCount += 1;
    const body = JSON.parse(options.body);
    if (!Array.isArray(body)) throw new Error('expected JSON-RPC batch body');
    const resultFor = function (req) {
      if (req.method === 'common:getNodes') return [];
      if (req.method === 'common:getNodesLatestStatus') return {};
      if (req.method === 'common:getPublicInfo') return { sitename: 'Batch Test' };
      if (req.method === 'public:getMe') return { logged_in: true };
      if (req.method === 'public:getPublicPingTasks') return [{ id: 7, name: 'IPLC' }];
      if (req.method === 'alpha') return 'A';
      if (req.method === 'beta') return 'B';
      return null;
    };
    const replies = body.map(req => ({ jsonrpc: '2.0', id: req.id, result: resultFor(req) })).reverse();
    return Promise.resolve({ ok: true, status: 200, json() { return Promise.resolve(replies); } });
  },
  setTimeout, clearTimeout, Promise, Map, Set, WeakMap, AbortController, Intl, Date, Math, Number, String, Object, Array, JSON, RegExp,
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
context.LiteAdapt = { snapshot(nodes, latest, pub) { return { enabled: true, servers: [], _public: pub || {} }; } };
vm.runInContext(source.slice(start, cut), context, { filename: 'src/app.js' });
(async () => {
  const ordered = await context.ProbeAPI.rpcBatch([{ method: 'alpha' }, { method: 'beta' }], 1000);
  if (ordered.join(',') !== 'A,B') throw new Error('batch response order was not restored by request id');
  fetchCount = 0;
  const boot = await context.ProbeAPI.fetchBootstrap();
  if (fetchCount !== 1) throw new Error('bootstrap did not use one HTTP request');
  if (!boot.access || boot.access.logged_in !== true) throw new Error('bootstrap access state missing');
  if (!boot.payload || !Array.isArray(boot.payload._bootstrap_ping_tasks) || boot.payload._bootstrap_ping_tasks[0].id !== 7) throw new Error('bootstrap Ping tasks missing');
  console.log('RPC batch bootstrap test passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
