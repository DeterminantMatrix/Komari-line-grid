(function (global) {
  'use strict';

  if (!global.ProbeAPI || !global.LiteAdapt) return;

  const api = global.ProbeAPI;
  const adapt = global.LiteAdapt;
  const originalRpc = api.rpc;
  const originalRpcBatch = api.rpcBatch;
  const originalFetchSeries = api.fetchSeries;
  const originalFetchTrafficHistory = api.fetchTrafficHistory;
  const originalEnrich = api.enrich;
  const originalSnapshot = adapt.snapshot;
  const originalMergeLatest = adapt.mergeLatest;
  const originalMergePingHistory = adapt.mergePingHistory;

  const TASK_TTL_MS = 60000;
  const STATIC_RECONCILE_MS = 2 * 60 * 1000;
  const TRAFFIC_HISTORY_REFRESH_MS = 5 * 60 * 1000;
  let taskCache = { at: 0, items: null, inflight: null };
  let lastPayload = null;

  function numberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function currentPayload() {
    return lastPayload || global.__lineGridLastPayload || null;
  }

  function rememberPayload(payload) {
    if (!payload) return payload;
    lastPayload = payload;
    global.__lineGridLastPayload = payload;
    return payload;
  }

  adapt.snapshot = function () {
    return rememberPayload(originalSnapshot.apply(this, arguments));
  };

  adapt.mergeLatest = function (payload) {
    rememberPayload(payload);
    return originalMergeLatest.apply(this, arguments);
  };

  // Legacy history is fallback-only from v0.6.4 onward. If it is used, keep
  // live current/loss values newer than the returned history authoritative.
  adapt.mergePingHistory = function (payload, raw) {
    const liveByServer = Object.create(null);
    if (payload && Array.isArray(payload.servers)) {
      payload.servers.forEach(function (server) {
        const ping = Object.create(null);
        (server.ping || []).forEach(function (item) {
          ping[String(item.key)] = { current_ms: item.current_ms, is_loss: item.is_loss };
        });
        liveByServer[String(server.uuid)] = { at: Number(server.last_seen_at) || 0, ping: ping };
      });
    }
    const result = originalMergePingHistory.apply(this, arguments);
    if (!payload || !Array.isArray(payload.servers)) return result;
    payload.servers.forEach(function (server) {
      const live = liveByServer[String(server.uuid)];
      if (!live || !live.at) return;
      (server.ping || []).forEach(function (item) {
        const prior = live.ping[String(item.key)];
        if (!prior) return;
        const buckets = Array.isArray(item.buckets) ? item.buckets : [];
        const historyAt = buckets.length ? Number(buckets[buckets.length - 1].t) || 0 : 0;
        if (live.at <= historyAt) return;
        item.current_ms = prior.current_ms;
        item.is_loss = prior.is_loss;
      });
    });
    return result;
  };

  function shanghaiDayOfMonth(nowValue) {
    const date = nowValue instanceof Date ? nowValue : new Date(nowValue == null ? Date.now() : nowValue);
    return new Date(date.getTime() + 8 * 3600000).getUTCDate();
  }

  api.fetchTrafficHistory = function (hours) {
    if (hours != null && Number(hours) > 0) return originalFetchTrafficHistory.apply(this, arguments);
    return originalFetchTrafficHistory.call(this, shanghaiDayOfMonth() * 24);
  };

  api.fetchAccess = function () {
    return originalRpc('public:getMe', {}, 5000).then(function (me) {
      const loggedIn = !!(me && me.logged_in);
      return { known: true, logged_in: loggedIn, is_admin: loggedIn };
    }).catch(function () {
      return { known: true, logged_in: false, is_admin: false };
    });
  };

  function runBatch(calls, timeoutMs) {
    const individual = function () {
      return Promise.all(calls.map(function (call) { return originalRpc(call.method, call.params || {}, timeoutMs); }));
    };
    if (typeof originalRpcBatch !== 'function') return individual();
    return originalRpcBatch(calls, timeoutMs).catch(individual);
  }

  function loadPingTasks(force) {
    const seeded = currentPayload() && currentPayload()._bootstrap_ping_tasks;
    if (!force && !taskCache.items && Array.isArray(seeded)) taskCache = { at: Date.now(), items: seeded, inflight: null };
    if (!force && taskCache.items && Date.now() - taskCache.at < TASK_TTL_MS) return Promise.resolve(taskCache.items);
    if (taskCache.inflight) return taskCache.inflight;
    taskCache.inflight = originalRpc('public:getPublicPingTasks', {}, 8000).then(function (raw) {
      const items = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.tasks) ? raw.tasks : []);
      taskCache = { at: Date.now(), items: items, inflight: null };
      return items;
    }).catch(function (error) {
      taskCache.inflight = null;
      throw error;
    });
    return taskCache.inflight;
  }

  function taskIdFromSeries(series) {
    if (!series) return '';
    const tags = series.tags || {};
    if (tags.task_id != null && String(tags.task_id)) return String(tags.task_id);
    const points = Array.isArray(series.points) ? series.points : [];
    for (let i = 0; i < points.length; i += 1) {
      const pointTags = points[i] && points[i].tags || {};
      if (pointTags.task_id != null && String(pointTags.task_id)) return String(pointTags.task_id);
    }
    return '';
  }

  function metricPoints(series) {
    return (series && Array.isArray(series.points) ? series.points : []).map(function (point) {
      const t = Date.parse(point && point.time || '');
      const v = point && point.value != null ? Number(point.value) : null;
      return { t: Number.isFinite(t) ? t : null, value: Number.isFinite(v) ? v : -1 };
    }).filter(function (point) { return point.t != null; });
  }

  function pingLatencyPoints(latencySeries, lossSeries) {
  const lossByTime = Object.create(null);
  metricPoints(lossSeries).forEach(function (point) {
    if (point.t != null && Number.isFinite(point.value)) lossByTime[String(point.t)] = point.value;
  });
  return metricPoints(latencySeries).map(function (point) {
    const lossValue = lossByTime[String(point.t)];
    const isLoss = Number.isFinite(lossValue) && lossValue > 0;
    // Keep true loss distinct from fill_empty placeholders. Detail charts
    // may trim only trailing placeholders when a valid current Ping exists.
    if (!(point.value > 0) || isLoss) {
      return { t: point.t, value: -1, is_loss: isLoss };
    }
    return { t: point.t, value: point.value, is_loss: false };
  });
}

