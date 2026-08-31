(function (global) {
  'use strict';

  const LINE_GRID_PAGES = ['overview', 'ping', 'traffic', 'routes', 'system'];
  let appliedPingRoute = '';
  let uiRefreshQueued = false;

  function safeSegment(value) {
    const raw = String(value || '');
    try {
      return encodeURIComponent(decodeURIComponent(raw));
    } catch (e) {
      return encodeURIComponent(raw);
    }
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

  function normalizeNavigationPath() {
    if (global.location.hash && global.location.hash !== '#') return '';
    const nextHash = navigationHashFromPath(global.location.pathname, global.location.search);
    if (!nextHash) return '';
    global.history.replaceState(global.history.state, '', global.location.pathname + global.location.search + nextHash);
    return nextHash;
  }

  // Lite navigation manifests must use normal paths rather than URL fragments.
  // Bridge those paths into Line Grid's existing hash router before app.js starts.
  normalizeNavigationPath();

  function calcTraffic(up, down, type) {
    if (global.KomariAdapt && typeof global.KomariAdapt.calcTraffic === 'function') {
      return global.KomariAdapt.calcTraffic(up, down, type);
    }
    return Number(up || 0) + Number(down || 0);
  }

  function restoreLitePeriod(payload, latestRaw) {
    if (!payload || payload._runtime !== 'lite' || !Array.isArray(payload.servers)) return payload;
    let latest = latestRaw && latestRaw.data && typeof latestRaw.data === 'object' ? latestRaw.data : (latestRaw || {});
    if (Array.isArray(latest)) {
      const mapped = {};
      latest.forEach(function (row) {
        const id = row && (row.client || row.uuid || row.id);
        if (id) mapped[String(id)] = row;
      });
      latest = mapped;
    }
    payload.servers.forEach(function (server) {
      const live = latest && latest[String(server.uuid)];
      if (!live) return;
      const up = Number(live.net_total_up);
      const down = Number(live.net_total_down);
      if (!Number.isFinite(up) && !Number.isFinite(down)) return;
      const safeUp = Number.isFinite(up) && up >= 0 ? up : 0;
      const safeDown = Number.isFinite(down) && down >= 0 ? down : 0;
      const used = calcTraffic(safeUp, safeDown, server.traffic_limit_type);
      server._lite_native_period_up = safeUp;
      server._lite_native_period_down = safeDown;
      server._lite_native_period_used = used;
      server.traffic_period_up = safeUp;
      server.traffic_period_down = safeDown;
      server.traffic_period = used;
      server.traffic_used_up = safeUp;
      server.traffic_used_down = safeDown;
      server.traffic_used = used;
      server.traffic_source = 'lite_native_period';
      server.traffic_period_complete = true;
      server.traffic_lifetime_up = null;
      server.traffic_lifetime_down = null;
      server.traffic_lifetime = null;
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
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }

  function validPublicIPv6(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s || s.indexOf(':') < 0 || s.indexOf('*') >= 0 || /[^0-9a-f:.]/.test(s)) return false;
    if (s === '::' || s === '::1') return false;
    if (/^f[cd]/.test(s)) return false;
    if (/^fe[89ab]/.test(s)) return false;
    if (/^ff/.test(s)) return false;
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

  function normalizeBranding() {
    const nodes = global.document.querySelectorAll('.foot-meta');
    nodes.forEach(function (node) {
      const text = String(node.textContent || '');
      let next = text.replace('Komari RPC2', 'RPC2');
      next = next.replace('Powered by Komari Monitor', 'Line Grid · Komari / Lite');
      if (next !== text) node.textContent = next;
    });
  }

  function refreshUICompatibility() {
    uiRefreshQueued = false;
    normalizeBranding();
    applyPingTaskFromQuery();
  }

  function scheduleUICompatibility() {
    if (uiRefreshQueued) return;
    uiRefreshQueued = true;
    Promise.resolve().then(refreshUICompatibility);
  }

  if (global.KomariAdapt && typeof global.KomariAdapt.mergeLatest === 'function') {
    const originalMergeLatest = global.KomariAdapt.mergeLatest;
    global.KomariAdapt.mergeLatest = function (payload, latestRaw) {
      const result = originalMergeLatest(payload, latestRaw);
      return restoreLitePeriod(result || payload, latestRaw);
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
      return Promise.resolve(originalEnrichNodes(payload)).finally(function () {
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
    scheduleUICompatibility();
  });
  if (global.MutationObserver) {
    new global.MutationObserver(scheduleUICompatibility).observe(global.document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  global.LineGridLite = {
    isPublicIPLiteral: isPublicIPLiteral,
    restoreLitePeriod: restoreLitePeriod,
    navigationHashFromPath: navigationHashFromPath,
    normalizeNavigationPath: normalizeNavigationPath,
    applyPingTaskFromQuery: applyPingTaskFromQuery,
  };
})(window);
