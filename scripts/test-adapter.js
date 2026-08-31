#!/usr/bin/env node
'use strict';
const fs = require('fs');
const vm = require('vm');
const { fixAdapter } = require('./runtime-fixes');
const { refineAdapter } = require('./refine-v051');

const source = refineAdapter(fixAdapter(fs.readFileSync('dist/js/lite-adapter.js', 'utf8')));
const sandbox = { window: {}, console, Date, Math, JSON, Number, String, Object, Array, RegExp, Map };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'lite-adapter.js' });
const L = sandbox.window.LiteAdapt;
if (!L) throw new Error('LiteAdapt missing');

const nodes = {
  b: {
    uuid: 'b', name: 'B', region: 'JP', weight: 1, created_at: '2026-01-02T00:00:00Z',
    traffic_limit: 999, effective_traffic_limit: 100000, traffic_limit_type: 'sum', effective_traffic_type: 'sum',
    traffic_reset_day: 21, tags: 'linegrid:return:telecom=163', mem_total: 1000, swap_total: 500, disk_total: 2000,
    cpu_cores: 1, cpu_physical_cores: 1,
  },
  a: {
    uuid: 'a', name: 'A', region: 'US', weight: 1, created_at: '2026-01-01T00:00:00Z',
    traffic_limit: 50000, effective_traffic_limit: 80000, traffic_limit_type: 'up', effective_traffic_type: 'max',
    traffic_reset_day: 3, mem_total: 1000, swap_total: 500, disk_total: 2000,
    cpu_cores: 1, cpu_physical_cores: 1,
  },
};
const latest = {
  a: {
    online: true, time: '2026-08-31T00:00:00Z', net_total_up: 9000, net_total_down: 8000,
    cpu: 2, ram: 10, ram_total: 14000, swap: 5, swap_total: 4000, disk: 20, disk_total: 50000,
    net_in: 30, net_out: 40, uptime: 1234, connections: 9, connections_udp: 2, ping: {},
  },
  b: {
    online: true, time: '2026-08-31T00:00:00Z', net_total_up: 100, net_total_down: 200,
    cpu: 3, ram: 11, ram_total: 12000, swap: 6, swap_total: 3000, disk: 21, disk_total: 40000,
    net_in: 31, net_out: 41, uptime: 2345, connections: 5, connections_udp: 1, ping: {},
  },
};
const snap = L.snapshot(nodes, latest, {
  sitename: 'Lite Test',
  theme_settings: { offlineServerPosition: 'Keep', showGlobe: true, globeQuality: 'Medium', geoIpProvider: 'ip.sb', geoIpFallback: false },
}, {
  nodes: { a: { region_city: 'San Jose', longitude: -121.8, latitude: 37.3, provider_name: 'Provider A' } },
});

if (snap._runtime !== 'lite' || snap._source !== 'lite-rpc2') throw new Error('Lite runtime/source markers missing');
if (snap.title !== 'Lite Test') throw new Error('Lite site title missing');
if (snap.offline_server_position !== 'Keep') throw new Error('Lite offline order setting missing');
if (snap.servers.map((s) => s.uuid).join(',') !== 'a,b') throw new Error('Lite weight/created_at/uuid order mismatch');

const a = snap.servers[0];
if (a.traffic_limit !== 80000 || a.traffic_limit_type !== 'max') throw new Error('effective Lite quota not used');
if (a.traffic_used_up !== 9000 || a.traffic_used_down !== 8000 || a.traffic_used !== 9000) throw new Error('Lite calibrated current-cycle totals not used');
if (a.traffic_lifetime != null) throw new Error('Lite current-cycle counters must not be labeled lifetime');
if (a.region_city !== 'San Jose' || a.provider_name !== 'Provider A') throw new Error('display-only metadata missing');
if (a.period_start != null || a.period_end != null) throw new Error('adapter must not invent Lite cycle boundaries');
if (a.return_routes.length !== 0) throw new Error('Lite adapter must ignore legacy Return tags/metadata');
if (a.mem_total !== 14000 || a.swap_total !== 4000 || a.disk_total !== 50000) throw new Error('live Agent hardware totals must override stale Client totals');
if (a.mem_used !== 10 || a.disk_used !== 20 || a.cpu_pct !== 2) throw new Error('online live resource metrics missing');
if (a.connections_tcp !== 7 || a.connections_udp !== 2) throw new Error('TCP/UDP connection split mismatch');

const b = snap.servers[1];
if (b.return_routes.length !== 0) throw new Error('legacy linegrid:return tags leaked into Lite model');

L.mergeMetricTraffic(snap, { series: [
  { entity_id: 'a', metric_key: 'traffic.up', retention_days: 90, points: [{ time: '2026-08-31T01:00:00Z', value: 100 }] },
  { entity_id: 'a', metric_key: 'traffic.down', retention_days: 90, points: [{ time: '2026-08-31T01:00:00Z', value: 200 }] },
] }, 7);
if (!a.daily_traffic.length || a.daily_traffic[0].total !== 300) throw new Error('Lite Metric Store daily history merge failed');
if (a.traffic_used !== 9000) throw new Error('Metric Store history overwrote authoritative Lite current-cycle total');

L.mergeLatest(snap, {
  a: {
    online: false, time: '2026-08-31T02:00:00Z', net_total_up: 9100, net_total_down: 8200,
    cpu: 99, ram: 999, ram_total: 15000, swap: 999, swap_total: 5000, disk: 999, disk_total: 60000,
    net_in: 999, net_out: 999, uptime: 99999, connections: 99, connections_udp: 9, ping: {},
  },
});
if (a.online !== false) throw new Error('offline report must mark node offline');
if (a.cpu_pct != null || a.mem_used != null || a.disk_used != null || a.download_speed != null || a.uptime != null) throw new Error('offline cached report leaked live resource metrics');
if (a.mem_total !== 15000 || a.swap_total !== 5000 || a.disk_total !== 60000) throw new Error('last-known hardware totals should refresh even when node is offline');
const seen = a.last_seen_at;
L.mergeLatest(snap, {});
if (a.online !== false) throw new Error('missing latest report should mark node offline');
if (a.last_seen_at !== seen) throw new Error('last seen should survive offline latest refresh');
if (a.mem_total !== 15000 || a.disk_total !== 60000) throw new Error('hardware totals should survive missing latest report');

console.log('Lite adapter semantics ok');
