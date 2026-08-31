(function (global) {
  'use strict';

  const LINE_GRID_PAGES = ['overview', 'ping', 'traffic', 'routes', 'system'];
  let appliedPingRoute = '';
  let uiRefreshQueued = false;
  let liteActive = false;

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

  // Lite manifests use clean paths. Bridge them into Line Grid's hash router
  // before app.js starts; this is navigation compatibility only.
  normalizeNavigationPath();

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
    const s = String(raw || '').trim().toLowerCase();
    if (!s || s.indexOf(':') < 0 || s.indexOf('*') >= 0 || /[^0-9a-f:.]/.test(s)) return false;
    if (s === '::' || s === '::1') return false;
    if (/^f[cd]/.test(s)) return false;
    if (/^fe[89ab]/.test(s)) return false;
    if (/^ff/.test(s)) return false;
    if (/^2001:db8(?::|$)/.test(s)) return false;
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

  function normalizeLiteTrafficUI() {
    if (!liteActive) return;

    // Reset-day configuration and countdown belong to Lite, not the theme.
    global.document.querySelectorAll('.quota-reset').forEach(function (node) {
      node.hidden = true;
    });

    // Theme-side forecasting depended on a browser-computed billing window.
    // Hide it in Lite mode instead of recreating Lite's traffic policy.
    global.document.querySelectorAll('.page-traffic .traffic-forecast').forEach(function (node) {
      node.hidden = true;
    });

    global.document.querySelectorAll('.page-traffic .kpi article').forEach(function (article) {
      const label = article.querySelector('.lbl');
      if (!label || String(label.textContent || '').trim() !== '账期') return;
      label.textContent = '账期管理';
      const value = article.querySelector('.val');
      const sub = article.querySelector('.sub');
      if (value) value.textContent = 'Lite';
      if (sub) sub.textContent = '后台统一管理';
    });

    global.document.querySelectorAll('.page-traffic .kpi article').forEach(function (article) {
      const label = article.querySelector('.lbl');
      const sub = article.querySelector('.sub');
      if (!label || !sub) return;
      const text = String(label.textContent || '').trim();
      if (text === '本账期上行' || text === '本账期下行') sub.textContent = 'Lite 后端 · 当前账期';
    });

    global.document.querySelectorAll('.page-traffic .chart-fill .panel-h .hero-sub').forEach(function (node) {
      node.textContent = 'Lite Metric Store · 历史流量';
    });

    // Overview's trailing percentage is packet loss, not quota usage.
    global.document.querySelectorAll('.traffic-sub').forEach(function (node) {
      const text = String(node.textContent || '').trim();
      if (/^\d+(?:\.\d+)?%$/.test(text)) node.textContent = '丢包 ' + text;
    });
  }

  function refreshUICompatibility() {
    uiRefreshQueued = false;
    normalizeBranding();
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
      return originalFetchServers.apply(this, arguments).then(function (payload) {
        liteActive = !!(payload && payload._runtime === 'lite');
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
      return Promise.resolve().then(function () {
        return originalEnrichNodes(payload);
      }).finally(function () {
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
    navigationHashFromPath: navigationHashFromPath,
    normalizeNavigationPath: normalizeNavigationPath,
    applyPingTaskFromQuery: applyPingTaskFromQuery,
    isActive: function () { return liteActive; },
  };
})(window);
