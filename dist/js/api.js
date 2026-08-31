(function (global) {
  'use strict';

  let lastPayload = null;
  let pollHandle = null;
  let rpcSeq = 0;

  function trimSlash(s) {
    return String(s || '').replace(/\/+$/, '');
  }

  function base() {
    const q = new URLSearchParams(location.search);
    if (q.get('api')) return trimSlash(q.get('api'));
    if (global.ProbeConfig && ProbeConfig.apiBase != null) return trimSlash(ProbeConfig.apiBase);
    return '';
  }

  function rpcUrl() {
    return (base() || '') + '/api/rpc2';
  }

  function rpc(method, params, timeoutMs) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs || 8000) : null;
    const body = JSON.stringify({ jsonrpc: '2.0', id: ++rpcSeq, method: method, params: params || {} });
    return fetch(rpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: body,
      signal: controller ? controller.signal : undefined,
    }).then(function (res) {
      if (!res.ok) throw new Error('RPC HTTP ' + res.status + ': ' + method);
      return res.json();
    }).then(function (json) {
      if (!json || json.jsonrpc !== '2.0') throw new Error('Invalid RPC2 response: ' + method);
      if (json.error) throw new Error((json.error.message || 'RPC error') + ' [' + method + ']');
      return json.result;
    }).catch(function (err) {
      if (err && err.name === 'AbortError') throw new Error('RPC timeout: ' + method);
      throw err;
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function loadMetadata() {
    if (global.LINE_GRID_METADATA && typeof global.LINE_GRID_METADATA === 'object') {
      return Promise.resolve(global.LINE_GRID_METADATA);
    }
    return fetch('metadata/nodes.json', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (res) { return res.ok ? res.json() : {}; })
      .catch(function () { return {}; });
  }

  function objectValues(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (raw.data && typeof raw.data === 'object') raw = raw.data;
    return raw && typeof raw === 'object' ? Object.keys(raw).map(function (key) { return raw[key]; }) : [];
  }

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

  function isLiteNode(node) {
    return !!(node && typeof node === 'object' && (
      Object.prototype.hasOwnProperty.call(node, 'traffic_reset_allowance') ||
      Object.prototype.hasOwnProperty.call(node, 'effective_traffic_limit') ||
      Object.prototype.hasOwnProperty.call(node, 'deployment_status')
    ));
  }

  function validTrafficType(value) {
    return ['sum', 'max', 'min', 'up', 'down'].indexOf(String(value || '').toLowerCase()) >= 0;
  }

  function applyLiteCurrentTotals(payload, latestRaw) {
    if (!payload || payload._runtime !== 'lite' || !Array.isArray(payload.servers)) return payload;
    const latestById = keyed(latestRaw);
    payload.servers.forEach(function (server) {
      if (!server || !server.uuid) return;
      const live = latestById[String(server.uuid)] || {};
      const up = Number(live.net_total_up);
      const down = Number(live.net_total_down);
      if (!Number.isFinite(up) && !Number.isFinite(down)) return;
      const safeUp = Number.isFinite(up) && up >= 0 ? up : 0;
      const safeDown = Number.isFinite(down) && down >= 0 ? down : 0;
      const used = global.KomariAdapt && KomariAdapt.calcTraffic
        ? KomariAdapt.calcTraffic(safeUp, safeDown, server.traffic_limit_type)
        : safeUp + safeDown;
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

  function applyLiteNativeSemantics(payload, nodesRaw, latestRaw) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    const nodes = objectValues(nodesRaw);
    if (payload._runtime !== 'lite' && !nodes.some(isLiteNode)) return payload;
    const nodeById = keyed(nodesRaw);
    payload._runtime = 'lite';
    payload._source = 'lite-rpc2';

    payload.servers.forEach(function (server) {
      if (!server || !server.uuid) return;
      const node = nodeById[String(server.uuid)] || {};
      const effectiveLimit = Number(node.effective_traffic_limit);
      if (Number.isFinite(effectiveLimit) && effectiveLimit >= 0) server.traffic_limit = effectiveLimit;
      if (validTrafficType(node.effective_traffic_type)) server.traffic_limit_type = String(node.effective_traffic_type).toLowerCase();

      // Lite owns reset-day interpretation and cycle boundaries. Do not retain
      // browser-computed billing windows from the legacy Komari adapter.
      server.period_start = null;
      server.period_end = null;
      server.billing_timezone = null;
    });

    return applyLiteCurrentTotals(payload, latestRaw);
  }

  function restoreLiteNativePeriod(payload) {
    if (!payload || payload._runtime !== 'lite' || !Array.isArray(payload.servers)) return payload;
    payload.servers.forEach(function (server) {
      if (!server || server._lite_native_period_used == null) return;
      server.traffic_period_up = server._lite_native_period_up;
      server.traffic_period_down = server._lite_native_period_down;
      server.traffic_period = server._lite_native_period_used;
      server.traffic_used_up = server._lite_native_period_up;
      server.traffic_used_down = server._lite_native_period_down;
      server.traffic_used = server._lite_native_period_used;
      server.traffic_source = 'lite_native_period';
      server.traffic_period_complete = true;
    });
    return payload;
  }

  function fetchServers() {
    if (!global.KomariAdapt) return Promise.reject(new Error('Komari adapter missing'));
    return Promise.all([
      rpc('common:getNodes', {}, 8000),
      rpc('common:getNodesLatestStatus', {}, 8000).catch(function () { return {}; }),
      rpc('common:getPublicInfo', {}, 6000).catch(function () { return {}; }),
      loadMetadata(),
    ]).then(function (parts) {
      lastPayload = KomariAdapt.snapshot(parts[0], parts[1], parts[2], parts[3]);
      applyLiteNativeSemantics(lastPayload, parts[0], parts[1]);
      return lastPayload;
    });
  }

  function fetchPingOverview() {
    if (!lastPayload) return Promise.resolve(null);
    return rpc('common:getRecords', { type: 'ping', uuid: '', hours: 1, task_id: -1, maxCount: 8000 }, 12000)
      .then(function (raw) {
        KomariAdapt.mergePingHistory(lastPayload, raw);
        return lastPayload;
      });
  }

  function fetchTrafficHistory(hours) {
    if (!lastPayload) return Promise.resolve(null);
    const windowHours = Math.min(840, Math.max(168, Number(hours) || 0));
    const days = Math.ceil(windowHours / 24);
    const uuids = (lastPayload.servers || []).map(function (s) { return s.uuid; }).filter(Boolean);
    if (!uuids.length || !KomariAdapt.mergeMetricTraffic) {
      lastPayload._traffic_history_status = 'unavailable';
      return Promise.resolve(lastPayload);
    }

    return rpc('public:queryMetrics', {
      metric_keys: ['traffic.up', 'traffic.down'],
      entity_ids: uuids,
      hours: windowHours,
      aggregation: 'sum',
      fill_empty: false,
      max_points: Math.min(1200, Math.max(336, days * 24 + 24)),
    }, 18000).then(function (raw) {
      KomariAdapt.mergeMetricTraffic(lastPayload, raw, days);
      restoreLiteNativePeriod(lastPayload);
      const any = (lastPayload.servers || []).some(function (s) { return s.daily_traffic && s.daily_traffic.length; });
      lastPayload._traffic_history_status = any ? 'ok' : 'unavailable';
      (lastPayload.servers || []).forEach(function (s) {
        if (!s.daily_traffic || !s.daily_traffic.length) s.traffic_history_status = 'unavailable';
      });
      return lastPayload;
    }).catch(function () {
      restoreLiteNativePeriod(lastPayload);
      lastPayload._traffic_history_status = 'unavailable';
      (lastPayload.servers || []).forEach(function (s) { s.traffic_history_status = 'unavailable'; });
      return lastPayload;
    });
  }

  function fetchSeries(uuid, range, target) {
    const hours = range === '24h' ? 24 : range === '6h' ? 6 : 1;
    const params = { type: 'ping', uuid: String(uuid || ''), hours: hours, task_id: -1, maxCount: 4000 };
    if (target && target !== 'all' && /^\d+$/.test(String(target))) params.task_id = Number(target);
    return rpc('common:getRecords', params, 12000).then(function (raw) {
      return KomariAdapt.pingSeries(raw, uuid, target || 'all');
    });
  }

  function fetchAccess(uuid) {
    return rpc('common:getMe', {}, 5000).then(function (me) {
      const loggedIn = !!(me && me.logged_in);
      if (!loggedIn) return { known: true, logged_in: false, is_admin: false };
      if (!uuid) return { known: true, logged_in: true, is_admin: false };
      return rpc('admin:getClient', { uuid: String(uuid) }, 5000).then(function () {
        return { known: true, logged_in: true, is_admin: true };
      }).catch(function () {
        return { known: true, logged_in: true, is_admin: false };
      });
    }).catch(function () {
      return { known: true, logged_in: false, is_admin: false };
    });
  }

  function saveReturnRoutes(uuid, choices) {
    const prefix = 'linegrid:return:';
    const carriers = ['telecom', 'unicom', 'mobile'];
    return rpc('admin:getClient', { uuid: String(uuid || '') }, 6000).then(function (client) {
      if (!client || !client.uuid) throw new Error('无法读取管理员节点信息');
      const existing = String(client.tags || '').split(';').map(function (tag) { return tag.trim(); }).filter(Boolean);
      const kept = existing.filter(function (tag) { return tag.indexOf(prefix) !== 0; });
      carriers.forEach(function (carrier) {
        const value = String(choices && choices[carrier] || '').trim();
        if (value) kept.push(prefix + carrier + '=' + encodeURIComponent(value));
      });
      const tags = kept.join(';');
      return rpc('admin:editClient', { uuid: String(uuid), tags: tags }, 8000).then(function () {
        return { uuid: String(uuid), tags: tags };
      });
    });
  }

  function enrich(payload, options) {
    if (!payload || !global.LineGridEnrich) return Promise.resolve(payload);
    options = options || {};
    const tasks = [];
    if (options.loadFx === true) {
      tasks.push(LineGridEnrich.getDailyExchangeRates().then(function (fx) {
        payload._fx_rates = fx && fx.rates || LineGridEnrich.defaultRates;
        payload._fx_source = fx && fx.source || 'default';
        payload._fx_updated_at = fx && fx.updatedAt || null;
      }).catch(function () {}));
    } else {
      payload._fx_source = payload._fx_source || 'deferred';
    }
    tasks.push(LineGridEnrich.enrichNodes(payload).catch(function () {}));
    return Promise.allSettled(tasks).then(function () { return payload; });
  }

  function connectWS(onPayload) {
    let stopped = false;
    let running = false;
    let timer = null;

    function clear() {
      if (timer) clearTimeout(timer);
      timer = null;
    }

    function schedule() {
      clear();
      if (!stopped && !document.hidden) timer = setTimeout(refresh, 2000);
    }

    function refresh() {
      if (stopped || running || document.hidden || !lastPayload) return;
      running = true;
      rpc('common:getNodesLatestStatus', {}, 8000)
        .then(function (latest) {
          if (stopped) return;
          KomariAdapt.mergeLatest(lastPayload, latest);
          applyLiteCurrentTotals(lastPayload, latest);
          if (typeof onPayload === 'function') onPayload(lastPayload, { kind: 'latest' });
        })
        .catch(function () {})
        .finally(function () {
          running = false;
          schedule();
        });
    }

    function visible() {
      if (document.hidden) clear();
      else if (!running) refresh();
    }

    document.addEventListener('visibilitychange', visible);
    schedule();
    pollHandle = {
      close: function () {
        stopped = true;
        clear();
        document.removeEventListener('visibilitychange', visible);
      },
    };
    return pollHandle;
  }

  function sparkFromSeries(payload) {
    if (!payload || !Array.isArray(payload.series)) return [];
    return payload.series.map(function (p) {
      const v = typeof p === 'number' ? p : Number(p.value);
      return Number.isFinite(v) ? v : -1;
    });
  }

  global.ProbeAPI = {
    base: base,
    rpc: rpc,
    fetchServers: fetchServers,
    fetchPingOverview: fetchPingOverview,
    fetchTrafficHistory: fetchTrafficHistory,
    fetchSeries: fetchSeries,
    fetchAccess: fetchAccess,
    saveReturnRoutes: saveReturnRoutes,
    enrich: enrich,
    connectWS: connectWS,
    sparkFromSeries: sparkFromSeries,
  };
})(window);
