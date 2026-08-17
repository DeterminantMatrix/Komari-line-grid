const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(__dirname + '/../dist/js/komari-api.js', 'utf8');
const now = new Date();
let metricCalls = 0;

function rpcResult(method) {
  if (method === 'common:getNodes') return {
    'u-1': {
      uuid: 'u-1', name: 'SG-01', weight: 10, cpu_name: 'EPYC', arch: 'x86_64', cpu_cores: 2,
      os: 'Debian', kernel_version: '6.1', region: 'SG', mem_total: 8e9, disk_total: 80e9,
      price: 5, billing_cycle: 30, currency: 'USD', traffic_limit: 1e12,
      traffic_limit_type: 'sum', expired_at: '2027-01-01'
    },
    'u-2': {
      uuid: 'u-2', name: 'Offline', weight: 20, cpu_name: 'Xeon', arch: 'x86_64', cpu_cores: 1,
      os: 'Debian', region: 'HK', mem_total: 1e9, disk_total: 10e9,
      price: -1, billing_cycle: 30, currency: 'USD', traffic_limit: 0,
      expired_at: '2226-08-11'
    }
  };
  if (method === 'common:getNodesLatestStatus') return {
    'u-1': {
      online: true, cpu: 12, ram: 2e9, ram_total: 8e9, disk: 20e9, disk_total: 80e9,
      net_in: 12345, net_out: 6789, net_total_up: 1000, net_total_down: 3000, uptime: 86400,
      ping: { '1': { name: 'Shanghai', latest: 35, avg: 38, loss: 0.5, min: 30, max: 45, tail: 0.1 } }
    }
  };
  if (method === 'common:getPublicInfo') return { sitename: 'Test Komari', description: 'test' };
  if (method === 'public:queryMetrics') return { series: [
    { metric_key: 'traffic.up', entity_id: 'u-1', points: [{ time: now.toISOString(), value: 100 }] },
    { metric_key: 'traffic.down', entity_id: 'u-1', points: [{ time: now.toISOString(), value: 300 }] }
  ] };
  if (method === 'common:getRecords') return { records: [{ task_id: 1, time: now.toISOString(), value: 35 }], tasks: [], basic_info: [] };
  throw new Error('unexpected ' + method);
}

const context = {
  console, URLSearchParams, Date, Number, Math, Promise, setTimeout, clearTimeout,
  window: {},
  fetch: async (url, opt) => {
    if (String(url).includes('metadata/nodes.json')) return {
      ok: true,
      json: async () => ({
        global: { show_globe: true },
        nodes: {
          'u-1': { region_country: 'SG', provider_name: 'Demo', traffic_reset_day: 1, longitude: 103.82, latitude: 1.35 }
        }
      })
    };
    const req = JSON.parse(opt.body);
    if (req.method === 'public:queryMetrics') metricCalls += 1;
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: req.id, result: rpcResult(req.method) }) };
  }
};
context.window.window = context.window;
context.window.fetch = context.fetch;
context.window.Date = Date;
vm.createContext(context);
vm.runInContext(code, context);

context.window.KomariLineGridAPI.snapshot().then(snapshot => {
  assert.equal(snapshot.title, 'Test Komari');
  assert.equal(snapshot.servers.length, 2);
  assert.deepEqual(snapshot.servers.map(node => node.uuid), ['u-1', 'u-2'], 'lower Komari weight must render first');
  assert.equal(metricCalls, 0, 'initial snapshot must not wait for metric history');

  const online = snapshot.servers.find(node => node.uuid === 'u-1');
  assert.equal(online.online, true);
  assert.equal(online.cpu_pct, 12);
  assert.equal(online.provider_name, 'Demo');
  assert.equal(online.longitude, 103.82);
  assert.equal(online.ping[0].current_ms, 35);
  assert.equal(online.traffic_available, true);
  assert.equal(online.traffic_source, 'live_total');
  assert.equal(online.traffic_used_up, 1000);
  assert.equal(online.traffic_used_down, 3000);
  assert.equal(online.traffic_used, 4000);

  const offline = snapshot.servers.find(node => node.uuid === 'u-2');
  assert.equal(offline.online, false);
  assert.equal(offline.has_live, false);
  assert.equal(offline.cpu_pct, null);
  assert.equal(offline.mem_used, null);
  assert.equal(offline.disk_used, null);
  assert.equal(offline.download_speed, null);
  assert.equal(offline.uptime, null);
  assert.equal(offline.expires_at, '');
  assert.equal(offline.renewal_price, null);
  assert.equal(offline.ping.length, 0);
  assert.equal(offline.traffic_available, false);
  assert.equal(offline.traffic_used, null);

  return context.window.KomariLineGridAPI.loadTraffic(snapshot.servers).then(() => snapshot);
}).then(snapshot => {
  assert.equal(metricCalls, 1, 'traffic history should load only after first snapshot');
  const online = snapshot.servers.find(node => node.uuid === 'u-1');
  assert.equal(online.traffic_source, 'metric');
  assert.equal(online.traffic_used, 400);
  assert.equal(online.traffic_used_up, 100);
  assert.equal(online.traffic_used_down, 300);
  return context.window.KomariLineGridAPI.getPingHistory('u-1', 1, 1);
}).then(history => {
  assert.equal(history.records[0].value, 35);
  assert.equal(context.window.KomariLineGridAPI.normalizeExpiry('2226-08-11'), '');
  assert.equal(context.window.KomariLineGridAPI.normalizeExpiry('2027-01-01'), '2027-01-01');
  console.log('api adapter ok');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