function alignSeriesToCurrentPing(uuid, byTask) {
  const payload = currentPayload();
  const server = payload && Array.isArray(payload.servers)
    ? payload.servers.find(function (item) { return String(item && item.uuid || '') === String(uuid || ''); })
    : null;
  if (!server) return byTask;
  const now = Date.now();
  (server.ping || []).forEach(function (ping) {
    const id = String(ping && ping.key != null ? ping.key : '');
    if (!id) return;
    const current = ping && ping.current_ms != null ? Number(ping.current_ms) : NaN;
    if (!(Number.isFinite(current) && current > 0) || ping.is_loss === true) return;
    const points = Array.isArray(byTask[id]) ? byTask[id].slice() : [];
    // fill_empty can leave empty buckets at the end of the requested
    // window. Remove only those placeholders; never remove a real-loss gap.
    while (points.length) {
      const tail = points[points.length - 1];
      if (!(Number(tail && tail.value) < 0) || (tail && tail.is_loss === true)) break;
      points.pop();
    }
    const last = points.length ? points[points.length - 1] : null;
    if (last && Number(last.t) >= now - 1000) {
      last.value = current;
      last.is_loss = false;
    } else {
      points.push({ t: now, value: current, is_loss: false, is_live: true });
    }
    byTask[id] = points;
  });
  return byTask;
}

  function indexMetricSeries(raw, metricKey) {
    const out = Object.create(null);
    const list = raw && Array.isArray(raw.series) ? raw.series : [];
    list.forEach(function (series) {
      if (metricKey && String(series.metric_key || '') !== metricKey) return;
      const entity = String(series.entity_id || '');
      const task = taskIdFromSeries(series);
      if (!entity || !task) return;
      if (!out[entity]) out[entity] = Object.create(null);
      out[entity][task] = series;
    });
    return out;
  }

  function lastMetricPoint(series) {
    const points = metricPoints(series);
    return points.length ? points[points.length - 1] : null;
  }

  function mergeNativePingOverview(payload, tasks, statsRaw, metricsRaw) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    const statsByEntity = Object.create(null);
    (statsRaw && Array.isArray(statsRaw.stats) ? statsRaw.stats : []).forEach(function (stat) {
      const entity = String(stat.entity_id || '');
      const task = String(stat.task_id || '');
      if (!entity || !task) return;
      if (!statsByEntity[entity]) statsByEntity[entity] = Object.create(null);
      statsByEntity[entity][task] = stat;
    });
    const latencyByEntity = indexMetricSeries(metricsRaw, 'ping.latency_ms');
    const lossByEntity = indexMetricSeries(metricsRaw, 'ping.loss');
    const taskById = Object.create(null);
    (tasks || []).forEach(function (task) { if (task && task.id != null) taskById[String(task.id)] = task; });

    let any = false;
    payload.servers.forEach(function (server) {
      const uuid = String(server.uuid || '');
      const prior = Object.create(null);
      (server.ping || []).forEach(function (item) { if (item && item.key != null) prior[String(item.key)] = item; });
      const stats = statsByEntity[uuid] || Object.create(null);
      const latency = latencyByEntity[uuid] || Object.create(null);
      const loss = lossByEntity[uuid] || Object.create(null);
      const ids = [];
      const seen = Object.create(null);
      (tasks || []).forEach(function (task) {
        const id = String(task && task.id != null ? task.id : '');
        if (!id || seen[id] || (!stats[id] && !latency[id] && !loss[id] && !prior[id])) return;
        seen[id] = true;
        ids.push(id);
      });
      Object.keys(prior).forEach(function (id) { if (!seen[id]) { seen[id] = true; ids.push(id); } });
      Object.keys(stats).forEach(function (id) { if (!seen[id]) { seen[id] = true; ids.push(id); } });

      server.ping = ids.map(function (id) {
        const p = prior[id] || {};
        const stat = stats[id] || {};
        const latencySeries = latency[id];
        const lossSeries = loss[id];
        const buckets = pingLatencyPoints(latencySeries, lossSeries).slice(-24).map(function (point) { return { t: point.t, ms: point.value }; });
        const lastLatency = lastMetricPoint(latencySeries);
        const lastLoss = lastMetricPoint(lossSeries);
        const lossNow = lastLoss && lastLoss.value >= 0 ? lastLoss.value > 0 : null;
        let current = null;
        let isLoss = false;
        // Metric Store is the primary Ping source here. compact latest-status
        // polling deliberately carries no Ping, so node report timestamps must
        // never prevent a newer metric sample from replacing a prior Ping value.
        if (lossNow === true) {
          isLoss = true;
        } else if (lastLatency && lastLatency.value >= 0) {
          current = Math.round(lastLatency.value);
        } else if (numberOrNull(stat.latest) != null && Number(stat.latest) >= 0) {
          current = Math.round(Number(stat.latest));
        } else if (p.current_ms != null) {
          current = Number(p.current_ms);
          isLoss = !!p.is_loss;
        }
        if (stat.task_id != null || latencySeries || lossSeries) any = true;
        return {
          key: id,
          label: String(stat.name || (taskById[id] && taskById[id].name) || p.label || ('Ping ' + id)),
          current_ms: current,
          is_loss: isLoss,
          loss_pct: numberOrNull(stat.loss) != null ? Number(stat.loss) : (numberOrNull(p.loss_pct) || 0),
          avg_ms: numberOrNull(stat.avg),
          min_ms: numberOrNull(stat.min),
          max_ms: numberOrNull(stat.max),
          p50_ms: numberOrNull(stat.p50),
          p99_ms: numberOrNull(stat.p99),
          buckets: buckets.length ? buckets : (p.buckets || []),
        };
      });
    });
    payload._ping_history_status = any ? 'ok' : 'unavailable';
    payload._ping_source = any ? 'metric-store' : payload._ping_source;
    return payload;
  }

  function legacyPingOverview() {
    const payload = currentPayload();
    if (!payload) return Promise.resolve(null);
    return originalRpc('common:getRecords', { type: 'ping', uuid: '', hours: 1, task_id: -1, maxCount: -1 }, 18000)
      .then(function (raw) { adapt.mergePingHistory(payload, raw); return payload; })
      .catch(function () { payload._ping_history_status = 'unavailable'; return payload; });
  }

  api.fetchPingOverview = function () {
    const payload = currentPayload();
    if (!payload) return Promise.resolve(null);
    const entityIds = (payload.servers || []).map(function (server) { return String(server.uuid || ''); }).filter(Boolean);
    if (!entityIds.length) return Promise.resolve(payload);
    return loadPingTasks(false).then(function (tasks) {
      return runBatch([
        { method: 'public:getPingMetricStats', params: { entity_ids: entityIds, hours: 1, max_points: 120 } },
        { method: 'public:queryMetrics', params: {
          metric_keys: ['ping.latency_ms', 'ping.loss'],
          entity_ids: entityIds,
          hours: 1,
          fill_empty: true,
          max_points: 24,
          aggregation_by_metric: { 'ping.latency_ms': 'last', 'ping.loss': 'last' },
        } },
      ], 18000).then(function (parts) { return mergeNativePingOverview(payload, tasks, parts[0], parts[1]); });
    }).catch(function () { return legacyPingOverview(); });
  };

  function rangeHours(range) {
    const value = String(range || '1h').toLowerCase();
    if (value === '7d') return 168;
    if (value === '24h') return 24;
    if (value === '6h') return 6;
    return 1;
  }

  function rangePoints(hours) {
    if (hours >= 168) return 672;
    if (hours >= 24) return 480;
    if (hours >= 6) return 360;
    return 180;
  }

  api.fetchSeries = function (uuid, range, target) {
    const hours = rangeHours(range);
    const normalizedTarget = target && target !== 'all' ? String(target) : 'all';
    return loadPingTasks(false).then(function (tasks) {
      const params = {
        metric_keys: ['ping.latency_ms', 'ping.loss'],
        entity_ids: [String(uuid || '')],
        hours: hours,
        fill_empty: true,
        max_points: rangePoints(hours),
      };
      if (normalizedTarget !== 'all') params.tags = { task_id: normalizedTarget };
      return originalRpc('public:queryMetrics', params, hours >= 168 ? 18000 : 12000).then(function (raw) {
        const latencyByTask = Object.create(null);
        const lossByTask = Object.create(null);
        (raw && Array.isArray(raw.series) ? raw.series : []).forEach(function (series) {
          const id = taskIdFromSeries(series);
          if (!id) return;
          const metric = String(series.metric_key || '');
          if (metric === 'ping.latency_ms') latencyByTask[id] = series;
          else if (metric === 'ping.loss') lossByTask[id] = series;
        });
        const byTask = Object.create(null);
        Object.keys(latencyByTask).forEach(function (id) {
          byTask[id] = pingLatencyPoints(latencyByTask[id], lossByTask[id]);
        });
        alignSeriesToCurrentPing(uuid, byTask);
        const orderedIds = [];
        const seen = Object.create(null);
        (tasks || []).forEach(function (task) {
          const id = String(task && task.id != null ? task.id : '');
          if (id && byTask[id] && !seen[id]) { seen[id] = true; orderedIds.push(id); }
        });
        Object.keys(byTask).forEach(function (id) { if (!seen[id]) orderedIds.push(id); });
        const taskMap = Object.create(null);
        (tasks || []).forEach(function (task) { if (task && task.id != null) taskMap[String(task.id)] = task; });
        const seriesByTask = orderedIds.map(function (id) {
          return { key: id, label: String(taskMap[id] && taskMap[id].name || ('Ping ' + id)), points: byTask[id] };
        });
        const selected = normalizedTarget !== 'all' ? normalizedTarget : (orderedIds[0] || '');
        return { series: selected && byTask[selected] ? byTask[selected] : [], seriesByTask: seriesByTask, tasks: tasks };
      });
    }).catch(function () { return originalFetchSeries.call(api, uuid, range, target); });
  };

  function nativeSystemHistory(params, timeoutMs) {
    const uuid = String(params && params.uuid || '');
    const payload = currentPayload();
    const server = payload && (payload.servers || []).find(function (item) { return String(item.uuid || '') === uuid; });
    const ramTotal = server && numberOrNull(server.mem_total);
    const diskTotal = server && numberOrNull(server.disk_total);
    if (!uuid || !ramTotal || !diskTotal) return originalRpc('common:getRecords', params, timeoutMs);
    const hours = Math.max(1, Number(params.hours) || 1);
    const maxPoints = Math.max(120, Number(params.maxCount) || 360);
    return originalRpc('public:queryMetrics', {
      metric_keys: ['cpu.usage', 'memory.used', 'disk.used'],
      entity_ids: [uuid],
      hours: hours,
      fill_empty: false,
      max_points: maxPoints,
    }, timeoutMs).then(function (raw) {
      const rows = Object.create(null);
      (raw && Array.isArray(raw.series) ? raw.series : []).forEach(function (series) {
        const metric = String(series.metric_key || '');
        (series.points || []).forEach(function (point) {
          const t = Date.parse(point && point.time || '');
          if (!Number.isFinite(t) || point.value == null || !Number.isFinite(Number(point.value))) return;
          const key = String(t);
          if (!rows[key]) rows[key] = { client: uuid, time: new Date(t).toISOString(), ram_total: ramTotal, disk_total: diskTotal };
          if (metric === 'cpu.usage') rows[key].cpu = Number(point.value);
          else if (metric === 'memory.used') rows[key].ram = Number(point.value);
          else if (metric === 'disk.used') rows[key].disk = Number(point.value);
        });
      });
      const records = Object.keys(rows).map(function (key) { return rows[key]; }).sort(function (a, b) { return Date.parse(a.time) - Date.parse(b.time); });
      if (!records.length) return originalRpc('common:getRecords', params, timeoutMs);
      return { records: records, count: records.length, source: 'metric-store' };
    }).catch(function () { return originalRpc('common:getRecords', params, timeoutMs); });
  }

  api.rpc = function (method, params, timeoutMs) {
    if (method === 'common:getRecords' && params && params.type === 'load' && params.load_type === 'all') {
      return nativeSystemHistory(params, timeoutMs);
    }
    return originalRpc(method, params, timeoutMs);
  };

  function median(values) {
    const list = values.filter(function (value) { return Number.isFinite(value) && value > 0; }).sort(function (a, b) { return a - b; });
    if (!list.length) return null;
    const mid = Math.floor(list.length / 2);
    return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
  }

  function fetchBillingServersPage(page) {
    return originalRpc('admin:getBillingServers', { currency: 'CNY', page: String(page), page_size: '100' }, 12000);
  }

  function fetchAllBillingServers() {
    return fetchBillingServersPage(1).then(function (first) {
      const items = first && Array.isArray(first.items) ? first.items.slice() : [];
      const pages = Math.max(1, Number(first && first.pagination && first.pagination.pages) || 1);
      if (pages <= 1) return items;
      const calls = [];
      for (let page = 2; page <= pages; page += 1) calls.push({ method: 'admin:getBillingServers', params: { currency: 'CNY', page: String(page), page_size: '100' } });
      return runBatch(calls, 12000).then(function (rest) {
        rest.forEach(function (part) { if (part && Array.isArray(part.items)) items.push.apply(items, part.items); });
        return items;
      });
    });
  }

  function fallbackFx(payload, nativeRates, missing) {
    if (!missing.length || !global.LineGridEnrich || !LineGridEnrich.getDailyExchangeRates) {
      payload._fx_rates = nativeRates;
      payload._fx_source = 'Lite Billing';
      payload._fx_updated_at = Date.now();
      return Promise.resolve(payload);
    }
    return LineGridEnrich.getDailyExchangeRates().then(function (fx) {
      payload._fx_rates = Object.assign({}, fx && fx.rates || {}, nativeRates);
      payload._fx_source = 'Lite Billing + fallback';
      payload._fx_updated_at = fx && fx.updatedAt || Date.now();
      return payload;
    }).catch(function () {
      payload._fx_rates = nativeRates;
      payload._fx_source = 'Lite Billing';
      payload._fx_updated_at = Date.now();
      return payload;
    });
  }

  function applyNativeBilling(payload, rows) {
    const ratesByCurrency = Object.create(null);
    const serverById = Object.create(null);
    (payload.servers || []).forEach(function (server) { serverById[String(server.uuid || '')] = server; });
    (rows || []).forEach(function (row) {
      const server = serverById[String(row.client || '')];
      if (server) {
        server._billing_monthly_cny = numberOrNull(row.monthly_average);
        server._billing_yearly_cny = numberOrNull(row.yearly_average);
        server._billing_remaining_value_cny = numberOrNull(row.remaining_value);
      }
      const code = global.LineGridEnrich && LineGridEnrich.normalizeCurrency ? LineGridEnrich.normalizeCurrency(row.original_currency) : String(row.original_currency || 'CNY').toUpperCase();
      if (code === 'CNY') {
        if (!ratesByCurrency.CNY) ratesByCurrency.CNY = [];
        ratesByCurrency.CNY.push(1);
        return;
      }
      const amount = numberOrNull(row.original_amount);
      const cycle = numberOrNull(row.billing_cycle_days);
      const convertedMonthly = numberOrNull(row.monthly_average);
      if (amount == null || cycle == null || cycle <= 0 || convertedMonthly == null || convertedMonthly <= 0) return;
      const nativeMonthly = amount * 30.4375 / cycle;
      const rate = nativeMonthly / convertedMonthly;
      if (!Number.isFinite(rate) || rate <= 0) return;
      if (!ratesByCurrency[code]) ratesByCurrency[code] = [];
      ratesByCurrency[code].push(rate);
    });
    const nativeRates = { CNY: 1 };
    Object.keys(ratesByCurrency).forEach(function (code) {
      const value = median(ratesByCurrency[code]);
      if (value != null) nativeRates[code] = value;
    });
    const wanted = Object.create(null);
    (payload.servers || []).forEach(function (server) {
      if (!(Number(server.price) > 0) || !(Number(server.billing_cycle) > 0)) return;
      const code = global.LineGridEnrich && LineGridEnrich.normalizeCurrency ? LineGridEnrich.normalizeCurrency(server.currency) : String(server.currency || 'CNY').toUpperCase();
      wanted[code] = true;
    });
    const missing = Object.keys(wanted).filter(function (code) { return !nativeRates[code]; });
    payload._billing_source = 'lite-native';
    return fallbackFx(payload, nativeRates, missing);
  }

  api.enrich = function (payload, options) {
    options = options || {};
    const baseOptions = Object.assign({}, options, { loadFx: false });
    return originalEnrich(payload, baseOptions).then(function (next) {
      const target = next || payload;
      if (!target || options.loadFx !== true) return target;
      return fetchAllBillingServers().then(function (rows) {
        return applyNativeBilling(target, rows);
      }).catch(function () {
        if (!global.LineGridEnrich || !LineGridEnrich.getDailyExchangeRates) return target;
        return LineGridEnrich.getDailyExchangeRates().then(function (fx) {
          target._fx_rates = fx && fx.rates || LineGridEnrich.defaultRates;
          target._fx_source = fx && fx.source || 'default';
          target._fx_updated_at = fx && fx.updatedAt || null;
          target._billing_source = 'fallback';
          return target;
        }).catch(function () { return target; });
      });
    });
  };

  function nativeShanghaiDateKey(nowValue) {
    const date = new Date(Number(nowValue == null ? Date.now() : nowValue) + 8 * 3600000);
    return String(date.getUTCFullYear()).padStart(4, '0') + '-' +
      String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(date.getUTCDate()).padStart(2, '0');
  }

  function sameBillingIdentity(a, b) {
    return Number(a && a.price) === Number(b && b.price) &&
      Number(a && a.billing_cycle) === Number(b && b.billing_cycle) &&
      String(a && a.currency || '') === String(b && b.currency || '') &&
      String(a && a.expires_at_raw || '') === String(b && b.expires_at_raw || '');
  }

  function reconcileStaticServer(prior, next, preserveGeo) {
    if (!prior) return next;
    const merged = Object.assign({}, prior, next);
    if (Array.isArray(prior.ping) && prior.ping.length) merged.ping = prior.ping;
    if (Array.isArray(prior.daily_traffic)) merged.daily_traffic = prior.daily_traffic;
    ['traffic_history_status', 'traffic_history_days', 'traffic_retention_days'].forEach(function (key) {
      if (prior[key] != null) merged[key] = prior[key];
    });

    const sameLookup = String(prior._lookup_ip || '') === String(next._lookup_ip || '');
    if (preserveGeo && sameLookup) {
      ['region_city', 'geo_country', 'longitude', 'latitude', 'asn', 'asn_org', 'geo_source', 'provider_name', 'provider_url'].forEach(function (key) {
        const value = next[key];
        if ((value == null || value === '') && prior[key] != null && prior[key] !== '') merged[key] = prior[key];
      });
    }

    if (sameBillingIdentity(prior, next)) {
      ['_billing_monthly_cny', '_billing_yearly_cny', '_billing_remaining_value_cny'].forEach(function (key) {
        if (prior[key] != null) merged[key] = prior[key];
      });
    } else {
      delete merged._billing_monthly_cny;
      delete merged._billing_yearly_cny;
      delete merged._billing_remaining_value_cny;
    }
    return merged;
  }

  function reconcileStaticPayload(current, fresh) {
    if (!current || !fresh || !Array.isArray(fresh.servers)) return current || fresh;
    const priorById = Object.create(null);
    (current.servers || []).forEach(function (server) { if (server && server.uuid) priorById[String(server.uuid)] = server; });
    const preserveGeo = fresh.enable_ip_geo_asn === true;
    const mergedServers = fresh.servers.map(function (server) {
      return reconcileStaticServer(priorById[String(server.uuid || '')], server, preserveGeo);
    });
    ['title', 'appearance', 'show_globe', 'globe_quality', 'offline_server_position', 'enable_ip_geo_asn', 'geo_ip_provider', 'geo_ip_fallback', 'billing_timezone', '_public'].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(fresh, key)) current[key] = fresh[key];
    });
    current.servers = typeof adapt.sortServers === 'function' ? adapt.sortServers(mergedServers) : mergedServers;
    if (global.LineGridLite && typeof global.LineGridLite.applyLiteDisplayWindows === 'function') {
      global.LineGridLite.applyLiteDisplayWindows(current);
    }
    return rememberPayload(current);
  }

  function fetchStaticSnapshot() {
    const current = currentPayload();
    if (!current) return Promise.resolve(null);
    return runBatch([
      { method: 'common:getNodes', params: {} },
      { method: 'common:getNodesLatestStatus', params: { compact: true }, fallback: {} },
      { method: 'common:getPublicInfo', params: {}, fallback: {} },
    ], 10000).then(function (parts) {
      const fresh = originalSnapshot(parts[0], parts[1], parts[2]);
      if (global.LineGridLite && typeof global.LineGridLite.applyLiteDisplayWindows === 'function') {
        global.LineGridLite.applyLiteDisplayWindows(fresh);
      }
      const merged = reconcileStaticPayload(current, fresh);
      return api.enrich(merged, { loadFx: false }).then(function (next) { return rememberPayload(next || merged); }).catch(function () { return merged; });
    });
  }

  // Compact status stays on Lite's native current-status RPC every two seconds.
  // Ping statistics/series refresh separately from Metric Store once per minute.
  // Static node metadata is reconciled every two minutes (and on tab return),
  // while traffic history refreshes every five minutes.
  api.connectWS = function (onPayload) {
    let stopped = false;
    let running = false;
    let timer = null;
    let tick = 0;
    let lastStaticAt = Date.now();
    let lastTrafficAt = Date.now();
    let lastShanghaiDay = nativeShanghaiDateKey(Date.now());
    let forceStatic = false;

    function clear() {
      if (timer) clearTimeout(timer);
      timer = null;
    }

    function schedule() {
      clear();
      if (!stopped && !document.hidden) timer = setTimeout(refresh, 2000);
    }

    function emit(payload, info) {
      if (!stopped && payload && typeof onPayload === 'function') onPayload(payload, info);
    }

    function maintenance(payload, now) {
      const tasks = [];
      const day = nativeShanghaiDateKey(now);
      if (day !== lastShanghaiDay) {
        lastShanghaiDay = day;
        if (global.LineGridLite && typeof global.LineGridLite.applyLiteDisplayWindows === 'function') {
          global.LineGridLite.applyLiteDisplayWindows(payload, now);
        }
        emit(payload, { kind: 'cycle-rollover' });
      }

      if (forceStatic || now - lastStaticAt >= STATIC_RECONCILE_MS) {
        forceStatic = false;
        lastStaticAt = now;
        tasks.push(fetchStaticSnapshot().then(function (next) {
          if (next) emit(next, { kind: 'static-reconcile' });
          return next;
        }));
      }

      if (tick % 30 === 0) {
        tasks.push(api.fetchPingOverview().then(function (next) {
          if (next) emit(next, { kind: 'metric-ping', ping: true });
          return next;
        }));
      }

      if (now - lastTrafficAt >= TRAFFIC_HISTORY_REFRESH_MS) {
        lastTrafficAt = now;
        tasks.push(api.fetchTrafficHistory().then(function (next) {
          if (next) emit(next, { kind: 'traffic-history' });
          return next;
        }));
      }
      return Promise.allSettled(tasks);
    }

    function refresh() {
      const payload = currentPayload();
      if (stopped || running || document.hidden || !payload) return;
      running = true;
      tick += 1;
      originalRpc('common:getNodesLatestStatus', { compact: true }, 8000)
        .then(function (latest) {
          if (stopped) return null;
          adapt.mergeLatest(payload, latest);
          emit(payload, { kind: 'latest', ping: false });
          return maintenance(payload, Date.now());
        })
        .catch(function () {})
        .finally(function () { running = false; schedule(); });
    }

    function visible() {
      if (document.hidden) {
        clear();
        return;
      }
      forceStatic = true;
      clear();
      refresh();
    }

    document.addEventListener('visibilitychange', visible);
    refresh();
    return {
      close: function () {
        stopped = true;
        clear();
        document.removeEventListener('visibilitychange', visible);
      },
    };
  };

  global.LineGridNativeData = {
    version: '0.6.8',
    ping: 'public:getPingMetricStats + public:queryMetrics',
    system: 'public:queryMetrics',
    billing: 'admin:getBillingServers',
  };
})(window);
