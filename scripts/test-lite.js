#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function loadLite(pathname, search, hash) {
  const clicks = [];
  const observers = [];
  const location = { pathname: pathname || '/', search: search || '', hash: hash || '' };
  const document = {
    readyState: 'complete',
    documentElement: {},
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector === '[data-latency-target]') {
        return ['1', '3', '7'].map((value) => ({
          getAttribute(name) { return name === 'data-latency-target' ? value : null; },
          click() { clicks.push(value); },
        }));
      }
      return [];
    },
  };
  const history = {
    state: null,
    replaceState(state, _title, url) {
      this.state = state;
      const hashIndex = String(url).indexOf('#');
      location.hash = hashIndex >= 0 ? String(url).slice(hashIndex) : '';
    },
  };
  function MutationObserver(cb) {
    this.cb = cb;
    this.observe = function (target, options) { observers.push({ observer: this, target, options }); };
  }
  const window = {
    location,
    history,
    document,
    MutationObserver,
    URLSearchParams,
    Promise,
    addEventListener() {},
  };
  window.window = window;
  const context = vm.createContext({ window, URLSearchParams, Promise, Date });
  vm.runInContext(fs.readFileSync('dist/js/lite.js', 'utf8'), context, { filename: 'dist/js/lite.js' });
  return { api: window.LineGridLite, location, clicks, observers };
}

{
  const r = loadLite('/node/abc-123/overview', '', '');
  assert(r.location.hash === '#/node/abc-123/overview', 'detail path was not bridged to Line Grid hash router');
  assert(r.api.navigationHashFromPath('/node/a b/overview', '') === '#/node/a%20b/overview', 'UUID/path segment escaping failed');
}

{
  const r = loadLite('/network/node/abc-123/ping', '', '');
  assert(r.location.hash === '#/network/node/abc-123/ping', 'network path was not bridged to Line Grid hash router');
}

{
  const r = loadLite('/node/abc-123/overview', '?ping_task=3', '');
  assert(r.location.hash === '#/node/abc-123/ping', 'ping_task did not redirect detail route to ping page');
  assert(r.api.applyPingTaskFromQuery() === true, 'ping_task was not applied to rendered task controls');
  assert(r.clicks.length === 1 && r.clicks[0] === '3', 'wrong Ping Task control selected');
  assert(r.api.applyPingTaskFromQuery() === false, 'same ping_task should not be applied twice');
}

{
  const r = loadLite('/node/abc-123/overview', '', '#/node/custom/traffic');
  assert(r.location.hash === '#/node/custom/traffic', 'existing Line Grid hash route must win over clean-path bridge');
}

{
  const r = loadLite('/', '', '');
  assert(r.api.isPublicIPLiteral('8.8.8.8') === true, 'public IPv4 rejected');
  assert(r.api.isPublicIPLiteral('192.168.1.1') === false, 'private IPv4 accepted');
  assert(r.api.isPublicIPLiteral('192.0.2.1') === false, 'documentation IPv4 accepted');
  assert(r.api.isPublicIPLiteral('198.51.100.1') === false, 'documentation IPv4 accepted');
  assert(r.api.isPublicIPLiteral('203.0.113.1') === false, 'documentation IPv4 accepted');
  assert(r.api.isPublicIPLiteral('1.2.*.*') === false, 'masked IPv4 accepted');
  assert(r.api.isPublicIPLiteral('2001:4860:4860::8888') === true, 'public IPv6 rejected');
  assert(r.api.isPublicIPLiteral('fd00::1') === false, 'ULA IPv6 accepted');
  assert(r.api.isPublicIPLiteral('2001:db8::1') === false, 'documentation IPv6 accepted');
}

{
  const r = loadLite('/', '', '');
  const payload = {
    _runtime: 'lite',
    servers: [
      { uuid: 'a', weight: 99 },
      { uuid: 'b', weight: 99 },
      { uuid: 'c', weight: 99 },
    ],
  };
  r.api.applyLiteNodeMetadata(payload, {
    a: { uuid: 'a', weight: 2, created_at: '2026-01-01T00:00:00Z', traffic_reset_day: 3 },
    b: { uuid: 'b', weight: 1, created_at: '2026-01-02T00:00:00Z', traffic_reset_day: 21 },
    c: { uuid: 'c', weight: 1, created_at: '2026-01-01T00:00:00Z', traffic_reset_day: 30 },
  }, new Date('2026-08-31T00:00:00Z'));
  assert(payload.servers.map((s) => s.uuid).join(',') === 'c,b,a', 'Lite native weight/created_at/uuid order not preserved');
  const a = payload.servers.find((s) => s.uuid === 'a');
  assert(a.period_start === '2026-08-03' && a.period_end === '2026-09-03', 'Lite reset-day display window mismatch');
  assert(a.billing_timezone === 'Asia/Shanghai', 'Lite reset display timezone mismatch');

  const feb = r.api.liteDisplayWindow(31, new Date('2026-02-15T00:00:00Z'));
  assert(feb.start === '2026-01-31' && feb.end === '2026-02-28', 'Lite end-of-month reset clamp mismatch');
}

{
  const r = loadLite('/', '', '');
  assert(typeof r.api.isActive === 'function', 'Lite runtime state accessor missing');
  assert(r.api.isActive() === false, 'Lite compatibility layer must start inactive before backend detection');
  assert(!Object.prototype.hasOwnProperty.call(r.api, 'trafficLabels'), 'theme-owned traffic labels API must be removed');
  assert(!Object.prototype.hasOwnProperty.call(r.api, 'markLiteRuntime'), 'legacy Lite runtime marker must be removed');
  assert(r.observers.length === 1, 'Lite compatibility observer missing');
  assert(r.observers[0].options.characterData !== true, 'observer must not watch characterData and self-trigger on text rewrites');
}

console.log('Lite compatibility tests passed');
