(function (global) {
  'use strict';

  let lastPayload = null;
  let pollHandle = null;
  let rpcSeq = 0;
  const seriesInFlight = Object.create(null);

  function trimSlash(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function base() {
    const query = new URLSearchParams(location.search);
    if (query.get('api')) return trimSlash(query.get('api'));
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
    }).then(function (response) {
      if (!response.ok) throw new Error('RPC HTTP ' + response.status + ': ' + method);
      return response.json();
    }).then(function (json) {
      if (!json || json.jsonrpc !== '2.0') throw new Error('Invalid RPC2 response: ' + method);
      if (json.error) throw new Error((json.error.message || 'RPC error') + ' [' + method + ']');
      return json.result;
    }).catch(function (error) {
      if (error && error.name === 'AbortError') throw new Error('RPC timeout: ' + method);
      throw error;
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function loadMetadata() {
    if (global.LINE_GRID_METADATA && typeof global.LINE_GRID_METADATA === 'object') {
      return Promise.resolve(global.LINE_GRID_METADATA);
    }
    return fetch('metadata/nodes.json', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (response) { return response.ok ? response.json() : {}; })
      .catch(function () { return {}; });
  }

  function fetchServers() {
    if (!global.LiteAdapt) return Promise.reject(new Error('Lite adapter missing'));
    return Promise.all([
      rpc('common:getNodes', {}, 8000),
      rpc('common:getNodesLatestStatus', {}, 8000).catch(function () { return {}; }),
      rpc('common:getPublicInfo', {}, 6000).catch(function () { return {}; }),
      loadMetadata(),
    ]).then(function (parts) {
      lastPayload = LiteAdapt.snapshot(parts[0], parts[1], parts[2], parts[3]);
      return lastPayload;
    });
  }

  function fetchPingOverview() {
    if (!lastPayload) return Promise.resolve(null);
    return rpc('common:getRecords', { type: 'ping', uuid: '', hours: 1, task_id: -1, maxCount: 8000 }, 12000)
      .then(function (raw) {
        LiteAdapt.mergePingHistory(lastPayload, raw);
        return lastPayload;
      });
  }

  function fetchTrafficHistory(hours) {
    if (!lastPayload) return Promise.resolve(null);
    const windowHours = Math.min(840, Math.max(168, Number(hours) || 0));
    const days = Math.ceil(windowHours / 24);
    const uuids = (lastPayload.servers || []).map(function (server) { return server.uuid; }).filter(Boolean);
    if (!uuids.length) {
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
      LiteAdapt.mergeMetricTraffic(lastPayload, raw, days);
      const any = (lastPayload.servers || []).some(function (server) {
        return server.daily_traffic && server.daily_traffic.length;
      });
      lastPayload._traffic_history_status = any ? 'ok' : 'unavailable';
      (lastPayload.servers || []).forEach(function (server) {
        if (!server.daily_traffic || !server.daily_traffic.length) server.traffic_history_status = 'unavailable';
      });
      return lastPayload;
    }).catch(function () {
      lastPayload._traffic_history_status = 'unavailable';
      (lastPayload.servers || []).forEach(function (server) { server.traffic_history_status = 'unavailable'; });
      return lastPayload;
    });
  }

  function fetchSeries(uuid, range, target) {
    const normalizedRange = String(range || '1h');
    const hours = normalizedRange === '7D' || normalizedRange === '7d' ? 168 : normalizedRange === '24h' ? 24 : normalizedRange === '6h' ? 6 : 1;
    const normalizedTarget = target && target !== 'all' ? String(target) : 'all';
    const key = String(uuid || '') + ':' + hours + ':' + normalizedTarget;
    if (seriesInFlight[key]) return seriesInFlight[key];

    const params = {
      type: 'ping',
      uuid: String(uuid || ''),
      hours: hours,
      task_id: -1,
      maxCount: hours >= 168 ? 2400 : 4000,
    };
    if (normalizedTarget !== 'all' && /^\d+$/.test(normalizedTarget)) params.task_id = Number(normalizedTarget);

    const request = rpc('common:getRecords', params, hours >= 168 ? 18000 : 12000)
      .then(function (raw) {
        return LiteAdapt.pingSeries(raw, uuid, normalizedTarget);
      })
      .finally(function () {
        delete seriesInFlight[key];
      });
    seriesInFlight[key] = request;
    return request;
  }

  function fetchAccess() {
    return rpc('common:getMe', {}, 5000).then(function (me) {
      const loggedIn = !!(me && me.logged_in);
      return { known: true, logged_in: loggedIn, is_admin: loggedIn };
    }).catch(function () {
      return { known: true, logged_in: false, is_admin: false };
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
          LiteAdapt.mergeLatest(lastPayload, latest);
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
    return payload.series.map(function (point) {
      const value = typeof point === 'number' ? point : Number(point.value);
      return Number.isFinite(value) ? value : -1;
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
    enrich: enrich,
    connectWS: connectWS,
    sparkFromSeries: sparkFromSeries,
  };
})(window);
