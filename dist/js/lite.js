(function (global) {
  'use strict';

  const LINE_GRID_PAGES = ['overview', 'ping', 'traffic', 'system'];
  let appliedPingRoute = '';
  let uiRefreshQueued = false;

  function safeSegment(value) {
    const raw = String(value || '');
    try { return encodeURIComponent(decodeURIComponent(raw)); }
    catch (e) { return encodeURIComponent(raw); }
  }

  function navigationHashFromPath(pathname, search) {
    const parts = String(pathname || '/').split('/').filter(Boolean);
    const params = new URLSearchParams(search || '');
    const pingTask = String(params.get('ping_task') || '').trim();

    if (parts[0] === 'node' && parts[1]) {
      let page = LINE_GRID_PAGES.indexOf(parts[2]) >= 0 ? parts[2] : 'overview';
      if (pingTask) page = 'ping';
      return '#/node/' + safeSegment(parts[1]) + '/' + page;
    }
    if ((parts[0] === 'network' || parts[0] === 'resource') && parts[1] === 'node' && parts[2]) {
      let page = LINE_GRID_PAGES.indexOf(parts[3]) >= 0 ? parts[3] : (parts[0] === 'network' ? 'ping' : 'overview');
      if (pingTask) page = 'ping';
      return '#/' + parts[0] + '/node/' + safeSegment(parts[2]) + '/' + page;
    }
    return '';
  }

  function replaceHash(nextHash) {
    if (!nextHash || String(global.location.hash || '') === nextHash) return false;
    global.history.replaceState(global.history.state, '', global.location.pathname + global.location.search + nextHash);
    return true;
  }

  function normalizeNavigationPath() {
    if (global.location.hash && global.location.hash !== '#') return '';
    const nextHash = navigationHashFromPath(global.location.pathname, global.location.search);
    if (!nextHash) return '';
    replaceHash(nextHash);
    return nextHash;
  }

  function normalizeLegacyReturnHash() {
    const hash = String(global.location.hash || '');
    if (!/\/routes$/.test(hash)) return false;
    return replaceHash(hash.replace(/\/routes$/, '/overview'));
  }

  normalizeNavigationPath();
  normalizeLegacyReturnHash();

  function pad2(value) { return String(value).padStart(2, '0'); }
  function dateKey(year, month, day) { return String(year).padStart(4, '0') + '-' + pad2(month) + '-' + pad2(day); }
  function daysInMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
  function monthShift(year, month, delta) {
    const zero = year * 12 + (month - 1) + delta;
    return { year: Math.floor(zero / 12), month: ((zero % 12) + 12) % 12 + 1 };
  }
  function shanghaiParts(nowValue) {
    const date = nowValue instanceof Date ? nowValue : new Date(nowValue == null ? Date.now() : nowValue);
    const shifted = new Date(date.getTime() + 8 * 3600000);
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
  }

  // Display only: Lite remains the owner of reset policy and traffic counters.
  function liteDisplayWindow(resetDay, nowValue) {
    const day = Number(resetDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    const now = shanghaiParts(nowValue);
    let startYear = now.year;
    let startMonth = now.month;
    let startDay = Math.min(day, daysInMonth(startYear, startMonth));
    const today = dateKey(now.year, now.month, now.day);
    let start = dateKey(startYear, startMonth, startDay);
    if (today < start) {
      const previous = monthShift(startYear, startMonth, -1);
      startYear = previous.year;
      startMonth = previous.month;
      startDay = Math.min(day, daysInMonth(startYear, startMonth));
      start = dateKey(startYear, startMonth, startDay);
    }
    const next = monthShift(startYear, startMonth, 1);
    return {
      start: start,
      end: dateKey(next.year, next.month, Math.min(day, daysInMonth(next.year, next.month))),
      resetDay: day,
      timeZone: 'Asia/Shanghai',
    };
  }

  function applyLiteDisplayWindows(payload, nowValue) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    payload.servers.forEach(function (server) {
      if (!server) return;
      const window = liteDisplayWindow(server.traffic_reset_day, nowValue);
      server.period_start = window ? window.start : null;
      server.period_end = window ? window.end : null;
      server.billing_timezone = 'Asia/Shanghai';
    });
    return payload;
  }

  function validPublicIPv4(raw) {
    const m = String(raw || '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;
    const p = m.slice(1).map(Number);
    if (p.some(function (n) { return n < 0 || n > 255; })) return false;
    const a = p[0], b = p[1];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
    if (a === 203 && b === 0) return false;
    return true;
  }

  function validPublicIPv6(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value || value.indexOf(':') < 0 || value.indexOf('*') >= 0 || /[^0-9a-f:.]/.test(value)) return false;
    if (value === '::' || value === '::1') return false;
    if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value) || /^ff/.test(value)) return false;
    if (/^2001:db8(?::|$)/.test(value)) return false;
    return true;
  }

  function isPublicIPLiteral(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.indexOf('*') >= 0) return false;
    return raw.indexOf(':') >= 0 ? validPublicIPv6(raw) : validPublicIPv4(raw);
  }

  function applyPingTaskFromQuery() {
    const taskID = String(new URLSearchParams(global.location.search).get('ping_task') || '').trim();
    if (!taskID || !/\/ping$/.test(String(global.location.hash || ''))) return false;
    const routeKey = String(global.location.hash || '') + '|' + taskID;
    if (appliedPingRoute === routeKey) return false;
    const buttons = global.document.querySelectorAll('[data-latency-target]');
    for (let i = 0; i < buttons.length; i += 1) {
      if (String(buttons[i].getAttribute('data-latency-target') || '') !== taskID) continue;
      appliedPingRoute = routeKey;
      buttons[i].click();
      return true;
    }
    return false;
  }

  function setTextIfChanged(node, value) {
    if (!node) return false;
    const next = String(value == null ? '' : value);
    if (String(node.textContent || '') === next) return false;
    node.textContent = next;
    return true;
  }

  function normalizeLiteTrafficUI() {
    global.document.querySelectorAll('.page-traffic .traffic-forecast small').forEach(function (node) {
      setTextIfChanged(node, 'Lite 后端 · 当前账期');
    });
    global.document.querySelectorAll('.page-traffic .kpi article').forEach(function (article) {
      const label = article.querySelector('.lbl');
      const sub = article.querySelector('.sub');
      if (!label || !sub) return;
      const text = String(label.textContent || '').trim();
      if (text === '本账期上行' || text === '本账期下行') setTextIfChanged(sub, 'Lite 后端 · 当前账期');
    });
    global.document.querySelectorAll('.page-traffic .chart-fill .panel-h .hero-sub').forEach(function (node) {
      setTextIfChanged(node, 'Lite Metric Store · 历史流量');
    });
    global.document.querySelectorAll('.traffic-sub').forEach(function (node) {
      const text = String(node.textContent || '').trim();
      if (/^\d+(?:\.\d+)?%$/.test(text)) setTextIfChanged(node, '丢包 ' + text);
    });
  }

  function refreshUICompatibility() {
    uiRefreshQueued = false;
    normalizeLegacyReturnHash();
    normalizeLiteTrafficUI();
    applyPingTaskFromQuery();
  }

  function scheduleUICompatibility() {
    if (uiRefreshQueued) return;
    uiRefreshQueued = true;
    Promise.resolve().then(refreshUICompatibility);
  }

  if (global.ProbeAPI && typeof global.ProbeAPI.fetchServers === 'function') {
    const originalFetchServers = global.ProbeAPI.fetchServers;
    global.ProbeAPI.fetchServers = function () {
      return Promise.resolve(originalFetchServers.apply(this, arguments)).then(function (payload) {
        applyLiteDisplayWindows(payload);
        scheduleUICompatibility();
        return payload;
      });
    };
  }

  if (global.LineGridEnrich && typeof global.LineGridEnrich.enrichNodes === 'function') {
    const originalEnrichNodes = global.LineGridEnrich.enrichNodes;
    global.LineGridEnrich.enrichNodes = function (payload) {
      if (!payload || !Array.isArray(payload.servers)) return originalEnrichNodes(payload);
      const hidden = [];
      payload.servers.forEach(function (server) {
        if (!server || !server._lookup_ip || isPublicIPLiteral(server._lookup_ip)) return;
        hidden.push([server, server._lookup_ip]);
        server._lookup_ip = '';
      });
      return Promise.resolve().then(function () { return originalEnrichNodes(payload); }).finally(function () {
        hidden.forEach(function (item) { item[0]._lookup_ip = item[1]; });
      });
    };
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', scheduleUICompatibility, { once: true });
  } else {
    scheduleUICompatibility();
  }
  global.addEventListener('hashchange', function () {
    appliedPingRoute = '';
    normalizeLegacyReturnHash();
    scheduleUICompatibility();
  });
  if (global.MutationObserver) {
    new global.MutationObserver(scheduleUICompatibility).observe(global.document.documentElement, { childList: true, subtree: true });
  }

  global.LineGridLite = {
    isPublicIPLiteral: isPublicIPLiteral,
    navigationHashFromPath: navigationHashFromPath,
    normalizeNavigationPath: normalizeNavigationPath,
    normalizeLegacyReturnHash: normalizeLegacyReturnHash,
    applyPingTaskFromQuery: applyPingTaskFromQuery,
    liteDisplayWindow: liteDisplayWindow,
    applyLiteDisplayWindows: applyLiteDisplayWindows,
  };
})(window);
