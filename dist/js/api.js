(function (global) {
  'use strict';

  let lastPayload = null;
  let pollHandle = null;
  let rpcSeq = 0;

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
    const hours = range === '24h' ? 24 : range === '6h' ? 6 : 1;
    const params = { type: 'ping', uuid: String(uuid || ''), hours: hours, task_id: -1, maxCount: 4000 };
    if (target && target !== 'all' && /^\d+$/.test(String(target))) params.task_id = Number(target);
    return rpc('common:getRecords', params, 12000).then(function (raw) {
      return LiteAdapt.pingSeries(raw, uuid, target || 'all');
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

  // Temporary bridge until the legacy Return tab is removed from app.js.
  // v0.5.1 does not read these tags as authoritative Return Route data.
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
    saveReturnRoutes: saveReturnRoutes,
    enrich: enrich,
    connectWS: connectWS,
    sparkFromSeries: sparkFromSeries,
  };
})(window);
