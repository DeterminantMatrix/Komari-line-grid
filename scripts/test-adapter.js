#!/usr/bin/env node
'use strict';
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('dist/js/komari.js', 'utf8');
const sandbox = { window: {}, console, Date, Intl, Math, JSON, Number, String, Object, Array, RegExp, Map, setTimeout, clearTimeout };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'komari.js' });
const K = sandbox.window.KomariAdapt;
if (!K) throw new Error('KomariAdapt missing');
const nodes = [{ uuid: 'node-a', name: 'A', region: 'US', traffic_limit: 100000, traffic_limit_type: 'sum', weight: 1 }];
const latest = { 'node-a': { online: true, net_total_up: 9000, net_total_down: 8000, time: new Date().toISOString(), cpu: 2, ram: 10, disk: 20 } };
const snap = K.snapshot(nodes, latest, { theme_settings: { trafficResetDay: 19, billingTimeZone: 'Asia/Shanghai', geoIpProvider: 'ip.sb', geoIpFallback: false } }, { global: { traffic_reset_day: 2, billing_timezone: 'UTC' } });
const s = snap.servers[0];
if (s.traffic_lifetime !== 17000) throw new Error('lifetime traffic not preserved separately');
if (s.traffic_used != null) throw new Error('live lifetime counter leaked into billing-period traffic');
if (!s.last_seen_at) throw new Error('last_seen_at missing');
if (s.billing_timezone !== 'Asia/Shanghai') throw new Error('managed billing timezone must override legacy global metadata');
if (s.traffic_reset_day !== 19) throw new Error('managed reset day must override legacy global metadata');
if (snap.billing_timezone !== 'Asia/Shanghai') throw new Error('billing timezone missing on payload');
if (snap.geo_ip_provider !== 'ip.sb' || snap.geo_ip_fallback !== false) throw new Error('GeoIP provider settings missing');
const stamp = s.period_start + 'T12:00:00Z';
K.mergeMetricTraffic(snap, { series: [
  { entity_id: 'node-a', metric_key: 'traffic.up', retention_days: 90, points: [{ time: stamp, value: 100 }] },
  { entity_id: 'node-a', metric_key: 'traffic.down', retention_days: 90, points: [{ time: stamp, value: 200 }] }
] }, 35);
if (s.traffic_used !== 300 || s.traffic_period !== 300) throw new Error('billing-period traffic merge failed');
const seen = s.last_seen_at;
K.mergeLatest(snap, {});
if (s.online !== false) throw new Error('missing latest report should mark offline');
if (s.last_seen_at !== seen) throw new Error('last seen should survive an offline latest refresh');
console.log('adapter semantics ok');
