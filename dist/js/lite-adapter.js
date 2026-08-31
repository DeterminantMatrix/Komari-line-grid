(function (global) {
  'use strict';

  function numberOrNull(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function numberOr(value, fallback) {
    const n = numberOrNull(value);
    return n == null ? fallback : n;
  }

  function unwrap(raw) {
    return raw && raw.data && typeof raw.data === 'object' ? raw.data : (raw || {});
  }

  function asNodeList(raw) {
    raw = unwrap(raw);
    if (Array.isArray(raw)) return raw;
    if (!raw || typeof raw !== 'object') return [];
    return Object.keys(raw).map(function (key) { return raw[key]; });
  }

  function keyed(raw) {
    raw = unwrap(raw);
    if (!Array.isArray(raw) && raw && typeof raw === 'object') return raw;
    const out = {};
    (Array.isArray(raw) ? raw : []).forEach(function (row) {
      const id = row && (row.uuid || row.client || row.id);
      if (id != null) out[String(id)] = row;
    });
    return out;
  }

  function flagToIso(value) {
    const text = String(value || '').trim();
    if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
    const plain = text.match(/(?:^|[^A-Za-z])([A-Za-z]{2})(?:$|[^A-Za-z])/);
    if (plain) return plain[1].toUpperCase();
    const chars = Array.from(text);
    const letters = [];
    chars.forEach(function (ch) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x1F1E6 && cp <= 0x1F1FF) letters.push(String.fromCharCode(cp - 0x1F1E6 + 65));
    });
    return letters.length >= 2 ? letters.slice(0, 2).join('') : '';
  }

  function maskIPv4(value) {
    const m = String(value || '').trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    return m ? (m[1] + '.' + m[2] + '.*.*') : '';
  }

  function maskIPv6(value) {
    const text = String(value || '').trim();
    if (!text || text.indexOf(':') < 0) return '';
    const parts = text.split(':').filter(Boolean);
    return parts.length ? parts.slice(0, 2).join(':') + ':*:*:*:*:*:*' : '';
  }

  function normalizeExpiry(value) {
    if (!value) return { raw: '', label: '', longTerm: false };
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { raw: '', label: '', longTerm: false };
    const raw = String(value).slice(0, 10);
    const days = (date.getTime() - Date.now()) / 86400000;
    return { raw: raw, label: days > 36500 ? '长期' : raw, longTerm: days > 36500 };
  }

  function calcTraffic(up, down, type) {
    if (up == null && down == null) return null;
    up = up == null ? 0 : Number(up);
    down = down == null ? 0 : Number(down);
    switch (String(type || 'sum').toLowerCase()) {
      case 'max': return Math.max(up, down);
      case 'min': return Math.min(up, down);
      case 'up': return up;
      case 'down': return down;
      default: return up + down;
    }
  }

  function parseTime(value) {
    if (value == null) return null;
    if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
    const n = Date.parse(value);
    return Number.isNaN(n) ? null : n;
  }

  function shanghaiDateKey(value) {
    const date = value instanceof Date ? value : new Date(value == null ? Date.now() : value);
    const shifted = new Date(date.getTime() + 8 * 3600000);
    return String(shifted.getUTCFullYear()).padStart(4, '0') + '-' +
      String(shifted.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(shifted.getUTCDate()).padStart(2, '0');
  }

  function shiftDateKey(key, days) {
    const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(days || 0)));
    return String(date.getUTCFullYear()).padStart(4, '0') + '-' +
      String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(date.getUTCDate()).padStart(2, '0');
  }

  function metadataFor(metadata, uuid) {
    return metadata && metadata.nodes && metadata.nodes[uuid] && typeof metadata.nodes[uuid] === 'object'
      ? metadata.nodes[uuid]
      : {};
  }

  function mapLivePing(rawPing, existing) {
    const out = [];
    const old = {};
    (existing || []).forEach(function (item) { old[String(item.key)] = item; });
    if (!rawPing || typeof rawPing !== 'object') return existing || [];
    Object.keys(rawPing).forEach(function (key) {
      const row = rawPing[key] || {};
      const latest = numberOrNull(row.latest);
      const prior = old[String(key)] || {};
      out.push({
        key: String(key),
        label: String(row.name || prior.label || ('Ping ' + key)),
        current_ms: latest != null && latest >= 0 ? Math.round(latest) : null,
        is_loss: latest != null && latest < 0,
        loss_pct: numberOr(row.loss, prior.loss_pct || 0),
        avg_ms: numberOrNull(row.avg),
        min_ms: numberOrNull(row.min),
        max_ms: numberOrNull(row.max),
        p50_ms: numberOrNull(row.p50),
        p99_ms: numberOrNull(row.p99),
        buckets: prior.buckets || [],
      });
    });
    return out;
  }

  function currentTraffic(live, type) {
    if (!live || typeof live !== 'object') return { up: null, down: null, used: null };
    const up = numberOrNull(live.net_total_up);
    const down = numberOrNull(live.net_total_down);
    const safeUp = up != null && up >= 0 ? up : 0;
    const safeDown = down != null && down >= 0 ? down : 0;
    return {
      up: up == null && down == null ? null : safeUp,
      down: up == null && down == null ? null : safeDown,
      used: up == null && down == null ? null : calcTraffic(safeUp, safeDown, type),
    };
  }

  function mapNode(node, live, metadata, order) {
    node = node || {};
    const uuid = String(node.uuid || '');
    const ext = metadataFor(metadata, uuid);
    const hasLive = !!(live && typeof live === 'object');
    const trafficType = String(node.effective_traffic_type || node.traffic_limit_type || 'sum').toLowerCase();
    const trafficLimit = numberOrNull(node.effective_traffic_limit);
    const current = currentTraffic(live, trafficType);
    const expiry = normalizeExpiry(node.expired_at);
    const country = flagToIso(node.region || '');
    const logicalCores = numberOrNull(node.cpu_cores);
    const physicalCores = numberOrNull(node.cpu_physical_cores);
    const liveSeen = hasLive ? parseTime(live.time) : null;

    return {
      uuid: uuid,
      _order: order,
      weight: numberOr(node.weight, 0),
      _lite_created_at: String(node.created_at || ''),
      name: String(node.name || '未命名'),
      online: hasLive && live.online === true,
      has_live: hasLive,
      last_seen_at: liveSeen != null ? liveSeen : (hasLive && live.online === true ? Date.now() : null),

      region_country: country,
      geo_country: country,
      region_name: String(node.group || node.region || country || ''),
      region_city: String(ext.region_city || ''),
      provider_name: String(ext.provider_name || ''),
      provider_url: String(ext.provider_url || ''),
      longitude: numberOrNull(ext.longitude),
      latitude: numberOrNull(ext.latitude),
      group: String(node.group || ''),
      tags: String(node.tags || ''),

      cpu_pct: hasLive ? numberOrNull(live.cpu) : null,
      mem_used: hasLive ? numberOrNull(live.ram) : null,
      mem_total: numberOrNull(node.mem_total) != null ? numberOrNull(node.mem_total) : (hasLive ? numberOrNull(live.ram_total) : null),
      swap_used: hasLive ? numberOrNull(live.swap) : null,
      swap_total: numberOrNull(node.swap_total) != null ? numberOrNull(node.swap_total) : (hasLive ? numberOrNull(live.swap_total) : null),
      disk_used: hasLive ? numberOrNull(live.disk) : null,
      disk_total: numberOrNull(node.disk_total) != null ? numberOrNull(node.disk_total) : (hasLive ? numberOrNull(live.disk_total) : null),
      download_speed: hasLive ? numberOrNull(live.net_in) : null,
      upload_speed: hasLive ? numberOrNull(live.net_out) : null,
      uptime: hasLive ? numberOrNull(live.uptime) : null,
      loadavg: hasLive ? [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)].filter(function (v) { return v != null; }).join(' ') : '',
      process_count: hasLive ? numberOrNull(live.process) : null,
      connections_tcp: hasLive ? numberOrNull(live.connections) : null,
      connections_udp: hasLive ? numberOrNull(live.connections_udp) : null,

      traffic_lifetime_up: null,
      traffic_lifetime_down: null,
      traffic_lifetime: null,
      traffic_period_up: current.up,
      traffic_period_down: current.down,
      traffic_period: current.used,
      traffic_used_up: current.up,
      traffic_used_down: current.down,
      traffic_used: current.used,
      traffic_limit: trafficLimit != null && trafficLimit >= 0 ? trafficLimit : Math.max(0, numberOr(node.traffic_limit, 0)),
      traffic_limit_type: ['sum', 'max', 'min', 'up', 'down'].indexOf(trafficType) >= 0 ? trafficType : 'sum',
      traffic_source: current.used == null ? null : 'lite_native_period',
      traffic_period_complete: current.used != null,
      traffic_history_status: 'loading',
      traffic_history_days: 0,
      daily_traffic: [],
      traffic_reset_day: node.traffic_reset_day == null ? null : numberOrNull(node.traffic_reset_day),
      period_start: null,
      period_end: null,
      billing_timezone: 'Asia/Shanghai',

      ping: mapLivePing(hasLive ? live.ping : null, []),

      os: String(node.os || ''),
      kernel: String(node.kernel_version || ''),
      arch: String(node.arch || ''),
      virtualization: String(node.virtualization || ''),
      cpu_model: String(node.cpu_name || ''),
      cpu_cores: physicalCores != null ? physicalCores : logicalCores,
      cpu_threads: logicalCores,
      gpu_name: String(node.gpu_name || ''),
      agent_version: String(node.version || ''),
      _lookup_ip: String(node.ipv4 || node.ipv6 || ''),
      ipv4: maskIPv4(node.ipv4),
      ipv6: maskIPv6(node.ipv6),
      public_remark: String(node.public_remark || ''),

      price: numberOrNull(node.price),
      billing_cycle: numberOrNull(node.billing_cycle),
      currency: String(node.currency || ''),
      auto_renewal: node.auto_renewal === true,
      expires_at: expiry.label,
      expires_at_raw: expiry.raw,
      long_term: expiry.longTerm,
      renewal_price_cny: /^(CNY|RMB|CNH|¥|￥)$/i.test(String(node.currency || '')) ? numberOrNull(node.price) : null,
      asn: String(ext.asn || ''),
      asn_org: String(ext.asn_org || ''),
      return_routes: [],
    };
  }

  function sortServers(servers) {
    servers.sort(function (a, b) {
      const aw = Number(a.weight);
      const bw = Number(b.weight);
      if (aw !== bw) return aw - bw;
      const at = Date.parse(a._lite_created_at || '');
      const bt = Date.parse(b._lite_created_at || '');
      const av = Number.isFinite(at) ? at : Number.MAX_SAFE_INTEGER;
      const bv = Number.isFinite(bt) ? bt : Number.MAX_SAFE_INTEGER;
      if (av !== bv) return av - bv;
      return String(a.uuid).localeCompare(String(b.uuid));
    });
    servers.forEach(function (server, index) { server._order = index; });
    return servers;
  }

  function publicInfoValue(raw) {
    raw = unwrap(raw);
    return raw && typeof raw === 'object' ? raw : {};
  }

  function truthy(value) {
    return [true, 1, '1', 'true', 'on'].indexOf(value) >= 0;
  }

  function snapshot(nodesRaw, latestRaw, publicRaw, metadata) {
    const nodes = asNodeList(nodesRaw);
    const latest = keyed(latestRaw);
    const pub = publicInfoValue(publicRaw);
    const settings = pub.theme_settings && typeof pub.theme_settings === 'object' ? pub.theme_settings : {};
    const servers = nodes.map(function (node, index) {
      return mapNode(node, latest[String(node.uuid)] || null, metadata || {}, index);
    });
    sortServers(servers);
    return {
      enabled: true,
      title: String(pub.sitename || pub.site_name || pub.name || '节点状态'),
      appearance: { theme: 'line-grid', color_mode: 'dark' },
      show_globe: settings.showGlobe !== false,
      globe_quality: (function () {
        const q = String(settings.globeQuality || 'Medium').toLowerCase();
        return q === 'low' || q === 'high' ? q : 'medium';
      })(),
      offline_server_position: String(settings.offlineServerPosition || 'Keep'),
      enable_ip_geo_asn: truthy(settings.enableIpGeoAsn),
      geo_ip_provider: String(settings.geoIpProvider || 'ip.sb'),
      geo_ip_fallback: truthy(settings.geoIpFallback),
      billing_timezone: 'Asia/Shanghai',
      servers: servers,
      _runtime: 'lite',
      _source: 'lite-rpc2',
      _public: pub,
      _traffic_history_status: 'loading',
      _ping_history_status: 'loading',
    };
  }

  function updateLive(server, live) {
    const hasLive = !!(live && typeof live === 'object');
    server.has_live = hasLive;
    server.online = hasLive && live.online === true;
    if (!hasLive) {
      server.cpu_pct = null;
      server.mem_used = null;
      server.swap_used = null;
      server.disk_used = null;
      server.download_speed = null;
      server.upload_speed = null;
      server.uptime = null;
      server.loadavg = '';
      server.process_count = null;
      server.connections_tcp = null;
      server.connections_udp = null;
      return;
    }
    const seen = parseTime(live.time);
    if (seen != null) server.last_seen_at = seen;
    else if (live.online === true) server.last_seen_at = Date.now();
    server.cpu_pct = numberOrNull(live.cpu);
    server.mem_used = numberOrNull(live.ram);
    server.swap_used = numberOrNull(live.swap);
    server.disk_used = numberOrNull(live.disk);
    server.download_speed = numberOrNull(live.net_in);
    server.upload_speed = numberOrNull(live.net_out);
    server.uptime = numberOrNull(live.uptime);
    server.loadavg = [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)].filter(function (v) { return v != null; }).join(' ');
    server.process_count = numberOrNull(live.process);
    server.connections_tcp = numberOrNull(live.connections);
    server.connections_udp = numberOrNull(live.connections_udp);
    const current = currentTraffic(live, server.traffic_limit_type);
    if (current.used != null) {
      server.traffic_period_up = current.up;
      server.traffic_period_down = current.down;
      server.traffic_period = current.used;
      server.traffic_used_up = current.up;
      server.traffic_used_down = current.down;
      server.traffic_used = current.used;
      server.traffic_source = 'lite_native_period';
      server.traffic_period_complete = true;
    }
    server.ping = mapLivePing(live.ping, server.ping);
  }

  function mergeLatest(payload, latestRaw) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    const latest = keyed(latestRaw);
    payload.servers.forEach(function (server) {
      updateLive(server, latest[String(server.uuid)] || null);
    });
    return payload;
  }

  function percentile(values, p) {
    if (!values.length) return null;
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
  }

  function mergePingHistory(payload, raw) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    raw = unwrap(raw);
    const records = Array.isArray(raw.records) ? raw.records : [];
    const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    const taskById = {};
    tasks.forEach(function (task) { taskById[String(task.id)] = task; });
    const grouped = {};
    records.forEach(function (record) {
      const client = String(record.client || '');
      const taskId = String(record.task_id == null ? '' : record.task_id);
      if (!client || !taskId) return;
      const key = client + '\u0000' + taskId;
      (grouped[key] = grouped[key] || []).push(record);
    });

    payload.servers.forEach(function (server) {
      const existing = {};
      (server.ping || []).forEach(function (p) { existing[String(p.key)] = p; });
      const ids = {};
      Object.keys(existing).forEach(function (id) { ids[id] = true; });
      Object.keys(grouped).forEach(function (key) {
        const parts = key.split('\u0000');
        if (parts[0] === server.uuid) ids[parts[1]] = true;
      });
      server.ping = Object.keys(ids).map(function (id) {
        const prior = existing[id] || {};
        const rows = (grouped[server.uuid + '\u0000' + id] || []).slice().sort(function (a, b) {
          return (parseTime(a.time) || 0) - (parseTime(b.time) || 0);
        });
        const valid = rows.map(function (row) { return numberOrNull(row.value); }).filter(function (v) { return v != null && v >= 0; });
        const loss = rows.reduce(function (n, row) {
          const v = numberOrNull(row.value);
          return n + (v != null && v < 0 ? 1 : 0);
        }, 0);
        const last = rows.length ? numberOrNull(rows[rows.length - 1].value) : null;
        const task = taskById[id] || {};
        return {
          key: id,
          label: String(task.name || prior.label || ('Ping ' + id)),
          current_ms: last != null ? (last >= 0 ? Math.round(last) : null) : (prior.current_ms == null ? null : prior.current_ms),
          is_loss: last != null && last < 0,
          loss_pct: rows.length ? (loss / rows.length) * 100 : numberOr(prior.loss_pct, 0),
          avg_ms: valid.length ? Math.round(valid.reduce(function (a, b) { return a + b; }, 0) / valid.length) : numberOrNull(prior.avg_ms),
          min_ms: valid.length ? Math.min.apply(null, valid) : numberOrNull(prior.min_ms),
          max_ms: valid.length ? Math.max.apply(null, valid) : numberOrNull(prior.max_ms),
          p50_ms: valid.length ? percentile(valid, 0.5) : numberOrNull(prior.p50_ms),
          p99_ms: valid.length ? percentile(valid, 0.99) : numberOrNull(prior.p99_ms),
          buckets: rows.slice(-12).map(function (row) {
            const v = numberOrNull(row.value);
            return { ms: v != null && v >= 0 ? Math.round(v) : -1, loss: v != null && v < 0 ? 100 : 0, t: parseTime(row.time) };
          }),
        };
      }).sort(function (a, b) { return Number(a.key) - Number(b.key); });
    });
    payload._ping_history_status = records.length ? 'ok' : 'unavailable';
    return payload;
  }

  function mergeMetricTraffic(payload, raw, days) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    raw = unwrap(raw);
    const series = Array.isArray(raw.series) ? raw.series : [];
    const grouped = {};
    series.forEach(function (item) {
      const uuid = String(item.entity_id || item.entityId || '');
      const metric = String(item.metric_key || item.metricKey || '');
      if (!uuid || (metric !== 'traffic.up' && metric !== 'traffic.down')) return;
      if (!grouped[uuid]) grouped[uuid] = {};
      grouped[uuid][metric] = item;
    });
    const cutoff = shiftDateKey(shanghaiDateKey(), -(Math.max(1, days || 7) - 1));
    let any = false;
    payload.servers.forEach(function (server) {
      const pack = grouped[server.uuid];
      if (!pack) return;
      const byDate = {};
      ['traffic.up', 'traffic.down'].forEach(function (metric) {
        const item = pack[metric];
        if (!item || !Array.isArray(item.points)) return;
        item.points.forEach(function (point) {
          const time = parseTime(point.time);
          const value = numberOrNull(point.value);
          if (time == null || value == null || value < 0) return;
          const key = shanghaiDateKey(time);
          if (!byDate[key]) byDate[key] = { date: key, uplink: 0, downlink: 0, total: 0 };
          if (metric === 'traffic.up') byDate[key].uplink += value;
          else byDate[key].downlink += value;
        });
      });
      const daily = Object.keys(byDate).sort().map(function (key) {
        const row = byDate[key];
        row.total = row.uplink + row.downlink;
        return row;
      }).filter(function (row) { return row.date >= cutoff; });
      if (!daily.length) return;
      any = true;
      server.daily_traffic = daily.slice(-Math.max(7, days || 7));
      server.traffic_history_days = daily.length;
      server.traffic_history_status = 'ok';
      server.traffic_history_source = 'metric';
      const retention = Math.max(
        numberOr(pack['traffic.up'] && pack['traffic.up'].retention_days, 0),
        numberOr(pack['traffic.down'] && pack['traffic.down'].retention_days, 0)
      );
      if (retention) server.traffic_retention_days = retention;
    });
    payload._traffic_history_status = any ? 'ok' : 'unavailable';
    return payload;
  }

  function pingSeries(raw, uuid, target) {
    raw = unwrap(raw);
    const records = Array.isArray(raw.records) ? raw.records : [];
    const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    const taskMap = {};
    tasks.forEach(function (task) { taskMap[String(task.id)] = task; });
    const byTask = {};
    records.forEach(function (record) {
      if (uuid && record.client && String(record.client) !== String(uuid)) return;
      const id = String(record.task_id == null ? '' : record.task_id);
      if (!id) return;
      (byTask[id] = byTask[id] || []).push({ t: parseTime(record.time), value: numberOrNull(record.value), task_id: id });
    });
    Object.keys(byTask).forEach(function (id) {
      byTask[id].sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
    });
    const ids = Object.keys(byTask).sort(function (a, b) { return Number(a) - Number(b); });
    const selected = target && target !== 'all' ? String(target) : (ids[0] || '');
    return {
      series: selected && byTask[selected] ? byTask[selected] : [],
      seriesByTask: ids.map(function (id) {
        return { key: id, label: String((taskMap[id] && taskMap[id].name) || ('Ping ' + id)), points: byTask[id] };
      }),
      tasks: tasks,
    };
  }

  global.LiteAdapt = {
    asNodeList: asNodeList,
    snapshot: snapshot,
    mergeLatest: mergeLatest,
    mergePingHistory: mergePingHistory,
    mergeMetricTraffic: mergeMetricTraffic,
    pingSeries: pingSeries,
    normalizeExpiry: normalizeExpiry,
    calcTraffic: calcTraffic,
    sortServers: sortServers,
  };
})(window);
