#!/usr/bin/env node
'use strict';
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('dist/js/komari.js', 'utf8');
const sandbox = { window: {}, console, Date, Intl, Math, JSON, Number, String, Object, Array, RegExp, Map, setTimeout, clearTimeout };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'komari.js' });
const K = sandbox.window.KomariAdapt;
if (!K || !K.billingWindow) throw new Error('billing helpers missing');
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(label + ': expected ' + expected + ', got ' + actual);
}
let w = K.billingWindow(1, 'Asia/Shanghai', '2026-08-20T10:00:00Z');
eq(w.start, '2026-08-01', 'Shanghai start');
eq(w.end, '2026-09-01', 'Shanghai end');
eq(w.timeZone, 'Asia/Shanghai', 'Shanghai zone');

// Same instant is Aug 1 in Shanghai but Jul 31 in UTC.
w = K.billingWindow(1, 'Asia/Shanghai', '2026-07-31T16:30:00Z');
eq(w.start, '2026-08-01', 'Shanghai midnight boundary');
w = K.billingWindow(1, 'UTC', '2026-07-31T16:30:00Z');
eq(w.start, '2026-07-01', 'UTC midnight boundary');
eq(w.end, '2026-08-01', 'UTC midnight end');

// Day 31 clamps to the actual last day of short months.
w = K.billingWindow(31, 'Asia/Shanghai', '2026-02-28T04:00:00Z');
eq(w.start, '2026-02-28', 'Feb clamp start');
eq(w.end, '2026-03-31', 'Feb clamp end');
w = K.billingWindow(31, 'Asia/Shanghai', '2028-02-29T04:00:00Z');
eq(w.start, '2028-02-29', 'Leap year clamp start');
eq(w.end, '2028-03-31', 'Leap year clamp end');

// Invalid zones fall back to the product default instead of throwing.
w = K.billingWindow(15, 'Not/AZone', '2026-08-20T10:00:00Z');
eq(w.timeZone, 'Asia/Shanghai', 'invalid zone fallback');

console.log('billing timezone semantics ok');
