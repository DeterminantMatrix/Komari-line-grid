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
    this.observe = function () { observers.push(this); };
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
  const context = vm.createContext({ window, URLSearchParams, Promise });
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
  assert(r.api.isPublicIPLiteral('1.2.*.*') === false, 'masked IPv4 accepted');
  assert(r.api.isPublicIPLiteral('2001:4860:4860::8888') === true, 'public IPv6 rejected');
  assert(r.api.isPublicIPLiteral('fd00::1') === false, 'ULA IPv6 accepted');
}

console.log('Lite compatibility tests passed');
