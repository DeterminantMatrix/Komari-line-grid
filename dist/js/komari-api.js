(function (global) {
  'use strict';

  var seq = 1;
  var endpoint = '/api/rpc2';
  var metaCache = null;

  function rpc(method, params, timeoutMs) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : 8000;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeout) : null;
    return fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: seq++, method: method, params: params || {} }),
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response.ok) throw new Error('RPC HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        if (payload && payload.error) throw new Error(payload.error.message || 'RPC error');
        return payload ? payload.result : null;
      })
      .catch(function (error) {
        if (controller && controller.signal.aborted) throw new Error('RPC timeout: ' + method);
        throw error;
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function numberOrNull(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function positiveOrNull(value) {
    var n = numberOrNull(value);
    return n != null && n > 0 ? n : null;
  }

  function firstNumber() {
    for (var i = 0; i < arguments.length; i += 1) {
      var n = numberOrNull(arguments[i]);
      if (n != null) return n;
    }
    return null;
  }

  function normalizeObject(value) {
    if (!value) return {};
    if (!Array.isArray(value) && typeof value === 'object') return value;
    var out = {};
    (value || []).forEach(function (item) {
      if (item && item.uuid) out[item.uuid] = item;
    });
    return out;
  }

  function countryCode(region) {
    var s = String(region || '').trim();
    var exact = s.match(/^([A-Z]{2})$/);
    if (exact) return exact[1];
    var inside = s.match(/\b([A-Z]{2})\b/);
    if (inside) return inside[1];
    var flags = {
      '🇭🇰': 'HK', '🇯🇵': 'JP', '🇸🇬': 'SG', '🇺🇸': 'US', '🇩🇪': 'DE', '🇳🇱': 'NL',
      '🇬🇧': 'GB', '🇫🇷': 'FR', '🇰🇷': 'KR', '🇹🇼': 'TW', '🇦🇺': 'AU', '🇨🇦': 'CA',
      '🇨🇳': 'CN', '🇹🇭': 'TH', '🇲🇾': 'MY', '🇮🇩': 'ID', '🇻🇳': 'VN', '🇮🇳': 'IN',
      '🇦🇪': 'AE', '🇷🇺': 'RU', '🇧🇷': 'BR'
    };
    for (var key in flags) {
      if (Object.prototype.hasOwnProperty.call(flags, key) && s.indexOf(key) >= 0) return flags[key];
    }
    return '';
  }

  function currencySymbol(currency) {
    var c = String(currency || '').toUpperCase();
    return ({ CNY: '¥', RMB: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥', HKD: 'HK$', SGD: 'S$' })[c] || (c ? c + ' ' : '');
  }

  function normalizeExpiry(value) {
    if (!value) return '';
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    var year = d.getUTCFullYear();
    if (year < 2000 || year >= 2100) return '';
    return d.toISOString().slice(0, 10);
  }

  function billingCycleLabel(days) {
    var d = positiveOrNull(days);
    if (!d) return '';
    if (d >= 350 && d <= 380) return 'year';
    if (d >= 170 && d <= 190) return 'half_year';
    if (d >= 80 && d <= 100) return 'quarter';
    if (d >= 27 && d <= 32) return 'month';
    return d + 'd';
  }

  function periodStart(resetDay, now) {
    var current = now ? new Date(now) : new Date();
    var day = Math.max(1, Math.min(28, Number(resetDay) || 1));
    var year = current.getFullYear();
    var month = current.getMonth();
    if (current.getDate() < day) {
      month -= 1;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
    }
    return new Date(year, month, day, 0, 0, 0, 0);
  }

  function mergeMetadata(base, extra) {
    var out = {};
    var key;
    base = base || {};
    extra = extra || {};
    for (key in base) if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
    for (key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) out[key] = extra[key];
    return out;
  }

  function loadMetadata() {
    if (metaCache) return Promise.resolve(metaCache);
    var inline = global.LINE_GRID_METADATA && typeof global.LINE_GRID_METADATA === 'object' ? global.LINE_GRID_METADATA : {};
    return fetch('./metadata/nodes.json', { cache: 'no-store' })
      .then(function (response) { return response.ok ? response.json() : {}; })
      .catch(function () { return {}; })
      .then(function (file) {
        metaCache = {
          global: mergeMetadata(file.global || {}, inline.global || {}),
          nodes: mergeMetadata(file.nodes || {}, inline.nodes || {})
        };
        return metaCache;
      });
  }

  function getPublicInfo() {
    return rpc('common:getPublicInfo').catch(function () { return {}; });
  }

  function getNodes() {
    return rpc('common:getNodes').then(normalizeObject);
  }

  function getLatest(uuids) {
    var params = uuids && uuids.length ? { uuids: uuids } : {};
    return rpc('common:getNodesLatestStatus', params).then(normalizeObject);
  }

  function oldPingByKey(oldRows) {
    var by = {};
    (oldRows || []).forEach(function (row) { if (row && row.key != null) by[String(row.key)] = row; });
    return by;
  }

  function mapPing(ping, oldRows) {
    var oldBy = oldPingByKey(oldRows);
    var out = [];
    Object.keys(ping || {}).forEach(function (id) {
      var p = ping[id] || {};
      var current = numberOrNull(p.latest);
      var old = oldBy[String(id)];
      var trail = old && Array.isArray(old.buckets) ? old.buckets.slice(-23) : [];
      if (current != null) {
        trail.push({ ms: current, t: Math.floor(Date.now() / 1000), loss: numberOrNull(p.loss) || 0 });
      }
      out.push({
        key: String(id),
        label: p.name || ('Task ' + id),
        isp: p.isp || '',
        current_ms: current == null ? -1 : current,
        loss_pct: numberOrNull(p.loss) || 0,
        avg_ms: numberOrNull(p.avg),
        min_ms: numberOrNull(p.min),
        max_ms: numberOrNull(p.max),
        tail: numberOrNull(p.tail),
        buckets: trail
      });
    });
    return out;
  }

  function hasLiveRecord(live) {
    return !!(live && typeof live === 'object' && Object.keys(live).length);
  }

  function liveLoadText(live) {
    if (!hasLiveRecord(live)) return '';
    var values = [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)];
    if (values.every(function (v) { return v == null; })) return '';
    return values.map(function (v) { return v == null ? '—' : v.toFixed(2); }).join(' ');
  }

  function trafficValue(up, down, type) {
    up = numberOrNull(up);
    down = numberOrNull(down);
    if (up == null && down == null) return null;
    up = up == null ? 0 : up;
    down = down == null ? 0 : down;
    if (type === 'up') return up;
    if (type === 'down') return down;
    if (type === 'max') return Math.max(up, down);
    if (type === 'min') return Math.min(up, down);
    return up + down;
  }

  function liveTrafficTotals(live) {
    if (!hasLiveRecord(live)) return { up: null, down: null, total: null, available: false };
    var up = firstNumber(live.net_total_out, live.net_total_up);
    var down = firstNumber(live.net_total_in, live.net_total_down);
    return {
      up: up,
      down: down,
      total: up == null && down == null ? null : (up == null ? 0 : up) + (down == null ? 0 : down),
      available: up != null || down != null
    };
  }

  function applyLiveTrafficFallback(server, live) {
    var totals = liveTrafficTotals(live);
    server.traffic_live_up = totals.up;
    server.traffic_live_down = totals.down;
    if (!totals.available || server.traffic_source === 'metric') return;
    server.traffic_available = true;
    server.traffic_source = 'live_total';
    server.traffic_used_up = totals.up == null ? 0 : totals.up;
    server.traffic_used_down = totals.down == null ? 0 : totals.down;
    server.traffic_used_total = totals.total;
    server.traffic_used = trafficValue(totals.up, totals.down, server.traffic_limit_type);
  }

  function mapNode(node, live, extension) {
    node = node || {};
    extension = extension || {};
    var hasLive = hasLiveRecord(live);
    var country = extension.region_country || countryCode(node.region);
    var rawRegion = String(node.region || '').trim();
    var regionName = extension.region_name || (rawRegion && rawRegion.toUpperCase() !== String(country || '').toUpperCase() ? rawRegion : '');
    var price = positiveOrNull(node.price);
    var billingDays = positiveOrNull(node.billing_cycle);
    var expiry = normalizeExpiry(node.expired_at);
    var liveTotals = liveTrafficTotals(live);
    var initialTraffic = trafficValue(liveTotals.up, liveTotals.down, node.traffic_limit_type || 'sum');
    return {
      uuid: node.uuid,
      name: node.name || node.uuid || '未命名',
      online: hasLive ? !!live.online : false,
      has_live: hasLive,
      last_report_at: hasLive ? (live.time || live.updated_at || '') : '',
      region: node.region || '',
      region_country: country,
      region_name: regionName,
      region_city: extension.region_city || '',
      longitude: numberOrNull(extension.longitude),
      latitude: numberOrNull(extension.latitude),
      provider_name: extension.provider_name || '',
      provider_url: extension.provider_url || '',
      telecom_paid_peer: !!extension.telecom_paid_peer,
      download_speed: hasLive ? numberOrNull(live.net_in) : null,
      upload_speed: hasLive ? numberOrNull(live.net_out) : null,
      traffic_used: liveTotals.available ? initialTraffic : null,
      traffic_limit: numberOrNull(node.traffic_limit) || 0,
      traffic_limit_type: node.traffic_limit_type || 'sum',
      traffic_used_up: liveTotals.available ? (liveTotals.up == null ? 0 : liveTotals.up) : null,
      traffic_used_down: liveTotals.available ? (liveTotals.down == null ? 0 : liveTotals.down) : null,
      traffic_used_total: liveTotals.available ? liveTotals.total : null,
      traffic_available: liveTotals.available,
      traffic_source: liveTotals.available ? 'live_total' : 'none',
      traffic_live_up: liveTotals.up,
      traffic_live_down: liveTotals.down,
      period_start: '',
      period_end: '',
      cpu_pct: hasLive ? numberOrNull(live.cpu) : null,
      loadavg: liveLoadText(live),
      mem_used: hasLive ? numberOrNull(live.ram) : null,
      mem_total: firstNumber(live && live.ram_total, node.mem_total),
      swap_used: hasLive ? numberOrNull(live.swap) : null,
      swap_total: firstNumber(live && live.swap_total, node.swap_total),
      disk_used: hasLive ? numberOrNull(live.disk) : null,
      disk_total: firstNumber(live && live.disk_total, node.disk_total),
      uptime: hasLive ? numberOrNull(live.uptime) : null,
      cpu_model: node.cpu_name || '',
      cpu_cores: positiveOrNull(node.cpu_cores),
      cpu_threads: positiveOrNull(extension.cpu_threads) || positiveOrNull(node.cpu_cores),
      os: node.os || '',
      kernel: node.kernel_version || '',
      arch: node.arch || '',
      virtualization: node.virtualization || '',
      gpu: node.gpu_name || '',
      version: node.version || '',
      group: node.group || '',
      tags: node.tags || '',
      ipv4: node.ipv4 || '',
      ipv6: node.ipv6 || '',
      ping: hasLive ? mapPing(live.ping) : [],
      expires_at: expiry,
      renewal_price: price,
      renewal_currency: price ? (node.currency || '') : '',
      renewal_cycle_days: billingDays,
      renewal_cycle: billingCycleLabel(billingDays),
      renewal_price_cny: positiveOrNull(extension.renewal_price_cny),
      return_routes: Array.isArray(extension.return_routes) ? extension.return_routes : [],
      traffic_reset_day: positiveOrNull(extension.traffic_reset_day) || 1,
      daily_traffic: [],
      traffic_history: [],
      metadata: extension
    };
  }

  function normalizeInfo(info) {
    return {
      title: info && (info.sitename || info.site_name || info.name) || 'Komari',
      description: info && info.description || ''
    };
  }

  function queryMetrics(params) {
    return rpc('public:queryMetrics', params, 12000);
  }

  function trafficWindow(servers, startOverride) {
    var ids = servers.map(function (server) { return server.uuid; });
    var end = new Date();
    var start = startOverride || new Date(Date.now() - 35 * 86400000);
    return queryMetrics({
      metric_keys: ['traffic.up', 'traffic.down'],
      entity_ids: ids,
      start: start.toISOString(),
      end: end.toISOString(),
      aggregation: 'sum',
      max_points_by_metric: { 'traffic.up': 6000, 'traffic.down': 6000 }
    }).then(function (result) {
      if (!result || !Array.isArray(result.series)) throw new Error('Metric response missing series');
      var by = {};
      ids.forEach(function (id) { by[id] = { up: 0, down: 0, days: {}, seen: false }; });
      result.series.forEach(function (series) {
        var id = series.entity_id;
        if (!by[id]) return;
        var isUp = series.metric_key === 'traffic.up';
        if (!isUp && series.metric_key !== 'traffic.down') return;
        by[id].seen = true;
        (series.points || []).forEach(function (point) {
          var value = numberOrNull(point.value);
          if (value == null) return;
          var day = String(point.time || '').slice(0, 10);
          if (isUp) by[id].up += value;
          else by[id].down += value;
          if (!day) return;
          var row = by[id].days[day] || (by[id].days[day] = { date: day, up: 0, down: 0, total: 0 });
          if (isUp) row.up += value;
          else row.down += value;
          row.total = row.up + row.down;
        });
      });
      return by;
    });
  }

  function loadTraffic(servers) {
    if (!servers || !servers.length) return Promise.resolve(servers || []);
    var now = new Date();
    var earliest = new Date(now.getFullYear(), now.getMonth(), 1);
    servers.forEach(function (server) {
      var p = periodStart(server.traffic_reset_day, now);
      if (p < earliest) earliest = p;
    });
    var seven = new Date(Date.now() - 8 * 86400000);
    if (seven < earliest) earliest = seven;

    return trafficWindow(servers, earliest).then(function (by) {
      servers.forEach(function (server) {
        var bucket = by[server.uuid] || { days: {}, seen: false };
        var start = periodStart(server.traffic_reset_day, now);
        if (!bucket.seen) {
          if (server.traffic_source !== 'live_total') {
            server.traffic_available = false;
            server.traffic_used = null;
            server.traffic_used_up = null;
            server.traffic_used_down = null;
            server.traffic_used_total = null;
            server.traffic_source = 'none';
          }
          server.period_start = start.toISOString().slice(0, 10);
          var missingEnd = new Date(start);
          missingEnd.setMonth(missingEnd.getMonth() + 1);
          server.period_end = missingEnd.toISOString().slice(0, 10);
          server.traffic_history = [];
          server.daily_traffic = [];
          return;
        }
        var up = 0;
        var down = 0;
        Object.keys(bucket.days || {}).forEach(function (key) {
          if (new Date(key + 'T23:59:59') >= start) {
            up += bucket.days[key].up;
            down += bucket.days[key].down;
          }
        });
        server.traffic_available = true;
        server.traffic_source = 'metric';
        server.traffic_used_up = up;
        server.traffic_used_down = down;
        server.traffic_used_total = up + down;
        server.traffic_used = trafficValue(up, down, server.traffic_limit_type);
        server.period_start = start.toISOString().slice(0, 10);
        var end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        server.period_end = end.toISOString().slice(0, 10);
        var rows = Object.keys(bucket.days || {}).sort().map(function (key) { return bucket.days[key]; });
        server.traffic_history = rows.map(function (row) {
          return { date: row.date, uplink: row.up, downlink: row.down, total: row.total };
        });
        server.daily_traffic = server.traffic_history.slice(-7);
      });
      return servers;
    }).catch(function (error) {
      servers.forEach(function (server) {
        if (server.traffic_source !== 'live_total') {
          server.traffic_available = false;
          server.traffic_used = null;
          server.traffic_used_up = null;
          server.traffic_used_down = null;
          server.traffic_used_total = null;
          server.traffic_source = 'none';
        }
        server.daily_traffic = [];
        server.traffic_history = [];
      });
      throw error;
    });
  }

  function getPingHistory(uuid, hours, taskId) {
    var params = { type: 'ping', uuid: uuid, hours: hours || 1, maxCount: 2000 };
    if (taskId != null && taskId !== '' && taskId !== 'all') params.task_id = Number(taskId);
    return rpc('common:getRecords', params).then(function (result) {
      result = result || {};
      return { records: result.records || [], tasks: result.tasks || [], basic_info: result.basic_info || [] };
    });
  }

  function getLoadHistory(uuid, hours, loadType) {
    return rpc('common:getRecords', {
      type: 'load', uuid: uuid, hours: hours || 1, load_type: loadType || 'all', maxCount: 2000
    });
  }

  function snapshot() {
    return Promise.all([getNodes(), getLatest().catch(function () { return {}; }), loadMetadata(), getPublicInfo()]).then(function (all) {
      var nodes = all[0];
      var latest = all[1];
      var metadata = all[2];
      var info = normalizeInfo(all[3]);
      var servers = Object.keys(nodes).map(function (id) {
        return mapNode(nodes[id], latest[id], metadata.nodes[id] || {});
      });
      servers.sort(function (a, b) {
        var aw = numberOrNull(nodes[a.uuid] && nodes[a.uuid].weight) || 0;
        var bw = numberOrNull(nodes[b.uuid] && nodes[b.uuid].weight) || 0;
        return aw - bw;
      });
      return {
        enabled: true,
        title: metadata.global.title || info.title,
        description: info.description,
        show_globe: metadata.global.show_globe !== false,
        servers: servers,
        metadata: metadata.global
      };
    });
  }

  function applyLatest(state) {
    var servers = state && state.servers || [];
    var ids = servers.map(function (server) { return server.uuid; });
    return getLatest(ids).then(function (latest) {
      servers.forEach(function (server) {
        var live = latest[server.uuid];
        var hasLive = hasLiveRecord(live);
        server.has_live = hasLive;
        server.online = hasLive ? !!live.online : false;
        server.last_report_at = hasLive ? (live.time || live.updated_at || '') : '';
        server.download_speed = hasLive ? numberOrNull(live.net_in) : null;
        server.upload_speed = hasLive ? numberOrNull(live.net_out) : null;
        server.cpu_pct = hasLive ? numberOrNull(live.cpu) : null;
        server.loadavg = liveLoadText(live);
        server.mem_used = hasLive ? numberOrNull(live.ram) : null;
        server.mem_total = firstNumber(live && live.ram_total, server.mem_total);
        server.swap_used = hasLive ? numberOrNull(live.swap) : null;
        server.swap_total = firstNumber(live && live.swap_total, server.swap_total);
        server.disk_used = hasLive ? numberOrNull(live.disk) : null;
        server.disk_total = firstNumber(live && live.disk_total, server.disk_total);
        server.uptime = hasLive ? numberOrNull(live.uptime) : null;
        server.ping = hasLive ? mapPing(live.ping, server.ping) : [];
        applyLiveTrafficFallback(server, live);
      });
      return state;
    });
  }

  global.KomariLineGridAPI = {
    rpc: rpc,
    snapshot: snapshot,
    applyLatest: applyLatest,
    getLatest: getLatest,
    getPingHistory: getPingHistory,
    getLoadHistory: getLoadHistory,
    queryMetrics: queryMetrics,
    loadTraffic: loadTraffic,
    currencySymbol: currencySymbol,
    periodStart: periodStart,
    normalizeExpiry: normalizeExpiry
  };
})(window);
