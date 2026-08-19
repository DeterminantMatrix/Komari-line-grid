(function (global) {
  'use strict';

  const DAY = 86400;

  function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  function numberOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function numberOr(v, fallback) {
    const n = numberOrNull(v);
    return n == null ? fallback : n;
  }

  function nest(obj, path) {
    const parts = String(path || '').split('.');
    let cur = obj;
    for (let i = 0; i < parts.length; i += 1) {
      if (cur == null) return null;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function firstNumber(obj, paths) {
    for (let i = 0; i < paths.length; i += 1) {
      const value = numberOrNull(nest(obj, paths[i]));
      if (value != null) return value;
    }
    return null;
  }

  function firstValue(obj, paths) {
    for (let i = 0; i < paths.length; i += 1) {
      const value = nest(obj, paths[i]);
      if (value != null && value !== '') return value;
    }
    return null;
  }

  function asNodeList(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (raw.data && Array.isArray(raw.data)) return raw.data;
    if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) raw = raw.data;
    if (typeof raw === 'object') return Object.keys(raw).map(function (key) { return raw[key]; });
    return [];
  }

  function flagToIso(value) {
    const text = String(value || '').trim();
    const plain = text.match(/(?:^|[^A-Za-z])([A-Za-z]{2})(?:$|[^A-Za-z])/);
    if (plain) return plain[1].toUpperCase();
    if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
    const chars = Array.from(text);
    const letters = [];
    chars.forEach(function (ch) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x1F1E6 && cp <= 0x1F1FF) letters.push(String.fromCharCode(cp - 0x1F1E6 + 65));
    });
    return letters.length >= 2 ? letters.slice(0, 2).join('') : '';
  }

  function maskIPv4(value) {
    const text = String(value || '').trim();
    const m = text.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    return m ? (m[1] + '.' + m[2] + '.*.*') : '';
  }

  function maskIPv6(value) {
    const text = String(value || '').trim();
    if (!text || text.indexOf(':') < 0) return '';
    const parts = text.split(':').filter(Boolean);
    if (!parts.length) return '';
    return parts.slice(0, 2).join(':') + ':*:*:*:*:*:*';
  }

  function routeTags(tags) {
    const prefix = 'linegrid:return:';
    const out = [];
    String(tags || '').split(';').map(function (tag) { return tag.trim(); }).filter(Boolean).forEach(function (tag) {
      if (tag.indexOf(prefix) !== 0) return;
      const body = tag.slice(prefix.length);
      const eq = body.indexOf('=');
      if (eq <= 0) return;
      const carrier = body.slice(0, eq);
      if (['telecom', 'unicom', 'mobile'].indexOf(carrier) < 0) return;
      let value = body.slice(eq + 1);
      try { value = decodeURIComponent(value); } catch (e) {}
      if (value) out.push({ carrier: carrier, region: '', route_type: value, source: 'komari' });
    });
    return out;
  }

  function mergeRoutes(base, tagged) {
    const map = {};
    (Array.isArray(base) ? base : []).forEach(function (row) { if (row && row.carrier) map[row.carrier] = Object.assign({}, row); });
    (tagged || []).forEach(function (row) { if (row && row.carrier) map[row.carrier] = Object.assign({}, row); });
    return ['telecom', 'unicom', 'mobile'].map(function (carrier) { return map[carrier] || null; }).filter(Boolean);
  }

  function normalizeExpiry(value) {
    if (!value) return { raw: '', label: '', longTerm: false };
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return { raw: '', label: '', longTerm: false };
    const now = Date.now();
    const days = (d.getTime() - now) / 86400000;
    if (days > 36500) return { raw: String(value).slice(0, 10), label: '长期', longTerm: true };
    return { raw: String(value).slice(0, 10), label: String(value).slice(0, 10), longTerm: false };
  }

  function calcTraffic(up, down, type) {
    if (up == null && down == null) return null;
    up = up == null ? 0 : up;
    down = down == null ? 0 : down;
    switch (type || 'sum') {
      case 'max': return Math.max(up, down);
      case 'min': return Math.min(up, down);
      case 'up': return up;
      case 'down': return down;
      default: return up + down;
    }
  }

  function dateOnly(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function billingWindow(resetDay) {
    const day = Math.max(1, Math.min(31, Number(resetDay) || 1));
    const now = new Date();
    function resetDate(year, month) {
      const lastDay = new Date(year, month + 1, 0).getDate();
      return new Date(year, month, Math.min(day, lastDay));
    }
    let start = resetDate(now.getFullYear(), now.getMonth());
    if (now < start) start = resetDate(now.getFullYear(), now.getMonth() - 1);
    const end = resetDate(start.getFullYear(), start.getMonth() + 1);
    return { start: dateOnly(start), end: dateOnly(end), resetDay: day };
  }

  function metadataFor(meta, uuid) {
    const globalMeta = meta && meta.global && typeof meta.global === 'object' ? meta.global : {};
    const nodeMeta = meta && meta.nodes && meta.nodes[uuid] && typeof meta.nodes[uuid] === 'object' ? meta.nodes[uuid] : {};
    return { global: globalMeta, node: nodeMeta };
  }


  function parseTrafficResetOverrides(raw, nodes) {
    const out = {};
    const byUuid = {};
    const byName = {};
    (nodes || []).forEach(function (node) {
      const uuid = String(node && (node.uuid || node.UUID || node.id) || '').trim();
      const name = String(node && (node.name || node.Name) || '').trim();
      if (uuid) byUuid[uuid.toLowerCase()] = uuid;
      if (name) {
        const key = name.toLowerCase();
        (byName[key] = byName[key] || []).push(uuid);
      }
    });

    function apply(key, value) {
      const day = Math.max(1, Math.min(31, Number(value) || 0));
      if (!day) return;
      const token = String(key || '').trim();
      if (!token) return;
      const uuid = byUuid[token.toLowerCase()];
      if (uuid) {
        out[uuid] = day;
        return;
      }
      const matches = byName[token.toLowerCase()] || [];
      matches.forEach(function (id) { if (id) out[id] = day; });
    }

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      Object.keys(raw).forEach(function (key) { apply(key, raw[key]); });
      return out;
    }
    const text = String(raw || '').trim();
    if (!text) return out;
    if (text[0] === '{') {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.keys(parsed).forEach(function (key) { apply(key, parsed[key]); });
          return out;
        }
      } catch (e) {}
    }
    text.split(/\r?\n/).forEach(function (line) {
      line = String(line || '').replace(/\s+#.*$/, '').trim();
      if (!line || line[0] === '#') return;
      const m = line.match(/^(.*?)\s*(?:=|:|\t)\s*(\d{1,2})\s*$/);
      if (!m) return;
      apply(m[1], m[2]);
    });
    return out;
  }

  function mapLivePing(rawPing, existing) {
    const out = [];
    const old = {};
    (existing || []).forEach(function (p) { old[String(p.key)] = p; });
    if (!rawPing || typeof rawPing !== 'object') return existing || [];
    Object.keys(rawPing).forEach(function (key) {
      const p = rawPing[key] || {};
      const latestRaw = firstNumber(p, ['latest', 'Latest', 'value', 'current']);
      const prior = old[String(key)] || {};
      const current = latestRaw != null && latestRaw >= 0 ? Math.round(latestRaw) : null;
      out.push({
        key: String(key),
        label: String(firstValue(p, ['name', 'Name', 'label']) || prior.label || ('Ping ' + key)),
        current_ms: current,
        is_loss: latestRaw != null && latestRaw < 0,
        loss_pct: numberOr(firstValue(p, ['loss', 'Loss']), prior.loss_pct || 0),
        avg_ms: numberOrNull(firstValue(p, ['avg', 'Avg'])),
        min_ms: numberOrNull(firstValue(p, ['min', 'Min'])),
        max_ms: numberOrNull(firstValue(p, ['max', 'Max'])),
        p50_ms: numberOrNull(firstValue(p, ['p50', 'P50'])),
        p99_ms: numberOrNull(firstValue(p, ['p99', 'P99'])),
        buckets: prior.buckets || [],
      });
    });
    return out;
  }

  function mapNode(node, live, meta, order) {
    node = node || {};
    const uuid = String(node.uuid || node.UUID || node.id || '');
    const extPack = metadataFor(meta, uuid);
    const ext = extPack.node;
    const hasLive = !!(live && typeof live === 'object');
    const country = flagToIso(ext.region_country || node.region || node.country || node.iso || '');
    const totalUp = hasLive ? firstNumber(live, ['net_total_out', 'net_total_up', 'network.totalUp', 'net.totalUp']) : null;
    const totalDown = hasLive ? firstNumber(live, ['net_total_in', 'net_total_down', 'network.totalDown', 'net.totalDown']) : null;
    const trafficType = String(node.traffic_limit_type || 'sum');
    const expiry = normalizeExpiry(node.expired_at);
    const price = numberOrNull(node.price);
    const cycle = numberOrNull(node.billing_cycle);
    const currency = String(node.currency || '').trim();
    const cycleWindow = billingWindow(ext.traffic_reset_day || extPack.global.traffic_reset_day || 1);
    const cny = numberOrNull(ext.renewal_price_cny);
    const nativeCny = /^(CNY|RMB|CNH|¥|￥)$/i.test(currency) && price != null && price >= 0 ? price : null;
    const logicalThreads = numberOrNull(node.cpu_cores);
    const physicalCores = numberOrNull(node.cpu_physical_cores);
    const cpuThreads = numberOrNull(ext.cpu_threads) != null ? numberOrNull(ext.cpu_threads) : logicalThreads;
    const cpuCores = physicalCores != null ? physicalCores : logicalThreads;
    const persistedRoutes = routeTags(node.tags);
    const returnRoutes = mergeRoutes(ext.return_routes, persistedRoutes);

    return {
      uuid: uuid,
      _order: order,
      weight: numberOr(node.weight, 0),
      name: String(node.name || node.Name || '未命名'),
      online: hasLive ? live.online === true : false,
      has_live: hasLive,
      region_country: country,
      geo_country: country,
      region_name: String(ext.region_name || node.group || node.region || country || ''),
      region_city: String(ext.region_city || ''),
      provider_name: String(ext.provider_name || ''),
      provider_url: String(ext.provider_url || ''),
      longitude: numberOrNull(ext.longitude),
      latitude: numberOrNull(ext.latitude),
      tags: String(node.tags || ''),
      group: String(node.group || ''),

      cpu_pct: hasLive ? firstNumber(live, ['cpu', 'cpu.usage', 'cpu_used', 'cpu_percent']) : null,
      mem_used: hasLive ? firstNumber(live, ['ram', 'ram.used', 'mem_used', 'memory']) : null,
      mem_total: firstNumber(node, ['mem_total', 'ram_total']) != null ? firstNumber(node, ['mem_total', 'ram_total']) : (hasLive ? firstNumber(live, ['ram_total', 'ram.total', 'mem_total']) : null),
      swap_used: hasLive ? firstNumber(live, ['swap', 'swap.used']) : null,
      swap_total: firstNumber(node, ['swap_total']) != null ? firstNumber(node, ['swap_total']) : (hasLive ? firstNumber(live, ['swap_total']) : null),
      disk_used: hasLive ? firstNumber(live, ['disk', 'disk.used', 'disk_used']) : null,
      disk_total: firstNumber(node, ['disk_total']) != null ? firstNumber(node, ['disk_total']) : (hasLive ? firstNumber(live, ['disk_total', 'disk.total']) : null),
      download_speed: hasLive ? firstNumber(live, ['net_in', 'network.down', 'net.down', 'network.in']) : null,
      upload_speed: hasLive ? firstNumber(live, ['net_out', 'network.up', 'net.up', 'network.out']) : null,
      uptime: hasLive ? firstNumber(live, ['uptime', 'uptime_seconds']) : null,
      loadavg: hasLive ? [firstNumber(live, ['load', 'load1']), firstNumber(live, ['load5']), firstNumber(live, ['load15'])].filter(function (v) { return v != null; }).join(' ') : '',
      process_count: hasLive ? firstNumber(live, ['process']) : null,
      connections_tcp: hasLive ? firstNumber(live, ['connections']) : null,
      connections_udp: hasLive ? firstNumber(live, ['connections_udp']) : null,

      traffic_used_up: totalUp,
      traffic_used_down: totalDown,
      traffic_used: calcTraffic(totalUp, totalDown, trafficType),
      traffic_limit: numberOr(node.traffic_limit, 0),
      traffic_limit_type: trafficType,
      traffic_source: totalUp != null || totalDown != null ? 'live_total' : null,
      traffic_history_status: 'loading',
      traffic_history_days: 0,
      daily_traffic: [],
      period_start: cycleWindow.start,
      period_end: cycleWindow.end,
      traffic_reset_day: cycleWindow.resetDay,

      ping: mapLivePing(hasLive ? live.ping : null, []),

      os: String(node.os || ''),
      kernel: String(node.kernel_version || node.kernel || ''),
      arch: String(node.arch || ''),
      virtualization: String(node.virtualization || ''),
      cpu_model: String(node.cpu_name || ''),
      cpu_cores: cpuCores,
      cpu_threads: cpuThreads,
      gpu_name: String(node.gpu_name || ''),
      agent_version: String(node.version || ''),
      _lookup_ip: String(node.ipv4 || node.ipv6 || ''),
      ipv4: maskIPv4(node.ipv4),
      ipv6: maskIPv6(node.ipv6),
      public_remark: String(node.public_remark || ''),

      price: price,
      billing_cycle: cycle,
      currency: currency,
      auto_renewal: node.auto_renewal === true,
      expires_at: expiry.label,
      expires_at_raw: expiry.raw,
      long_term: expiry.longTerm,
      renewal_price_cny: cny != null ? cny : nativeCny,
      asn: String(ext.asn || ''),
      asn_org: String(ext.asn_org || ''),
      return_routes: returnRoutes,
    };
  }

  function publicInfoValue(raw) {
    if (!raw || typeof raw !== 'object') return {};
    return raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : raw;
  }

  function snapshot(nodesRaw, latestRaw, publicRaw, metadata) {
    const nodes = asNodeList(nodesRaw);
    const latest = latestRaw && latestRaw.data && typeof latestRaw.data === 'object' ? latestRaw.data : (latestRaw || {});
    const pub = publicInfoValue(publicRaw);
    const metaGlobal = metadata && metadata.global || {};
    const settings = pub.theme_settings && typeof pub.theme_settings === 'object' ? pub.theme_settings : {};
    const resetOverrides = parseTrafficResetOverrides(settings.trafficResetOverrides, nodes);
    const sourceNodes = metadata && metadata.nodes && typeof metadata.nodes === 'object' ? metadata.nodes : {};
    const effectiveNodes = Object.assign({}, sourceNodes);
    nodes.forEach(function (node) {
      const uuid = String(node && (node.uuid || node.UUID || node.id) || '');
      if (!uuid || resetOverrides[uuid] == null) return;
      effectiveNodes[uuid] = Object.assign({}, sourceNodes[uuid] || {}, { traffic_reset_day: resetOverrides[uuid] });
    });
    const effectiveMeta = {
      global: Object.assign({}, metaGlobal, {
        traffic_reset_day: metaGlobal.traffic_reset_day || settings.trafficResetDay || 1,
      }),
      nodes: effectiveNodes,
    };
    const servers = nodes.map(function (node, index) {
      const uuid = String(node.uuid || node.UUID || node.id || '');
      return mapNode(node, latest[uuid] || latest[String(uuid)] || null, effectiveMeta, index);
    });
    return {
      enabled: true,
      title: String(metaGlobal.title || pub.sitename || pub.site_name || pub.name || '节点状态'),
      appearance: { theme: 'line-grid', color_mode: 'dark' },
      show_globe: metaGlobal.show_globe !== false && settings.showGlobe !== false,
      offline_server_position: String(metaGlobal.offline_server_position || settings.offlineServerPosition || 'Last'),
      enable_ip_geo_asn: [true, 1, '1', 'true', 'on'].indexOf(metaGlobal.enable_ip_geo_asn) >= 0 || [true, 1, '1', 'true', 'on'].indexOf(settings.enableIpGeoAsn) >= 0,
      servers: servers,
      _source: 'komari-rpc2',
      _public: pub,
      _traffic_history_status: 'loading',
      _ping_history_status: 'loading',
    };
  }

  function updateLiveFields(server, live) {
    const hasLive = !!(live && typeof live === 'object');
    server.has_live = hasLive;
    server.online = hasLive ? live.online === true : false;
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
    server.cpu_pct = firstNumber(live, ['cpu', 'cpu.usage', 'cpu_used', 'cpu_percent']);
    server.mem_used = firstNumber(live, ['ram', 'ram.used', 'mem_used', 'memory']);
    server.swap_used = firstNumber(live, ['swap', 'swap.used']);
    server.disk_used = firstNumber(live, ['disk', 'disk.used', 'disk_used']);
    server.download_speed = firstNumber(live, ['net_in', 'network.down', 'net.down', 'network.in']);
    server.upload_speed = firstNumber(live, ['net_out', 'network.up', 'net.up', 'network.out']);
    server.uptime = firstNumber(live, ['uptime', 'uptime_seconds']);
    server.loadavg = [firstNumber(live, ['load', 'load1']), firstNumber(live, ['load5']), firstNumber(live, ['load15'])].filter(function (v) { return v != null; }).join(' ');
    server.process_count = firstNumber(live, ['process']);
    server.connections_tcp = firstNumber(live, ['connections']);
    server.connections_udp = firstNumber(live, ['connections_udp']);
    const up = firstNumber(live, ['net_total_out', 'net_total_up', 'network.totalUp', 'net.totalUp']);
    const down = firstNumber(live, ['net_total_in', 'net_total_down', 'network.totalDown', 'net.totalDown']);
    if (up != null || down != null) {
      server.traffic_used_up = up;
      server.traffic_used_down = down;
      server.traffic_used = calcTraffic(up, down, server.traffic_limit_type);
      server.traffic_source = 'live_total';
    }
    server.ping = mapLivePing(live.ping, server.ping);
  }

  function mergeLatest(payload, latestRaw) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    const latest = latestRaw && latestRaw.data && typeof latestRaw.data === 'object' ? latestRaw.data : (latestRaw || {});
    payload.servers.forEach(function (server) {
      updateLiveFields(server, latest[server.uuid] || latest[String(server.uuid)] || null);
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

  function parseTime(value) {
    if (value == null) return null;
    if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
    const n = Date.parse(value);
    return Number.isNaN(n) ? null : n;
  }

  function mergePingHistory(payload, raw) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    raw = raw && raw.data ? raw.data : (raw || {});
    const records = Array.isArray(raw.records) ? raw.records : [];
    const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    const taskById = {};
    tasks.forEach(function (t) { taskById[String(t.id)] = t; });
    const grouped = {};
    records.forEach(function (r) {
      const client = String(r.client || '');
      const taskId = String(r.task_id == null ? '' : r.task_id);
      if (!client || !taskId) return;
      const key = client + '\u0000' + taskId;
      (grouped[key] = grouped[key] || []).push(r);
    });
    payload.servers.forEach(function (server) {
      const existing = {};
      (server.ping || []).forEach(function (p) { existing[String(p.key)] = p; });
      const taskIds = {};
      Object.keys(existing).forEach(function (id) { taskIds[id] = true; });
      Object.keys(grouped).forEach(function (key) {
        const parts = key.split('\u0000');
        if (parts[0] === server.uuid) taskIds[parts[1]] = true;
      });
      const next = Object.keys(taskIds).map(function (id) {
        const prior = existing[id] || {};
        const rows = (grouped[server.uuid + '\u0000' + id] || []).slice().sort(function (a, b) {
          return (parseTime(a.time) || 0) - (parseTime(b.time) || 0);
        });
        const valid = rows.map(function (r) { return numberOrNull(r.value); }).filter(function (v) { return v != null && v >= 0; });
        const lossCount = rows.reduce(function (n, r) { const v = numberOrNull(r.value); return n + (v != null && v < 0 ? 1 : 0); }, 0);
        const last = rows.length ? numberOrNull(rows[rows.length - 1].value) : null;
        const task = taskById[id] || {};
        const current = last != null ? (last >= 0 ? Math.round(last) : null) : (prior.current_ms != null ? prior.current_ms : (valid.length ? Math.round(valid[valid.length - 1]) : null));
        return {
          key: id,
          label: String(task.name || prior.label || ('Ping ' + id)),
          current_ms: current,
          is_loss: last != null && last < 0,
          loss_pct: rows.length ? (lossCount / rows.length) * 100 : numberOr(prior.loss_pct, numberOr(task.loss, 0)),
          avg_ms: valid.length ? Math.round(valid.reduce(function (a, b) { return a + b; }, 0) / valid.length) : numberOrNull(prior.avg_ms),
          min_ms: valid.length ? Math.min.apply(null, valid) : numberOrNull(prior.min_ms),
          max_ms: valid.length ? Math.max.apply(null, valid) : numberOrNull(prior.max_ms),
          p50_ms: valid.length ? percentile(valid, 0.5) : numberOrNull(prior.p50_ms),
          p99_ms: valid.length ? percentile(valid, 0.99) : numberOrNull(prior.p99_ms),
          buckets: rows.slice(-12).map(function (r) {
            const v = numberOrNull(r.value);
            return { ms: v != null && v >= 0 ? Math.round(v) : -1, loss: v != null && v < 0 ? 100 : 0, t: parseTime(r.time) };
          }),
        };
      });
      next.sort(function (a, b) { return Number(a.key) - Number(b.key); });
      server.ping = next;
    });
    payload._ping_history_status = records.length ? 'ok' : 'unavailable';
    return payload;
  }

  function extractRecordRows(raw, uuid) {
    raw = raw && raw.data ? raw.data : (raw || {});
    const records = raw.records;
    if (Array.isArray(records)) return records.filter(function (r) { return !uuid || String(r.client || '') === String(uuid); });
    if (records && typeof records === 'object') {
      if (Array.isArray(records[uuid])) return records[uuid];
      if (!uuid) {
        return Object.keys(records).reduce(function (all, key) {
          return all.concat((records[key] || []).map(function (r) {
            if (r && typeof r === 'object' && !r.client) r.client = key;
            return r;
          }));
        }, []);
      }
    }
    return [];
  }

  function trafficCounters(record) {
    return {
      up: firstNumber(record, ['net_total_out', 'net_total_up', 'network.totalUp', 'net.totalUp', 'traffic_up', 'up']),
      down: firstNumber(record, ['net_total_in', 'net_total_down', 'network.totalDown', 'net.totalDown', 'traffic_down', 'down']),
      time: parseTime(firstValue(record, ['time', 'timestamp', 'created_at'])),
    };
  }

  function buildDailyTraffic(rows, days) {
    const list = rows.map(trafficCounters).filter(function (r) { return r.time != null && (r.up != null || r.down != null); }).sort(function (a, b) { return a.time - b.time; });
    const byDate = {};
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1];
      const cur = list[i];
      const up = cur.up == null || prev.up == null ? 0 : (cur.up >= prev.up ? cur.up - prev.up : cur.up);
      const down = cur.down == null || prev.down == null ? 0 : (cur.down >= prev.down ? cur.down - prev.down : cur.down);
      if (up < 0 || down < 0) continue;
      const d = new Date(cur.time);
      const key = dateOnly(d);
      if (!byDate[key]) byDate[key] = { date: key, uplink: 0, downlink: 0, total: 0 };
      byDate[key].uplink += up;
      byDate[key].downlink += down;
      byDate[key].total += up + down;
    }
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (Math.max(1, days || 7) - 1));
    return Object.keys(byDate).sort().map(function (key) { return byDate[key]; }).filter(function (row) {
      return new Date(row.date + 'T00:00:00').getTime() >= cutoff.getTime();
    });
  }

  function mergeTrafficHistory(payload, raw, days) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    let any = false;
    payload.servers.forEach(function (server) {
      const rows = extractRecordRows(raw, server.uuid);
      const daily = buildDailyTraffic(rows, days || 7);
      server.daily_traffic = daily.slice(-Math.max(7, days || 7));
      server.traffic_history_days = daily.length;
      server.traffic_history_status = daily.length ? 'ok' : 'unavailable';
      if (daily.length) any = true;
      if (server.traffic_used == null && daily.length) {
        const up = daily.reduce(function (n, d) { return n + d.uplink; }, 0);
        const down = daily.reduce(function (n, d) { return n + d.downlink; }, 0);
        server.traffic_used_up = up;
        server.traffic_used_down = down;
        server.traffic_used = calcTraffic(up, down, server.traffic_limit_type);
        server.traffic_source = 'history_delta';
      }
    });
    payload._traffic_history_status = any ? 'ok' : 'unavailable';
    return payload;
  }

  function mergeMetricTraffic(payload, raw, days) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    raw = raw && raw.data ? raw.data : (raw || {});
    const series = Array.isArray(raw.series) ? raw.series : [];
    const grouped = {};
    series.forEach(function (item) {
      const uuid = String(item.entity_id || item.entityId || '');
      const metric = String(item.metric_key || item.metricKey || '');
      if (!uuid || (metric !== 'traffic.up' && metric !== 'traffic.down')) return;
      if (!grouped[uuid]) grouped[uuid] = {};
      grouped[uuid][metric] = item;
    });
    let any = false;
    payload.servers.forEach(function (server) {
      const pack = grouped[server.uuid];
      if (!pack) return;
      const byDate = {};
      ['traffic.up', 'traffic.down'].forEach(function (metric) {
        const item = pack[metric];
        if (!item || !Array.isArray(item.points)) return;
        item.points.forEach(function (point) {
          const t = parseTime(point.time);
          const value = numberOrNull(point.value);
          if (t == null || value == null || value < 0) return;
          const key = dateOnly(new Date(t));
          if (!byDate[key]) byDate[key] = { date: key, uplink: 0, downlink: 0, total: 0 };
          if (metric === 'traffic.up') byDate[key].uplink += value;
          else byDate[key].downlink += value;
        });
      });
      const cutoff = new Date();
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - (Math.max(1, days || 7) - 1));
      const daily = Object.keys(byDate).sort().map(function (key) {
        const row = byDate[key];
        row.total = row.uplink + row.downlink;
        return row;
      }).filter(function (row) { return new Date(row.date + 'T00:00:00').getTime() >= cutoff.getTime(); });
      if (!daily.length) return;
      any = true;
      if (!server.daily_traffic || daily.length > server.daily_traffic.length) {
        server.daily_traffic = daily.slice(-Math.max(7, days || 7));
        server.traffic_history_days = daily.length;
        server.traffic_history_status = 'ok';
        server.traffic_history_source = 'metric';
      }
      const retention = Math.max(
        numberOr(pack['traffic.up'] && pack['traffic.up'].retention_days, 0),
        numberOr(pack['traffic.down'] && pack['traffic.down'].retention_days, 0)
      );
      if (retention) server.traffic_retention_days = retention;
      if (server.traffic_used == null) {
        const up = daily.reduce(function (n, d) { return n + d.uplink; }, 0);
        const down = daily.reduce(function (n, d) { return n + d.downlink; }, 0);
        server.traffic_used_up = up;
        server.traffic_used_down = down;
        server.traffic_used = calcTraffic(up, down, server.traffic_limit_type);
        server.traffic_source = 'metric_delta';
      }
    });
    if (any) payload._traffic_history_status = 'ok';
    return payload;
  }

  function pingSeries(raw, uuid, target) {
    raw = raw && raw.data ? raw.data : (raw || {});
    const records = Array.isArray(raw.records) ? raw.records : [];
    const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    const taskMap = {};
    tasks.forEach(function (t) { taskMap[String(t.id)] = t; });
    const byTask = {};
    records.forEach(function (r) {
      if (uuid && r.client && String(r.client) !== String(uuid)) return;
      const id = String(r.task_id == null ? '' : r.task_id);
      if (!id) return;
      (byTask[id] = byTask[id] || []).push({
        t: parseTime(r.time),
        value: numberOrNull(r.value),
        task_id: id,
      });
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

  global.KomariAdapt = {
    asNodeList: asNodeList,
    snapshot: snapshot,
    mergeLatest: mergeLatest,
    mergePingHistory: mergePingHistory,
    mergeTrafficHistory: mergeTrafficHistory,
    mergeMetricTraffic: mergeMetricTraffic,
    pingSeries: pingSeries,
    normalizeExpiry: normalizeExpiry,
    calcTraffic: calcTraffic,
    buildDailyTraffic: buildDailyTraffic,
  };
})(window);
