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

  function keyed(raw) {
    if (!raw) return {};
    if (raw.data && typeof raw.data === 'object') raw = raw.data;
    if (!Array.isArray(raw) && typeof raw === 'object') return raw;
    const out = {};
    (Array.isArray(raw) ? raw : []).forEach(function (row) {
      const id = row && (row.uuid || row.client || row.id);
      if (id) out[String(id)] = row;
    });
    return out;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function dateKey(year, month, day) {
    return String(year).padStart(4, '0') + '-' + pad2(month) + '-' + pad2(day);
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function monthShift(year, month, delta) {
    const zero = year * 12 + (month - 1) + delta;
    return { year: Math.floor(zero / 12), month: ((zero % 12) + 12) % 12 + 1 };
  }

  function shanghaiParts(nowValue) {
    const d = nowValue instanceof Date ? nowValue : new Date(nowValue == null ? Date.now() : nowValue);
    const shifted = new Date(d.getTime() + 8 * 3600000);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    };
  }

  // Display-only mirror of Lite's Asia/Shanghai cycle boundary. The reset
  // policy and counters still belong exclusively to Lite; Line Grid only uses
  // this to render the next reset date/countdown from Lite traffic_reset_day.
  function liteDisplayWindow(resetDay, nowValue) {
    const day = Number(resetDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    const now = shanghaiParts(nowValue);
    let startYear = now.year;
    let startMonth = now.month;
    let startDay = Math.min(day, daysInMonth(startYear, startMonth));
    const todayKey = dateKey(now.year, now.month, now.day);
    let startKey = dateKey(startYear, startMonth, startDay);
    if (todayKey < startKey) {
      const previous = monthShift(startYear, startMonth, -1);
      startYear = previous.year;
      startMonth = previous.month;
      startDay = Math.min(day, daysInMonth(startYear, startMonth));
      startKey = dateKey(startYear, startMonth, startDay);
    }
    const next = monthShift(startYear, startMonth, 1);
    const nextDay = Math.min(day, daysInMonth(next.year, next.month));
    return {
      start: startKey,
      end: dateKey(next.year, next.month, nextDay),
      resetDay: day,
      timeZone: 'Asia/Shanghai',
    };
  }

  function sortLiteServers(payload) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    payload.servers.sort(function (a, b) {
      const aw = Number(a && a.weight);
      const bw = Number(b && b.weight);
      const aWeight = Number.isFinite(aw) ? aw : Number.MAX_SAFE_INTEGER;
      const bWeight = Number.isFinite(bw) ? bw : Number.MAX_SAFE_INTEGER;
      if (aWeight !== bWeight) return aWeight - bWeight;

      const at = Date.parse(String(a && a._lite_created_at || ''));
      const bt = Date.parse(String(b && b._lite_created_at || ''));
      const aTime = Number.isFinite(at) ? at : Number.MAX_SAFE_INTEGER;
      const bTime = Number.isFinite(bt) ? bt : Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;

      return String(a && a.uuid || '').localeCompare(String(b && b.uuid || ''));
    });
    payload.servers.forEach(function (server, index) {
      if (server) server._order = index;
    });
    return payload;
  }

  function applyLiteNodeMetadata(payload, nodesRaw, nowValue) {
    if (!payload || payload._runtime !== 'lite' || !Array.isArray(payload.servers)) return payload;
    const nodes = keyed(nodesRaw);
    payload.servers.forEach(function (server) {
      if (!server || !server.uuid) return;
      const node = nodes[String(server.uuid)] || {};
      const weight = Number(node.weight);
      if (Number.isFinite(weight)) server.weight = weight;
      server._lite_created_at = String(node.created_at || '');

      const resetDay = Number(node.traffic_reset_day);
      if (Number.isInteger(resetDay) && resetDay >= 1 && resetDay <= 31) {
        const window = liteDisplayWindow(resetDay, nowValue);
        server.traffic_reset_day = resetDay;
        server.period_start = window ? window.start : null;
        server.period_end = window ? window.end : null;
        server.billing_timezone = 'Asia/Shanghai';
      } else {
        server.traffic_reset_day = node.traffic_reset_day == null ? null : Number(node.traffic_reset_day);
        server.period_start = null;
        server.period_end = null;
        server.billing_timezone = 'Asia/Shanghai';
      }
    });
    return sortLiteServers(payload);
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

  function setTextIfChanged(node, value) {
    if (!node) return false;
    const next = String(value == null ? '' : value);
    if (String(node.textContent || '') === next) return false;
    node.textContent = next;
    return true;
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

    // Overview's trailing percentage is packet loss, not quota usage.
    global.document.querySelectorAll('.traffic-sub').forEach(function (node) {
      const text = String(node.textContent || '').trim();
      if (/^\d+(?:\.\d+)?%$/.test(text)) setTextIfChanged(node, '丢包 ' + text);
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
      const args = arguments;
      const nodesPromise = global.ProbeAPI.rpc && typeof global.ProbeAPI.rpc === 'function'
        ? global.ProbeAPI.rpc('common:getNodes', {}, 8000).catch(function () { return null; })
        : Promise.resolve(null);
      return Promise.all([originalFetchServers.apply(this, args), nodesPromise]).then(function (parts) {
        const payload = parts[0];
        liteActive = !!(payload && payload._runtime === 'lite');
        if (liteActive) {
          if (parts[1]) applyLiteNodeMetadata(payload, parts[1]);
          else sortLiteServers(payload);
        }
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
    });
  }

  global.LineGridLite = {
    isPublicIPLiteral: isPublicIPLiteral,
    navigationHashFromPath: navigationHashFromPath,
    normalizeNavigationPath: normalizeNavigationPath,
    applyPingTaskFromQuery: applyPingTaskFromQuery,
    liteDisplayWindow: liteDisplayWindow,
    applyLiteNodeMetadata: applyLiteNodeMetadata,
    sortLiteServers: sortLiteServers,
    isActive: function () { return liteActive; },
  };
})(window);
