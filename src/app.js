/* fx.js */
(function (global) {
  const KEY = "mmwx-fx";
  const DEFAULTS = {
    grain: "1",
    count: "1",
    expose: "1",
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let flags = load();
  let counted = false;

  function load() {
    const out = Object.assign({}, DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return out;
      const parsed = JSON.parse(raw);
      Object.keys(DEFAULTS).forEach(function (k) {
        if (parsed[k] === "0" || parsed[k] === "1" || parsed[k] === "auto" || parsed[k] === "on" || parsed[k] === "off") {
          out[k] = String(parsed[k]);
        }
      });
    } catch (e) {}
    return out;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(flags)); } catch (e) {}
  }

  function on(name) {
    return flags[name] === "1";
  }

  function apply() {
    const root = document.documentElement;
    root.setAttribute("data-fx-grain", flags.grain);
    root.setAttribute("data-fx-count", flags.count);
    root.setAttribute("data-fx-expose", flags.expose);
  }

  function set(name, value) {
    flags[name] = String(value);
    save();
    apply();
    document.dispatchEvent(new CustomEvent("mmwx-fx", { detail: name }));
    if (name === "count" && flags.count === "1") {
      counted = false;
      tickCounts(document.getElementById("main"));
    }
  }

  function tickCounts(root) {
    if (!root || counted || !on("count") || reduce.matches) return;
    const vals = root.querySelectorAll(".fleet .val");
    if (!vals.length) return;
    counted = true;
    Array.prototype.forEach.call(vals, function (el) {
      const text = (el.textContent || "").trim();
      const m = text.match(/^(-?[\d,.]+)\s*(.*)$/);
      if (!m) return;
      const target = parseFloat(m[1].replace(/,/g, ""));
      if (!isFinite(target)) return;
      const rest = m[2] || "";
      const decimals = (m[1].split(".")[1] || "").length;
      const t0 = performance.now();
      const dur = 740;
      function step(now) {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        const n = target * e;
        el.textContent = n.toFixed(decimals) + (rest ? " " + rest : "");
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = text;
      }
      el.textContent = (0).toFixed(decimals) + (rest ? " " + rest : "");
      requestAnimationFrame(step);
    });
  }

  function expose(run) {
    run();
  }

  function localHost() {
    return /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  }

  function mountPanel() {
    if (!localHost()) return;
    if (document.getElementById("fx-panel")) return;
    const box = document.createElement("aside");
    box.id = "fx-panel";
    box.setAttribute("aria-label", "本地试效果");
    box.innerHTML =
      '<header><span>本地试效果</span><button type="button" class="fx-min" aria-label="收起">–</button></header>' +
      '<div class="fx-body">' +
        row("grain", "纸纹", flags.grain === "1") +
        row("count", "数字进场", flags.count === "1") +
        row("expose", "日夜间曝光", flags.expose === "1") +
      "</div>";
    document.body.appendChild(box);
    box.addEventListener("change", function (ev) {
      const el = ev.target;
      const name = el.getAttribute("data-fx");
      if (!name) return;
      if (el.tagName === "SELECT") set(name, el.value);
      else set(name, el.checked ? "1" : "0");
    });
    box.querySelector(".fx-min").addEventListener("click", function () {
      box.classList.toggle("is-min");
    });
  }

  function row(name, label, onOff) {
    return '<label class="fx-row"><span>' + label + '</span><input type="checkbox" data-fx="' + name + '"' + (onOff ? " checked" : "") + "></label>";
  }

  apply();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountPanel);
  } else {
    mountPanel();
  }

  global.ProbeFX = {
    on: on,
    apply: apply,
    set: set,
    tickCounts: tickCounts,
    expose: expose,
    flags: flags,
  };
})(window);

/* enrich.js */
(function (global) {
  'use strict';

  const GEO_CACHE_PREFIX = 'linegrid:geo:v1:';
  const GEO_PUBLIC_PREFIX = 'linegrid:geo-public:v1:';
  const GEO_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
  const GEO_NEG_TTL = 6 * 60 * 60 * 1000;
  const FX_CACHE_KEY = 'linegrid:fx:cny:v2';
  const FX_TTL = 24 * 60 * 60 * 1000;
  const FX_DEFAULT = {
    CNY: 1, USD: 0.142536, HKD: 1.108377, EUR: 0.12102, GBP: 0.105581,
    JPY: 22.231552, RUB: 13.5, CHF: 0.12, INR: 11.8, VND: 3500,
    THB: 5.0, CAD: 0.19,
  };
  const inflightGeo = new Map();
  let fxInflight = null;

  function hashKey(text) {
    let h = 2166136261;
    const s = String(text || '');
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function cacheRead(key, ttl) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (!item || !item.at || Date.now() - Number(item.at) > ttl) return null;
      return item.value;
    } catch (e) { return null; }
  }

  function cacheWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), value: value })); } catch (e) {}
  }

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function text() {
    for (let i = 0; i < arguments.length; i += 1) {
      const v = arguments[i];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }

  function validGeo(g) {
    return g && Number.isFinite(g.lat) && g.lat >= -90 && g.lat <= 90 && Number.isFinite(g.lng) && g.lng >= -180 && g.lng <= 180;
  }

  function withTimeout(url, ms) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, ms || 5000) : null;
    return fetch(url, { signal: controller ? controller.signal : undefined, cache: 'no-store', credentials: 'omit' })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function parseIpSb(d) {
    const lat = number(d && d.latitude), lng = number(d && d.longitude);
    if (lat == null || lng == null) return null;
    return { lat: lat, lng: lng, city: text(d.city), countryCode: text(d.country_code).toUpperCase(), org: text(d.organization, d.asn_organization, d.isp), asn: d.asn != null ? ('AS' + String(d.asn).replace(/^AS/i, '')) : '' };
  }

  function parseIpInfo(d) {
    if (!d || typeof d.loc !== 'string') return null;
    const parts = d.loc.split(','), lat = number(parts[0]), lng = number(parts[1]);
    if (lat == null || lng == null) return null;
    const org = text(d.org), m = org.match(/^AS\d+/i);
    return { lat: lat, lng: lng, city: text(d.city), countryCode: text(d.country).toUpperCase(), org: org, asn: m ? m[0].toUpperCase() : '' };
  }

  function parseIpWho(d) {
    if (!d || d.success === false) return null;
    const lat = number(d.latitude), lng = number(d.longitude), c = d.connection || {};
    if (lat == null || lng == null) return null;
    return { lat: lat, lng: lng, city: text(d.city), countryCode: text(d.country_code).toUpperCase(), org: text(c.org, c.isp), asn: c.asn != null ? ('AS' + String(c.asn).replace(/^AS/i, '')) : '' };
  }

  function parseIpApi(d) {
    const lat = number(d && d.latitude), lng = number(d && d.longitude);
    if (lat == null || lng == null) return null;
    return { lat: lat, lng: lng, city: text(d.city), countryCode: text(d.country_code).toUpperCase(), org: text(d.org), asn: text(d.asn).toUpperCase() };
  }

  const GEO_PROVIDERS = [
    { id: 'ip.sb', url: function (ip) { return 'https://api.ip.sb/geoip/' + encodeURIComponent(ip); }, parse: parseIpSb },
    { id: 'ipinfo', url: function (ip) { return 'https://ipinfo.io/' + encodeURIComponent(ip) + '/json'; }, parse: parseIpInfo },
    { id: 'ipwho.is', url: function (ip) { return 'https://ipwho.is/' + encodeURIComponent(ip); }, parse: parseIpWho },
    { id: 'ipapi.co', url: function (ip) { return 'https://ipapi.co/' + encodeURIComponent(ip) + '/json/'; }, parse: parseIpApi },
  ];
  function geoProvider(value) {
    const wanted = String(value || 'ip.sb').trim().toLowerCase();
    return GEO_PROVIDERS.find(function (provider) { return provider.id.toLowerCase() === wanted; }) || GEO_PROVIDERS[0];
  }

  function geoProviderOrder(primaryValue, allowFallback) {
    const primary = geoProvider(primaryValue);
    if (!allowFallback) return [primary];
    return [primary].concat(GEO_PROVIDERS.filter(function (provider) { return provider.id !== primary.id; }));
  }

  function lookupIpGeo(ip, options) {
    const raw = String(ip || '').trim();
    if (!raw || raw.indexOf('*') >= 0) return Promise.resolve(null);
    options = options || {};
    const primary = geoProvider(options.provider);
    const allowFallback = options.fallback === true;
    const cacheKey = GEO_CACHE_PREFIX + primary.id + ':' + hashKey(raw);
    const inflightKey = primary.id + ':' + (allowFallback ? 'fallback:' : 'single:') + raw;
    const cached = cacheRead(cacheKey, GEO_CACHE_TTL);
    if (cached && validGeo(cached)) return Promise.resolve(cached);
    const neg = cacheRead(cacheKey + ':neg', GEO_NEG_TTL);
    if (neg) return Promise.resolve(null);
    if (inflightGeo.has(inflightKey)) return inflightGeo.get(inflightKey);
    const ordered = geoProviderOrder(primary.id, allowFallback);
    const task = (async function () {
      for (let i = 0; i < ordered.length; i += 1) {
        try {
          const res = await withTimeout(ordered[i].url(raw), 5000);
          if (!res.ok) continue;
          const data = await res.json();
          const geo = ordered[i].parse(data);
          if (validGeo(geo)) {
            geo.provider = ordered[i].id;
            cacheWrite(cacheKey, geo);
            return geo;
          }
        } catch (e) {}
      }
      cacheWrite(cacheKey + ':neg', true);
      return null;
    })();
    inflightGeo.set(inflightKey, task);
    return task.finally(function () { inflightGeo.delete(inflightKey); });
  }

  function publicGeoKey(uuid) {
    return GEO_PUBLIC_PREFIX + hashKey(String(uuid || ''));
  }

  function publicGeo(geo) {
    if (!validGeo(geo)) return null;
    return { lat: geo.lat, lng: geo.lng, city: text(geo.city), countryCode: text(geo.countryCode).toUpperCase() };
  }

  function applyGeo(server, geo, includeAsn) {
    if (!server || !validGeo(geo)) return;
    if (geo.city) server.region_city = geo.city;
    if (geo.countryCode) server.geo_country = geo.countryCode;
    server.longitude = geo.lng;
    server.latitude = geo.lat;
    server.geo_source = includeAsn ? 'ip' : 'uuid-cache';
    if (includeAsn) {
      server.asn = geo.asn || server.asn || '';
      server.asn_org = geo.org || server.asn_org || '';
    }
  }

  async function enrichNodes(payload) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    // Disabled means disabled: do not even apply browser-cached GeoIP-derived
    // city/coordinate data. Explicit Lite/metadata fields remain untouched.
    if (payload.enable_ip_geo_asn !== true) return payload;

    payload.servers.forEach(function (server) {
      if (!server || !server.uuid) return;
      const cached = cacheRead(publicGeoKey(server.uuid), GEO_CACHE_TTL);
      if (cached && validGeo(cached)) applyGeo(server, cached, false);
    });

    const nodes = payload.servers.filter(function (s) { return s && s._lookup_ip && String(s._lookup_ip).indexOf('*') < 0; });
    const batchSize = 4;
    const lookupOptions = { provider: payload.geo_ip_provider || 'ip.sb', fallback: payload.geo_ip_fallback === true };
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(function (s) {
        return lookupIpGeo(s._lookup_ip, lookupOptions).then(function (geo) { return { s: s, geo: geo }; });
      }));
      results.forEach(function (r) {
        if (!r.geo) return;
        const s = r.s, g = r.geo;
        applyGeo(s, g, true);
        if (s.uuid) {
          const safe = publicGeo(g);
          if (safe) cacheWrite(publicGeoKey(s.uuid), safe);
        }
      });
    }
    payload._geo_enriched = true;
    return payload;
  }

  function normalizeCurrency(value) {
    const s = String(value == null || value === '' ? 'CNY' : value).trim().toUpperCase();
    if (s === '$' || s === 'US$') return 'USD';
    if (s === 'HK$') return 'HKD';
    if (s === '€') return 'EUR';
    if (s === '£') return 'GBP';
    if (s === '¥' || s === '￥' || s === 'RMB' || s === 'CNH') return 'CNY';
    return /^[A-Z]{3}$/.test(s) ? s : '';
  }

  function sanitizeRates(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const out = Object.assign({}, FX_DEFAULT, { CNY: 1 });
    let count = 0;
    Object.keys(raw).forEach(function (rawCode) {
      const code = String(rawCode || "").trim().toUpperCase();
      if (code === 'CNY' || !/^[A-Z]{3}$/.test(code)) return;
      const v = number(raw[rawCode]);
      if (v != null && v > 0) { out[code] = v; count += 1; }
    });
    return count >= 4 ? out : null;
  }

  function getDailyExchangeRates() {
    const cached = cacheRead(FX_CACHE_KEY, FX_TTL);
    if (cached && cached.rates) return Promise.resolve({ rates: cached.rates, source: 'cache', updatedAt: cached.updatedAt || null });
    if (fxInflight) return fxInflight;
    const stale = (function () {
      try {
        const raw = localStorage.getItem(FX_CACHE_KEY);
        return raw ? JSON.parse(raw).value : null;
      } catch (e) { return null; }
    })();
    const sources = [
      { id: 'open.er-api', url: 'https://open.er-api.com/v6/latest/CNY', parse: function (d) { return d && d.rates; } },
      { id: 'frankfurter', url: 'https://api.frankfurter.app/latest?from=CNY', parse: function (d) { return d && d.rates; } },
    ];
    fxInflight = (async function () {
      for (let i = 0; i < sources.length; i += 1) {
        try {
          const res = await withTimeout(sources[i].url, 5000);
          if (!res.ok) continue;
          const data = await res.json();
          const rates = sanitizeRates(sources[i].parse(data));
          if (!rates) continue;
          const value = { rates: rates, source: sources[i].id, updatedAt: Date.now() };
          cacheWrite(FX_CACHE_KEY, value);
          return value;
        } catch (e) {}
      }
      if (stale && stale.rates) return { rates: Object.assign({}, FX_DEFAULT, stale.rates), source: 'stale-cache', updatedAt: stale.updatedAt || null };
      return { rates: Object.assign({}, FX_DEFAULT), source: 'default', updatedAt: null };
    })().finally(function () { fxInflight = null; });
    return fxInflight;
  }

  function toCNY(value, currency, rates) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const code = normalizeCurrency(currency);
    if (code === 'CNY') return n;
    const r = rates && Number(rates[code]);
    return Number.isFinite(r) && r > 0 ? n / r : null;
  }

  global.LineGridEnrich = {
    lookupIpGeo: lookupIpGeo,
    enrichNodes: enrichNodes,
    getDailyExchangeRates: getDailyExchangeRates,
    normalizeCurrency: normalizeCurrency,
    toCNY: toCNY,
    defaultRates: FX_DEFAULT,
  };
})(window);

/* lite-adapter.js */
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


  function mapLivePing(rawPing, existing) {
    const out = [];
    const old = {};
    const ordered = [];
    const seen = {};
    (existing || []).forEach(function (item) {
      const key = String(item && item.key != null ? item.key : '');
      if (!key) return;
      old[key] = item;
      if (rawPing && typeof rawPing === 'object' && Object.prototype.hasOwnProperty.call(rawPing, key) && !seen[key]) {
        seen[key] = true;
        ordered.push(key);
      }
    });
    if (!rawPing || typeof rawPing !== 'object') return existing || [];
    Object.keys(rawPing).forEach(function (key) {
      key = String(key);
      if (seen[key]) return;
      seen[key] = true;
      ordered.push(key);
    });
    ordered.forEach(function (key) {
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

  function mapNode(node, live, order) {
    node = node || {};
    const uuid = String(node.uuid || '');
    const hasLive = !!(live && typeof live === 'object');
    const onlineNow = hasLive && live.online === true;
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
      online: onlineNow,
      has_live: hasLive,
      last_seen_at: liveSeen != null ? liveSeen : (hasLive && live.online === true ? Date.now() : null),

      region_country: country,
      geo_country: country,
      region_name: String(node.group || node.region || country || ''),
      region_city: String(node.region_city || node.city || ''),
      provider_name: String(node.provider_name || ''),
      provider_url: String(node.provider_url || ''),
      longitude: numberOrNull(node.longitude),
      latitude: numberOrNull(node.latitude),
      group: String(node.group || ''),
      tags: String(node.tags || ''),

      cpu_pct: onlineNow ? numberOrNull(live.cpu) : null,
      mem_used: onlineNow ? numberOrNull(live.ram) : null,
      mem_total: hasLive && numberOrNull(live.ram_total) != null && numberOrNull(live.ram_total) > 0 ? numberOrNull(live.ram_total) : numberOrNull(node.mem_total),
      swap_used: onlineNow ? numberOrNull(live.swap) : null,
      swap_total: hasLive && numberOrNull(live.swap_total) != null ? numberOrNull(live.swap_total) : numberOrNull(node.swap_total),
      disk_used: onlineNow ? numberOrNull(live.disk) : null,
      disk_total: hasLive && numberOrNull(live.disk_total) != null && numberOrNull(live.disk_total) > 0 ? numberOrNull(live.disk_total) : numberOrNull(node.disk_total),
      download_speed: onlineNow ? numberOrNull(live.net_in) : null,
      upload_speed: onlineNow ? numberOrNull(live.net_out) : null,
      uptime: onlineNow ? numberOrNull(live.uptime) : null,
      loadavg: onlineNow ? [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)].filter(function (v) { return v != null; }).join(' ') : '',
      process_count: onlineNow ? numberOrNull(live.process) : null,
      connections_tcp: onlineNow ? Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0)) : null,
      connections_udp: onlineNow ? numberOrNull(live.connections_udp) : null,

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
      ipv4: String(node.ipv4 || ''),
      ipv6: String(node.ipv6 || ''),
      public_remark: String(node.public_remark || ''),

      price: numberOrNull(node.price),
      billing_cycle: numberOrNull(node.billing_cycle),
      currency: String(node.currency || ''),
      auto_renewal: node.auto_renewal === true,
      expires_at: expiry.label,
      expires_at_raw: expiry.raw,
      long_term: expiry.longTerm,
      renewal_price_cny: /^(CNY|RMB|CNH|¥|￥)$/i.test(String(node.currency || '')) ? numberOrNull(node.price) : null,
      asn: String(node.asn || ''),
      asn_org: String(node.asn_org || ''),
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

  function snapshot(nodesRaw, latestRaw, publicRaw) {
    const nodes = asNodeList(nodesRaw);
    const latest = keyed(latestRaw);
    const pub = publicInfoValue(publicRaw);
    const settings = pub.theme_settings && typeof pub.theme_settings === 'object' ? pub.theme_settings : {};
    const servers = nodes.map(function (node, index) {
      return mapNode(node, latest[String(node.uuid)] || null, index);
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
    const onlineNow = hasLive && live.online === true;
    server.has_live = hasLive;
    server.online = onlineNow;
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
    const liveRamTotal = numberOrNull(live.ram_total);
    const liveSwapTotal = numberOrNull(live.swap_total);
    const liveDiskTotal = numberOrNull(live.disk_total);
    if (liveRamTotal != null && liveRamTotal > 0) server.mem_total = liveRamTotal;
    if (liveSwapTotal != null) server.swap_total = liveSwapTotal;
    if (liveDiskTotal != null && liveDiskTotal > 0) server.disk_total = liveDiskTotal;
    server.cpu_pct = onlineNow ? numberOrNull(live.cpu) : null;
    server.mem_used = onlineNow ? numberOrNull(live.ram) : null;
    server.swap_used = onlineNow ? numberOrNull(live.swap) : null;
    server.disk_used = onlineNow ? numberOrNull(live.disk) : null;
    server.download_speed = onlineNow ? numberOrNull(live.net_in) : null;
    server.upload_speed = onlineNow ? numberOrNull(live.net_out) : null;
    server.uptime = onlineNow ? numberOrNull(live.uptime) : null;
    server.loadavg = onlineNow ? [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)].filter(function (v) { return v != null; }).join(' ') : '';
    server.process_count = onlineNow ? numberOrNull(live.process) : null;
    server.connections_tcp = onlineNow ? Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0)) : null;
    server.connections_udp = onlineNow ? numberOrNull(live.connections_udp) : null;
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
    const taskOrder = [];
    tasks.forEach(function (task) {
      const id = String(task && task.id != null ? task.id : '');
      if (!id) return;
      taskById[id] = task;
      taskOrder.push(id);
    });
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
      const available = {};
      const fallbackOrder = [];
      function addAvailable(id) {
        id = String(id == null ? '' : id);
        if (!id || available[id]) return;
        available[id] = true;
        fallbackOrder.push(id);
      }
      (server.ping || []).forEach(function (p) {
        const id = String(p.key);
        existing[id] = p;
        addAvailable(id);
      });
      Object.keys(grouped).forEach(function (key) {
        const parts = key.split('\u0000');
        if (parts[0] === server.uuid) addAvailable(parts[1]);
      });
      const orderedIds = [];
      const orderedSeen = {};
      taskOrder.forEach(function (id) {
        if (!available[id] || orderedSeen[id]) return;
        orderedSeen[id] = true;
        orderedIds.push(id);
      });
      fallbackOrder.forEach(function (id) {
        if (orderedSeen[id]) return;
        orderedSeen[id] = true;
        orderedIds.push(id);
      });
      server.ping = orderedIds.map(function (id) {
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
      });
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
    const taskOrder = [];
    tasks.forEach(function (task) {
      const id = String(task && task.id != null ? task.id : '');
      if (!id) return;
      taskMap[id] = task;
      taskOrder.push(id);
    });
    const byTask = {};
    const recordTaskOrder = [];
    records.forEach(function (record) {
      if (uuid && record.client && String(record.client) !== String(uuid)) return;
      const id = String(record.task_id == null ? '' : record.task_id);
      if (!id) return;
      if (!byTask[id]) {
        byTask[id] = [];
        recordTaskOrder.push(id);
      }
      byTask[id].push({ t: parseTime(record.time), value: numberOrNull(record.value), task_id: id });
    });
    Object.keys(byTask).forEach(function (id) {
      byTask[id].sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
    });
    const ids = [];
    const seen = {};
    taskOrder.forEach(function (id) {
      if (!byTask[id] || seen[id]) return;
      seen[id] = true;
      ids.push(id);
    });
    recordTaskOrder.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      ids.push(id);
    });
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

/* api.js */
(function (global) {
  'use strict';

  let lastPayload = null;
  let rpcSeq = 0;
  const seriesInFlight = Object.create(null);

  function rpcUrl() {
    return '/api/rpc2';
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


  function rpcBatch(calls, timeoutMs) {
    calls = Array.isArray(calls) ? calls : [];
    if (!calls.length) return Promise.resolve([]);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs || 9000) : null;
    const requests = calls.map(function (call) {
      return { jsonrpc: '2.0', id: ++rpcSeq, method: call.method, params: call.params || {} };
    });
    const order = Object.create(null);
    requests.forEach(function (request, index) { order[String(request.id)] = index; });
    return fetch(rpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(requests),
      signal: controller ? controller.signal : undefined,
    }).then(function (response) {
      if (!response.ok) throw new Error('RPC batch HTTP ' + response.status);
      return response.json();
    }).then(function (json) {
      if (!Array.isArray(json)) throw new Error('Invalid RPC2 batch response');
      const slots = new Array(calls.length);
      json.forEach(function (item) {
        if (!item || item.jsonrpc !== '2.0') return;
        const index = order[String(item.id)];
        if (index == null) return;
        slots[index] = item.error ? { error: item.error } : { result: item.result };
      });
      return calls.map(function (call, index) {
        const slot = slots[index];
        if (slot && !slot.error) return slot.result;
        if (Object.prototype.hasOwnProperty.call(call, 'fallback')) {
          return typeof call.fallback === 'function' ? call.fallback(slot && slot.error) : call.fallback;
        }
        const error = slot && slot.error;
        throw new Error(((error && error.message) || 'RPC batch item missing') + ' [' + call.method + ']');
      });
    }).catch(function (error) {
      if (error && error.name === 'AbortError') throw new Error('RPC batch timeout');
      throw error;
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function fetchBootstrap() {
    if (!global.LiteAdapt) return Promise.reject(new Error('Lite adapter missing'));
    const calls = [
      { method: 'common:getNodes', params: {} },
      { method: 'common:getNodesLatestStatus', params: {}, fallback: {} },
      { method: 'common:getPublicInfo', params: {}, fallback: {} },
      { method: 'public:getMe', params: {}, fallback: { logged_in: false } },
      { method: 'public:getPublicPingTasks', params: {}, fallback: [] },
    ];
    const individualFallback = function () {
      return Promise.all([
        rpc('common:getNodes', {}, 8000),
        rpc('common:getNodesLatestStatus', {}, 8000).catch(function () { return {}; }),
        rpc('common:getPublicInfo', {}, 6000).catch(function () { return {}; }),
        rpc('public:getMe', {}, 5000).catch(function () { return { logged_in: false }; }),
        rpc('public:getPublicPingTasks', {}, 7000).catch(function () { return []; }),
      ]);
    };
    return rpcBatch(calls, 9000).catch(individualFallback).then(function (parts) {
      lastPayload = LiteAdapt.snapshot(parts[0], parts[1], parts[2]);
      const me = parts[3] || {};
      const rawTasks = parts[4];
      lastPayload._bootstrap_ping_tasks = Array.isArray(rawTasks) ? rawTasks : (rawTasks && Array.isArray(rawTasks.tasks) ? rawTasks.tasks : []);
      const loggedIn = !!me.logged_in;
      return {
        payload: lastPayload,
        access: { known: true, logged_in: loggedIn, is_admin: loggedIn },
      };
    });
  }

  function fetchServers() {
    return fetchBootstrap().then(function (result) { return result.payload; });
  }

  function fetchPingOverview() {
    if (!lastPayload) return Promise.resolve(null);
    return rpc('common:getRecords', { type: 'ping', uuid: '', hours: 1, task_id: -1, maxCount: 8000 }, 12000)
      .then(function (raw) {
        LiteAdapt.mergePingHistory(lastPayload, raw);
        return lastPayload;
      })
      .catch(function () {
        lastPayload._ping_history_status = 'unavailable';
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
    return rpc('public:getMe', {}, 5000).then(function (me) {
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
    let statusTick = 0;

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
      statusTick += 1;
      // High-frequency status refreshes do not need the relatively expensive
      // Ping summary. Refresh Ping once per minute; initial fetch is already full.
      const includePing = statusTick % 30 === 0;
      rpc('common:getNodesLatestStatus', includePing ? {} : { compact: true }, 8000)
        .then(function (latest) {
          if (stopped) return;
          LiteAdapt.mergeLatest(lastPayload, latest);
          if (typeof onPayload === 'function') onPayload(lastPayload, { kind: 'latest', ping: includePing });
        })
        .catch(function () {})
        .finally(function () {
          running = false;
          schedule();
        });
    }

    function visible() {
      if (document.hidden) clear();
      else if (!running) {
        // Force a full refresh after returning to the tab so Ping badges do not
        // remain stale after a long suspension.
        statusTick = 29;
        refresh();
      }
    }

    document.addEventListener('visibilitychange', visible);
    schedule();
    return {
      close: function () {
        stopped = true;
        clear();
        document.removeEventListener('visibilitychange', visible);
      },
    };
  }

  global.ProbeAPI = {
    rpc: rpc,
    rpcBatch: rpcBatch,
    fetchBootstrap: fetchBootstrap,
    fetchServers: fetchServers,
    fetchPingOverview: fetchPingOverview,
    fetchTrafficHistory: fetchTrafficHistory,
    fetchSeries: fetchSeries,
    fetchAccess: fetchAccess,
    enrich: enrich,
    connectWS: connectWS,
  };
})(window);

/* lite.js */
(function (global) {
  'use strict';

  const LINE_GRID_PAGES = ['overview', 'ping', 'traffic', 'system'];
  let appliedPingRoute = '';
  let uiRefreshQueued = false;

  function safeSegment(value) {
    const raw = String(value || '');
    try { return encodeURIComponent(decodeURIComponent(raw)); }
    catch (e) { return encodeURIComponent(raw); }
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

  function replaceHash(nextHash) {
    if (!nextHash || String(global.location.hash || '') === nextHash) return false;
    global.history.replaceState(global.history.state, '', global.location.pathname + global.location.search + nextHash);
    return true;
  }

  function normalizeNavigationPath() {
    if (global.location.hash && global.location.hash !== '#') return '';
    const nextHash = navigationHashFromPath(global.location.pathname, global.location.search);
    if (!nextHash) return '';
    replaceHash(nextHash);
    return nextHash;
  }

  function normalizeLegacyReturnHash() {
    const hash = String(global.location.hash || '');
    if (!/\/routes$/.test(hash)) return false;
    return replaceHash(hash.replace(/\/routes$/, '/overview'));
  }

  normalizeNavigationPath();
  normalizeLegacyReturnHash();

  function pad2(value) { return String(value).padStart(2, '0'); }
  function dateKey(year, month, day) { return String(year).padStart(4, '0') + '-' + pad2(month) + '-' + pad2(day); }
  function daysInMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
  function monthShift(year, month, delta) {
    const zero = year * 12 + (month - 1) + delta;
    return { year: Math.floor(zero / 12), month: ((zero % 12) + 12) % 12 + 1 };
  }
  function shanghaiParts(nowValue) {
    const date = nowValue instanceof Date ? nowValue : new Date(nowValue == null ? Date.now() : nowValue);
    const shifted = new Date(date.getTime() + 8 * 3600000);
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
  }

  // Display only: Lite remains the owner of reset policy and traffic counters.
  function liteDisplayWindow(resetDay, nowValue) {
    const day = Number(resetDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    const now = shanghaiParts(nowValue);
    let startYear = now.year;
    let startMonth = now.month;
    let startDay = Math.min(day, daysInMonth(startYear, startMonth));
    const today = dateKey(now.year, now.month, now.day);
    let start = dateKey(startYear, startMonth, startDay);
    if (today < start) {
      const previous = monthShift(startYear, startMonth, -1);
      startYear = previous.year;
      startMonth = previous.month;
      startDay = Math.min(day, daysInMonth(startYear, startMonth));
      start = dateKey(startYear, startMonth, startDay);
    }
    const next = monthShift(startYear, startMonth, 1);
    return {
      start: start,
      end: dateKey(next.year, next.month, Math.min(day, daysInMonth(next.year, next.month))),
      resetDay: day,
      timeZone: 'Asia/Shanghai',
    };
  }

  function applyLiteDisplayWindows(payload, nowValue) {
    if (!payload || !Array.isArray(payload.servers)) return payload;
    payload.servers.forEach(function (server) {
      if (!server) return;
      const window = liteDisplayWindow(server.traffic_reset_day, nowValue);
      server.period_start = window ? window.start : null;
      server.period_end = window ? window.end : null;
      server.billing_timezone = 'Asia/Shanghai';
    });
    return payload;
  }

  function validPublicIPv4(raw) {
    const m = String(raw || '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;
    const p = m.slice(1).map(Number);
    if (p.some(function (n) { return n < 0 || n > 255; })) return false;
    const a = p[0], b = p[1], c = p[2];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }

  function validPublicIPv6(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value || value.indexOf(':') < 0 || value.indexOf('*') >= 0 || /[^0-9a-f:.]/.test(value)) return false;
    // Do not send IPv4-mapped/embedded dotted literals to third-party GeoIP;
    // validating their embedded IPv4 semantics here would be error-prone.
    if (value.indexOf('.') >= 0) return false;
    if (value === '::' || value === '::1') return false;
    if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value) || /^ff/.test(value)) return false;
    if (/^2001:db8(?::|$)/.test(value)) return false;
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

  function refreshUICompatibility() {
    uiRefreshQueued = false;
    normalizeLegacyReturnHash();
    applyPingTaskFromQuery();
  }

  function scheduleUICompatibility() {
    if (uiRefreshQueued) return;
    uiRefreshQueued = true;
    setTimeout(refreshUICompatibility, 0);
  }

  if (global.ProbeAPI && typeof global.ProbeAPI.fetchServers === 'function') {
    const originalFetchServers = global.ProbeAPI.fetchServers;
    global.ProbeAPI.fetchServers = function () {
      return Promise.resolve(originalFetchServers.apply(this, arguments)).then(function (payload) {
        applyLiteDisplayWindows(payload);
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
      return Promise.resolve().then(function () { return originalEnrichNodes(payload); }).finally(function () {
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
    normalizeLegacyReturnHash();
    scheduleUICompatibility();
  });
  global.LineGridLite = {
    isPublicIPLiteral: isPublicIPLiteral,
    navigationHashFromPath: navigationHashFromPath,
    normalizeNavigationPath: normalizeNavigationPath,
    normalizeLegacyReturnHash: normalizeLegacyReturnHash,
    applyPingTaskFromQuery: applyPingTaskFromQuery,
    liteDisplayWindow: liteDisplayWindow,
    applyLiteDisplayWindows: applyLiteDisplayWindows,
  };
})(window);

/* charts.js */
(function (global) {
  function n(v) { return Number.isFinite(v) ? v : 0; }

  function token(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function parseColor(v) {
    v = String(v || "").trim();
    const rgb = v.match(/rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    let hex = v.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      const n = parseInt(hex, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return null;
  }

  function isLight() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  function inkRgba(a) {
    const p = parseColor(token("--ink", "#ddd6c8"));
    if (!p) return "rgba(221,214,200," + a + ")";
    return "rgba(" + p[0] + "," + p[1] + "," + p[2] + "," + a + ")";
  }

  function gold() { return token("--gold", "#c4a56a"); }
  function voidFill() { return token("--void", "#15130f"); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function axisTime(ts) {
    if (!Number.isFinite(Number(ts))) return "";
    return new Date(Number(ts)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function axisNumber(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return "—";
    if (Math.abs(v) >= 100) return String(Math.round(v));
    return String(Math.round(v * 10) / 10);
  }

  function spark(values, opt) {
    opt = opt || {};
    const w = opt.w || 240;
    const h = opt.h || 40;
    const raw = values || [];
    const pts = raw.map(function (item) {
      if (item && typeof item === "object") {
        const value = item.value != null ? Number(item.value) : Number(item.v);
        return Number.isFinite(value) ? value : -1;
      }
      const value = Number(item);
      return Number.isFinite(value) ? value : -1;
    });
    const times = raw.map(function (item) {
      const value = item && typeof item === "object" && item.t != null ? Number(item.t) : NaN;
      return Number.isFinite(value) ? value : null;
    });
    const domainStart = Number(opt.domainStart);
    const domainEnd = Number(opt.domainEnd);
    const hasDomain = Number.isFinite(domainStart) && Number.isFinite(domainEnd) && domainEnd > domainStart;
    if (!pts.length) return "";
    const usable = pts.filter(function (v) { return v >= 0 && Number.isFinite(v); });
    const dataMin = Math.min.apply(null, usable.length ? usable : [0]);
    const dataMax = Math.max.apply(null, usable.length ? usable : [0]);
    function niceMax(m) {
      if (m <= 50) return 50;
      if (m <= 100) return 100;
      if (m <= 200) return 200;
      if (m <= 500) return 500;
      return Math.ceil(m / 100) * 100;
    }
    let min = 0;
    let max = niceMax(dataMax);
    if (opt.adaptiveY && usable.length) {
      const rawSpan = Math.max(0, dataMax - dataMin);
      const yPad = rawSpan > 0 ? Math.max(3, rawSpan * 0.16) : Math.max(3, Math.abs(dataMax) * 0.08);
      min = Math.max(0, dataMin - yPad);
      max = Math.max(min + 6, dataMax + yPad);
    }
    const span = Math.max(1, max - min);
    const showY = opt.showYAxis === true;
    const showX = opt.showXAxis === true;
    const padL = showY ? 48 : 2;
    const padR = 6;
    const padT = 7;
    const padB = showX ? 24 : 7;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);
    const plotBottom = padT + plotH;
    const step = pts.length === 1 ? 0 : plotW / (pts.length - 1);
    const coords = pts.map(function (v, i) {
      let x = padL + i * step;
      if (hasDomain && Number.isFinite(times[i])) {
        const ratio = Math.max(0, Math.min(1, (times[i] - domainStart) / (domainEnd - domainStart)));
        x = padL + ratio * plotW;
      }
      const y = plotBottom - ((v < 0 ? min : v) - min) / span * plotH;
      return [x, y];
    });
    let d = "";
    let drawing = false;
    let first = null;
    let last = null;
    coords.forEach(function (p, i) {
      if (pts[i] < 0) { drawing = false; return; }
      d += (drawing ? " L " : "M ") + p[0].toFixed(2) + " " + p[1].toFixed(2);
      if (!first) first = p;
      last = p;
      drawing = true;
    });
    if (!first) first = coords[0];
    if (!last) last = coords[coords.length - 1];
    const color = opt.color || token("--ink", "#ddd6c8");
    const hitW = hasDomain ? Math.max(6, Math.min(24, plotW / Math.max(pts.length, 12))) : Math.max(6, step || plotW);
    const hits = coords.map(function (p, i) {
      const tip = (opt.tips && opt.tips[i]) || (pts[i] < 0 ? "无数据" : pts[i] + " ms");
      return '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + (p[0] - hitW / 2).toFixed(2) + '" y="' + padT + '" width="' + hitW.toFixed(2) + '" height="' + plotH.toFixed(2) + '" fill="transparent"/>';
    }).join("");
    let grid = "";
    [0, 0.5, 1].forEach(function (t) {
      const y = plotBottom - t * plotH;
      grid += '<line class="spark-grid" x1="' + padL + '" y1="' + y.toFixed(2) + '" x2="' + (w - padR) + '" y2="' + y.toFixed(2) + '" stroke="' + inkRgba(t === 0 ? 0.16 : 0.08) + '" stroke-width="0.6"/>';
    });
    let axes = '';
    if (showY) {
      [0, 0.5, 1].forEach(function (t) {
        const y = plotBottom - t * plotH;
        const val = min + t * span;
        axes += '<text class="axis-label" x="' + (padL - 7) + '" y="' + (y + 3).toFixed(2) + '" text-anchor="end">' + esc(axisNumber(val)) + '</text>';
      });
      axes += '<text class="axis-unit" x="4" y="11">' + esc(opt.yUnit || '') + '</text>';
    }
    if (showX) {
      const labels = Array.isArray(opt.xLabels) && opt.xLabels.length >= 3 ? opt.xLabels : ['', '', ''];
      const xs = [padL, padL + plotW / 2, w - padR];
      labels.slice(0, 3).forEach(function (label, i) {
        axes += '<text class="axis-label axis-x" x="' + xs[i].toFixed(2) + '" y="' + (h - 5) + '" text-anchor="' + (i === 0 ? 'start' : i === 2 ? 'end' : 'middle') + '">' + esc(label) + '</text>';
      });
      axes += '<line class="axis-line" x1="' + padL + '" y1="' + plotBottom.toFixed(2) + '" x2="' + (w - padR) + '" y2="' + plotBottom.toFixed(2) + '"/>';
    }
    const fillOpacity = opt.fillOpacity == null ? 0.08 : Math.max(0, Math.min(0.35, Number(opt.fillOpacity) || 0));
    const segments = [];
    let segment = [];
    coords.forEach(function (p, i) {
      if (pts[i] < 0 || !Number.isFinite(pts[i])) { if (segment.length) segments.push(segment); segment = []; return; }
      segment.push(p);
    });
    if (segment.length) segments.push(segment);
    const area = segments.map(function (seg) {
      if (!seg.length) return '';
      let sd = '';
      seg.forEach(function (p, i) { sd += (i ? ' L ' : 'M ') + p[0].toFixed(2) + ' ' + p[1].toFixed(2); });
      const a = seg[0], b = seg[seg.length - 1];
      return '<path class="spark-fill" d="' + sd + ' L ' + b[0].toFixed(2) + ' ' + plotBottom.toFixed(2) + ' L ' + a[0].toFixed(2) + ' ' + plotBottom.toFixed(2) + ' Z" fill="' + color + '" fill-opacity="' + fillOpacity + '" stroke="none"/>';
    }).join('');
    const packed = coords.map(function (p, i) { return p[0].toFixed(2) + "," + p[1].toFixed(2) + "," + pts[i]; }).join(";");
    return (
      '<svg class="spark' + (showY || showX ? ' has-axes' : '') + '" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" data-plot-l="' + padL + '" data-plot-r="' + (w - padR) + '" data-pts="' + packed + '">' +
        grid + area +
        '<path class="spark-line" d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.25" vector-effect="non-scaling-stroke"/>' +
        '<circle cx="' + last[0].toFixed(2) + '" cy="' + last[1].toFixed(2) + '" r="1.7" fill="' + color + '"/>' +
        axes +
        '<g class="scope-cur" hidden>' +
          '<line class="scope-v" x1="0" y1="' + padT + '" x2="0" y2="' + plotBottom.toFixed(2) + '" stroke="' + color + '" stroke-width="0.8" opacity="0.55"/>' +
          '<circle class="scope-dot" cx="0" cy="0" r="2.4" fill="none" stroke="' + color + '" stroke-width="1"/>' +
        "</g>" + hits +
      "</svg>"
    );
  }

  function bars(items, opt) {
    opt = opt || {};
    const w = opt.w || 240;
    const h = opt.h || 56;
    const list = items || [];
    const vals = list.map(function (it) { return typeof it === "number" ? it : n(it.total); });
    const max = Math.max.apply(null, vals.concat([1]));
    const slotCount = Math.max(vals.length, Number(opt.slotCount) || 7);
    const slotW = w / Math.max(slotCount, 1);
    const bw = Math.max(4, Math.min(Number(opt.maxBarWidth) || 56, slotW * 0.62));
    const slotOffset = Math.max(0, slotCount - vals.length);
    const color = opt.color || inkRgba(isLight() ? 0.58 : 0.4);
    const last = gold();
    const rects = vals.map(function (v, i) {
      const bh = Math.max(2, (v / max) * (h - 8));
      const x = (slotOffset + i) * slotW + (slotW - bw) / 2;
      const y = h - bh;
      const fill = i === vals.length - 1 ? last : color;
      const tip = (opt.tips && opt.tips[i]) || (list[i] && list[i].tip) || String(v);
      return '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + Math.max(2, bw).toFixed(2) + '" height="' + bh.toFixed(2) + '" fill="' + fill + '"/>';
    }).join("");
    return '<svg class="bars" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' + rects + "</svg>";
  }

  function wave(opt) {
    opt = opt || {};
    const w = opt.w || 420;
    const h = opt.h || 72;
    const mid = h / 2;
    let d = "M 0 " + mid;
    const cycles = 2.15;
    for (let x = 0; x <= w; x += 2) {
      const t = x / w;
      const env = t > 0.58 && t < 0.86 ? Math.sin((t - 0.58) / 0.28 * Math.PI) : 0;
      const y = mid - Math.sin(t * Math.PI * 2 * cycles) * 18 * env;
      d += " L " + x + " " + y.toFixed(2);
    }
    return (
      '<svg class="wave" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="' + d + '" fill="none" stroke="' + inkRgba(0.4) + '" stroke-width="1.1"/>' +
      "</svg>"
    );
  }

  function stacked(items, opt) {
    opt = opt || {};
    const w = opt.w || 320;
    const h = opt.h || 80;
    const list = items || [];
    const downs = list.map(function (it) { return n(it.downlink || it.total); });
    const ups = list.map(function (it) { return n(it.uplink); });
    const max = Math.max.apply(null, downs.map(function (d, i) { return d + ups[i]; }).concat([1]));
    const slotW = w / Math.max(downs.length, 1);
    const bw = Math.max(4, Math.min(Number(opt.maxBarWidth) || 58, slotW * 0.62));
    return '<svg class="bars" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' + downs.map(function (d, i) {
      const up = ups[i];
      const x = i * slotW + (slotW - bw) / 2;
      const tip = (opt.tips && opt.tips[i]) || "";
      if (list[i] && list[i]._missing) return '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="0" width="' + Math.max(2, bw).toFixed(2) + '" height="' + h + '" fill="transparent"/>';
      const bhD = Math.max(1, (d / max) * (h - 8));
      const bhU = Math.max(1, (up / max) * (h - 8));
      return '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="' + (h - bhD).toFixed(2) + '" width="' + Math.max(2, bw).toFixed(2) + '" height="' + bhD.toFixed(2) + '" fill="' + inkRgba(0.4) + '"/>' +
        '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="' + (h - bhD - bhU).toFixed(2) + '" width="' + Math.max(2, bw).toFixed(2) + '" height="' + bhU.toFixed(2) + '" fill="' + gold() + '"/>';
    }).join("") + "</svg>";
  }

  function ruler(today, daysInMonth, opt) {
    opt = opt || {};
    const heights = opt.heights || [];
    const selected = opt.selected || today;
    const half = opt.halfDay;
    const w = 1000;
    const h = 48;
    const maxH = Math.max.apply(null, heights.concat([1]));
    let ticks = "";
    let labels = "";
    for (let d = 1; d <= daysInMonth; d += 1) {
      const x = ((d - 1) / Math.max(1, daysInMonth - 1)) * (w - 8) + 4;
      const future = d > today;
      const amp = heights[d - 1] != null ? 8 + (heights[d - 1] / maxH) * 18 : 8;
      const y2 = 26;
      const y1 = y2 - (future ? 6 : amp);
      const color = d === selected ? gold() : (future ? inkRgba(0.12) : inkRgba(0.28));
      ticks += '<line x1="' + x.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + y2 + '" stroke="' + color + '" stroke-width="' + (d === selected ? 1.6 : 1) + '"/>';
      const major = d === 1 || d === 5 || d === 10 || d === 15 || d === 20 || d === 30 || d === daysInMonth;
      if (major) {
        labels += '<text x="' + x.toFixed(1) + '" y="44" text-anchor="middle" fill="' + inkRgba(0.28) + '" font-size="11" font-family="IBM Plex Mono, monospace">' + String(d).padStart(2, "0") + "</text>";
      }
    }
    const cx = ((selected - 1) / Math.max(1, daysInMonth - 1)) * (w - 8) + 4;
    const mark =
      '<line x1="' + cx.toFixed(1) + '" y1="2" x2="' + cx.toFixed(1) + '" y2="26" stroke="' + gold() + '" stroke-width="1.2"/>' +
      '<circle cx="' + cx.toFixed(1) + '" cy="30" r="7" fill="' + voidFill() + '" stroke="' + gold() + '"/>' +
      '<text x="' + cx.toFixed(1) + '" y="33.5" text-anchor="middle" fill="' + token("--ink", "#ddd6c8") + '" font-size="8" font-family="IBM Plex Mono, monospace">' + selected + "</text>";
    let extra = "";
    if (half && half !== selected) {
      const hx = ((half - 1) / Math.max(1, daysInMonth - 1)) * (w - 8) + 4;
      extra = '<circle cx="' + hx.toFixed(1) + '" cy="30" r="3" fill="none" stroke="' + inkRgba(0.4) + '"/>';
    }
    return '<svg class="ruler-svg" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' + ticks + labels + extra + mark + "</svg>";
  }

  function multiSpark(seriesList, opt) {
    opt = opt || {};
    const w = opt.w || 960;
    const h = opt.h || 220;
    const series = (seriesList || []).filter(function (s) { return s && Array.isArray(s.points) && s.points.length; });
    if (!series.length) return '';
    const all = [];
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        const v = p && p.value != null ? Number(p.value) : NaN;
        if (Number.isFinite(v) && v >= 0) all.push(v);
      });
    });
    const dataMin = Math.min.apply(null, all.length ? all : [0]);
    const dataMax = Math.max.apply(null, all.length ? all : [50]);
    const rawSpan = Math.max(0, dataMax - dataMin);
    const yPad = rawSpan > 0 ? Math.max(4, rawSpan * 0.14) : Math.max(4, Math.abs(dataMax) * 0.08);
    const min = Math.max(0, dataMin - yPad);
    const max = Math.max(min + 8, dataMax + yPad);
    const span = Math.max(1, max - min);
    const times = [];
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        const t = p && p.t != null ? Number(p.t) : NaN;
        if (Number.isFinite(t)) times.push(t);
      });
    });
    const dataMinT = times.length ? Math.min.apply(null, times) : null;
    const dataMaxT = times.length ? Math.max.apply(null, times) : null;
    const requestedStart = Number(opt.domainStart);
    const requestedEnd = Number(opt.domainEnd);
    const fixedDomain = Number.isFinite(requestedStart) && Number.isFinite(requestedEnd) && requestedEnd > requestedStart;
    const minT = fixedDomain ? requestedStart : dataMinT;
    const maxT = fixedDomain ? requestedEnd : dataMaxT;
    const showY = opt.showYAxis === true;
    const showX = opt.showXAxis === true;
    const padL = showY ? 48 : 4;
    const padR = 6;
    const padT = 8;
    const padB = showX ? 24 : 8;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);
    const plotBottom = padT + plotH;
    function seriesColor(item, i) {
      const palette = ['#e2ad45', '#58a6ff', '#e06c75', '#65c18c', '#b48ead', '#d08770'];
      return palette[(Number(i) || 0) % palette.length];
    }
    const colors = series.map(seriesColor);
    const dashes = ['', '', '', '6 3'];
    let grid = '';
    [0, 0.5, 1].forEach(function (t) {
      const y = plotBottom - t * plotH;
      grid += '<line x1="' + padL + '" y1="' + y.toFixed(2) + '" x2="' + (w - padR) + '" y2="' + y.toFixed(2) + '" stroke="' + inkRgba(t === 0 ? 0.16 : 0.08) + '" stroke-width="0.6"/>';
    });
    let axes = '';
    if (showY) {
      [0, 0.5, 1].forEach(function (t) {
        const y = plotBottom - t * plotH;
        axes += '<text class="axis-label" x="' + (padL - 7) + '" y="' + (y + 3).toFixed(2) + '" text-anchor="end">' + esc(axisNumber(min + t * span)) + '</text>';
      });
      axes += '<text class="axis-unit" x="4" y="11">' + esc(opt.yUnit || '') + '</text>';
    }
    if (showX) {
      let labels = Array.isArray(opt.xLabels) && opt.xLabels.length >= 3 ? opt.xLabels.slice(0, 3) : null;
      if (!labels && minT != null && maxT != null) labels = [axisTime(minT), axisTime(minT + (maxT - minT) / 2), axisTime(maxT)];
      labels = labels || ['', '', ''];
      const xs = [padL, padL + plotW / 2, w - padR];
      labels.forEach(function (label, i) {
        axes += '<text class="axis-label axis-x" x="' + xs[i].toFixed(2) + '" y="' + (h - 5) + '" text-anchor="' + (i === 0 ? 'start' : i === 2 ? 'end' : 'middle') + '">' + esc(label) + '</text>';
      });
      axes += '<line class="axis-line" x1="' + padL + '" y1="' + plotBottom.toFixed(2) + '" x2="' + (w - padR) + '" y2="' + plotBottom.toFixed(2) + '"/>';
    }
    let paths = '';
    let hits = '';
    series.forEach(function (s, si) {
      const pts = s.points || [];
      const step = pts.length <= 1 ? 0 : plotW / (pts.length - 1);
      let d = '';
      let drawing = false;
      let seg = [];
      const segments = [];
      pts.forEach(function (p, i) {
        const v = p && p.value != null ? Number(p.value) : NaN;
        if (!Number.isFinite(v) || v < 0) { drawing = false; if (seg.length) segments.push(seg); seg = []; return; }
        const pt = p && p.t != null ? Number(p.t) : NaN;
        const x = Number.isFinite(pt) && minT != null && maxT != null && maxT > minT
          ? padL + Math.max(0, Math.min(1, (pt - minT) / (maxT - minT))) * plotW
          : padL + i * step;
        const y = plotBottom - ((v - min) / span) * plotH;
        d += (drawing ? ' L ' : 'M ') + x.toFixed(2) + ' ' + y.toFixed(2);
        drawing = true;
        seg.push([x, y]);
        const tm = p && p.t ? ((maxT != null && minT != null && maxT - minT >= 48 * 3600000) ? (String(new Date(Number(p.t)).getMonth() + 1).padStart(2, "0") + "-" + String(new Date(Number(p.t)).getDate()).padStart(2, "0") + " " + axisTime(p.t)) : axisTime(p.t)) : String(i + 1);
        hits += '<circle class="chart-hit" data-tip="' + esc(String(s.label || s.key || '') + ' · ' + tm + ' · ' + v + ' ms') + '" cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="5" fill="transparent"/>';
      });
      if (seg.length) segments.push(seg);
      if (d) {
        const color = colors[si % colors.length];
        segments.forEach(function (part) {
          if (!part.length) return;
          let ad = '';
          part.forEach(function (pt, i) { ad += (i ? ' L ' : 'M ') + pt[0].toFixed(2) + ' ' + pt[1].toFixed(2); });
          const a = part[0], b = part[part.length - 1];
          paths += '<path d="' + ad + ' L ' + b[0].toFixed(2) + ' ' + plotBottom.toFixed(2) + ' L ' + a[0].toFixed(2) + ' ' + plotBottom.toFixed(2) + ' Z" fill="' + color + '" fill-opacity="0.075" stroke="none"/>';
        });
        paths += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.8"' + (dashes[si % dashes.length] ? ' stroke-dasharray="' + dashes[si % dashes.length] + '"' : '') + ' vector-effect="non-scaling-stroke"/>';
      }
    });
    const legend = '<div class="multi-legend">' + series.map(function (s, i) {
      return '<span><i style="border-top-color:' + colors[i % colors.length] + ';' + (dashes[i % dashes.length] ? 'border-top-style:dashed;' : '') + '"></i>' + esc(s.label || s.key || '') + '</span>';
    }).join('') + '</div>';
    return '<div class="multi-chart"><svg class="multi-spark' + (showY || showX ? ' has-axes' : '') + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" data-plot-l="' + padL + '" data-plot-r="' + (w - padR) + '">' + grid + paths + axes + '<g class="scope-cur" hidden><line class="scope-v" x1="0" y1="' + padT + '" x2="0" y2="' + plotBottom.toFixed(2) + '" stroke="' + inkRgba(0.62) + '" stroke-width="0.8" opacity="0.72"/></g>' + hits + '</svg>' + legend + '</div>';
  }

  global.ProbeCharts = { spark: spark, multiSpark: multiSpark, bars: bars, stacked: stacked, wave: wave, ruler: ruler };
})(window);

/* land.js */
(function(g){g.ProbeLand=[[[-180.0,69.0],[-175.3,67.7],[-173.9,66.1],[-174.6,67.1],[-169.7,66.1],[-173.0,65.7],[-172.1,65.0],[-173.2,64.2],[-178.4,65.5],[-178.5,66.4],[-180.0,65.1]],[[180.0,65.1],[175.1,64.7],[178.2,64.4],[179.1,62.3],[173.5,61.8],[170.3,59.9],[163.6,60.0],[161.9,58.0],[163.3,57.7],[163.4,56.2],[162.1,56.1],[162.1,54.7],[160.0,54.2],[160.0,53.1],[158.4,53.0],[156.7,50.9],[156.0,56.7],[165.3,62.5],[163.3,62.5],[163.3,61.7],[160.2,60.6],[160.4,62.0],[156.7,61.5],[154.2,59.9],[155.2,59.2],[142.5,59.2],[135.2,54.9],[136.8,54.6],[136.8,53.8],[137.7,54.3],[137.3,53.5],[139.7,54.3],[141.4,53.3],[140.6,53.1],[141.5,52.2],[140.4,49.0],[135.1,43.5],[133.0,42.7],[131.8,43.3],[127.5,39.7],[129.4,37.1],[129.1,35.1],[126.5,34.3],[126.3,34.6],[126.5,37.8],[124.7,38.1],[125.6,39.7],[121.1,38.7],[121.9,41.0],[117.7,39.1],[119.2,37.1],[122.7,37.4],[119.2,35.0],[121.9,31.7],[120.1,32.0],[121.9,30.9],[120.1,30.2],[122.0,29.2],[119.5,26.8],[119.7,25.4],[116.5,22.9],[114.3,22.3],[113.4,23.1],[113.5,22.2],[110.4,21.4],[110.3,20.2],[109.6,21.8],[106.6,21.0],[105.6,18.9],[108.9,15.2],[109.0,11.4],[104.8,8.8],[105.1,10.0],[100.9,12.6],[101.0,13.5],[100.0,13.3],[99.2,9.3],[103.2,5.3],[104.3,1.4],[101.3,2.8],[100.1,6.6],[98.3,8.2],[98.9,11.7],[97.7,16.6],[96.9,17.5],[95.5,15.7],[94.2,16.0],[94.1,19.4],[91.4,22.8],[89.0,21.6],[88.0,22.2],[80.3,15.7],[79.9,10.3],[77.5,8.1],[73.5,16.1],[72.9,22.3],[70.8,20.7],[68.9,22.3],[70.4,23.0],[67.5,23.9],[66.5,25.6],[61.8,25.0],[57.3,25.8],[56.7,27.2],[53.7,26.7],[48.9,30.4],[47.7,29.4],[50.8,24.7],[51.6,25.9],[51.3,24.3],[54.1,24.1],[56.5,26.4],[56.6,24.5],[59.8,22.2],[57.8,19.0],[55.0,17.0],[43.5,12.7],[42.7,16.7],[34.6,28.1],[35.0,29.5],[34.2,27.7],[32.6,29.9],[32.3,31.2],[34.2,31.3],[36.0,34.5],[36.2,36.8],[32.8,36.0],[27.4,36.7],[28.3,37.1],[27.3,37.0],[26.2,38.3],[27.2,38.4],[26.9,39.6],[26.1,39.5],[33.3,42.0],[38.4,40.9],[41.4,41.4],[41.4,42.7],[36.6,45.2],[39.3,47.3],[35.2,46.5],[34.5,45.9],[35.0,45.4],[34.8,46.1],[36.6,45.4],[34.0,44.4],[32.5,45.4],[33.6,46.2],[30.1,46.4],[27.3,42.4],[29.0,41.0],[26.2,40.0],[26.8,40.6],[22.6,40.5],[23.4,39.2],[22.5,38.9],[24.1,38.2],[22.7,37.6],[23.2,36.4],[21.7,36.8],[21.4,38.2],[23.2,38.2],[21.1,38.3],[19.3,40.4],[19.6,41.8],[13.5,45.8],[12.1,45.4],[12.4,44.2],[18.5,40.1],[16.9,40.4],[17.2,39.0],[16.1,37.9],[15.7,40.0],[8.7,44.4],[6.2,43.0],[3.3,43.3],[3.2,41.9],[1.0,41.0],[-0.2,39.7],[0.2,38.7],[-2.1,36.7],[-5.6,36.0],[-6.9,37.3],[-9.0,37.0],[-8.6,38.4],[-9.5,38.8],[-8.6,42.3],[-9.3,43.1],[-1.6,43.4],[-1.1,46.3],[-4.8,48.5],[-1.4,48.6],[-1.9,49.7],[0.0,49.3],[1.6,50.9],[4.3,51.4],[3.4,51.5],[5.9,53.4],[9.8,53.5],[8.3,54.8],[8.6,57.1],[10.7,57.7],[10.1,56.7],[11.0,56.4],[9.4,54.8],[10.9,54.0],[19.4,54.2],[21.1,55.7],[20.5,55.0],[21.2,55.0],[21.7,57.6],[24.4,57.2],[23.5,59.2],[30.3,60.0],[21.4,60.6],[21.1,62.8],[25.5,65.0],[22.6,65.9],[20.7,63.8],[17.7,63.0],[17.2,60.7],[19.1,59.7],[16.2,58.6],[16.9,58.5],[15.8,56.1],[12.8,55.4],[10.8,59.9],[8.2,58.1],[5.7,58.6],[6.6,59.6],[5.2,59.5],[7.1,60.5],[5.5,59.9],[5.0,61.0],[7.1,60.9],[7.7,61.2],[5.2,61.1],[5.2,61.9],[6.8,61.9],[5.1,62.2],[11.0,63.4],[11.4,64.1],[9.5,63.6],[14.2,66.3],[13.0,66.2],[13.5,67.0],[15.9,67.6],[14.8,67.9],[17.9,68.4],[16.5,68.5],[18.1,69.5],[23.5,70.0],[24.6,71.0],[25.9,70.9],[25.2,70.1],[29.0,70.9],[31.0,70.4],[28.6,70.2],[29.5,69.7],[32.1,69.9],[33.0,68.9],[35.3,69.3],[41.4,67.1],[39.1,66.1],[31.9,67.1],[34.9,65.9],[34.8,64.5],[37.4,63.8],[38.0,64.3],[36.8,65.2],[40.5,64.5],[39.7,65.5],[40.7,66.0],[44.1,66.0],[44.2,68.3],[43.3,68.7],[46.5,68.1],[44.9,67.4],[46.0,66.8],[53.9,69.0],[53.2,68.2],[59.8,68.3],[61.2,68.8],[60.2,69.6],[60.8,69.9],[68.3,68.1],[69.3,68.9],[66.8,69.6],[66.7,71.1],[69.4,72.9],[71.6,72.9],[72.9,72.7],[71.8,71.5],[73.6,68.4],[71.7,66.9],[69.1,66.6],[72.1,66.2],[74.8,67.7],[74.7,68.8],[76.6,69.0],[77.1,67.8],[78.8,67.5],[77.5,67.7],[77.7,68.9],[75.9,69.3],[73.8,69.2],[74.3,70.6],[73.0,71.4],[74.8,72.8],[76.1,71.2],[78.5,70.9],[76.0,71.9],[78.4,72.4],[83.3,71.7],[82.0,70.6],[82.8,71.0],[82.4,70.2],[83.6,69.7],[83.7,71.6],[80.9,72.4],[80.5,73.6],[87.2,73.8],[85.9,74.9],[94.1,75.9],[93.3,76.1],[99.8,76.0],[98.9,76.5],[104.1,77.7],[107.5,76.9],[106.5,76.5],[113.9,75.8],[112.3,75.8],[113.6,75.2],[107.0,73.6],[105.5,72.7],[111.0,73.7],[110.0,74.0],[122.8,72.9],[124.4,73.8],[128.8,73.2],[129.5,72.7],[128.4,72.5],[129.6,72.2],[128.3,72.1],[131.0,70.7],[132.8,72.0],[140.1,71.4],[139.3,71.9],[140.2,72.3],[139.1,72.3],[140.9,72.9],[146.9,72.3],[145.3,71.6],[148.4,72.3],[152.5,70.8],[158.9,70.9],[161.1,69.2],[167.8,69.8],[170.5,68.8],[170.5,70.1],[176.1,69.9],[180.0,69.0]],[[31.9,31.5],[36.9,22.1],[37.4,18.9],[39.7,15.1],[43.3,12.5],[42.5,11.5],[44.6,10.4],[50.8,12.0],[51.4,10.4],[48.0,4.5],[40.8,-1.9],[39.2,-4.7],[40.8,-14.8],[34.6,-19.7],[35.5,-24.1],[32.5,-26.0],[32.4,-28.5],[27.0,-33.6],[20.0,-34.8],[18.4,-34.3],[18.2,-31.7],[11.8,-18.0],[13.9,-11.0],[12.7,-6.0],[8.7,-0.7],[10.0,0.2],[9.7,4.1],[8.2,4.9],[6.0,4.3],[3.8,6.6],[-2.0,4.8],[-8.7,4.8],[-12.5,7.4],[-15.5,11.3],[-14.9,12.0],[-16.8,12.4],[-16.7,13.5],[-16.4,13.2],[-15.6,13.5],[-17.5,14.7],[-16.0,17.7],[-17.0,21.8],[-14.5,26.2],[-10.2,29.3],[-9.3,32.5],[-5.5,35.9],[-2.0,35.1],[1.1,36.5],[9.7,37.3],[11.0,37.1],[10.2,33.8],[19.0,30.3],[21.7,32.9],[29.1,30.8]],[[-81.1,8.8],[-79.5,8.9],[-80.4,7.2],[-85.7,9.9],[-87.4,13.4],[-103.5,18.3],[-105.5,20.0],[-106.0,22.9],[-109.4,25.7],[-113.1,31.2],[-115.0,31.9],[-109.5,23.2],[-112.2,24.8],[-112.2,26.1],[-115.0,27.7],[-114.0,27.7],[-114.0,28.5],[-117.4,33.3],[-120.6,34.6],[-122.3,38.1],[-123.7,38.9],[-124.6,42.8],[-123.4,46.2],[-124.7,48.4],[-122.8,48.1],[-122.9,47.0],[-122.5,48.8],[-124.8,50.9],[-127.8,51.2],[-127.0,52.7],[-128.4,52.3],[-127.8,52.7],[-129.0,53.5],[-128.1,53.5],[-130.5,54.4],[-129.7,55.0],[-129.9,55.9],[-130.9,54.8],[-131.0,56.1],[-132.2,55.6],[-131.5,56.2],[-135.3,59.5],[-135.1,58.2],[-137.0,59.1],[-136.7,58.2],[-139.5,60.1],[-144.3,60.0],[-146.3,61.1],[-151.7,59.2],[-151.4,60.7],[-149.0,60.8],[-150.1,61.2],[-149.2,61.5],[-150.6,61.4],[-154.1,59.4],[-153.2,58.9],[-159.6,55.6],[-163.4,54.8],[-157.4,57.5],[-156.8,59.0],[-162.1,58.6],[-162.2,60.2],[-164.1,59.8],[-164.5,60.6],[-163.4,60.7],[-166.1,61.5],[-164.4,63.2],[-161.1,63.5],[-160.8,64.7],[-166.2,64.6],[-168.1,65.7],[-161.1,66.1],[-162.5,67.0],[-161.6,66.4],[-160.2,66.5],[-166.8,68.3],[-156.5,71.4],[-135.3,68.6],[-136.0,69.2],[-129.7,70.3],[-130.9,69.3],[-127.4,70.1],[-128.0,70.6],[-125.5,69.3],[-124.5,70.2],[-124.4,69.3],[-121.9,69.8],[-113.9,68.4],[-115.1,67.8],[-110.0,68.0],[-107.2,66.3],[-108.0,67.8],[-105.7,68.6],[-108.8,68.3],[-106.2,68.9],[-102.2,67.7],[-95.9,68.3],[-96.4,67.5],[-95.3,67.2],[-95.5,68.1],[-93.3,69.4],[-96.2,69.9],[-95.8,70.7],[-96.6,70.8],[-94.5,72.0],[-91.5,70.2],[-92.9,69.7],[-90.3,69.5],[-91.4,69.4],[-90.2,68.2],[-88.2,68.9],[-87.5,67.1],[-84.7,68.7],[-85.5,69.9],[-82.5,69.7],[-83.3,69.5],[-81.3,69.2],[-82.6,68.4],[-81.2,67.5],[-83.3,66.3],[-86.8,66.5],[-85.9,66.2],[-87.3,65.3],[-90.9,65.9],[-86.9,65.1],[-90.7,63.4],[-93.8,64.2],[-90.6,63.2],[-93.6,62.0],[-95.0,59.1],[-93.2,58.7],[-92.8,56.9],[-90.8,57.3],[-82.3,55.2],[-82.3,52.9],[-79.8,51.1],[-78.4,52.2],[-79.8,54.6],[-76.5,56.4],[-77.0,58.0],[-78.6,58.7],[-77.2,60.0],[-78.2,62.3],[-73.7,62.5],[-69.5,61.1],[-69.6,60.1],[-70.9,60.0],[-69.2,59.3],[-70.3,58.8],[-68.3,58.8],[-68.7,58.0],[-66.0,58.3],[-65.5,59.7],[-64.4,60.2],[-62.9,58.7],[-63.6,58.3],[-62.6,58.5],[-63.4,58.0],[-61.4,57.1],[-62.5,56.8],[-60.3,55.8],[-60.7,55.0],[-57.3,54.6],[-60.8,53.2],[-58.2,54.2],[-55.8,53.3],[-56.5,52.6],[-55.7,52.1],[-59.9,50.3],[-66.5,50.3],[-70.0,48.3],[-71.2,46.8],[-68.2,48.6],[-64.6,49.1],[-64.3,48.4],[-66.8,48.0],[-61.0,45.3],[-65.5,43.5],[-66.1,44.5],[-63.4,45.4],[-68.8,44.7],[-71.1,42.4],[-70.0,41.6],[-73.6,41.0],[-74.9,38.9],[-75.5,39.7],[-75.1,38.4],[-75.9,37.1],[-75.9,39.5],[-76.3,38.0],[-77.2,38.7],[-76.2,37.9],[-77.0,37.2],[-76.0,36.9],[-75.5,35.8],[-76.0,36.7],[-76.7,35.9],[-75.7,35.6],[-77.0,35.5],[-76.3,34.9],[-81.6,31.2],[-80.0,26.8],[-80.6,25.0],[-83.7,29.9],[-88.0,30.8],[-90.4,30.2],[-89.2,29.9],[-89.4,28.9],[-95.0,29.7],[-97.8,27.3],[-97.9,22.6],[-95.9,18.7],[-91.6,18.4],[-90.3,21.1],[-86.8,21.3],[-88.9,15.9],[-83.4,15.3],[-83.9,11.3]],[[-73.4,-53.0],[-73.7,-52.0],[-72.9,-52.5],[-72.5,-51.8],[-73.9,-51.6],[-73.3,-50.7],[-74.7,-50.2],[-73.6,-49.7],[-74.7,-48.0],[-73.2,-48.0],[-75.6,-46.7],[-74.7,-45.8],[-73.6,-46.5],[-72.5,-44.5],[-73.3,-44.2],[-72.3,-41.4],[-74.0,-41.0],[-73.7,-37.3],[-71.6,-33.6],[-70.3,-18.4],[-75.9,-14.7],[-81.3,-4.3],[-79.7,-2.6],[-80.9,-2.3],[-80.1,0.8],[-77.0,3.9],[-78.1,8.4],[-79.9,9.4],[-76.8,7.9],[-75.3,10.8],[-71.7,12.5],[-71.7,9.1],[-71.6,10.8],[-69.8,11.4],[-70.0,12.2],[-68.1,10.5],[-61.9,10.7],[-62.9,10.4],[-59.0,8.0],[-58.7,6.4],[-54.2,5.9],[-51.3,4.3],[-49.9,1.2],[-52.7,-1.6],[-50.9,-0.9],[-50.5,-1.9],[-49.3,-1.7],[-49.7,-2.7],[-48.1,-0.7],[-46.2,-0.9],[-44.8,-1.4],[-44.8,-3.4],[-43.4,-2.3],[-40.0,-2.8],[-35.6,-5.1],[-34.8,-7.2],[-38.8,-12.8],[-39.1,-17.7],[-41.0,-22.0],[-48.7,-25.4],[-48.8,-28.5],[-52.1,-32.2],[-50.6,-30.5],[-51.3,-30.0],[-54.2,-34.7],[-57.9,-34.5],[-58.4,-33.1],[-58.6,-34.4],[-56.7,-36.3],[-57.5,-38.1],[-62.3,-38.8],[-62.4,-40.9],[-65.0,-40.7],[-65.0,-42.1],[-63.6,-42.6],[-65.0,-42.7],[-64.3,-43.0],[-65.5,-44.9],[-67.6,-46.1],[-65.8,-47.9],[-68.7,-49.8],[-69.6,-51.6],[-68.4,-52.3],[-70.9,-52.7],[-71.3,-53.9],[-72.5,-53.4],[-71.5,-52.6]],[[146.2,-38.7],[140.6,-38.0],[139.5,-36.0],[138.1,-35.6],[138.1,-34.1],[137.8,-35.1],[136.9,-35.3],[138.0,-33.6],[137.8,-32.5],[136.0,-35.0],[134.2,-32.5],[131.2,-31.5],[118.0,-35.1],[115.1,-34.4],[115.9,-32.0],[113.2,-26.1],[114.2,-26.3],[113.4,-24.4],[114.0,-21.9],[114.3,-22.5],[116.8,-20.5],[121.1,-19.5],[122.9,-16.4],[123.6,-17.6],[123.6,-16.2],[124.4,-16.6],[125.0,-16.4],[124.4,-15.7],[126.0,-13.9],[127.4,-13.9],[128.0,-15.5],[129.6,-15.2],[130.6,-12.4],[132.8,-12.2],[132.0,-11.1],[136.6,-11.9],[135.4,-14.9],[140.6,-17.6],[142.5,-10.7],[143.8,-14.4],[145.3,-14.9],[146.3,-18.9],[148.8,-20.2],[149.6,-22.6],[150.7,-22.3],[153.2,-25.9],[153.6,-28.6],[150.0,-37.5]],[[-42.9,60.5],[-46.2,60.7],[-45.2,61.2],[-49.1,61.4],[-48.3,61.5],[-51.6,63.7],[-49.6,64.3],[-51.0,65.2],[-52.0,64.2],[-51.3,65.0],[-52.6,65.3],[-50.5,65.7],[-53.5,66.0],[-50.3,66.8],[-53.7,66.1],[-52.2,66.8],[-53.9,67.2],[-51.5,67.3],[-53.8,67.4],[-50.3,67.9],[-53.7,67.5],[-50.3,67.9],[-53.5,68.3],[-50.7,68.5],[-50.2,70.1],[-54.6,70.7],[-50.6,70.3],[-52.5,71.2],[-51.4,71.5],[-53.0,71.4],[-51.7,71.7],[-55.9,71.7],[-54.3,72.5],[-56.1,74.3],[-57.3,74.1],[-56.2,74.6],[-60.9,76.2],[-68.5,76.1],[-69.6,76.4],[-67.9,76.7],[-71.4,77.1],[-66.2,77.6],[-73.1,78.2],[-66.0,79.1],[-63.8,80.1],[-67.5,80.3],[-61.8,81.0],[-61.8,81.8],[-57.2,81.3],[-60.1,82.0],[-40.9,82.4],[-45.9,82.9],[-44.3,83.3],[-21.9,82.6],[-34.3,81.8],[-22.9,82.1],[-24.8,80.5],[-12.9,81.7],[-21.3,80.6],[-16.1,80.5],[-20.6,80.1],[-17.6,80.0],[-22.0,77.7],[-18.3,76.8],[-22.7,76.7],[-19.4,75.7],[-22.5,75.5],[-19.0,74.5],[-22.5,74.1],[-20.4,73.5],[-25.8,73.9],[-24.7,73.5],[-27.7,73.1],[-21.9,71.7],[-22.6,71.5],[-21.5,70.5],[-28.4,72.0],[-25.4,71.3],[-29.3,70.5],[-22.1,70.1],[-29.4,68.2],[-32.6,68.6],[-32.1,67.9],[-34.8,66.3],[-41.1,65.1],[-40.3,64.3],[-41.6,64.3],[-40.5,63.7],[-43.2,62.7],[-42.1,62.4],[-43.6,61.1]],[[147.2,-7.5],[150.9,-10.2],[147.7,-10.1],[144.8,-7.4],[142.2,-8.2],[143.4,-8.8],[142.6,-9.3],[139.0,-8.3],[138.1,-5.4],[134.0,-3.9],[133.8,-2.9],[132.9,-4.1],[131.9,-2.8],[133.9,-2.1],[130.9,-1.4],[132.4,-0.3],[134.0,-0.7],[135.1,-3.4],[137.9,-1.5],[144.5,-3.8],[147.6,-6.1]],[[115.0,-4.0],[110.3,-3.0],[108.9,1.2],[109.6,2.1],[111.2,1.4],[111.4,2.7],[117.2,7.0],[119.3,5.4],[117.0,3.6],[119.0,1.0],[117.9,1.1]],[[45.0,-25.5],[43.2,-22.3],[44.5,-20.0],[43.9,-17.5],[44.4,-16.2],[47.2,-15.5],[49.3,-12.0],[50.5,-15.4],[49.6,-15.5],[47.1,-25.0]],[[-66.0,62.0],[-71.6,63.1],[-73.3,64.7],[-78.0,64.4],[-77.4,65.5],[-73.5,65.4],[-74.5,66.2],[-72.1,66.7],[-73.7,68.7],[-76.6,68.7],[-75.6,69.2],[-77.0,70.0],[-79.0,70.7],[-78.8,69.9],[-85.8,70.0],[-89.5,71.1],[-84.8,70.9],[-84.5,71.6],[-86.0,72.0],[-84.1,72.0],[-85.7,72.9],[-81.5,73.7],[-80.2,72.7],[-81.0,71.9],[-77.7,71.7],[-78.9,72.2],[-77.0,72.1],[-78.6,72.4],[-77.6,72.8],[-74.2,72.1],[-75.0,71.2],[-70.6,71.1],[-71.5,70.0],[-68.3,70.5],[-70.0,69.6],[-67.2,69.7],[-70.1,69.5],[-66.7,69.2],[-69.4,68.8],[-61.3,66.7],[-63.5,65.9],[-63.5,64.9],[-65.5,65.7],[-64.4,66.4],[-67.9,66.6],[-67.1,66.0],[-68.2,65.4],[-65.7,64.8],[-64.5,63.2],[-69.0,63.8]],[[105.7,-5.9],[101.6,-3.2],[95.2,5.6],[97.5,5.3],[103.7,0.3],[103.3,-0.7],[106.1,-3.2]],[[136.0,33.7],[135.3,34.7],[130.9,34.3],[133.1,35.6],[136.1,35.7],[136.8,37.4],[137.3,36.8],[139.4,38.1],[139.9,40.6],[141.5,41.4],[142.1,39.5],[140.9,35.7],[138.8,34.6],[136.7,35.1]],[[-113.6,69.0],[-117.4,70.0],[-111.4,70.3],[-117.7,70.6],[-118.3,71.0],[-115.0,71.5],[-119.1,71.8],[-114.5,73.4],[-114.5,72.6],[-109.9,73.0],[-107.8,71.6],[-108.2,73.2],[-106.8,73.3],[-105.3,72.8],[-104.5,71.0],[-101.0,70.2],[-103.5,69.7],[-101.8,69.0]],[[1.4,51.2],[-5.7,50.1],[-2.3,51.8],[-5.3,51.9],[-2.7,53.4],[-3.1,55.0],[-5.1,54.9],[-4.8,56.2],[-5.8,55.3],[-5.0,56.7],[-6.2,56.7],[-5.0,58.6],[-3.0,58.6],[-4.4,57.5],[-1.8,57.6],[-3.8,56.1],[-2.1,55.9],[-0.0,52.9],[1.8,52.5],[0.3,51.5]],[[-82.4,82.7],[-63.6,82.8],[-61.1,82.4],[-69.3,81.7],[-66.6,81.5],[-70.0,81.1],[-64.6,81.4],[-78.0,79.4],[-74.4,79.0],[-78.9,79.1],[-74.6,78.6],[-78.7,77.3],[-82.0,77.7],[-78.0,77.0],[-81.1,76.1],[-89.7,76.6],[-86.6,77.2],[-88.2,77.9],[-84.5,77.3],[-82.3,78.1],[-84.8,77.5],[-84.6,78.6],[-87.5,78.1],[-86.9,78.7],[-81.5,79.1],[-84.7,79.0],[-83.4,79.1],[-86.5,80.3],[-80.6,79.6],[-83.2,80.3],[-76.5,80.9],[-79.0,80.9],[-76.8,81.5],[-86.1,80.5],[-82.3,81.2],[-87.5,80.6],[-89.4,80.9],[-84.6,81.3],[-91.9,81.7],[-80.4,82.0]],[[120.5,-5.6],[118.8,-2.8],[120.0,0.7],[125.2,1.7],[124.3,0.4],[120.3,0.4],[120.7,-1.4],[123.5,-0.8],[121.3,-1.8],[122.9,-4.4],[121.5,-4.8],[120.8,-2.6]],[[170.0,-46.3],[166.7,-46.2],[166.8,-45.3],[170.7,-43.1],[172.1,-40.9],[174.3,-41.0],[173.1,-43.9],[171.7,-43.5]],[[114.0,-8.6],[107.8,-7.7],[105.2,-6.8],[106.0,-5.9],[111.0,-6.4],[114.4,-7.8]],[[174.9,-41.0],[175.1,-39.9],[173.8,-39.3],[174.9,-37.1],[174.5,-37.0],[172.7,-34.4],[176.0,-37.7],[178.6,-37.7],[176.0,-41.2]],[[-54.1,47.9],[-56.0,47.0],[-54.7,47.7],[-59.4,47.9],[-55.9,51.6],[-56.9,49.5],[-53.5,49.3],[-53.9,47.9],[-52.6,47.5],[-53.2,46.6],[-54.2,46.8]],[[-74.1,20.2],[-77.7,19.8],[-77.2,20.7],[-81.9,22.7],[-82.8,22.7],[-84.0,21.9],[-85.0,21.9],[-84.0,22.7],[-81.1,23.2]],[[124.0,13.0],[120.6,13.8],[119.7,16.0],[120.6,18.5],[122.3,18.4],[121.7,14.4]],[[-17.0,63.8],[-22.7,63.8],[-21.4,64.4],[-24.0,64.9],[-21.7,65.5],[-24.5,65.5],[-22.4,65.8],[-23.1,66.4],[-21.1,65.2],[-20.4,66.1],[-16.2,66.5],[-13.5,65.1]],[[125.0,5.9],[123.7,7.8],[121.9,7.1],[123.4,8.7],[123.7,8.0],[125.5,9.0],[125.4,9.8],[126.6,7.3]],[[-6.3,52.2],[-10.4,51.8],[-8.7,52.7],[-9.9,52.6],[-8.9,53.2],[-10.1,54.2],[-6.1,55.2],[-5.4,54.5],[-6.4,54.0]],[[143.3,42.0],[140.5,42.6],[141.2,41.8],[140.0,41.6],[139.8,42.6],[141.4,43.3],[141.9,45.5],[145.8,43.4]],[[142.0,46.0],[141.6,52.3],[142.7,54.4],[144.7,48.6],[143.0,49.1],[142.5,47.8],[143.6,46.4]],[[-68.3,18.6],[-71.4,17.6],[-74.5,18.4],[-72.4,18.5],[-72.8,20.0]],[[-115.3,73.5],[-123.1,71.1],[-126.0,72.0],[-123.8,73.8],[-124.7,74.4]],[[80.3,6.0],[79.7,8.2],[80.2,9.8],[81.9,7.0]],[[146.0,-43.3],[144.7,-40.7],[148.1,-40.8],[148.0,-43.2]],[[-92.2,75.0],[-93.1,76.4],[-95.4,76.2],[-96.8,77.0],[-79.3,74.9]],[[-65.1,-54.6],[-66.7,-55.0],[-72.0,-54.6],[-69.0,-54.5],[-70.4,-52.8],[-68.8,-52.6]],[[58.3,74.0],[53.7,73.8],[61.1,76.3],[68.6,77.0]],[[-80.1,63.8],[-83.0,64.2],[-85.2,63.1],[-87.2,63.6],[-85.6,65.9]],[[-111.0,75.3],[-117.7,75.3],[-115.0,75.7],[-117.2,75.6],[-114.9,76.5],[-108.9,75.5],[-110.4,76.4],[-109.1,76.8],[-108.0,75.8],[-105.4,75.9],[-112.4,74.4],[-114.4,74.7]],[[-94.2,79.0],[-90.3,79.2],[-95.1,79.3],[-94.3,79.8],[-96.7,80.1],[-94.4,80.0],[-96.6,80.4],[-93.8,80.5],[-95.5,80.8],[-93.5,81.4],[-84.9,79.3],[-88.9,78.1]],[[17.0,76.6],[13.9,77.5],[17.0,77.9],[13.6,78.1],[17.4,78.4],[13.0,78.2],[10.7,79.5],[16.5,78.9],[16.3,80.1],[21.5,78.7],[19.0,78.4]],[[-49.8,-1.8],[-50.3,-0.1],[-48.4,-0.3]],[[130.7,31.0],[130.5,33.3],[129.7,32.6],[129.6,33.3],[131.0,33.8],[132.1,32.9]],[[120.9,22.0],[120.1,23.6],[121.6,25.3],[122.0,25.0]],[[151.1,-6.0],[149.6,-6.3],[148.3,-5.6],[150.9,-5.5],[152.2,-4.1]],[[-85.0,71.3],[-87.0,71.2],[-90.0,71.5],[-89.1,73.2],[-86.6,73.9],[-84.8,73.7],[-86.3,72.7]],[[109.0,18.4],[109.3,19.9],[110.9,20.0],[110.4,18.7]],[[-96.5,72.8],[-99.2,71.4],[-102.7,72.7],[-100.2,72.8],[-101.6,73.5],[-100.9,73.8],[-97.0,73.7],[-98.5,73.0]],[[57.6,70.7],[51.4,71.8],[53.2,73.2],[56.5,73.2],[55.2,71.9]],[[-123.3,48.5],[-127.4,50.6],[-128.4,50.8],[-125.4,50.3]],[[124.0,-10.3],[125.1,-8.6],[127.3,-8.4]],[[15.0,36.7],[12.7,37.6],[12.5,38.0],[15.7,38.3]],[[-95.0,72.0],[-95.3,74.0],[-90.2,73.9],[-94.3,72.8],[-93.5,72.4]],[[8.5,39.0],[8.2,40.9],[9.2,41.3],[9.6,39.3]],[[138.0,74.8],[137.0,75.6],[138.8,76.2],[145.4,75.5]],[[134.2,33.2],[132.0,33.3],[134.6,34.2]],[[127.9,0.5],[128.4,-0.9],[127.7,-0.2],[127.4,1.0],[127.9,2.2],[127.6,0.9],[128.7,1.6],[128.9,0.2]],[[128.0,-3.1],[129.0,-2.8],[130.3,-3.0],[130.9,-3.9]],[[167.0,-22.3],[164.9,-21.4],[164.0,-20.1]],[[-97.3,75.4],[-100.8,75.4],[-99.6,75.7],[-102.9,75.6],[-98.5,76.7]],[[-119.2,77.3],[-115.4,77.3],[-122.6,75.9]],[[117.0,-9.1],[117.9,-8.1],[119.2,-8.6]],[[100.0,78.9],[92.9,79.6],[100.1,79.8]],[[27.0,79.9],[23.7,79.2],[17.7,80.1],[22.8,80.5]],[[123.0,-8.3],[121.7,-8.9],[119.8,-8.7],[120.4,-8.2]],[[-99.0,68.9],[-98.0,69.9],[-95.2,68.9],[-96.5,68.5]],[[123.2,11.0],[123.0,9.0],[122.4,9.8]],[[125.8,11.0],[125.0,11.8],[124.3,12.6],[125.5,12.2]],[[138.0,-8.4],[138.2,-7.5],[139.1,-7.6],[139.0,-8.1]],[[106.7,-3.0],[105.1,-2.1],[105.3,-1.6],[106.0,-1.6]],[[119.7,10.5],[117.2,8.3],[119.5,11.4]],[[122.0,10.4],[121.9,11.9],[123.2,11.6],[123.1,11.2]],[[-99.0,77.9],[-104.4,78.3],[-103.3,78.7],[-105.5,79.3]],[[100.3,78.0],[102.5,79.4],[105.5,78.5]],[[-79.3,72.7],[-80.8,73.8],[-76.1,72.9]],[[-76.2,17.9],[-77.7,17.9],[-78.3,18.4]],[[120.8,-10.0],[120.0,-10.0],[118.9,-9.5]],[[-59.8,46.0],[-61.3,45.5],[-61.6,46.0],[-60.4,47.0],[-61.2,45.7]],[[178.2,-17.3],[177.9,-18.3],[177.2,-18.0]],[[-154.8,19.5],[-155.8,19.0],[-155.9,20.3]],[[-180.0,-77.8],[-163.3,-78.6],[-158.2,-77.1],[-151.9,-77.4],[-145.5,-75.4],[-128.2,-74.3],[-127.1,-73.3],[-101.8,-75.1],[-101.2,-74.7],[-102.5,-74.5],[-101.4,-74.2],[-103.0,-73.6],[-101.3,-73.6],[-103.4,-72.3],[-98.7,-71.7],[-82.2,-73.8],[-77.4,-73.3],[-79.3,-73.0],[-78.9,-72.3],[-72.2,-73.1],[-75.4,-71.8],[-73.3,-70.8],[-76.5,-71.1],[-73.9,-70.5],[-75.8,-69.9],[-73.5,-70.3],[-70.5,-68.8],[-68.4,-70.1],[-68.8,-69.4],[-66.6,-68.2],[-67.5,-67.0],[-57.3,-63.2],[-60.7,-64.7],[-59.5,-65.2],[-62.2,-65.3],[-60.0,-66.8],[-61.5,-69.4],[-59.7,-72.5],[-61.7,-74.8],[-48.7,-77.8],[-36.0,-78.2],[-26.6,-76.1],[-27.7,-75.6],[-25.2,-75.1],[-25.7,-74.1],[-22.1,-74.3],[-19.2,-72.7],[0.0,-69.6],[24.6,-70.3],[33.6,-68.7],[38.8,-70.1],[39.9,-68.8],[50.9,-67.2],[50.4,-66.3],[53.8,-65.8],[59.1,-67.4],[69.6,-67.7],[74.5,-69.8],[86.0,-66.3],[94.3,-66.6],[96.4,-65.0],[102.5,-65.9],[102.9,-65.1],[108.8,-66.9],[113.2,-65.8],[117.6,-67.0],[134.7,-66.0],[146.2,-66.7],[145.3,-67.5],[147.7,-68.3],[153.9,-68.3],[170.3,-71.3],[171.0,-71.8],[169.2,-73.5],[162.6,-75.2],[165.8,-75.5],[162.5,-75.5],[162.3,-77.0],[164.4,-78.1],[166.9,-77.9],[166.7,-77.2],[180.0,-77.8],[180.0,-90.0],[-180.0,-90.0]]];})(window);

/* app.js */
(function () {
  const U = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  const main = document.getElementById("main");
  const foot = document.getElementById("foot");
  const titleEl = document.getElementById("page-title");
  const overlay = document.getElementById("overlay");
  const winBody = document.getElementById("win-body");
  const winTitle = document.getElementById("win-title");
  const winKicker = document.getElementById("win-kicker");
  const financeOverlay = document.getElementById("finance-overlay");
  const financeBody = document.getElementById("finance-body");

  let state = { enabled: true, title: "节点状态", servers: [], _loading: true, _source: "lite-rpc2" };
  let range = "1h";
  let targetKey = "";
  let latencyTargetKey = "all";
  let lastFocus = null;
  let lastView = "list";
  let home = "nodes";
  let showGlobe = localStorage.getItem("mmwx-globe") !== "0";
  let globeQuality = "medium";
  let globeLon = 80;
  let globeLat = 30;
  let globeDrag = null;
  let globeSkipClick = false;
  let globeLabelSide = {};
  let netKey = "";
  let netTarget = "all";
  let pulseDay = new Date().getDate();
  let pulse = [];
  let liveMode = false;
  let seriesCache = {};
  let seriesCacheOrder = [];
  const SERIES_CACHE_MAX = 64;
  let lastWindowKey = "";
  let subpageLiveTick = 0;
  let accessState = { known: false, logged_in: false, is_admin: false };
  let listSortKey = "";
  let listSortDir = 0; // 0=Lite default, -1=desc, 1=asc
  let regionFilter = "";
  let nodeQuery = "";
  let anomalyFilter = false;
  let globePaintRAF = 0;
  let globeLiveTick = 0;
  let domPatchActive = false;
  let domPatchFreezeSVG = false;
  let wakeGlobeIdle = function () {};
  let globePinned = false;
  let systemHistoryRange = "1h";
  const systemHistoryCache = Object.create(null);
  const systemHistoryInFlight = Object.create(null);
  const SYSTEM_HISTORY_TTL_MS = 90000;
  let externalFontsRequested = false;
  let financeSortKey = "";
  let financeSortDir = 0; // 0=default monthly desc, -1=desc, 1=asc
  const billingTodayCache = {};

  function h(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function attr(value) { return h(value); }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function iconSun() {
    return '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.3 3.3l1.3 1.3M11.4 11.4l1.3 1.3M3.3 12.7l1.3-1.3M11.4 4.6l1.3-1.3"/></svg>';
  }

  function iconMoon() {
    return '<svg viewBox="0 0 16 16"><path d="M10.4 2.6a5.7 5.7 0 1 0 2.9 7.6 4.5 4.5 0 0 1-2.9-7.6z"/></svg>';
  }

  function paintTheme(next) {
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("mmwx-theme", next);
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.innerHTML = next === "light" ? iconMoon() : iconSun();
    btn.setAttribute("aria-pressed", next === "light" ? "true" : "false");
    btn.setAttribute("aria-label", next === "light" ? "切换夜间模式" : "切换日间模式");
    btn.title = next === "light" ? "夜间" : "日间";
    if (window.ProbeFX) ProbeFX.apply();
  }

  function setTheme(mode, opts) {
    const next = mode === "light" ? "light" : "dark";
    paintTheme(next);
    if (opts && opts.after) opts.after();
  }
  const PAGES = ["overview", "ping", "traffic", "system"];
  const PAGE_LABEL = { overview: "Overview", ping: "Latency", traffic: "Traffic", system: "System" };
  const COUNTRY_LL = {
    HK: [114.2, 22.3], JP: [139.7, 35.7], DE: [8.7, 50.1], NL: [4.9, 52.4],
    US: [-98.6, 39.8], TW: [121.0, 23.7], AU: [134.5, -25.7], SG: [103.82, 1.35],
    KR: [127.8, 36.3], GB: [-2.5, 54.5], FR: [2.2, 46.2], CN: [104.2, 35.8],
  };

  // Lite exposes a region label but no native latitude/longitude. These hints
  // provide a better automatic approximation when a city/airport code exists
  // in the region or node name. Exact metadata coordinates always win.
  const CITY_HINTS = [
    [/\b(SJC|SAN JOSE)\b|圣何塞/i, [-121.8863, 37.3382], "San Jose"],
    [/\b(LAX|LOS ANGELES)\b|洛杉矶/i, [-118.2437, 34.0522], "Los Angeles"],
    [/\b(NYC|NEW YORK)\b|纽约/i, [-74.0060, 40.7128], "New York"],
    [/\b(ORD|CHICAGO)\b|芝加哥/i, [-87.6298, 41.8781], "Chicago"],
    [/\b(SEA|SEATTLE)\b|西雅图/i, [-122.3321, 47.6062], "Seattle"],
    [/\b(DAL|DFW|DALLAS)\b|达拉斯/i, [-96.7970, 32.7767], "Dallas"],
    [/\b(HKG|HONG KONG|HK)\b|香港/i, [114.1694, 22.3193], "Hong Kong"],
    [/\b(TYO|TOKYO)\b|东京|東京/i, [139.6917, 35.6895], "Tokyo"],
    [/\b(OSA|OSAKA)\b|大阪/i, [135.5023, 34.6937], "Osaka"],
    [/\b(SEL|SEOUL)\b|首尔|首爾|서울/i, [126.9780, 37.5665], "Seoul"],
    [/\b(SIN|SINGAPORE|SG)\b|新加坡/i, [103.8198, 1.3521], "Singapore"],
    [/\b(TPE|TAIPEI)\b|台北|臺北/i, [121.5654, 25.0330], "Taipei"],
    [/\b(AMS|AMSTERDAM)\b|阿姆斯特丹/i, [4.9041, 52.3676], "Amsterdam"],
    [/\b(FRA|FRANKFURT)\b|法兰克福|法蘭克福/i, [8.6821, 50.1109], "Frankfurt am Main"],
    [/\b(LON|LONDON)\b|伦敦|倫敦/i, [-0.1276, 51.5072], "London"],
    [/\b(PAR|PARIS)\b|巴黎/i, [2.3522, 48.8566], "Paris"],
    [/\b(SYD|SYDNEY)\b|悉尼|雪梨/i, [151.2093, -33.8688], "Sydney"],
    [/\b(SHA|SHANGHAI)\b|上海/i, [121.4737, 31.2304], "Shanghai"],
    [/\b(PEK|BEIJING)\b|北京/i, [116.4074, 39.9042], "Beijing"],
    [/\b(CAN|GUANGZHOU)\b|广州|廣州/i, [113.2644, 23.1291], "Guangzhou"],
    [/\b(TXG|TAICHUNG)\b|台中|臺中/i, [120.6736, 24.1477], "Taichung"],
    [/\b(BUF|BUFFALO)\b/i, [-78.8784, 42.8864], "Buffalo"],
    [/\b(HACIENDA[ _.-]*HEIGHTS)\b/i, [-117.9687, 33.9931], "Hacienda Heights"],
    [/\b(NYC|NEW[ _.-]*YORK)\b|CHICAGO[^A-Z0-9]*VPS[^A-Z0-9]*NY/i, [-74.0060, 40.7128], "New York"],
  ];

  function cityHintInfo(server) {
    const text = [server && server.region_city, server && server.region_name, server && server.group, server && server.name].filter(Boolean).join(' ');
    for (let i = 0; i < CITY_HINTS.length; i += 1) {
      if (CITY_HINTS[i][0].test(text)) return { ll: CITY_HINTS[i][1], name: CITY_HINTS[i][2] || '' };
    }
    return null;
  }

  function displayCountry(server) {
    return String(server && (server.geo_country || server.region_country) || '').toUpperCase();
  }

  function displayRegionCountry(server) {
    const raw = displayCountry(server);
    return raw === 'HK' || raw === 'TW' ? 'CN' : raw;
  }

  function fallbackCity(server) {
    const raw = String(server && (server.region_city || server.region_name || '') || '').trim();
    const hint = cityHintInfo(server);
    if (hint && hint.name) return hint.name;
    const cc = String(server && (server.geo_country || server.region_country) || '').toUpperCase();
    if (cc === 'HK') return 'Hong Kong';
    if (cc === 'TW') return /TAICHUNG|台中|臺中/i.test(raw) ? 'Taichung' : /TAIPEI|台北|臺北/i.test(raw) ? 'Taipei' : 'Taiwan';
    if (cc === 'SG') return 'Singapore';
    if (cc === 'JP' && !raw) return 'Japan';
    if (cc === 'KR' && !raw) return 'Korea';
    const countryWords = {
      US: /^(US|USA|美国|美國|United States|United States of America)$/i,
      GB: /^(GB|UK|英国|英國|United Kingdom|Britain)$/i,
      NL: /^(NL|荷兰|荷蘭|Netherlands|德国|德國|Germany)$/i,
      KR: /^(KR|韩国|韓國|Korea|South Korea)$/i,
      JP: /^(JP|日本|Japan)$/i,
      SG: /^(SG|新加坡|Singapore)$/i,
      CN: /^(CN|中国|中國|China)$/i,
      HK: /^(HK|香港|Hong Kong)$/i,
      TW: /^(TW|台湾|台灣|Taiwan)$/i
    };
    if (raw && countryWords[cc] && countryWords[cc].test(raw)) return '';
    if (raw && !/^([A-Z]{2}|[\u{1F1E6}-\u{1F1FF}]{2})$/u.test(raw) && raw.toUpperCase() !== cc) return raw.replace(/^([A-Z]{2})[\s·_.-]+/i, '').trim();
    return '';
  }

  function regionDisplay(server) {
    const cc = displayRegionCountry(server) || '—';
    const city = fallbackCity(server);
    return { code: cc, city: city, label: city ? cc + ' · ' + city : cc };
  }
  // Detailed coastline rings, loaded before the app in the same lon/lat format as upstream ProbeLand.
  const WORLD_OUTLINES = Array.isArray(window.ProbeLand) ? window.ProbeLand : [];
  // Lightweight orientation geometry used only by the explicit Low globe mode.
  const COARSE_WORLD_OUTLINES = [
    [[-168,72],[-145,70],[-130,55],[-124,48],[-123,38],[-117,32],[-105,25],[-97,19],[-85,22],[-81,30],[-75,40],[-66,47],[-60,54],[-78,62],[-100,72],[-130,72],[-168,72]],
    [[-82,12],[-75,8],[-70,-5],[-63,-15],[-58,-25],[-52,-33],[-58,-43],[-67,-55],[-74,-48],[-75,-32],[-80,-15],[-82,0],[-82,12]],
    [[-10,36],[-6,44],[4,51],[15,56],[28,58],[42,55],[55,49],[68,52],[84,56],[100,60],[120,58],[140,50],[150,42],[145,32],[130,30],[122,20],[110,12],[100,7],[88,20],[75,24],[62,30],[48,28],[36,34],[28,40],[18,42],[8,39],[-10,36]],
    [[-17,35],[-5,36],[10,33],[25,31],[35,23],[43,11],[51,2],[45,-12],[38,-25],[30,-34],[18,-35],[5,-30],[-5,-18],[-12,0],[-17,16],[-17,35]],
    [[112,-11],[126,-13],[138,-18],[151,-26],[153,-37],[144,-43],[130,-40],[116,-34],[112,-22],[112,-11]],
    [[130,32],[136,35],[141,41],[145,44],[143,36],[139,33],[130,32]],
    [[-8,50],[-5,58],[-3,59],[1,54],[-2,50],[-8,50]],
    [[-52,60],[-44,66],[-34,72],[-26,76],[-40,82],[-55,80],[-62,70],[-52,60]]
  ];

  function normalizeGlobeQuality(value) {
    const q = String(value || "medium").trim().toLowerCase();
    return q === "low" || q === "high" ? q : "medium";
  }

  function globeProfile() {
    const q = normalizeGlobeQuality(globeQuality);
    if (q === "low") return { key: "low", land: "coarse", coastStride: 1, gridLon: 60, gridLat: 30, curveStep: 8, sweepCount: 0, linkMode: 0, idleMs: 90 };
    if (q === "high") return { key: "high", land: "detailed", coastStride: 2, gridLon: 30, gridLat: 30, curveStep: 4, sweepCount: 4, linkMode: 2, idleMs: 48 };
    return { key: "medium", land: "detailed", coastStride: 3, gridLon: 30, gridLat: 30, curveStep: 7, sweepCount: 1, linkMode: 1, idleMs: 64 };
  }


  function pad(n) { return String(n).padStart(2, "0"); }

  function fmtBytes(bytes, digits) {
    if (bytes == null) return "—";
    const abs = Math.abs(bytes);
    const units = [
      [U.TB, "TB"],
      [U.GB, "GB"],
      [U.MB, "MB"],
      [U.KB, "KB"],
      [1, "B"],
    ];
    for (let i = 0; i < units.length; i += 1) {
      if (abs >= units[i][0] || units[i][1] === "B") {
        const v = bytes / units[i][0];
        let d = digits;
        if (d == null) d = v >= 100 ? 0 : v >= 10 ? 1 : 2;
        if (Math.abs(v - Math.round(v)) < 0.005 && units[i][1] !== "TB") d = 0;
        return v.toFixed(d) + " " + units[i][1];
      }
    }
    return "0 B";
  }

  function fmtSpeed(bps) {
    if (bps == null) return "—";
    return fmtBytes(bps, 1) + "/s";
  }

  function fmtDays(sec) {
    const value = Number(sec);
    if (!Number.isFinite(value) || value < 0) return "—";
    if (value < 3600) return Math.floor(value / 60) + " 分";
    if (value < 86400) return Math.floor(value / 3600) + " 小时";
    return Math.floor(value / 86400) + " 天";
  }

  function lastSeenText(server) {
    if (!server || server.online || server.last_seen_at == null) return "";
    const at = Number(server.last_seen_at);
    if (!Number.isFinite(at)) return "";
    const sec = Math.max(0, Math.floor((Date.now() - at) / 1000));
    if (sec < 45) return "刚刚";
    if (sec < 3600) return Math.max(1, Math.floor(sec / 60)) + " 分钟前";
    if (sec < 86400) return Math.max(1, Math.floor(sec / 3600)) + " 小时前";
    if (sec < 86400 * 60) return Math.max(1, Math.floor(sec / 86400)) + " 天前";
    const d = new Date(at);
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function statusHTML(server, compact) {
    const online = !!(server && server.online);
    const seen = online ? "" : lastSeenText(server);
    const detail = seen ? '<small>' + h(seen) + '</small>' : '';
    const alert = anomalyBadgeHTML(server);
    return '<span class="status ' + (online ? 'is-online' : 'is-offline') + (compact ? ' is-compact' : '') + '"><span>' + (online ? '在线' : '离线') + '</span>' + detail + alert + '</span>';
  }

  function pct(used, total) {
    if (!total || used == null) return 0;
    return Math.max(0, Math.min(100, (used / total) * 100));
  }

  function pctMetric(used, total) {
    if (used == null || total == null || !Number(total)) return null;
    return Math.max(0, Math.min(100, (Number(used) / Number(total)) * 100));
  }

  function pctText(value) {
    return value == null || !Number.isFinite(Number(value)) ? "—" : Math.round(Number(value)) + "%";
  }

  function currencyCode(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(¥|￥|RMB|CNH)$/i.test(raw)) return "CNY";
    if (raw === "$") return "USD";
    if (raw === "€") return "EUR";
    if (raw === "£") return "GBP";
    return raw.toUpperCase();
  }

  function money(value, currency) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    if (Number(value) === -1) return "免费";
    const code = currencyCode(currency);
    const n = Number(value);
    const digits = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2;
    if (code === "CNY") return "¥" + n.toFixed(digits);
    if (code === "USD") return "$" + n.toFixed(digits);
    if (code === "EUR") return "€" + n.toFixed(digits);
    if (code === "GBP") return "£" + n.toFixed(digits);
    return (code ? code + " " : "") + n.toFixed(digits);
  }

  function billingCycleText(days) {
    const d = Number(days);
    if (!Number.isFinite(d)) return "—";
    if (d === -1) return "一次性";
    if (d >= 27 && d <= 32) return "月";
    if (d >= 87 && d <= 95) return "季";
    if (d >= 175 && d <= 185) return "半年";
    if (d >= 360 && d <= 370) return "年";
    if (d >= 720 && d <= 750) return "两年";
    if (d >= 1080 && d <= 1150) return "三年";
    return d > 0 ? d + " 天" : "—";
  }

  function renewalText(server) {
    if (server.price == null) return "—";
    if (Number(server.price) === -1) return "免费";
    return money(server.price, server.currency) + " / " + billingCycleText(server.billing_cycle);
  }

  function expiryDeltaDays(server) {
    if (!server || server.long_term || !server.expires_at_raw) return null;
    const end = dateKeyOrdinal(String(server.expires_at_raw).slice(0, 10));
    const today = dateKeyOrdinal(todayKeyInZone(server.billing_timezone || state.billing_timezone || 'Asia/Shanghai'));
    if (end == null || today == null) return null;
    return end - today;
  }

  function remainingDaysText(server) {
    if (!server) return "—";
    if (server.long_term) return "长期";
    const days = expiryDeltaDays(server);
    if (days == null) return "—";
    if (days < 0) return "已过期 " + Math.abs(days) + " 天";
    if (days === 0) return "今天到期";
    return days + " 天";
  }


  function remainingIsUrgent(server) {
    const days = remainingDaysNumber(server);
    return days != null && days <= 7;
  }

  function remainingHTMLFor(server) {
    const urgent = remainingIsUrgent(server);
    return '<span class="remaining-value' + (urgent ? ' is-bad' : '') + '">' + h(remainingDaysText(server)) + (urgent ? '<span class="remaining-warn" aria-label="临近到期" title="临近到期">⚠</span>' : '') + '</span>';
  }

  function cnyValue(value, currency) {
    if (value == null || !state || !state._fx_rates || !window.LineGridEnrich) return null;
    return LineGridEnrich.toCNY(value, currency, state._fx_rates);
  }

  function monthlyCostCNY(server) {
    const native = recurringEquivalent(server, false);
    return native == null ? null : cnyValue(native, server.currency);
  }

  function aggregateCNY(servers, annual) {
    if (!state || !state._fx_rates || !window.LineGridEnrich) return null;
    let total = 0, count = 0;
    (servers || []).forEach(function (server) {
      const native = recurringEquivalent(server, annual);
      if (native == null) return;
      const value = cnyValue(native, server.currency);
      if (value == null) return;
      total += value; count += 1;
    });
    return count ? total : null;
  }

  function remainingDaysNumber(server) {
    const days = expiryDeltaDays(server);
    return days == null ? null : Math.max(0, days);
  }

  function remainingValueCNY(server) {
    if (!server) return null;
    if (Number(server.price) === -1) return 0;
    const monthly = monthlyCostCNY(server);
    const days = remainingDaysNumber(server);
    if (monthly == null || days == null) return null;
    return Math.max(0, monthly * days / 30.4375);
  }

  function financeSortValue(row, key) {
    if (key === "region") return String(row.region || "");
    if (key === "name") return String(row.server.name || "");
    if (key === "monthly") return row.monthly;
    if (key === "remaining") return row.remainingDays;
    if (key === "value") return row.remainingValue;
    return null;
  }

  function financeRows() {
    const rows = (state.servers || []).map(function (server) {
      const monthly = monthlyCostCNY(server);
      const remainingValue = remainingValueCNY(server);
      const nativeMonthly = recurringEquivalent(server, false);
      return {
        server: server,
        region: regionDisplay(server).label,
        monthly: monthly,
        monthlyNative: nativeMonthly,
        remaining: remainingDaysText(server),
        remainingDays: remainingDaysNumber(server),
        remainingValue: remainingValue
      };
    });
    const key = financeSortKey || "monthly";
    const dir = financeSortKey ? financeSortDir : -1;
    return rows.sort(function (a, b) {
      const av = financeSortValue(a, key);
      const bv = financeSortValue(b, key);
      const an = typeof av === "number" && Number.isFinite(av);
      const bn = typeof bv === "number" && Number.isFinite(bv);
      if ((av == null || (typeof av === "number" && !an)) && (bv != null && !(typeof bv === "number" && !bn))) return 1;
      if ((bv == null || (typeof bv === "number" && !bn)) && (av != null && !(typeof av === "number" && !an))) return -1;
      let cmp = 0;
      if (an && bn) cmp = av === bv ? 0 : (av > bv ? 1 : -1);
      else cmp = String(av == null ? "" : av).localeCompare(String(bv == null ? "" : bv), 'zh-CN', { numeric: true, sensitivity: 'base' });
      if (cmp) return cmp * dir;
      const monthlyCmp = (Number(b.monthly) || -1) - (Number(a.monthly) || -1);
      if (monthlyCmp) return monthlyCmp;
      return String(a.server.name || '').localeCompare(String(b.server.name || ''), 'zh-CN');
    });
  }

  function financeSortHead(label, key) {
    const active = financeSortKey === key;
    const mark = active ? (financeSortDir < 0 ? " ↓" : financeSortDir > 0 ? " ↑" : "") : "";
    return '<button type="button" class="finance-sort-head' + (active ? ' is-on' : '') + '" data-finance-sort="' + attr(key) + '" title="点击排序：降序 → 升序 → 默认">' + h(label + mark) + '</button>';
  }

  function financeMonthlyHTML(row) {
    if (Number(row.server.price) === -1) return '<strong>免费</strong>';
    if (Number(row.server.billing_cycle) === -1) return '<strong>一次性</strong>';
    if (row.monthlyNative == null) return '<strong>—</strong>';
    const native = money(row.monthlyNative, row.server.currency) + '/月';
    const cny = row.monthly == null ? '—' : ('≈ ¥' + row.monthly.toFixed(2) + '/月');
    return '<strong>' + h(cny) + '</strong><small>' + h(native) + '</small>';
  }

  function financeSummaryHTML(rows, masked) {
    let monthly = 0, monthlyCount = 0, remaining = 0, remainingCount = 0;
    let free = 0, oneTime = 0, due30 = 0, expired = 0;
    (rows || []).forEach(function (row) {
      if (row.monthly != null && Number.isFinite(Number(row.monthly))) { monthly += Number(row.monthly); monthlyCount += 1; }
      if (row.remainingValue != null && Number.isFinite(Number(row.remainingValue))) { remaining += Number(row.remainingValue); remainingCount += 1; }
      if (Number(row.server && row.server.price) === -1) free += 1;
      if (Number(row.server && row.server.billing_cycle) === -1) oneTime += 1;
      const d = expiryDeltaDays(row.server);
      if (d != null && d < 0) expired += 1;
      else if (d != null && d <= 30) due30 += 1;
    });
    const annual = accessState.logged_in ? aggregateCNY(state.servers || [], true) : null;
    const value = function (n, suffix) { return masked ? '*' : (n == null || !Number.isFinite(Number(n)) ? '—' : ('≈ ¥' + Number(n).toFixed(2) + (suffix || ''))); };
    return '<section class="finance-summary">' +
      '<article><span>月均总计</span><b>' + value(monthlyCount ? monthly : null, '') + '</b><small>周期账单 ' + monthlyCount + ' 台 · 免费 ' + free + ' · 一次性 ' + oneTime + '</small></article>' +
      '<article><span>年化预算</span><b>' + value(annual, '') + '</b><small>按 365.25 天折算</small></article>' +
      '<article><span>剩余价值</span><b>' + value(remainingCount ? remaining : null, '') + '</b><small>按剩余天数估算</small></article>' +
      '<article><span>到期风险</span><b>' + (expired + due30) + ' 台</b><small>已过期 ' + expired + ' · 30 天内 ' + due30 + '</small></article>' +
    '</section>';
  }

  function openFinanceDetail(preserveSort) {
    if (!financeOverlay || !financeBody) return;
    if (!preserveSort) { financeSortKey = ""; financeSortDir = 0; }
    const rows = financeRows();
    const maskFinance = !accessState.logged_in;
    const table = rows.length ?
      '<div class="finance-table-wrap"><table class="finance-table"><thead><tr>' +
      '<th>' + financeSortHead('区域', 'region') + '</th>' +
      '<th>' + financeSortHead('VPS', 'name') + '</th>' +
      '<th>原始账单</th>' +
      '<th>' + financeSortHead('月均续费', 'monthly') + '</th>' +
      '<th>' + financeSortHead('到期', 'remaining') + '</th>' +
      '<th>' + financeSortHead('剩余价值', 'value') + '</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (row) {
        const d = expiryDeltaDays(row.server);
        const rowClass = d != null && d < 0 ? ' is-expired' : d != null && d <= 7 ? ' is-due' : '';
        const nativeHTML = maskFinance ? '<strong class="finance-mask">*</strong>' : '<strong>' + h(renewalText(row.server)) + '</strong>';
        const monthlyHTML = maskFinance ? '<strong class="finance-mask">*</strong>' : financeMonthlyHTML(row);
        const valueHTML = maskFinance ? '<strong class="finance-mask">*</strong>' : '<strong>' + (row.remainingValue == null ? '—' : ('≈ ¥' + row.remainingValue.toFixed(2))) + '</strong>';
        const expiry = row.server.long_term ? '长期' : (row.server.expires_at || '—');
        return '<tr class="' + rowClass.trim() + '"><td>' + h(row.region) + '</td><td><b>' + h(row.server.name || '未命名') + '</b></td><td class="money-cell">' + nativeHTML + '</td><td class="money-cell">' + monthlyHTML + '</td><td class="expiry-cell"><strong>' + h(expiry) + '</strong><small>' + remainingHTMLFor(row.server) + '</small></td><td class="money-cell">' + valueHTML + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="chart-empty">暂无费用数据</div>';
    financeBody.innerHTML = financeSummaryHTML(rows, maskFinance) + table;
    financeOverlay.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeFinanceDetail() {
    if (!financeOverlay) return;
    financeOverlay.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function recurringEquivalent(server, annual) {
    const price = Number(server.price);
    const days = Number(server.billing_cycle);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(days) || days <= 0) return null;
    return price * (annual ? 365.25 : 30.4375) / days;
  }

  function costGroups(servers, annual) {
    const groups = {};
    (servers || []).forEach(function (server) {
      const value = recurringEquivalent(server, annual);
      if (value == null) return;
      const code = currencyCode(server.currency) || "未标币种";
      groups[code] = (groups[code] || 0) + value;
    });
    return groups;
  }

  function costGroupsHTML(groups) {
    const keys = Object.keys(groups || {}).sort();
    if (!keys.length) return "—";
    return keys.map(function (key) { return h(money(groups[key], key)); }).join('<span class="cost-plus"> + </span>');
  }

  function primaryPing(server) {
    return (server.ping && server.ping[0]) || null;
  }

  function pingMs(server) {
    const p = primaryPing(server);
    if (!p || p.current_ms == null) return null;
    const v = Number(p.current_ms);
    return Number.isFinite(v) && v >= 0 ? v : null;
  }

  function pingLoss(server) {
    const p = primaryPing(server);
    if (!p || p.loss_pct == null) return null;
    const v = Number(p.loss_pct);
    return Number.isFinite(v) && v >= 0 ? v : null;
  }

  function lossText(value) {
    return value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(2) + "%";
  }

  function latencyTone(ms) {
    if (ms == null || ms === '') return '';
    const v = Number(ms);
    if (!Number.isFinite(v) || v < 0) return "";
    if (v > 180) return " is-bad";
    if (v > 80) return " is-hot";
    return " is-good";
  }

  function lossTone(value) {
    if (value == null || value === '') return '';
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) return "";
    if (v >= 10) return " is-bad";
    if (v >= 1) return " is-hot";
    return " is-good";
  }

  function lossHTML(value) {
    return '<span class="loss-value' + lossTone(value) + '">' + lossText(value) + '</span>';
  }

  function pingColor(p, fallbackIndex) {
    const palette = ["#e2ad45", "#58a6ff", "#e06c75", "#65c18c", "#b48ead", "#d08770"];
    return palette[(Number(fallbackIndex) || 0) % palette.length];
  }


  function compactOS(value) {
    let v = String(value || "—").trim();
    if (!v || v === "—") return "—";
    v = v.replace(/\s*\([^)]*\)\s*$/g, "");
    v = v.replace(/\bGNU\/Linux\b/ig, "").replace(/\s{2,}/g, " ").trim();
    return v || "—";
  }

  function compactKernel(value) {
    const v = String(value || "").trim();
    if (!v) return "—";
    const m = v.match(/^\d+\.\d+(?:\.\d+)?/);
    return m ? m[0] : v.split("-")[0] || v;
  }

  function compactCPU(value) {
    let v = String(value || "—").trim();
    if (!v || v === "—") return "—";
    v = v.replace(/\(R\)|\(TM\)/gi, "").replace(/\bCPU\b/gi, "").replace(/\s*@\s*[0-9.]+\s*GHz\b/ig, "").replace(/\s{2,}/g, " ").trim();
    if (v.length > 34) v = v.slice(0, 33).trim() + "…";
    return v;
  }

  function pingText(p) {
    if (!p || p.current_ms == null || Number(p.current_ms) < 0) return "—";
    return Math.round(Number(p.current_ms)) + " ms";
  }

  function dailyStats(server) {
    const rows = server.daily_traffic || [];
    const vals = rows.map(function (r) { return r.total; }).filter(function (v) { return v != null && Number.isFinite(Number(v)); });
    if (!vals.length) return { high: null, low: null, avg: null };
    const high = Math.max.apply(null, vals);
    const low = Math.min.apply(null, vals);
    const avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    return { high: high, low: low, avg: avg };
  }

  function totals() {
    const servers = state.servers || [];
    let used = 0;
    let limit = 0;
    let online = 0;
    let unlimited = 0;
    servers.forEach(function (s) {
      used += s.traffic_used || 0;
      limit += s.traffic_limit || 0;
      if (!Number(s.traffic_limit || 0)) unlimited += 1;
      if (s.online) online += 1;
    });
    return { used: used, limit: limit, unlimited: unlimited, online: online, all: servers.length };
  }

  function clock(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "  " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function route() {
    const raw = (location.hash || "#/").replace(/^#/, "") || "/";
    const parts = raw.split("/").filter(Boolean);
    let view = "list";
    let node = null;
    let page = "overview";
    let section = "nodes";
    if (parts[0] === "network" || parts[0] === "resource") {
      section = parts[0];
      if (parts[1] === "node" && parts[2] != null) {
        node = decodeURIComponent(parts[2]);
        if (PAGES.indexOf(parts[3]) >= 0) page = parts[3];
      }
      home = section;
      return { view: view, node: node, page: page, home: section };
    }
    if (parts[0] === "column" || parts[0] === "list" || parts[0] === "grid") {
      view = parts[0];
      if (parts[1] === "node" && parts[2] != null) {
        node = decodeURIComponent(parts[2]);
        if (PAGES.indexOf(parts[3]) >= 0) page = parts[3];
      }
    } else if (parts[0] === "node" && parts[1] != null) {
      node = decodeURIComponent(parts[1]);
      if (PAGES.indexOf(parts[2]) >= 0) page = parts[2];
    } else if (parts[0] === "globe") {
      showGlobe = true;
      if (parts[1] === "node" && parts[2] != null) {
        node = decodeURIComponent(parts[2]);
        if (PAGES.indexOf(parts[3]) >= 0) page = parts[3];
      }
    }
    if (view === "grid" || view === "column" || view === "list") lastView = view;
    home = "nodes";
    return { view: view, node: node, page: page, home: "nodes" };
  }

  function viewHash(view, node, page, section) {
    const sec = section || home || "nodes";
    if (sec === "network" || sec === "resource") {
      if (node == null) return "#/" + sec;
      return "#/" + sec + "/node/" + encodeURIComponent(node) + (page && page !== "overview" ? "/" + page : "");
    }
    const base = !view || view === "list" ? "" : "/" + view;
    if (node == null) return "#" + (base || "/");
    const rest = page && page !== "overview" ? "/" + page : "";
    return "#" + (base || "") + "/node/" + encodeURIComponent(node) + rest;
  }

  function go(hash, ev) {
    if (ev) ev.preventDefault();
    location.hash = hash;
  }

  function iconGrid() {
    return '<svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="5" height="5"/><rect x="9.5" y="1.5" width="5" height="5"/><rect x="1.5" y="9.5" width="5" height="5"/><rect x="9.5" y="9.5" width="5" height="5"/></svg>';
  }

  function iconColumn() {
    return '<svg viewBox="0 0 16 16"><rect x="2" y="1.5" width="12" height="3.2"/><rect x="2" y="6.4" width="12" height="3.2"/><rect x="2" y="11.3" width="12" height="3.2"/></svg>';
  }

  function iconList() {
    return '<svg viewBox="0 0 16 16"><path d="M2 3.5h12M2 8h12M2 12.5h12"/></svg>';
  }

  function iconGlobe() {
    return '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2.2 2.2 2.2 9.8 0 12M8 2C5.8 4.2 5.8 11.8 8 14"/></svg>';
  }

  function pingTips(values, stepMin) {
    const n = (values || []).length;
    const step = stepMin || 5;
    return (values || []).map(function (item, i) {
      const objectPoint = item && typeof item === "object";
      const value = objectPoint ? Number(item.value != null ? item.value : item.v) : Number(item);
      const rawTime = objectPoint && item.t != null ? Number(item.t) : NaN;
      const t = new Date(Number.isFinite(rawTime) ? rawTime : (Date.now() - (n - 1 - i) * step * 60000));
      const clock = range === "7D" ? (pad(t.getMonth() + 1) + "-" + pad(t.getDate()) + " " + pad(t.getHours()) + ":" + pad(t.getMinutes())) : (pad(t.getHours()) + ":" + pad(t.getMinutes()));
      return clock + "  " + (!Number.isFinite(value) || value < 0 ? "无数据" : value + " ms");
    });
  }

  function rangeStepMinutes(values) {
    const n = (values || []).length;
    const span = range === "7D" ? 10080 : range === "24h" ? 1440 : range === "6h" ? 360 : 60;
    return n > 1 ? Math.max(0.1, span / (n - 1)) : span;
  }

  function trafficTips(rows) {
    return (rows || []).map(function (d) {
      const day = (d.date || "").slice(5) || "当日";
      if (d && d._missing) return day + "  无历史记录";
      return day + "  合计 " + fmtBytes(d.total, 1) + "  ↑ " + fmtBytes(d.uplink, 1) + "  ↓ " + fmtBytes(d.downlink, 1);
    });
  }

  function sparkOf(server, tall) {
    const p = primaryPing(server);
    let vals = p && p.buckets ? p.buckets.map(function (b) { return b.ms; }) : [];
    const ms = pingMs(server);
    if (!vals.length && ms != null) vals = [ms, ms];
    return (
      '<div class="spark-wrap">' +
        ProbeCharts.spark(vals, { w: tall ? 420 : 240, h: tall ? 64 : 40, color: ms != null && ms > 180 ? cssVar("--down", "#b06d52") : ms != null && ms > 80 ? cssVar("--gold", "#c4a56a") : cssVar("--live", "#8fa676"), tips: pingTips(vals, 5) }) +
        (tall ? "" : '<span class="ms' + latencyTone(ms) + '">' + (ms == null ? "—" : String(ms).padStart(3, "0") + " ms") + "</span>") +
      "</div>"
    );
  }

  function quotaTone(p) {
    return p >= 85 ? " is-full" : p >= 60 ? " is-hot" : "";
  }

  function quotaBar(server) {
    const used = server.traffic_used == null ? null : Number(server.traffic_used);
    const limit = Number(server.traffic_limit || 0);
    const p = used == null ? 0 : pct(used, limit);
    const remain = limit && used != null ? Math.max(0, limit - used) : null;
    const tip = used == null ? "暂无流量累计" : (limit ? ("已用 " + p.toFixed(1) + "%") : "无限流量");
    return (
      '<div class="quota">' +
        '<div class="quota-h">' +
          "<span>已用 <b>" + fmtBytes(used, 1) + "</b>" + (limit ? " / " + fmtBytes(limit, 2) : "") + "</span>" +
          "<span>" + (limit ? "剩余 <b>" + fmtBytes(remain, 1) + "</b>" : "无限流量") + "</span>" +
        "</div>" +
        '<div class="quota-bar' + quotaTone(p) + '" style="--p:' + (limit && used != null ? p : 0) + '%" data-tip="' + h(tip) + '"><i></i></div>' +
      "</div>"
    );
  }

  function dateKeyOrdinal(key) {
    const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
  }

  function todayKeyInZone(timeZone) {
    const zone = String(timeZone || 'Asia/Shanghai');
    const minute = Math.floor(Date.now() / 60000);
    const cached = billingTodayCache[zone];
    if (cached && cached.minute === minute) return cached.key;
    let key;
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const out = {};
      parts.forEach(function (part) { if (part.type === 'year' || part.type === 'month' || part.type === 'day') out[part.type] = part.value; });
      key = out.year + '-' + out.month + '-' + out.day;
    } catch (e) {
      key = new Date().toISOString().slice(0, 10);
    }
    billingTodayCache[zone] = { minute: minute, key: key };
    return key;
  }

  function trafficResetDays(server) {
    if (!server || !server.period_end) return null;
    const end = dateKeyOrdinal(String(server.period_end).slice(0, 10));
    const today = dateKeyOrdinal(todayKeyInZone(server.billing_timezone || state.billing_timezone || 'Asia/Shanghai'));
    if (end == null || today == null) return null;
    return Math.max(0, end - today);
  }

  function trafficQuotaPct(server) {
    if (!server || server.traffic_used == null || !Number(server.traffic_limit)) return null;
    return Math.max(0, (Number(server.traffic_used) / Number(server.traffic_limit)) * 100);
  }

  function trafficForecast(server) {
    if (!server || server.traffic_used == null || !Number(server.traffic_limit)) return null;
    const rows = (server.daily_traffic || []).slice(-7).filter(function (r) { return r && Number.isFinite(Number(r.total)); });
    if (rows.length < 3) return { kind: 'unknown', text: '预测数据不足' };
    const avg = rows.reduce(function (n, r) { return n + Math.max(0, Number(r.total) || 0); }, 0) / rows.length;
    const remain = Math.max(0, Number(server.traffic_limit) - Number(server.traffic_used));
    const reset = trafficResetDays(server);
    if (remain <= 0) return { kind: 'bad', text: '本账期额度已耗尽', days: 0, avg: avg };
    if (!Number.isFinite(avg) || avg <= 0) return { kind: 'good', text: '近期流量很低', avg: avg };
    const days = Math.max(1, Math.ceil(remain / avg));
    if (reset != null && days < reset) return { kind: 'bad', text: '预计 ' + days + ' 天后耗尽', days: days, avg: avg };
    return { kind: 'good', text: '预计可撑过本账期', days: days, avg: avg };
  }

  function anomalyDetails(server) {
    const out = [];
    if (!server || !server.online) out.push({ key: 'offline', label: '离线', tone: 'bad' });
    const pings = server && server.online && Array.isArray(server.ping) ? server.ping : [];
    const latencies = pings.map(function (p) { return p && p.current_ms != null ? Number(p.current_ms) : null; }).filter(function (v) { return v != null && Number.isFinite(v) && v >= 0; });
    const losses = pings.map(function (p) { return p && p.loss_pct != null ? Number(p.loss_pct) : null; }).filter(function (v) { return v != null && Number.isFinite(v) && v >= 0; });
    const ms = latencies.length ? Math.max.apply(null, latencies) : null;
    const loss = losses.length ? Math.max.apply(null, losses) : null;
    const traffic = trafficQuotaPct(server);
    const expiry = expiryDeltaDays(server);
    const pressure = server && server.online ? resourcePressure(server) : -1;
    if (loss != null && loss >= 10) out.push({ key: 'loss', label: '丢包 ' + lossText(loss), tone: loss >= 20 ? 'bad' : 'hot' });
    if (ms != null && ms > 180) out.push({ key: 'latency', label: '延迟 ' + Math.round(ms) + 'ms', tone: ms >= 250 ? 'bad' : 'hot' });
    if (pressure >= 90) out.push({ key: 'resource', label: '资源 ' + Math.round(pressure) + '%', tone: pressure >= 95 ? 'bad' : 'hot' });
    if (traffic != null && traffic >= 90) out.push({ key: 'traffic', label: '流量 ' + Math.round(traffic) + '%', tone: traffic >= 98 ? 'bad' : 'hot' });
    if (expiry != null && expiry < 0) out.push({ key: 'expiry', label: '已过期 ' + Math.abs(expiry) + '天', tone: 'bad' });
    else if (expiry != null && expiry <= 7) out.push({ key: 'expiry', label: expiry === 0 ? '今天到期' : (expiry + '天到期'), tone: expiry <= 3 ? 'bad' : 'hot' });
    return out;
  }

  function anomalyBadgeHTML(server) {
    const rows = anomalyDetails(server).filter(function (item) { return item.key !== 'offline'; });
    if (!rows.length) return '';
    const first = rows[0];
    const title = rows.map(function (item) { return item.label; }).join(' · ');
    return '<small class="node-alert is-' + first.tone + '" title="' + attr(title) + '">' + h(first.label) + (rows.length > 1 ? (' +' + (rows.length - 1)) : '') + '</small>';
  }

  function anomalyKinds(server) {
    return anomalyDetails(server).map(function (item) { return item.key; });
  }

  function isAnomalous(server) { return anomalyKinds(server).length > 0; }

  function anomalySummary() {
    const out = { total: 0, offline: 0, latency: 0, loss: 0, resource: 0, expiry: 0, traffic: 0 };
    (state.servers || []).forEach(function (server) {
      const kinds = anomalyKinds(server);
      if (kinds.length) out.total += 1;
      kinds.forEach(function (kind) { if (out[kind] != null) out[kind] += 1; });
    });
    return out;
  }

  function anomalyNotice() {
    const a = anomalySummary();
    if (!anomalyFilter && !nodeQuery) return '';
    const bits = [];
    if (anomalyFilter) bits.push('异常 ' + a.total + '：离线 ' + a.offline + ' · 延迟 ' + a.latency + ' · 丢包 ' + a.loss + ' · 资源 ' + a.resource + ' · 流量 ' + a.traffic + ' · 到期 ' + a.expiry);
    if (nodeQuery) bits.push('搜索：' + nodeQuery);
    return '<div class="filter-notice"><span>' + h(bits.join('　')) + '</span><button type="button" data-clear-filters>清除筛选</button></div>';
  }

  function serverSearchText(server) {
    const rd = regionDisplay(server);
    return [server && server.name, displayCountry(server), rd && rd.label, server && server.group, server && server.provider_name, server && server.asn, server && server.asn_org].filter(Boolean).join(' ').toLowerCase();
  }

  function serverMatchesQuery(server) {
    const q = String(nodeQuery || '').trim().toLowerCase();
    if (!q) return true;
    return q.split(/\s+/).filter(Boolean).every(function (token) { return serverSearchText(server).indexOf(token) >= 0; });
  }

  function quotaMini(server) {
    const used = server.traffic_used == null ? null : Number(server.traffic_used);
    const limit = Number(server.traffic_limit || 0);
    const p = used == null ? 0 : pct(used, limit);
    const forecast = trafficForecast(server);
    const quotaTitle = used == null ? "暂无账期流量" : (limit ? ("已用 " + p.toFixed(1) + "%" + (forecast ? " · " + forecast.text : "")) : "无限流量");
    return (
      '<span class="quota-cell hide-sm" title="' + h(quotaTitle) + '">' +
        '<span class="quota-cell-n">' + fmtBytes(used, 1) + (limit ? " / " + fmtBytes(limit, 2) : "") + "</span>" +
        '<span class="quota-cell-mobile">' + fmtBytes(used, 1) + "</span>" +
        '<span class="quota-mini' + quotaTone(p) + '" style="--p:' + (limit && used != null ? p : 0) + '%"><i></i></span>' +
        '<span class="quota-reset">' + (!limit ? "无限流量" : (trafficResetDays(server) == null ? "重置 —" : ("距重置 " + trafficResetDays(server) + " 天"))) + "</span>" +
      "</span>"
    );
  }

  function meters(server) {
    const mem = pctMetric(server.mem_used, server.mem_total);
    const disk = pctMetric(server.disk_used, server.disk_total);
    const cpu = server.cpu_pct == null ? null : Number(server.cpu_pct);
    return (
      '<div class="meters">' +
        '<div class="meter"><span>CPU ' + pctText(cpu) + '</span><i style="--p:' + (cpu == null ? 0 : cpu) + '%"></i></div>' +
        '<div class="meter"><span>内存 ' + pctText(mem) + '</span><i style="--p:' + (mem == null ? 0 : mem) + '%"></i></div>' +
        '<div class="meter"><span>硬盘 ' + pctText(disk) + '</span><i style="--p:' + (disk == null ? 0 : disk) + '%"></i></div>' +
      "</div>"
    );
  }

  function cardTone(server) {
    if (!server.online) return " is-down";
    const ms = pingMs(server);
    const loss = pingLoss(server);
    if ((ms != null && ms > 180) || (loss != null && loss > 20)) return " is-bad";
    if (ms != null && ms > 80) return " is-hot";
    return " is-ok";
  }

  function hashText(text) {
    let x = 2166136261;
    String(text || "").split("").forEach(function (ch) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); });
    return x >>> 0;
  }

  function cityHintLL(server) {
    const text = [server.region_city, server.region_name, server.name].filter(Boolean).join(" ");
    for (let i = 0; i < CITY_HINTS.length; i += 1) {
      if (CITY_HINTS[i][0].test(text)) return CITY_HINTS[i][1].slice();
    }
    return null;
  }

  function scatterLL(base, server, index, scope) {
    const same = (state.servers || []).filter(function (s) {
      if (scope === "city") {
        const ll = cityHintLL(s);
        return ll && Math.abs(ll[0] - base[0]) < 0.01 && Math.abs(ll[1] - base[1]) < 0.01;
      }
      return (s.geo_country || s.region_country) === (server.geo_country || server.region_country) && !cityHintLL(s);
    });
    if (same.length <= 1) return base.slice();
    const rank = Math.max(0, same.findIndex(function (s) { return s.uuid === server.uuid; }));
    const seed = hashText(server.uuid || server.name || index);
    const angle = ((rank / same.length) * Math.PI * 2) + ((seed % 31) / 31) * 0.45;
    const ring = scope === "city" ? 0.28 + (rank % 2) * 0.16 : 2.2 + (rank % 3) * 0.9;
    const latScale = Math.max(0.4, Math.cos(base[1] * Math.PI / 180));
    return [wrapLon(base[0] + Math.cos(angle) * ring / latScale), Math.max(-78, Math.min(78, base[1] + Math.sin(angle) * ring))];
  }

  function serverLL(server, index) {
    // Important: Number(null) is 0, so test null explicitly before conversion.
    if (server.longitude != null && server.latitude != null && Number.isFinite(Number(server.longitude)) && Number.isFinite(Number(server.latitude))) {
      return [Number(server.longitude), Number(server.latitude)];
    }
    const city = cityHintLL(server);
    if (city) return scatterLL(city, server, index, "city");
    const base = COUNTRY_LL[server.geo_country || server.region_country];
    if (!base) return null;
    return scatterLL(base, server, index, "country");
  }

  function cardCoord(server) {
    const ll = serverLL(server, 0);
    if (!ll) return (server.region_country || "——");
    return Math.abs(ll[1]).toFixed(1) + (ll[1] >= 0 ? "N" : "S") + "  " + Math.abs(ll[0]).toFixed(1) + (ll[0] >= 0 ? "E" : "W");
  }

  function regionAimLL(server) {
    if (server && server.longitude != null && server.latitude != null && Number.isFinite(Number(server.longitude)) && Number.isFinite(Number(server.latitude))) {
      return [Number(server.longitude), Number(server.latitude)];
    }
    const hint = cityHintInfo(server);
    if (hint && Array.isArray(hint.ll)) return hint.ll.slice(0, 2);
    const base = COUNTRY_LL[server && (server.geo_country || server.region_country)];
    return base ? base.slice(0, 2) : null;
  }

  function lookAtLocation(lon, lat) {
    if (lon == null || lat == null || lon === "" || lat === "") return false;
    const x = Number(lon), y = Number(lat);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    globeLon = wrapLon(x);
    globeLat = Math.max(-78, Math.min(78, y));
    globePinned = true;
    queueGlobePaint();
    wakeGlobeIdle();
    return true;
  }

  function lookAtCountry(cc) {
    const ll = COUNTRY_LL[cc];
    if (!ll) return;
    globeLon = ll[0];
    globeLat = Math.max(-78, Math.min(78, ll[1]));
    queueGlobePaint();
    wakeGlobeIdle();
  }

  function liveSignature(server) {
    if (!server) return '0';
    const p = primaryPing(server) || {};
    const mem = pctMetric(server.mem_used, server.mem_total);
    const disk = pctMetric(server.disk_used, server.disk_total);
    const cpu = server.cpu_pct == null ? null : Number(server.cpu_pct);
    const quota = trafficQuotaPct(server);
    const ms = p.current_ms == null || !Number.isFinite(Number(p.current_ms)) ? null : Math.round(Number(p.current_ms));
    const loss = p.loss_pct == null || !Number.isFinite(Number(p.loss_pct)) ? null : Number(p.loss_pct);
    function tenth(value) { return value == null || !Number.isFinite(Number(value)) ? null : Math.round(Number(value) * 10) / 10; }
    return String(hashText(JSON.stringify([
      !!server.online,
      server.online ? fmtDays(server.uptime) : lastSeenText(server),
      fmtSpeed(server.download_speed), fmtSpeed(server.upload_speed),
      tenth(cpu), tenth(mem), tenth(disk), tenth(quota),
      fmtBytes(server.traffic_used, 1), ms, lossText(loss),
      ms != null && ms > 80, ms != null && ms > 180, loss != null && loss > 20,
      remainingDaysText(server), trafficResetDays(server)
    ])));
  }

  function card(server, i) {
    const loss = pingLoss(server);
    return (
      '<button class="cell' + cardTone(server) + '" data-index="' + attr(i) + '" data-live-sig="' + liveSignature(server) + '" type="button">' +
        '<div class="card">' +
          '<span class="card-coord">' + h(cardCoord(server)) + "</span>" +
          '<div class="card-face">' +
            '<div class="head">' +
              '<span class="cc">' + h(displayCountry(server) || "") + "</span>" +
              '<span class="name">' + h(server.name || "未命名") + "</span>" +
              '<span class="dot' + (server.online ? "" : " is-off") + '"></span>' +
              statusHTML(server, true) +
            "</div>" +
            '<div class="speeds">' +
              '<span>实时网速　↓ <b>' + fmtSpeed(server.download_speed) + "</b>　↑ <b>" + fmtSpeed(server.upload_speed) + "</b></span>" +
            "</div>" +
            sparkOf(server) +
            '<div class="card-loss' + lossTone(loss) + '">' + lossText(loss) + '</div>' +
            meters(server) +
            quotaBar(server) +
            '<div class="meta"><span>' + h(server.online ? ('运行 ' + fmtDays(server.uptime).replace(/\s+/g, '')) : ('最后在线 ' + (lastSeenText(server) || '—'))) + ' · 剩余' + remainingHTMLFor(server) + '</span></div>' +
          "</div>" +
        "</div>" +
      "</button>"
    );
  }

  function rowSpeedPair(server) {
    return '<span class="speed-part"><i>↓</i><b>' + fmtSpeed(server.download_speed) + '</b></span>' +
      '<span class="speed-part"><i>↑</i><b>' + fmtSpeed(server.upload_speed) + '</b></span>';
  }

  function row(server, i) {
    const ms = pingMs(server);
    const mem = pctMetric(server.mem_used, server.mem_total);
    const disk = pctMetric(server.disk_used, server.disk_total);
    return (
      '<button class="row" data-index="' + attr(i) + '" data-live-sig="' + liveSignature(server) + '" type="button">' +
        '<span class="cc">' + h(displayCountry(server) || "") + "</span>" +
        '<span class="name node-name">' + h(server.name || "未命名") + ((server.ipv4 || server.ipv6) ? '<small class="node-ip">' + h(server.ipv4 || server.ipv6) + '</small>' : '') + "</span>" +
        statusHTML(server, false) +
        '<span class="speeds row-speeds">' + rowSpeedPair(server) + '</span>' +
        '<span class="latency-cell"><span class="ms' + latencyTone(ms) + '">' + (ms == null ? "—" : ms + " ms") + '</span><small class="' + lossTone(pingLoss(server)).trim() + '">' + lossText(pingLoss(server)) + '</small></span>' +
        sparkOf(server) +
        '<span class="hide-sm">' + pctText(server.cpu_pct) + "</span>" +
        '<span class="hide-sm">' + pctText(mem) + "</span>" +
        '<span class="hide-sm">' + pctText(disk) + "</span>" +
        quotaMini(server) +
        '<span class="hide-sm">' + fmtDays(server.uptime) + "</span>" +
        '<span class="life-cost"><span class="life-remain">' + remainingHTMLFor(server) + '</span></span>' +
      "</button>"
    );
  }

  function sortHead(label, key) {
    const mark = listSortKey === key ? (listSortDir < 0 ? " ↓" : listSortDir > 0 ? " ↑" : "") : "";
    return '<button type="button" class="sort-head' + (listSortKey === key ? ' is-on' : '') + '" data-sort="' + attr(key) + '" title="点击排序：降序 → 升序 → 默认">' + h(label + mark) + '</button>';
  }

  function listHead() {
    return (
      '<div class="row row-h">' +
        sortHead("地区", "region") + sortHead("名称", "name") + sortHead("状态", "status") + sortHead("实时网速", "speed") + sortHead("延迟 / %", "latency") + "<span>曲线</span>" +
        sortHead("CPU", "cpu") + sortHead("内存", "memory") + sortHead("硬盘", "disk") + sortHead("流量", "traffic") + sortHead("在线", "uptime") + sortHead("剩余", "remaining") +
      "</div>" +
      '<div class="mobile-row-h" aria-hidden="true"><span>地区</span><span>VPS</span><span>状态</span><span>延迟</span><span>丢包</span><span>流量</span><span>剩余</span></div>'
    );
  }

  function slab(server, i) {
    const ms = pingMs(server);
    return (
      '<button class="slab" data-index="' + attr(i) + '" data-live-sig="' + liveSignature(server) + '" type="button">' +
        '<div class="slab-top">' +
          '<div class="head">' +
            '<span class="cc">' + h(displayCountry(server) || '') + '</span>' +
            '<span class="name">' + h(server.name || '未命名') + '</span>' +
            '<span class="dot' + (server.online ? '' : ' is-off') + '"></span>' +
            statusHTML(server, true) + '<span class="slab-region">' + h(server.region_city || server.region_name || '') + '</span>' +
          '</div>' +
          '<span class="more">打开窗口 →</span>' +
        '</div>' +
        '<div class="slab-grid slab-grid-final">' +
          '<div>' +
            '<div class="slab-ms' + latencyTone(ms) + '">' + (ms == null ? '—' : ms) + '<small>MS</small></div>' +
            '<div class="slab-loss' + lossTone(pingLoss(server)) + '">' + lossText(pingLoss(server)) + '</div>' +
            '<div class="speeds">↓ <b>' + fmtSpeed(server.download_speed) + '</b>　↑ <b>' + fmtSpeed(server.upload_speed) + '</b></div>' +
            sparkOf(server, true) +
          '</div>' +
          '<div>' +
            meters(server) +
            '<div style="margin-top:14px">' + quotaBar(server) + '</div>' +
            '<div class="meta" style="margin-top:10px"><span>' + h(server.online ? ('运行 ' + fmtDays(server.uptime).replace(/\s+/g, '')) : ('最后在线 ' + (lastSeenText(server) || '—'))) + ' · 剩余' + remainingHTMLFor(server) + '</span></div>' +
          '</div>' +
        '</div>' +
      '</button>'
    );
  }

  function pulseInfo(day) {
    return pulse.find(function (p) { return p.day === day; }) || pulse[0];
  }

  function cycleBlock() {
    const today = Number(todayKeyInZone(state.billing_timezone || 'Asia/Shanghai').slice(8, 10));
    const days = pulse.length || 31;
    const heights = pulse.map(function (p) { return p.total; });
    const usedToNow = pulse.filter(function (p) { return p.day <= today; }).reduce(function (a, b) { return a + b.total; }, 0);
    const half = pulse.find(function (p) { return p.acc >= usedToNow * 0.5 && p.day <= today; });
    const info = pulseInfo(pulseDay);
    const hits = pulse.map(function (p) {
      return '<button type="button" data-day="' + attr(p.day) + '" aria-label="' + attr(p.date) + '"></button>';
    }).join("");
    return (
      '<section class="cycle" aria-label="本月脉搏">' +
        '<div class="cycle-head">' +
          "<span>本月脉搏　<b>" + info.date.slice(5) + "</b>　全网 " + fmtBytes(info.total, 1) +
          (info.total ? "　最忙 " + h(info.peak) : "") +
          (info.offline ? "　·　曾掉线" : "") +
          (info.loss >= 1 ? "　·　" + info.loss + "%" : "") +
          "</span>" +
          "<span>已过 " + today + "/" + days + "　累计 " + fmtBytes(usedToNow, 1) + "　空心点 = 过半</span>" +
        "</div>" +
        '<div class="ruler">' +
          ProbeCharts.ruler(today, days, { heights: heights, selected: pulseDay, halfDay: half ? half.day : 0 }) +
          '<div class="ruler-hit">' + hits + "</div>" +
        "</div>" +
      "</section>"
    );
  }

  function fleetStrip() {
    const t = totals();
    const trafficScope = t.limit ? ("有限额合计 " + fmtBytes(t.limit, 2) + (t.unlimited ? " · 无限流量 " + t.unlimited + " 台" : "")) : "全部无限流量";
    const regions = {};
    (state.servers || []).forEach(function (s) {
      const k = s.region_name || s.region_country || "—";
      regions[k] = (regions[k] || 0) + 1;
    });
    const down = (state.servers || []).reduce(function (a, s) { return a + (s.download_speed || 0); }, 0);
    const up = (state.servers || []).reduce(function (a, s) { return a + (s.upload_speed || 0); }, 0);
    const monthCNY = aggregateCNY(state.servers || [], false);
    const monthGroups = costGroups(state.servers || [], false);
    const fxLabel = state._fx_source ? (state._fx_source === "cache" ? "汇率缓存" : state._fx_source === "stale-cache" ? "旧汇率缓存" : state._fx_source === "default" ? "备用汇率" : state._fx_source) : "汇率加载中";
    const financeKnown = !!accessState.known;
    const financeVisible = !!accessState.logged_in;
    const financeValue = !financeKnown ? "…" : !financeVisible ? "*" : (monthCNY == null ? "—" : ("≈ ¥" + monthCNY.toFixed(2)));
    const financeSub = !financeKnown ? "正在确认权限" : !financeVisible ? "登录后可见" : (h(fxLabel) + " · " + costGroupsHTML(monthGroups));
    return (
      '<section class="fleet" aria-label="集群概览">' +
        "<article><div class='lbl'>节点</div><div class='val'>" + t.all + "</div><div class='sub'>在线 " + t.online + " · 离线 " + (t.all - t.online) + "</div></article>" +
        "<article><div class='lbl'>地区</div><div class='val'>" + Object.keys(regions).length + "</div><div class='sub'>独立地域</div></article>" +
        "<article><div class='lbl'>下行合计</div><div class='val'>" + fmtSpeed(down) + "</div><div class='sub'>上行 " + fmtSpeed(up) + "</div></article>" +
        "<article><div class='lbl'>流量累计</div><div class='val'>" + fmtBytes(t.used, 1) + "</div><div class='sub'>" + h(trafficScope) + "</div></article>" +
        "<article class='fleet-finance' data-finance-detail role='button' tabindex='0' aria-label='查看月均成本明细'><div class='lbl'>月均成本</div><div class='val'>" + financeValue + "</div><div class='sub'>" + financeSub + "</div></article>" +
      "</section>"
    );
  }

  function empty(title, text) {
    main.innerHTML =
      '<section class="state">' +
        ProbeCharts.wave({ w: 280, h: 64 }) +
        "<h2>" + h(title) + "</h2>" +
        "<p>" + h(text) + "</p>" +
      "</section>";
  }

  function renderChrome(r) {
    const titles = { nodes: state.title || "节点状态", network: "网络状况", resource: "资源概况" };
    titleEl.textContent = titles[r.home] || titles.nodes;
    titleEl.hidden = false;
    Array.prototype.forEach.call(document.querySelectorAll("#site-nav [data-home]"), function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-home") === r.home);
    });
    const bar = document.getElementById("views");
    if (bar) {
      Array.prototype.forEach.call(bar.querySelectorAll("[data-view]"), function (el) {
        const on = r.view === el.getAttribute("data-view");
        el.classList.toggle("is-on", on);
        el.setAttribute("aria-pressed", on ? "true" : "false");
      });
      const g = bar.querySelector("[data-globe]");
      if (g) {
        g.classList.toggle("is-on", showGlobe);
        g.setAttribute("aria-pressed", showGlobe ? "true" : "false");
      }
    }
  }

  function defaultListedServers() {
    const policy = String(state.offline_server_position || "Last");
    return (state.servers || []).map(function (s, i) { return { s: s, i: s.uuid || String(i), order: i }; }).sort(function (a, b) {
      if (policy === "First" && a.s.online !== b.s.online) return a.s.online ? 1 : -1;
      if (policy !== "Keep" && policy !== "First" && a.s.online !== b.s.online) return a.s.online ? -1 : 1;
      const aw = Number(a.s.weight || 0);
      const bw = Number(b.s.weight || 0);
      if (aw !== bw) return aw - bw;
      return Number(a.s._order == null ? a.order : a.s._order) - Number(b.s._order == null ? b.order : b.s._order);
    });
  }

  function remainingSortValue(server) {
    if (server.long_term) return Number.POSITIVE_INFINITY;
    if (!server.expires_at_raw) return Number.POSITIVE_INFINITY;
    const ts = new Date(server.expires_at_raw).getTime();
    return Number.isFinite(ts) ? Math.ceil((ts - Date.now()) / 86400000) : Number.POSITIVE_INFINITY;
  }

  function listSortValue(server, key) {
    if (key === "region") { const rd = regionDisplay(server); return (displayCountry(server) + " " + (rd.city || server.region_name || "")).toLowerCase(); }
    if (key === "name") return String(server.name || "").toLowerCase();
    if (key === "status") return server.online ? 1 : 0;
    if (key === "speed") return Number(server.download_speed || 0) + Number(server.upload_speed || 0);
    if (key === "latency") { const v = pingMs(server); return v == null ? null : v; }
    if (key === "cpu") return Number(server.cpu_pct == null ? -1 : server.cpu_pct);
    if (key === "memory") return pctMetric(server.mem_used, server.mem_total) ?? -1;
    if (key === "disk") return pctMetric(server.disk_used, server.disk_total) ?? -1;
    if (key === "traffic") return Number(server.traffic_used == null ? -1 : server.traffic_used);
    if (key === "uptime") return Number(server.uptime || 0);
    if (key === "remaining") return remainingSortValue(server);
    return 0;
  }

  function listedServers(applyInteractiveSort, applyRegionFilter) {
    let base = defaultListedServers();
    if (applyRegionFilter && regionFilter) {
      base = base.filter(function (item) { return regionDisplay(item.s).label === regionFilter; });
    }
    if (nodeQuery) base = base.filter(function (item) { return serverMatchesQuery(item.s); });
    if (anomalyFilter) base = base.filter(function (item) { return isAnomalous(item.s); });
    if (!applyInteractiveSort || !listSortKey || !listSortDir) return base;
    return base.map(function (item, idx) { return { item: item, idx: idx, value: listSortValue(item.s, listSortKey) }; }).sort(function (a, b) {
      if (listSortKey === "latency") {
        const aMissing = a.value == null || !Number.isFinite(Number(a.value));
        const bMissing = b.value == null || !Number.isFinite(Number(b.value));
        if (aMissing || bMissing) {
          if (aMissing && bMissing) return a.idx - b.idx;
          return aMissing ? 1 : -1;
        }
      }
      let cmp = 0;
      if (typeof a.value === "string" || typeof b.value === "string") cmp = String(a.value).localeCompare(String(b.value), "zh-CN", { numeric: true, sensitivity: "base" });
      else cmp = Number(a.value) - Number(b.value);
      if (!Number.isFinite(cmp) || cmp === 0) cmp = a.idx - b.idx;
      return listSortDir < 0 ? -cmp : cmp;
    }).map(function (x) { return x.item; });
  }

  function serverByKey(key) {
    const k = String(key == null ? "" : key);
    return (state.servers || []).find(function (s, i) { return String(s.uuid || i) === k; }) || null;
  }

  function listToolbar(r) {
    const a = anomalySummary();
    const anomalyTitle = '离线 ' + a.offline + ' · 高延迟 ' + a.latency + ' · 高丢包 ' + a.loss + ' · 高资源 ' + a.resource + ' · 高流量 ' + a.traffic + ' · 临期/过期 ' + a.expiry;
    return (
      '<div class="list-bar" id="views">' +
        '<div class="list-bar-left">' +
          '<span class="list-bar-k">机器清单</span>' +
          '<button class="filter-pill' + (anomalyFilter ? ' is-on' : '') + '" data-anomaly-filter type="button" title="' + attr(anomalyTitle) + '">异常 <b data-anomaly-count>' + a.total + '</b></button>' +
          '<label class="node-search"><span>筛选</span><input data-node-search type="search" value="' + attr(nodeQuery) + '" autocomplete="off" spellcheck="false" placeholder="VPS / 地区 / ASN / 服务商"></label>' +
        '</div>' +
        '<div class="views">' +
          '<button class="icon-btn' + (r.view === 'list' ? ' is-on' : '') + '" data-view="list" type="button" aria-label="横向排列" title="横向">' + iconList() + '</button>' +
          '<button class="icon-btn' + (r.view === 'grid' ? ' is-on' : '') + '" data-view="grid" type="button" aria-label="网格排列" title="网格">' + iconGrid() + '</button>' +
          '<button class="icon-btn' + (r.view === 'column' ? ' is-on' : '') + '" data-view="column" type="button" aria-label="列排列" title="列">' + iconColumn() + '</button>' +
          '<button class="icon-btn' + (showGlobe ? ' is-on' : '') + '" data-globe type="button" aria-label="显示地球" title="地球开/关">' + iconGlobe() + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderFoot() {
    const t = totals();
    const trafficScope = t.limit ? ("有限额合计 " + fmtBytes(t.limit, 2) + (t.unlimited ? " · 无限流量 " + t.unlimited + " 台" : "")) : "全部无限流量";
    const stamps = (state.servers || []).map(function (server) { return Number(server && server.last_seen_at); }).filter(Number.isFinite);
    const latestAt = stamps.length ? Math.max.apply(null, stamps) : null;
    const ageSeconds = latestAt == null ? null : Math.max(0, Math.floor((Date.now() - latestAt) / 1000));
    const stale = liveMode && ageSeconds != null && ageSeconds > 15;
    const source = !liveMode ? "连接中" : (stale ? ("Lite RPC2 · 状态 " + ageSeconds + "s 前") : "Lite RPC2");
    const statusTime = latestAt == null ? "—" : clock(new Date(latestAt));
    patchInnerHTML(foot,
      "<div>总使用流量　<b>" + fmtBytes(t.used, 2) + "</b>　" + h(trafficScope) + "</div>" +
      "<div>在线服务器　<b>" + t.online + " / " + t.all + "</b></div>" +
      "<div class='foot-update'><span>状态时间　<b>" + h(statusTime) + "</b></span><span class='foot-meta'>" + h(source) + "　·　Line Grid · Lite</span></div>");
  }

  function listEmpty() {
    if (nodeQuery || anomalyFilter || regionFilter) return '<section class="state"><h2>没有匹配节点</h2><p>调整搜索词或清除筛选条件后重试。</p></section>';
    return '<section class="state"><h2>暂无节点</h2><p>Lite 当前没有返回可展示的服务器。</p></section>';
  }

  function renderGrid(r) {
    const items = listedServers(false, true);
    main.innerHTML = fleetStrip() + globePanel() + listToolbar(r) + anomalyNotice() + (items.length
      ? '<section class="board" aria-label="网格排列">' + items.map(function (item) {
        return card(item.s, item.i);
      }).join("") + "</section>"
      : listEmpty()) + cycleBlock();
  }

  function renderColumn(r) {
    const items = listedServers(false, true);
    main.innerHTML = fleetStrip() + globePanel() + listToolbar(r) + anomalyNotice() + (items.length ? '<section class="stack" aria-label="列排列">' + items.map(function (item) {
      return slab(item.s, item.i);
    }).join("") + "</section>" : listEmpty()) + cycleBlock();
  }

  function renderList(r) {
    const items = listedServers(true, true);
    main.innerHTML = fleetStrip() + globePanel() + listToolbar(r) + anomalyNotice() + (items.length ? '<section class="list" aria-label="横向排列">' + listHead() + items.map(function (item) {
      return row(item.s, item.i);
    }).join("") + "</section>" : listEmpty()) + cycleBlock();
  }

  function seriesGet(key) {
    const value = seriesCache[key];
    if (!value) return value;
    const pos = seriesCacheOrder.indexOf(key);
    if (pos >= 0) seriesCacheOrder.splice(pos, 1);
    seriesCacheOrder.push(key);
    return value;
  }

  function seriesPut(key, value) {
    if (!value) return;
    seriesCache[key] = value;
    const pos = seriesCacheOrder.indexOf(key);
    if (pos >= 0) seriesCacheOrder.splice(pos, 1);
    seriesCacheOrder.push(key);
    while (seriesCacheOrder.length > SERIES_CACHE_MAX) {
      const old = seriesCacheOrder.shift();
      delete seriesCache[old];
    }
  }

  function nodeCtx(index) {
    const s = serverByKey(index);
    if (!s) return null;
    if ((!targetKey || targetKey === "all") && s.ping && s.ping.length) targetKey = s.ping[0].key;
    const ping = (s.ping || []).find(function (p) { return p.key === targetKey; }) || (s.ping || [])[0] || null;
    const cacheKey = s.uuid + ":" + range + ":" + (targetKey || "all");
    const cached = seriesGet(cacheKey);
    let sparkVals = [];
    let multiSeries = [];
    if (cached) {
      sparkVals = (cached.series || []).map(function (p) { return { v: p && p.value != null && Number.isFinite(Number(p.value)) ? Number(p.value) : -1, t: p && p.t != null ? Number(p.t) : null }; });
      multiSeries = cached.seriesByTask || [];
    } else if (range === "1h" && targetKey === "all") {
      multiSeries = (s.ping || []).map(function (p) { return { key: p.key, label: p.label, points: (p.buckets || []).map(function (b) { return { value: b.ms, t: b.t }; }) }; });
    } else if (range === "1h" && ping && ping.buckets) {
      sparkVals = ping.buckets.map(function (b) { return { v: b.ms, t: b.t }; });
    }
    return { s: s, ping: ping, sparkVals: sparkVals, multiSeries: multiSeries, st: dailyStats(s), last7: (s.daily_traffic || []).slice(-7) };
  }

  function heroMultiSeries(ctx) {
    const s = ctx.s;
    const cacheKey = s.uuid + ":" + range + ":all";
    const cached = seriesGet(cacheKey);
    if (cached && cached.seriesByTask && cached.seriesByTask.length) return cached.seriesByTask;
    if (range === "1h") {
      return (s.ping || []).map(function (p) {
        return { key: p.key, label: p.label, points: (p.buckets || []).map(function (b) { return { value: b.ms, t: b.t }; }) };
      }).filter(function (item) { return item.points.length; });
    }
    return [];
  }

  function heroPingSummary(s) {
    const pings = (s.ping || []).filter(function (p) { return p && p.current_ms != null && Number(p.current_ms) >= 0; });
    if (!pings.length) return null;
    const ms = pings.reduce(function (sum, p) { return sum + Number(p.current_ms); }, 0) / pings.length;
    const losses = pings.map(function (p) { return p.loss_pct == null ? null : Number(p.loss_pct); }).filter(Number.isFinite);
    return { current_ms: ms, loss_pct: losses.length ? losses.reduce(function (a, b) { return a + b; }, 0) / losses.length : null };
  }

  function pingWindowDomain() {
    const hours = range === "7D" ? 168 : range === "24h" ? 24 : range === "6h" ? 6 : 1;
    const end = Date.now();
    return { start: end - hours * 3600000, end: end, hours: hours };
  }

  function pingAxisLabels() {
    const domain = pingWindowDomain();
    const end = domain.end;
    const start = domain.start;
    const mid = start + (end - start) / 2;
    function tm(ts) {
      const d = new Date(ts);
      if (range === "7D") return pad(d.getMonth() + 1) + "-" + pad(d.getDate());
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return [tm(start), tm(mid), tm(end)];
  }

  function pingChartOpts(mode, base) {
    const opt = Object.assign({}, base || {});
    opt.showYAxis = mode === "y" || mode === "xy";
    opt.showXAxis = mode === "xy";
    opt.adaptiveY = true;
    opt.yUnit = "ms";
    const domain = pingWindowDomain();
    opt.domainStart = domain.start;
    opt.domainEnd = domain.end;
    opt.windowHours = domain.hours;
    if (opt.showXAxis) opt.xLabels = pingAxisLabels();
    return opt;
  }

  function hasLatencyValues(values) {
    return (values || []).some(function (point) {
      const raw = point && typeof point === "object" ? (point.value != null ? point.value : point.v) : point;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0;
    });
  }

  function heroPingChart(ctx, w, ht, mode) {
    const series = heroMultiSeries(ctx);
    if (series.length > 1 && ProbeCharts.multiSpark) return ProbeCharts.multiSpark(series, pingChartOpts(mode || "y", { w: w, h: ht }));
    if (series.length === 1) {
      const vals = (series[0].points || []).map(function (p) { return { v: p && p.value != null ? Number(p.value) : -1, t: p && p.t != null ? Number(p.t) : null }; });
      const p = (ctx.s.ping || []).find(function (item) { return item.key === series[0].key; }) || (ctx.s.ping || [])[0] || null;
      const idx = Math.max(0, (ctx.s.ping || []).indexOf(p));
      return ProbeCharts.spark(vals, pingChartOpts(mode || "y", { w: w, h: ht, color: pingColor(p, idx), fillOpacity: 0.11, tips: pingTips(vals, rangeStepMinutes(vals)) }));
    }
    return '<div class="chart-empty">暂无多线路延迟历史</div>';
  }

  function pingChart(ctx, w, ht, mode) {
    if (targetKey === "all" && ctx.multiSeries && ctx.multiSeries.length > 1 && ProbeCharts.multiSpark) {
      return ProbeCharts.multiSpark(ctx.multiSeries, pingChartOpts(mode || "y", { w: w, h: ht }));
    }
    if (!hasLatencyValues(ctx.sparkVals)) return '<div class="chart-empty">暂无该时间范围的延迟历史</div>';
    const idx = Math.max(0, (ctx.s.ping || []).findIndex(function (p) { return ctx.ping && p.key === ctx.ping.key; }));
    return ProbeCharts.spark(ctx.sparkVals, pingChartOpts(mode || "y", { w: w, h: ht, color: pingColor(ctx.ping, idx), fillOpacity: 0.11, tips: pingTips(ctx.sparkVals, rangeStepMinutes(ctx.sparkVals)) }));
  }

  function trafficHistoryHTML(ctx, w, ht) {
    if (!ctx.last7.length) {
      const status = ctx.s.traffic_history_status === "loading" ? "正在加载历史流量…" : "暂无近 7 日历史流量";
      return '<div class="chart-empty">' + h(status) + '</div>';
    }
    return ProbeCharts.bars(ctx.last7, { w: w, h: ht, tips: trafficTips(ctx.last7) });
  }

  function heroLine(s, ping) {
    const ms = ping && ping.current_ms != null ? Math.round(Number(ping.current_ms)) : null;
    const presence = s.online
      ? ("运行 " + fmtDays(s.uptime))
      : (lastSeenText(s) ? ("最后在线 " + lastSeenText(s)) : "最后在线 —");
    return (
      '<header class="hero">' +
        "<div>" +
          '<div class="hero-sub">' +
            (s.online ? "在线" : "离线") + " · " + h(s.region_name || s.region_city || "") +
            (s.provider_name ? " · " + h(s.provider_name) : "") +
            " · " + h(presence) +
          "</div>" +
        "</div>" +
        '<div class="hero-pulse">' +
          '<div class="ms-xl' + latencyTone(ms) + '">' + (ms == null ? "—" : ms) + "<small>MS</small></div>" +
          '<div class="hero-loss' + lossTone(ping && ping.loss_pct) + '">' + lossText(ping && ping.loss_pct) + '</div>' +
        "</div>" +
      "</header>"
    );
  }

  function pingTargetsHTML(s) {
    const pings = s.ping || [];
    if (!pings.length) return '<span class="hero-sub">暂无 Ping Task 数据</span>';
    let html = '';
    html += pings.map(function (p) {
      const danger = (p.current_ms != null && Number(p.current_ms) > 180) || (p.loss_pct != null && Number(p.loss_pct) > 20);
      return '<button type="button" class="chip' + (p.key === targetKey ? " is-on" : "") + (danger ? " is-bad" : "") + '" data-target="' + attr(p.key) + '">' + h(p.label) + ' · ' + h(pingText(p)) + ' · ' + lossHTML(p.loss_pct) + '</button>';
    }).join('');
    return html;
  }

  function pageHTML(index) {
    const ctx = nodeCtx(index);
    if (!ctx) return "";
    const s = ctx.s;
    const mem = pctMetric(s.mem_used, s.mem_total);
    const disk = pctMetric(s.disk_used, s.disk_total);
    const trafficSub = s.traffic_limit ? ('限额 ' + fmtBytes(s.traffic_limit, 2)) : '无限流量';
    return (
      '<article class="sheet">' +
        heroLine(s, heroPingSummary(s)) +
        heroPingChart(ctx, 960, 50, "y") +
        '<section class="kpi">' +
          '<article><div class="lbl">下行</div><div class="val">' + fmtSpeed(s.download_speed) + '</div><div class="sub">上行 ' + fmtSpeed(s.upload_speed) + "</div></article>" +
          '<article><div class="lbl">CPU</div><div class="val">' + pctText(s.cpu_pct) + '</div><div class="sub">负载 ' + h((s.loadavg || "—").toString().trim().split(/\s+/).join(" · ")) + "</div></article>" +
          '<article><div class="lbl">内存</div><div class="val">' + pctText(mem) + '</div><div class="sub">' + fmtBytes(s.mem_used, 1) + " / " + fmtBytes(s.mem_total, 0) + "</div></article>" +
          '<article><div class="lbl">硬盘</div><div class="val">' + pctText(disk) + '</div><div class="sub">' + fmtBytes(s.disk_used, 0) + " / " + fmtBytes(s.disk_total, 0) + "</div></article>" +
          '<article><div class="lbl">流量累计</div><div class="val">' + fmtBytes(s.traffic_used, 1) + '</div><div class="sub">' + trafficSub + " · " + lossHTML(ctx.ping && ctx.ping.loss_pct) + "</div></article>" +
        "</section>" +
        '<section class="sheet-mid">' +
          '<div class="panel tight">' +
            '<div class="panel-h"><h3>延迟</h3>' +
              '<div class="seg">' + ["1h", "6h", "24h", "7D"].map(function (k) {
                return '<button type="button" data-range="' + k + '" class="' + (range === k ? "is-on" : "") + '">' + k + "</button>";
              }).join("") + "</div>" +
            "</div>" +
            '<div class="targets">' + pingTargetsHTML(s) + "</div>" +
            pingChart(ctx, 520, 96, "y") +
          "</div>" +
          '<div class="panel tight">' +
            '<div class="panel-h"><h3>近 7 日</h3><span class="hero-sub">' + (ctx.last7.length ? ('均 ' + fmtBytes(ctx.st.avg, 1) + ' · 高 ' + fmtBytes(ctx.st.high, 1)) : '按 Lite 历史记录') + "</span></div>" +
            trafficHistoryHTML(ctx, 320, 88) +
            (ctx.last7.length ? '<div class="day-inline">' + ctx.last7.map(function (d) {
              return "<span>" + h(d.date.slice(8)) + " " + fmtBytes(d.total, 1) + "</span>";
            }).join("") + "</div>" : '') +
          "</div>" +
        "</section>" +
        '<section class="sheet-bot">' +
          '<div class="panel tight">' +
            '<div class="panel-h"><h3>系统</h3></div>' +
            '<div class="sys-grid desktop-sys-grid">' +
              "<div>系统 <b>" + h(s.os || "—") + "</b></div>" +
              "<div>内核 <b>" + h(s.kernel || "—") + "</b></div>" +
              "<div>架构 <b>" + h(s.arch || "—") + "</b></div>" +
              "<div>CPU <b>" + h(s.cpu_model || "—") + "</b></div>" +
              "<div>到期 <b>" + h(s.expires_at || "—") + "</b></div>" +
              (accessState.logged_in ? ("<div>续费 <b>" + h(renewalText(s)) + "</b></div>") : "") +
            "</div>" +
            '<div class="mobile-sys-grid">' +
              '<div><span>系统</span><b>' + h(compactOS(s.os)) + '</b></div>' +
              '<div><span>架构</span><b>' + h((s.arch || "—") + (s.virtualization ? " · " + s.virtualization : "")) + '</b></div>' +
              '<div class="wide"><span>CPU</span><b>' + h(compactCPU(s.cpu_model)) + '</b></div>' +
              '<div><span>内核</span><b>' + h(compactKernel(s.kernel)) + '</b></div>' +
              '<div><span>到期</span><b>' + h(s.expires_at || "—") + '</b></div>' +
              (accessState.logged_in ? ('<div><span>续费</span><b>' + h(renewalText(s)) + '</b></div>') : '') +
              (s.asn ? '<div class="wide"><span>ASN</span><b>' + h(s.asn + (s.asn_org ? " · " + s.asn_org : "")) + '</b></div>' : '') +
            '</div>' +
          "</div>" +
        "</section>" +
      "</article>"
    );
  }

  function latencyPageCtx(index) {
    const s = serverByKey(index);
    if (!s) return null;
    const key = latencyTargetKey || "all";
    const ping = key === "all" ? null : ((s.ping || []).find(function (p) { return p.key === key; }) || (s.ping || [])[0] || null);
    const cacheKey = s.uuid + ":" + range + ":" + key;
    const cached = seriesGet(cacheKey);
    let sparkVals = [];
    let multiSeries = [];
    if (cached) {
      sparkVals = (cached.series || []).map(function (p) { return { v: p && p.value != null && Number.isFinite(Number(p.value)) ? Number(p.value) : -1, t: p && p.t != null ? Number(p.t) : null }; });
      multiSeries = cached.seriesByTask || [];
    } else if (range === "1h" && key === "all") {
      multiSeries = (s.ping || []).map(function (p) { return { key: p.key, label: p.label, points: (p.buckets || []).map(function (b) { return { value: b.ms, t: b.t }; }) }; });
      if (multiSeries.length === 1) {
        sparkVals = (multiSeries[0].points || []).map(function (p) { return { v: p && p.value != null ? Number(p.value) : -1, t: p && p.t != null ? Number(p.t) : null }; });
      }
    } else if (range === "1h" && ping && ping.buckets) {
      sparkVals = ping.buckets.map(function (b) { return { v: b.ms, t: b.t }; });
    }
    return { s: s, ping: ping, sparkVals: sparkVals, multiSeries: multiSeries, st: dailyStats(s), last7: (s.daily_traffic || []).slice(-7) };
  }

  function latencyPageTargetsHTML(s) {
    const pings = s.ping || [];
    if (!pings.length) return '<span class="hero-sub">暂无 Ping Task 数据</span>';
    let html = '';
    if (pings.length > 1) html += '<button type="button" class="chip' + (latencyTargetKey === "all" ? ' is-on' : '') + '" data-latency-target="all">多线合并</button>';
    html += pings.map(function (p) {
      const danger = (p.current_ms != null && Number(p.current_ms) > 180) || (p.loss_pct != null && Number(p.loss_pct) >= 10);
      return '<button type="button" class="chip' + (latencyTargetKey === p.key ? ' is-on' : '') + (danger ? ' is-bad' : '') + '" data-latency-target="' + attr(p.key) + '">' + h(p.label) + ' · ' + h(pingText(p)) + ' · ' + lossHTML(p.loss_pct) + '</button>';
    }).join('');
    return html;
  }

  function latencyPageChart(ctx, w, ht) {
    if (!ctx) return '<div class="chart-empty">暂无 Ping Task 数据</div>';
    if (latencyTargetKey === "all" && ctx.multiSeries && ctx.multiSeries.length > 1 && ProbeCharts.multiSpark) {
      return ProbeCharts.multiSpark(ctx.multiSeries, pingChartOpts("xy", { w: w, h: ht }));
    }
    if (!hasLatencyValues(ctx.sparkVals)) return '<div class="chart-empty">暂无该时间范围的延迟历史</div>';
    const idx = Math.max(0, (ctx.s.ping || []).findIndex(function (p) { return ctx.ping && p.key === ctx.ping.key; }));
    return ProbeCharts.spark(ctx.sparkVals, pingChartOpts("xy", { w: w, h: ht, color: pingColor(ctx.ping, idx), fillOpacity: 0.11, tips: pingTips(ctx.sparkVals, rangeStepMinutes(ctx.sparkVals)) }));
  }

  function pagePing(ctx) {
    const s = ctx.s;
    const pings = s.ping || [];
    const pctx = latencyPageCtx(s.uuid) || ctx;
    return (
      '<article class="page page-ping">' +
        '<div class="panel-h">' +
          "<div><h3 style='margin:0'>Latency / Packet Loss</h3></div>" +
          '<div class="seg">' +
            ["1h", "6h", "24h", "7D"].map(function (k) {
              return '<button type="button" data-range="' + k + '" class="' + (range === k ? "is-on" : "") + '">' + k + "</button>";
            }).join("") +
          "</div>" +
        "</div>" +
        '<div class="targets">' + latencyPageTargetsHTML(s) + "</div>" +
        '<div class="chart-fill latency-axis-panel">' + latencyPageChart(pctx, 960, 280) + "</div>" +
        '<section class="ping-stat-grid">' + pings.map(function (p) {
          return '<article><div class="lbl">' + h(p.label) + '</div><div class="val' + latencyTone(p.current_ms) + '">' + h(pingText(p)) + '</div><div class="sub"><span class="loss-value' + lossTone(p.loss_pct) + '">' + lossText(p.loss_pct) + '</span> · avg ' + h(p.avg_ms == null ? '—' : Math.round(p.avg_ms) + 'ms') + ' · p99 ' + h(p.p99_ms == null ? '—' : Math.round(p.p99_ms) + 'ms') + '</div></article>';
        }).join('') + '</section>' +
      "</article>"
    );
  }

  function pageTraffic(ctx) {
    const s = ctx.s;
    const forecast = trafficForecast(s);
    const resetDays = trafficResetDays(s);
    const unlimitedTraffic = !Number(s.traffic_limit || 0);
    const cycleLabel = unlimitedTraffic ? '无限流量 · 不设重置' : (s.period_start && s.period_end ? ('账期 ' + s.period_start.slice(5) + ' → ' + s.period_end.slice(5)) : '当前账期');
    const cycleHint = unlimitedTraffic ? cycleLabel : (resetDays == null ? cycleLabel : (cycleLabel + ' · ' + resetDays + ' 天后重置'));
    const historyLabel = ctx.last7.length ? ('已有 ' + ctx.last7.length + ' 天历史') : '暂无历史流量';
    return (
      '<article class="page page-traffic">' +
        '<div style="margin:0 0 10px">' + quotaBar(s) + "</div>" +
        '<div class="traffic-forecast' + (forecast && forecast.kind === 'bad' ? ' is-bad' : forecast && forecast.kind === 'good' ? ' is-good' : '') + '"><span>流量预测</span><b>' + h(forecast ? forecast.text : (s.traffic_limit ? '历史数据不足，暂不预测' : '无限流量，无需额度预测')) + '</b><small>' + h(cycleHint) + '</small></div>' +
        '<section class="kpi">' +
          '<article><div class="lbl">已用</div><div class="val">' + fmtBytes(s.traffic_used, 1) + '</div><div class="sub">' + (s.traffic_limit ? ('限额 ' + fmtBytes(s.traffic_limit, 2)) : '无限流量') + "</div></article>" +
          '<article><div class="lbl">本账期上行</div><div class="val">' + fmtBytes(s.traffic_used_up, 1) + '</div><div class="sub">' + h(cycleLabel) + '</div></article>' +
          '<article><div class="lbl">本账期下行</div><div class="val">' + fmtBytes(s.traffic_used_down, 1) + '</div><div class="sub">' + h(cycleLabel) + '</div></article>' +
          '<article><div class="lbl">最高日</div><div class="val">' + (ctx.last7.length ? fmtBytes(ctx.st.high, 1) : '—') + '</div><div class="sub">日均 ' + (ctx.last7.length ? fmtBytes(ctx.st.avg, 1) : '—') + "</div></article>" +
          '<article><div class="lbl">账期</div><div class="val">' + h(unlimitedTraffic ? '不重置' : ((s.period_start || '').slice(5) || '—')) + '</div><div class="sub">' + h(unlimitedTraffic ? '无限流量' : ('至 ' + ((s.period_end || '').slice(5) || '—'))) + "</div></article>" +
        "</section>" +
        '<div class="chart-fill"><div class="panel-h"><h3>近 7 日流量</h3><span class="hero-sub">' + h(historyLabel) + "</span></div>" +
          trafficHistoryHTML(ctx, 960, 220) +
        "</div>" +
        (ctx.last7.length ? '<section class="day-grid">' +
          ctx.last7.map(function (d) {
            return "<article><div class='lbl'>" + h(d.date.slice(5)) + "</div><div class='val' style='font-size:16px'>" + fmtBytes(d.total, 1) + "</div><div class='hero-sub'>↑ " + fmtBytes(d.uplink, 1) + "　↓ " + fmtBytes(d.downlink, 1) + "</div></article>";
          }).join("") +
        "</section>" : '') +
      "</article>"
    );
  }

  function fontModeFromPayload(payload) {
    const settings = payload && payload._public && payload._public.theme_settings;
    return String(settings && settings.fontMode || "Web").toLowerCase() === "system" ? "system" : "web";
  }

  function applyFontMode(payload) {
    const mode = fontModeFromPayload(payload);
    document.documentElement.setAttribute("data-font-mode", mode);
    if (mode === "system") {
      document.querySelectorAll("[data-line-grid-font]").forEach(function (node) { node.remove(); });
      externalFontsRequested = false;
      return;
    }
    if (externalFontsRequested) return;
    externalFontsRequested = true;
    [
      ["preconnect", "https://fonts.googleapis.com", false],
      ["preconnect", "https://fonts.gstatic.com", true],
      ["stylesheet", "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap", false]
    ].forEach(function (row) {
      const link = document.createElement("link");
      link.rel = row[0]; link.href = row[1]; link.setAttribute("data-line-grid-font", "1");
      if (row[2]) link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    });
  }

  function systemHistoryHours(value) {
    return value === "7d" ? 168 : value === "24h" ? 24 : 1;
  }

  function systemHistoryKey(uuid, value) { return String(uuid || "") + ":" + value; }

  function systemHistoryRows(raw, uuid) {
    const root = raw && raw.data && typeof raw.data === "object" ? raw.data : (raw || {});
    const records = root.records;
    if (Array.isArray(records)) return records.slice();
    if (!records || typeof records !== "object") return [];
    if (Array.isArray(records[String(uuid)])) return records[String(uuid)].slice();
    const keys = Object.keys(records);
    for (let i = 0; i < keys.length; i += 1) if (Array.isArray(records[keys[i]])) return records[keys[i]].slice();
    return [];
  }

  function systemHistoryData(raw, uuid, value) {
    const rows = systemHistoryRows(raw, uuid).sort(function (a, b) { return Date.parse(a && a.time || 0) - Date.parse(b && b.time || 0); });
    const out = { range: value, hours: systemHistoryHours(value), cpu: [], ram: [], disk: [], count: rows.length, fetchedAt: Date.now() };
    rows.forEach(function (row) {
      const t = Date.parse(row && row.time || "");
      if (!Number.isFinite(t)) return;
      const cpu = row.cpu == null ? null : Number(row.cpu);
      const ram = row.ram == null ? null : Number(row.ram), ramTotal = row.ram_total == null ? null : Number(row.ram_total);
      const disk = row.disk == null ? null : Number(row.disk), diskTotal = row.disk_total == null ? null : Number(row.disk_total);
      if (Number.isFinite(cpu) && cpu >= 0) out.cpu.push({ v: Math.max(0, Math.min(100, cpu)), t: t });
      if (Number.isFinite(ram) && Number.isFinite(ramTotal) && ramTotal > 0) out.ram.push({ v: Math.max(0, Math.min(100, ram / ramTotal * 100)), t: t });
      if (Number.isFinite(disk) && Number.isFinite(diskTotal) && diskTotal > 0) out.disk.push({ v: Math.max(0, Math.min(100, disk / diskTotal * 100)), t: t });
    });
    return out;
  }

  function systemHistoryChart(label, values, data) {
    const last = values.length ? Number(values[values.length - 1].v) : null;
    const chart = values.length && window.ProbeCharts ? ProbeCharts.spark(values, {
      w: 960, h: 150, showYAxis: true, showXAxis: true, adaptiveY: true, yUnit: "%",
      domainStart: (data.fetchedAt || Date.now()) - data.hours * 3600000, domainEnd: data.fetchedAt || Date.now(), windowHours: data.hours
    }) : '<div class="chart-empty">暂无历史记录</div>';
    return '<article class="system-history-card"><header><span>' + h(label) + '</span><b>' + (last == null || !Number.isFinite(last) ? '—' : last.toFixed(1) + '%') + '</b></header><div class="system-history-chart">' + chart + '</div></article>';
  }

  function paintSystemHistory(uuid, value, data) {
    const host = winBody.querySelector("[data-system-history]");
    if (!host || String(host.getAttribute("data-uuid") || "") !== String(uuid || "")) return;
    host.querySelectorAll("[data-system-history-range]").forEach(function (btn) { btn.classList.toggle("is-on", btn.getAttribute("data-system-history-range") === value); });
    const body = host.querySelector("[data-system-history-body]");
    const meta = host.querySelector("[data-system-history-meta]");
    if (meta) meta.textContent = data && data.error ? "Lite 历史读取失败" : (data && data.count ? (data.count + " 条记录 · Lite common:getRecords") : "暂无历史记录");
    if (!body) return;
    if (!data || data.error) { body.innerHTML = '<div class="chart-empty">暂时无法读取 Lite 资源历史</div>'; return; }
    body.innerHTML = systemHistoryChart("CPU", data.cpu, data) + systemHistoryChart("RAM", data.ram, data) + systemHistoryChart("Disk", data.disk, data);
  }

  function loadSystemHistory(uuid, value) {
    value = value === "7d" || value === "24h" ? value : "1h";
    const key = systemHistoryKey(uuid, value);
    const cached = systemHistoryCache[key];
    if (cached && Date.now() - cached.at < SYSTEM_HISTORY_TTL_MS) { paintSystemHistory(uuid, value, cached.data); return Promise.resolve(cached.data); }
    if (cached) delete systemHistoryCache[key];
    if (systemHistoryInFlight[key]) return systemHistoryInFlight[key];
    const hours = systemHistoryHours(value);
    const host = winBody.querySelector("[data-system-history]");
    const meta = host && host.querySelector("[data-system-history-meta]");
    if (meta) meta.textContent = "正在读取 Lite 历史…";
    const task = ProbeAPI.rpc("common:getRecords", { type: "load", uuid: String(uuid || ""), hours: hours, load_type: "all", maxCount: hours >= 168 ? 1200 : hours >= 24 ? 720 : 360 }, hours >= 168 ? 18000 : 12000)
      .then(function (raw) { const data = systemHistoryData(raw, uuid, value); systemHistoryCache[key] = { data: data, at: Date.now() }; paintSystemHistory(uuid, value, data); return data; })
      .catch(function () { const data = { range: value, hours: hours, count: 0, cpu: [], ram: [], disk: [], error: true }; paintSystemHistory(uuid, value, data); return data; })
      .finally(function () { delete systemHistoryInFlight[key]; });
    systemHistoryInFlight[key] = task;
    return task;
  }

  function systemHistoryHTML(server) {
    return '<section class="system-history" data-system-history data-uuid="' + attr(server && server.uuid || "") + '"><header class="system-history-head"><div><div class="lbl">资源历史</div><small data-system-history-meta>按需读取 Lite 历史</small></div><div class="system-history-ranges">' +
      [["1h","1H"],["24h","24H"],["7d","7D"]].map(function (row) { return '<button type="button" class="' + (systemHistoryRange === row[0] ? ' is-on' : '') + '" data-system-history-range="' + row[0] + '">' + row[1] + '</button>'; }).join("") +
      '</div></header><div class="system-history-grid" data-system-history-body><div class="chart-empty">正在读取 Lite 历史…</div></div></section>';
  }

  function systemAsnText(server) {
    const asn = String(server && server.asn || '').trim();
    const org = String(server && server.asn_org || '').trim();
    if (!asn) return state.enable_ip_geo_asn ? '查询不可用' : '未启用';
    const tail = org && org.toUpperCase().indexOf(asn.toUpperCase()) === 0 ? org.slice(asn.length).trim().replace(/^[-·:|]\s*/, '') : org;
    return asn + (tail ? ' · ' + tail : '');
  }
  function pageSystem(ctx) {
    const s = ctx.s;
    const cells = [
      ["系统", s.os || "—"],
      ["内核", s.kernel || "—"],
      ["架构", s.arch || "—"],
      ["虚拟化", s.virtualization || "—"],
      ["处理器", s.cpu_model || "—"],
      ["内存 / Swap", fmtBytes(s.mem_total, 1) + " / " + fmtBytes(s.swap_total, 1)],
      ["磁盘总量", fmtBytes(s.disk_total, 1)],
      ["负载", (s.loadavg || "—").toString().trim().split(/\s+/).join(" · ")],
      ["到期", s.expires_at || "—"],
      ["续费", renewalText(s)],
      ["自动续费", s.auto_renewal ? "是" : "否"],
      ["流量限额", s.traffic_limit ? fmtBytes(s.traffic_limit, 2) + " · " + h(s.traffic_limit_type || "sum") : "无限流量"],
      ["IPv4", s.ipv4 || "—"],
      ["IPv6", s.ipv6 || "—"],
      ["ASN", systemAsnText(s)],
      ["Agent", s.agent_version || "—"],
    ];
    return (
      '<article class="page page-system">' +
        '<section class="spec">' + cells.map(function (c) { return "<article><div class='lbl'>" + h(c[0]) + "</div><div class='val'>" + h(c[1]) + "</div></article>"; }).join("") + "</section>" +
        systemHistoryHTML(s) +
      "</article>"
    );
  }

  function closeWindow() {
    const r = route();
    go(viewHash(r.view || lastView));
    if (lastFocus) {
      const el = Array.prototype.find.call(document.querySelectorAll("[data-index]"), function (node) { return node.getAttribute("data-index") === lastFocus; });
      if (el) el.focus();
    }
  }

  function renderWindow(index, page) {
    const s = serverByKey(index);
    if (s == null) {
      overlay.hidden = true;
      document.body.classList.remove("is-locked");
      document.documentElement.classList.remove("is-locked");
      return;
    }
    const visiblePages = accessState.is_admin ? PAGES : ["overview"];
    const current = visiblePages.indexOf(page) >= 0 ? page : "overview";
    const stage = overlay.querySelector(".stage");
    if (stage) stage.classList.toggle("is-compact-system", current === "system");
    const ctx = nodeCtx(index);
    winTitle.textContent = s.name || "未命名";
    const rd = regionDisplay(s);
    winKicker.textContent = rd.code + " / " + (rd.city || "DETAIL");
    const nav = document.getElementById("stage-nav");
    if (nav) {
      nav.style.display = accessState.is_admin ? "" : "none";
      patchInnerHTML(nav, visiblePages.map(function (key) {
        return '<button type="button" data-page="' + key + '" class="' + (current === key ? "is-on" : "") + '">' + PAGE_LABEL[key] + '</button>';
      }).join(""));
    }
    if (current === "ping") patchInnerHTML(winBody, pagePing(ctx));
    else if (current === "traffic") patchInnerHTML(winBody, pageTraffic(ctx));
    else if (current === "system") { patchInnerHTML(winBody, pageSystem(ctx)); setTimeout(function () { loadSystemHistory(s.uuid, systemHistoryRange); }, 0); }
    else patchInnerHTML(winBody, pageHTML(index));
    overlay.hidden = false;
    document.body.classList.add("is-locked");
    document.documentElement.classList.add("is-locked");
    const key = String(index) + ":" + current;
    if (lastWindowKey !== key) winBody.scrollTop = 0;
    lastWindowKey = key;
  }

  function wrapLon(lon) {
    return ((lon + 180) % 360 + 360) % 360 - 180;
  }

  function globeCaption() {
    const lon = Math.round(globeLon);
    const lat = Math.round(globeLat);
    return "ORTHOGRAPHIC · " + Math.abs(lon) + "°" + (lon >= 0 ? "E" : "W") + " " + Math.abs(lat) + "°" + (lat >= 0 ? "N" : "S");
  }

  function labelWidth(text) {
    let w = 0;
    for (let i = 0; i < text.length; i += 1) {
      w += text.charCodeAt(i) > 255 ? 8.6 : 5.05;
    }
    return w + 2;
  }

  function layoutGlobeLabels(cx, ortho) {
    const items = [];
    (state.servers || []).forEach(function (s, i) {
      const ll = serverLL(s, i) || [80, 30];
      const p = ortho(ll[0], ll[1]);
      if (!p) return;
      const loc = displayCountry(s);
      const leftLabel = (s.name || "未命名") + " · " + loc;
      const rightLabel = loc + " · " + (s.name || "未命名");
      items.push({ i: i, key: s.uuid || String(i), s: s, px: p.x, py: p.y, leftLabel: leftLabel, rightLabel: rightLabel, w: Math.max(labelWidth(leftLabel), labelWidth(rightLabel)) });
    });

    const buckets = {};
    items.forEach(function (n) {
      const key = displayCountry(n.s) || "?";
      (buckets[key] = buckets[key] || []).push(n);
    });
    Object.keys(buckets).forEach(function (key) {
      const g = buckets[key];
      if (g.length < 2) return;
      g.forEach(function (n, idx) {
        const a = (idx / g.length) * Math.PI * 2 - Math.PI / 2;
        n.px += Math.cos(a) * 4.2;
        n.py += Math.sin(a) * 4.2;
      });
    });

    const left = [];
    const right = [];
    items.forEach(function (n) {
      let side = n.px >= cx ? "R" : "L";
      if (globeLabelSide[n.key] && Math.abs(n.px - cx) < 18) side = globeLabelSide[n.key];
      (side === "L" ? left : right).push(n);
    });

    // Keep label counts visually balanced. Prefer moving nodes closest to the
    // central meridian so geographic placement still dominates the layout.
    function rebalance(from, to) {
      if (from.length - to.length <= 2) return;
      const move = from.slice().sort(function (a, b) {
        return Math.abs(a.px - cx) - Math.abs(b.px - cx) || a.w - b.w || a.i - b.i;
      });
      while (from.length - to.length > 2 && move.length) {
        const n = move.shift();
        const pos = from.indexOf(n);
        if (pos < 0) continue;
        from.splice(pos, 1);
        to.push(n);
      }
    }
    rebalance(right, left);
    rebalance(left, right);

    function stack(list, x, end) {
      list.sort(function (a, b) { return a.py - b.py || a.i - b.i; });
      if (!list.length) return;
      const gap = list.length > 14 ? 11 : 13;
      const mean = list.reduce(function (sum, n) { return sum + n.py; }, 0) / list.length;
      let y0 = mean - (list.length - 1) * gap / 2;
      if (y0 < 12) y0 = 12;
      const last = y0 + (list.length - 1) * gap;
      if (last > 204) y0 -= last - 204;
      if (y0 < 12) y0 = 12;
      list.forEach(function (n, idx) {
        n.lx = x;
        n.ly = y0 + idx * gap;
        n.end = end;
        globeLabelSide[n.key] = end ? "L" : "R";
      });
    }

    // Keep both label stacks fully outside the globe. The wider symmetric
    // viewBox leaves enough room for long VPS names on either side.
    stack(left, 126, true);
    stack(right, 334, false);
    return items;
  }

  function clipToLimb(visLL, hidLL, ortho) {
    let lon0 = visLL[0];
    let lat0 = visLL[1];
    let lon1 = hidLL[0];
    let lat1 = hidLL[1];
    if (lon1 - lon0 > 180) lon1 -= 360;
    if (lon0 - lon1 > 180) lon0 -= 360;
    let lo = 0;
    let hi = 1;
    let best = ortho(lon0, lat0);
    for (let k = 0; k < 7; k += 1) {
      const t = (lo + hi) / 2;
      const p = ortho(lon0 + (lon1 - lon0) * t, lat0 + (lat1 - lat0) * t);
      if (p) { lo = t; best = p; } else hi = t;
    }
    return best;
  }

  function landPathData(ortho, profile) {
    const cfg = profile || globeProfile();
    const rings = cfg.land === "coarse" ? COARSE_WORLD_OUTLINES : (WORLD_OUTLINES || []);
    const stride = Math.max(1, Number(cfg.coastStride) || 1);
    let fill = "";
    let stroke = "";
    for (let r = 0; r < rings.length; r += 1) {
      const raw = rings[r];
      if (!raw || raw.length < 3) continue;
      let ring = raw;
      if (stride > 1 && raw.length > 18) {
        ring = [];
        for (let z = 0; z < raw.length; z += stride) ring.push(raw[z]);
        if (ring.length < 3) ring = raw;
      }
      const n = ring.length;
      const vis = new Array(n);
      for (let i = 0; i < n; i += 1) vis[i] = ortho(ring[i][0], ring[i][1]);
      let d = "";
      let drawing = false;
      for (let i = 0; i < n; i += 1) {
        const a = vis[i];
        const b = vis[(i + 1) % n];
        if (a && b) {
          if (!drawing) { d += "M " + a.x.toFixed(1) + " " + a.y.toFixed(1); drawing = true; }
          d += " L " + b.x.toFixed(1) + " " + b.y.toFixed(1);
        } else if (a && !b) {
          const c = clipToLimb(ring[i], ring[(i + 1) % n], ortho);
          if (!drawing) { d += "M " + a.x.toFixed(1) + " " + a.y.toFixed(1); drawing = true; }
          if (c) d += " L " + c.x.toFixed(1) + " " + c.y.toFixed(1);
          drawing = false;
        } else if (!a && b) {
          const c = clipToLimb(ring[(i + 1) % n], ring[i], ortho);
          if (c) { d += "M " + c.x.toFixed(1) + " " + c.y.toFixed(1); drawing = true; }
          d += " L " + b.x.toFixed(1) + " " + b.y.toFixed(1);
        }
      }
      if (d) { fill += d + " Z "; stroke += d + " "; }
    }
    return { fill: fill, stroke: stroke };
  }

  function globeMarkup() {
    const cfg = globeProfile();
    const cx = 230;
    const cy = 112;
    const R = 92;
    const lon0 = globeLon * Math.PI / 180;
    const lat0 = globeLat * Math.PI / 180;
    function ortho(lonD, latD) {
      const lon = lonD * Math.PI / 180;
      const lat = latD * Math.PI / 180;
      const cosc = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(lon - lon0);
      if (cosc <= 0.02) return null;
      return {
        x: cx + R * Math.cos(lat) * Math.sin(lon - lon0),
        y: cy - R * (Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(lon - lon0)),
        k: cosc,
      };
    }
    function curve(lonFixed, latFixed, from, to, step) {
      let d = "";
      let started = false;
      for (let a = from; a <= to; a += step) {
        const p = lonFixed != null ? ortho(lonFixed, a) : ortho(a, latFixed);
        if (!p) { started = false; continue; }
        d += (started ? " L " : "M ") + p.x.toFixed(2) + " " + p.y.toFixed(2);
        started = true;
      }
      return d ? '<path class="globe-wire" d="' + d + '" fill="none" stroke-width="0.9"/>' : "";
    }
    let wire =
      '<defs><radialGradient id="globe-shade" cx="38%" cy="36%" r="68%">' +
        '<stop offset="0%" stop-color="var(--ink)" stop-opacity="0.06"/>' +
        '<stop offset="70%" stop-color="var(--ink)" stop-opacity="0"/>' +
        '<stop offset="100%" stop-color="var(--globe-rim)" stop-opacity="1"/>' +
      "</radialGradient></defs>" +
      '<circle class="globe-ocean" cx="' + cx + '" cy="' + cy + '" r="' + R + '" />' +
      '<circle class="globe-disk" cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#globe-shade)" stroke="var(--ink)" stroke-width="1.05"/>';
    const land = landPathData(ortho, cfg);
    if (land.fill) {
      wire += '<path class="globe-land" d="' + land.fill + '" />';
      wire += '<path class="globe-coast" d="' + land.stroke + '" fill="none" />';
    }
    for (let lon = -180; lon < 180; lon += cfg.gridLon) wire += curve(lon, null, -80, 80, cfg.curveStep);
    for (let lat = -60; lat <= 60; lat += cfg.gridLat) wire += curve(null, lat, -180, 180, cfg.curveStep);
    wire += curve(null, 0, -180, 180, Math.max(3, cfg.curveStep - 1)).replace('stroke-width="0.9"', 'stroke-width="1.15"');
    if (cfg.sweepCount > 0) {
      const sweepLon = ((Date.now() / 28) % 360) - 180;
      const sweepBase = currentTheme() === "light" ? 0.52 : 0.42;
      for (let k = 0; k < cfg.sweepCount; k += 1) {
        const lon = sweepLon - k * 8;
        const sweep = curve(lon, null, -80, 80, Math.max(3, cfg.curveStep - 1));
        if (sweep) {
          wire += sweep
            .replace('class="globe-wire"', 'class="globe-sweep"')
            .replace('stroke-width="0.9"', 'stroke-width="' + (k === 0 ? 1.6 : 1.1) + '" style="stroke-opacity:' + (sweepBase - k * 0.06).toFixed(2) + '"');
        }
      }
    }
    wire += '<line class="globe-base" x1="110" y1="' + (cy + R + 16) + '" x2="350" y2="' + (cy + R + 16) + '" stroke-width="1"/>';
    const laid = layoutGlobeLabels(cx, ortho);
    let links = "";
    const online = laid.filter(function (n) { return n.s.online; });
    if (cfg.linkMode > 0) online.forEach(function (a, i) {
      online.forEach(function (b, j) {
        if (j <= i) return;
        if ((a.s.geo_country || a.s.region_country || "") === (b.s.geo_country || b.s.region_country || "")) return;
        const divisor = cfg.linkMode > 1 ? 4 : 8;
        if ((a.i * 7 + b.i * 3) % divisor !== 1) return;
        const mx = (a.px + b.px) / 2;
        const my = (a.py + b.py) / 2;
        const qx = cx + (mx - cx) * 0.42;
        const qy = cy + (my - cy) * 0.42;
        links += '<path class="globe-link" d="M ' + a.px.toFixed(1) + " " + a.py.toFixed(1) + " Q " + qx.toFixed(1) + " " + qy.toFixed(1) + " " + b.px.toFixed(1) + " " + b.py.toFixed(1) + '" fill="none" stroke-width="0.55"/>';
      });
    });
    const pins = laid.map(function (n) {
      const tx = n.end ? n.lx - 3 : n.lx + 3;
      const label = n.end ? n.leftLabel : n.rightLabel;
      return (
        '<g class="globe-node">' +
          '<path d="M ' + n.px.toFixed(1) + " " + n.py.toFixed(1) + " L " + n.lx.toFixed(1) + " " + n.ly.toFixed(1) + '" fill="none" stroke="var(--ink)" stroke-width="0.75"/>' +
          '<circle cx="' + n.px.toFixed(1) + '" cy="' + n.py.toFixed(1) + '" r="2.1" fill="none" stroke="' + pingColor(n.s) + '" stroke-width="1.15"/>' +
          '<text x="' + tx.toFixed(1) + '" y="' + (n.ly + 3).toFixed(1) + '" text-anchor="' + (n.end ? "end" : "start") + '" fill="var(--ink-soft)" font-size="8.5" font-family="IBM Plex Mono, monospace" stroke="var(--void)" stroke-width="3" paint-order="stroke" stroke-linejoin="round">' + h(label) + "</text>" +
          '<circle class="hit" cx="' + n.px.toFixed(1) + '" cy="' + n.py.toFixed(1) + '" r="9" fill="transparent" data-index="' + attr(n.key) + '"/>' +
        "</g>"
      );
    }).join("");
    let selectedMarker = "";
    if (globePinned && regionFilter) {
      const p = ortho(globeLon, globeLat);
      if (p) selectedMarker = '<g class="globe-selected" aria-label="' + attr(regionFilter) + '"><circle class="globe-selected-ring" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="7"/><circle class="globe-selected-core" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.4"/></g>';
    }
    return wire + links + pins + selectedMarker +
      '<text class="globe-caption" x="230" y="' + (cy + R + 28) + '" text-anchor="middle" font-size="8" font-family="IBM Plex Mono, monospace" letter-spacing="1.4">' + globeCaption() + " · " + cfg.key.toUpperCase() + "</text>";
  }

  function globePanel() {
    if (!showGlobe || (window.matchMedia && window.matchMedia("(max-width: 720px)").matches)) return "";
    const regions = {};
    (state.servers || []).forEach(function (s) {
      const rd = regionDisplay(s);
      const key = rd.label;
      if (!regions[key]) regions[key] = { count: 0, lon: 0, lat: 0, coordCount: 0, aim: s.geo_country || s.region_country || rd.code };
      const item = regions[key];
      item.count += 1;
      const ll = regionAimLL(s);
      if (ll) { item.lon += Number(ll[0]); item.lat += Number(ll[1]); item.coordCount += 1; }
    });
    const side = '<button type="button" class="reg' + (!regionFilter ? ' is-on' : '') + '" data-region-filter=""><span>ALL</span><b>' + (state.servers || []).length + '</b></button>' +
      Object.keys(regions).sort().map(function (k) {
        const item = regions[k];
        const lon = item.coordCount ? item.lon / item.coordCount : null;
        const lat = item.coordCount ? item.lat / item.coordCount : null;
        const coords = lon != null && lat != null ? (' data-aim-lon="' + attr(lon.toFixed(5)) + '" data-aim-lat="' + attr(lat.toFixed(5)) + '"') : '';
        return '<button type="button" class="reg' + (regionFilter === k ? ' is-on' : '') + '" data-region-filter="' + attr(k) + '" data-aim="' + attr(item.aim) + '"' + coords + '><span>' + h(k) + "</span><b>" + item.count + "</b></button>";
      }).join("");
    return (
      '<section class="home-globe" aria-label="节点地球">' +
        '<div class="atlas">' +
          '<svg viewBox="0 0 460 240" preserveAspectRatio="xMidYMid meet">' + globeMarkup() + "</svg>" +
        "</div>" +
        '<aside class="atlas-side"><div class="lbl atlas-title">地区' + (globePinned && regionFilter ? ' · 已定位' : '') + '</div>' + side + "</aside>" +
      "</section>"
    );
  }

  function globeViewportReady() {
    if (!showGlobe || document.hidden || route().home !== "nodes") return false;
    const atlas = main.querySelector(".atlas");
    if (!atlas || !atlas.querySelector('svg')) return false;
    const rect = atlas.getBoundingClientRect();
    return rect.bottom >= 0 && rect.top <= window.innerHeight;
  }

  function paintGlobe() {
    const svg = main.querySelector(".atlas svg");
    if (svg) svg.innerHTML = globeMarkup();
  }

  function queueGlobePaint() {
    if (globePaintRAF) return;
    globePaintRAF = requestAnimationFrame(function () {
      globePaintRAF = 0;
      paintGlobe();
    });
  }

  function onGlobeDown(ev) {
    const atlas = ev.target.closest(".atlas");
    if (!atlas || ev.button) return;
    globeDrag = {
      id: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      lon: globeLon,
      lat: globeLat,
      moved: false,
    };
    atlas.classList.add("is-drag");
    wakeGlobeIdle();
    try { atlas.setPointerCapture(ev.pointerId); } catch (e) {}
  }

  function onGlobeMove(ev) {
    if (!globeDrag || ev.pointerId !== globeDrag.id) return;
    const dx = ev.clientX - globeDrag.x;
    const dy = ev.clientY - globeDrag.y;
    if (!globeDrag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    globeDrag.moved = true;
    ev.preventDefault();
    globeLon = wrapLon(globeDrag.lon - dx * 0.48);
    globeLat = Math.max(-78, Math.min(78, globeDrag.lat + dy * 0.36));
    queueGlobePaint();
  }

  function onGlobeUp(ev) {
    if (!globeDrag || ev.pointerId !== globeDrag.id) return;
    const atlas = main.querySelector(".atlas");
    if (atlas) {
      atlas.classList.remove("is-drag");
      try { atlas.releasePointerCapture(ev.pointerId); } catch (e) {}
    }
    if (globeDrag.moved) globeSkipClick = true;
    globeDrag = null;
    queueGlobePaint();
    wakeGlobeIdle();
  }

  function hideWindow() {
    overlay.hidden = true;
    document.body.classList.remove("is-locked");
    document.documentElement.classList.remove("is-locked");
    patchInnerHTML(winBody, "");
  }

  function setMainHTML(html) {
    if (domPatchActive) patchInnerHTML(main, html);
    else main.innerHTML = html;
  }

  function renderNetwork() {
    const servers = listedServers().map(function (item) { return item.s; });
    if (!servers.length) {
      setMainHTML(listEmpty());
      return;
    }
    if (!netKey || !servers.some(function (item) { return String(item.uuid) === String(netKey); })) netKey = servers[0].uuid;
    const s = servers.find(function (item) { return String(item.uuid) === String(netKey); }) || servers[0];
    const targets = s.ping || [];
    const chosen = netTarget === "all" ? null : targets.find(function (p) { return p.key === netTarget; });
    const valid = chosen ? [chosen] : targets.filter(function (p) { return p.current_ms != null && Number(p.current_ms) >= 0; });
    const avgMs = valid.length ? Math.round(valid.reduce(function (a, p) { return a + Number(p.current_ms); }, 0) / valid.length) : null;
    const lossValues = chosen ? (chosen.loss_pct == null ? [] : [Number(chosen.loss_pct)]) : targets.map(function (p) { return p.loss_pct == null ? null : Number(p.loss_pct); }).filter(Number.isFinite);
    const avgLoss = lossValues.length ? lossValues.reduce(function (a, b) { return a + b; }, 0) / lossValues.length : null;
    const cacheKey = s.uuid + ":" + range + ":" + (netTarget || "all");
    const cached = seriesGet(cacheKey) || null;
    const chartOpts = pingChartOpts("xy", { w: 960, h: 200 });
    let chart = '';
    if (!targets.length) {
      chart = '<div class="chart-empty">暂无 Ping Task 数据</div>';
    } else if (netTarget === 'all' && cached && cached.seriesByTask && cached.seriesByTask.length > 1) {
      chart = ProbeCharts.multiSpark(cached.seriesByTask, chartOpts);
    } else {
      let vals = cached ? (cached.series || []).map(function (p) {
        return { v: p && p.value != null && Number.isFinite(Number(p.value)) ? Number(p.value) : -1, t: p && p.t != null ? Number(p.t) : null };
      }) : [];
      const sparkSrc = chosen || targets[0];
      if (!vals.length && range === "1h" && sparkSrc && sparkSrc.buckets) vals = sparkSrc.buckets.map(function (b) { return { v: b.ms, t: b.t }; });
      const sparkIndex = Math.max(0, targets.indexOf(sparkSrc));
      chart = hasLatencyValues(vals) ? ProbeCharts.spark(vals, Object.assign({}, chartOpts, { color: pingColor(sparkSrc, sparkIndex), fillOpacity: 0.11, tips: pingTips(vals, rangeStepMinutes(vals)) })) : '<div class="chart-empty">暂无该时间范围的 Ping 历史</div>';
    }
    if (!chart) chart = '<div class="chart-empty">暂无该时间范围的 Ping 历史</div>';
    setMainHTML(
      '<section class="subpage">' +
        "<p class='lead'>按服务器与探测目标查看延迟、丢包和时间范围；负值 Ping 会按丢包处理，不显示为负延迟。</p>" +
        '<div class="pick" style="margin-bottom:16px">' +
          servers.map(function (item) {
            return '<button type="button" class="chip' + (String(item.uuid) === String(netKey) ? " is-on" : "") + '" data-net="' + attr(item.uuid) + '">' + h(item.name) + "</button>";
          }).join("") +
        "</div>" +
        '<section class="kpi">' +
          "<article><div class='lbl'>平均延迟</div><div class='val'>" + (avgMs == null ? '—' : avgMs + ' ms') + "</div><div class='sub'>" + h(s.name) + "</div></article>" +
          "<article><div class='lbl'>平均丢包</div><div class='val'>" + lossHTML(avgLoss) + "</div><div class='sub'>所选目标</div></article>" +
          "<article><div class='lbl'>时间范围</div><div class='val'>" + range + "</div><div class='sub'>1h / 6h / 24h / 7D</div></article>" +
          "<article><div class='lbl'>探测目标</div><div class='val'>" + targets.length + "</div><div class='sub'>Lite Ping Tasks</div></article>" +
        "</section>" +
        '<div class="panel-h" style="margin:16px 0 10px">' +
          '<div class="pick">' +
            '<button type="button" class="chip' + (netTarget === "all" ? " is-on" : "") + '" data-nett="all">多线合并</button>' +
            targets.map(function (p) {
              return '<button type="button" class="chip' + (netTarget === p.key ? " is-on" : "") + '" data-nett="' + attr(p.key) + '">' + h(p.label) + ' · ' + h(pingText(p)) + ' · ' + lossHTML(p.loss_pct) + '</button>';
            }).join("") +
          "</div>" +
          '<div class="seg">' +
            ["1h", "6h", "24h", "7D"].map(function (k) {
              return '<button type="button" data-range="' + k + '" class="' + (range === k ? "is-on" : "") + '">' + k + "</button>";
            }).join("") +
          "</div>" +
        "</div>" +
        '<div class="chart-fill" style="height:240px">' + chart + "</div>" +
        '<div class="bucket-strip" style="margin-top:14px">' +
          targets.map(function (p) {
            return "<article><div class='lbl'>" + h(p.label) + "</div><div class='val' style='font-size:16px'>" + h(pingText(p)) + "</div><div class='hero-sub'>" + lossHTML(p.loss_pct) + " · avg " + h(p.avg_ms == null ? '—' : Math.round(p.avg_ms) + 'ms') + "</div></article>";
          }).join("") +
        "</div>" +
      "</section>" + cycleBlock());
  }

  function calendarShiftKey(key, delta) {
    const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(delta || 0)));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function resourceWeekRows(servers) {
    const byDate = {};
    (servers || []).forEach(function (s) {
      (s.daily_traffic || []).forEach(function (row) {
        if (!row || !row.date) return;
        if (!byDate[row.date]) byDate[row.date] = { date: row.date, uplink: 0, downlink: 0, total: 0 };
        byDate[row.date].uplink += Number(row.uplink || 0);
        byDate[row.date].downlink += Number(row.downlink || 0);
        byDate[row.date].total += Number(row.total || 0);
      });
    });
    const today = todayKeyInZone(state.billing_timezone || 'Asia/Shanghai');
    const rows = [];
    let observed = 0;
    for (let i = 6; i >= 0; i -= 1) {
      const key = calendarShiftKey(today, -i);
      if (byDate[key]) { rows.push(byDate[key]); observed += 1; }
      else rows.push({ date: key, uplink: 0, downlink: 0, total: 0, _missing: true });
    }
    return { rows: rows, observed: observed };
  }

  function resourcePressure(server) {
    const values = [server && server.cpu_pct, pctMetric(server && server.mem_used, server && server.mem_total), pctMetric(server && server.disk_used, server && server.disk_total)]
      .filter(function (value) { return value != null && value !== ''; })
      .map(Number).filter(Number.isFinite);
    return values.length ? Math.max.apply(null, values) : -1;
  }

  function renderResource() {
    const servers = state.servers || [];
    const week = resourceWeekRows(servers);
    const last7 = week.rows;
    const monthGroups = costGroups(servers, false);
    const annualGroups = costGroups(servers, true);
    const canSeeFinance = !!accessState.logged_in;
    const monthCNY = canSeeFinance ? aggregateCNY(servers, false) : null;
    const annualCNY = canSeeFinance ? aggregateCNY(servers, true) : null;
    const fxLabel = state._fx_source ? (state._fx_source === 'cache' ? '汇率缓存' : state._fx_source === 'stale-cache' ? '旧汇率缓存' : state._fx_source === 'default' ? '备用汇率' : state._fx_source) : '汇率加载中';
    const ranked = servers.filter(function (s) { return Number(s.traffic_limit || 0) > 0 && s.traffic_used != null; }).slice().sort(function (a, b) {
      return pct(b.traffic_used, b.traffic_limit) - pct(a.traffic_used, a.traffic_limit);
    });
    const offlineCount = servers.filter(function (s) { return !s.online; }).length;
    const heat = servers.filter(function (s) { return s.online; }).slice().sort(function (a, b) { return resourcePressure(b) - resourcePressure(a); }).slice(0, 10);
    const soon = servers.filter(function (s) { return s.expires_at_raw && !s.long_term; }).slice().sort(function (a, b) { return a.expires_at_raw.localeCompare(b.expires_at_raw); }).slice(0, 6);
    const t = totals();
    const trafficScope = t.limit ? ("有限额合计 " + fmtBytes(t.limit, 2) + (t.unlimited ? " · 无限流量 " + t.unlimited + " 台" : "")) : "全部无限流量";
    const on = function (key) { return !liveMode || state[key] !== false; };
    let body = '<section class="subpage"><p class="lead">' + t.online + "/" + t.all + " 台在线 · 资源压力仅统计在线节点 · 费用按 Lite 节点账单字段折算。</p>";
    body += '<section class="kpi">' +
      "<article><div class='lbl'>月均成本</div><div class='val cost-value'>" + (!accessState.known ? '…' : !canSeeFinance ? '*' : monthCNY == null ? '—' : ('≈ ¥' + monthCNY.toFixed(2))) + "</div><div class='sub'>" + (!accessState.known ? '正在确认权限' : !canSeeFinance ? '登录后可见' : (h(fxLabel) + " · 原币种 " + costGroupsHTML(monthGroups))) + "</div></article>" +
      "<article><div class='lbl'>年化预算</div><div class='val cost-value'>" + (!accessState.known ? '…' : !canSeeFinance ? '*' : annualCNY == null ? '—' : ('≈ ¥' + annualCNY.toFixed(2))) + "</div><div class='sub'>" + (!accessState.known ? '正在确认权限' : !canSeeFinance ? '登录后可见' : ('按 365.25 天 · 原币种 ' + costGroupsHTML(annualGroups))) + "</div></article>" +
      "<article><div class='lbl'>流量累计</div><div class='val'>" + fmtBytes(t.used, 1) + "</div><div class='sub'>" + h(trafficScope) + "</div></article>" +
      "<article><div class='lbl'>有限额</div><div class='val'>" + servers.filter(function (s) { return s.traffic_limit; }).length + "</div><div class='sub'>台服务器</div></article></section>";
    if (on("show_traffic_7d") || on("show_traffic_quota")) {
      body += '<section class="panels" style="margin-top:16px">';
      if (on("show_traffic_7d")) {
        body += '<div class="panel resource-week-panel"><div class="panel-h"><h3>近 7 日上下行</h3><span class="hero-sub">' + week.observed + '/7 天有记录</span></div>' +
          (week.observed ? ProbeCharts.stacked(last7, { w: 760, h: 110, maxBarWidth: 46, tips: trafficTips(last7) }) : '<div class="chart-empty">暂无近 7 日流量历史</div>') + "</div>";
      }
      if (on("show_traffic_quota")) {
        body += '<div class="panel"><div class="panel-h"><h3>额度使用率</h3></div>' +
          (ranked.length ? ranked.slice(0, 5).map(function (s) {
            const p = pct(s.traffic_used, s.traffic_limit);
            return '<div class="rank" style="margin:10px 0"><div class="reg"><span>' + h(s.name) + "</span><b>" + Math.round(p) + "%</b></div><i style='--p:" + p + "%'></i></div>";
          }).join("") : '<div class="chart-empty">没有设置流量限额的节点</div>') + "</div>";
      }
      body += "</section>";
    }
    if (on("show_resource_heatmap")) {
      body += '<div class="panel" style="margin-top:16px"><div class="panel-h"><h3>资源压力</h3><span class="hero-sub">最高项排序 · 离线 ' + offlineCount + ' 台不参与</span></div>' +
        '<div class="resource-heat-wrap"><table class="heat"><thead><tr><th>服务器</th><th>CPU</th><th>内存</th><th>硬盘</th></tr></thead><tbody>' +
        heat.map(function (s) {
          const mem = pctMetric(s.mem_used, s.mem_total);
          const disk = pctMetric(s.disk_used, s.disk_total);
          const cpu = s.cpu_pct == null ? null : Number(s.cpu_pct);
          return "<tr><td>" + h(s.name) + "</td><td>" + pctText(cpu) + "<i class='bar'><i style='width:" + (cpu == null ? 0 : cpu) + "%'></i></i></td><td>" +
            pctText(mem) + "</td><td>" + pctText(disk) + "</td></tr>";
        }).join("") + "</tbody></table></div></div>";
    }
    if (on("show_renewal_timeline")) {
      body += '<div class="panel" style="margin-top:16px"><div class="panel-h"><h3>续费与到期</h3><span class="hero-sub">按到期日</span></div><div class="timeline">' +
        (soon.length ? soon.map(function (s) {
          return "<article><div>" + h(s.expires_at || "—") + "</div><b>" + h(s.name) + "</b>" + h(remainingDaysText(s)) + "　" + h(canSeeFinance ? renewalText(s) : "*") + "</article>";
        }).join("") : '<div class="hero-sub">暂无可用的到期日期</div>') + "</div></div>";
    }
    setMainHTML(body + "</section>" + cycleBlock());
  }

  function renderBoard(r) {
    if (r.home === "network") renderNetwork();
    else if (r.home === "resource") renderResource();
    else if (r.view === "column") renderColumn(r);
    else if (r.view === "list") renderList(r);
    else renderGrid(r);
  }

  function render() {
    const r = route();
    const params = new URLSearchParams(location.search);
    const demo = params.get("state");
    renderChrome(r);

    if (state._loading) {
      empty("连接 Lite", "正在读取 RPC2 节点与实时状态…");
      renderFoot();
      hideWindow();
      return;
    }
    if (state._error) {
      empty("Lite 数据读取失败", state._error);
      renderFoot();
      hideWindow();
      return;
    }
    if (demo === "error" || state.enabled === false) {
      empty("探针未开启", "当前没有可展示的公开探针数据。");
      renderFoot();
      hideWindow();
      return;
    }
    if (demo === "empty" || !(state.servers && state.servers.length)) {
      empty("暂无节点", "Lite 没有返回可展示的服务器。");
      renderFoot();
      hideWindow();
      return;
    }

    renderBoard(r);
    renderFoot();

    if (r.node != null) renderWindow(r.node, r.page);
    else hideWindow();
    if (window.ProbeFX) ProbeFX.tickCounts(main);
    if (r.home === "nodes") wakeGlobeIdle();
  }

  function openNode(index, page) {
    lastFocus = String(index);
    const node = serverByKey(index);
    targetKey = node && node.ping && node.ping.length ? node.ping[0].key : "";
    latencyTargetKey = "all";
    range = "1h";
    go(viewHash(route().view || lastView, index, page || "overview"));
    loadSeries(index, targetKey || undefined);
    loadSeries(index, "all");
  }

  function onMainClick(ev) {
    const dayBtn = ev.target.closest("[data-day]");
    if (dayBtn) {
      pulseDay = Number(dayBtn.getAttribute("data-day"));
      render();
      return;
    }
    const netBtn = ev.target.closest("[data-net]");
    if (netBtn) {
      netKey = netBtn.getAttribute("data-net") || "";
      netTarget = "all";
      if (netKey) loadSeries(netKey, netTarget).then(render);
      else render();
      return;
    }
    const nett = ev.target.closest("[data-nett]");
    if (nett) {
      netTarget = nett.getAttribute("data-nett");
      if (netKey) loadSeries(netKey, netTarget).then(render);
      else render();
      return;
    }
    const rangeBtn = ev.target.closest("[data-range]");
    if (rangeBtn) {
      range = rangeBtn.getAttribute("data-range");
      if (route().home === "network") {
        if (netKey) loadSeries(netKey, netTarget).then(render);
        else render();
      } else {
        render();
      }
      return;
    }
    const anomalyBtn = ev.target.closest("[data-anomaly-filter]");
    if (anomalyBtn) {
      anomalyFilter = !anomalyFilter;
      render();
      return;
    }
    const clearFilters = ev.target.closest("[data-clear-filters]");
    if (clearFilters) {
      anomalyFilter = false;
      nodeQuery = "";
      regionFilter = "";
      globePinned = false;
      render();
      return;
    }
    const financeBtn = ev.target.closest("[data-finance-detail]");
    if (financeBtn) {
      openFinanceDetail();
      return;
    }
    const sortBtn = ev.target.closest("[data-sort]");
    if (sortBtn) {
      const key = sortBtn.getAttribute("data-sort") || "";
      if (listSortKey !== key) { listSortKey = key; listSortDir = -1; }
      else if (listSortDir < 0) listSortDir = 1;
      else { listSortKey = ""; listSortDir = 0; }
      render();
      return;
    }
    const viewBtn = ev.target.closest("[data-view]");
    if (viewBtn) {
      go(viewHash(viewBtn.getAttribute("data-view"), null, null, "nodes"));
      return;
    }
    const globeBtn = ev.target.closest("[data-globe]");
    if (globeBtn) {
      showGlobe = !showGlobe;
      localStorage.setItem("mmwx-globe", showGlobe ? "1" : "0");
      render();
      return;
    }
    const regionBtn = ev.target.closest("[data-region-filter]");
    if (regionBtn) {
      const selected = regionBtn.getAttribute("data-region-filter") || "";
      if (!selected || regionFilter === selected) {
        regionFilter = "";
        globePinned = false;
        render();
        return;
      }
      regionFilter = selected;
      const lon = regionBtn.getAttribute("data-aim-lon");
      const lat = regionBtn.getAttribute("data-aim-lat");
      const aimCode = regionBtn.getAttribute("data-aim");
      if (!lookAtLocation(lon, lat) && aimCode) { lookAtCountry(aimCode); globePinned = true; }
      render();
      return;
    }
    const aim = ev.target.closest("[data-aim]");
    if (aim) {
      lookAtCountry(aim.getAttribute("data-aim"));
      return;
    }
    if (globeSkipClick) {
      globeSkipClick = false;
      if (ev.target.closest(".atlas")) return;
    }
    const item = ev.target.closest("[data-index]");
    if (!item) return;
    openNode(item.getAttribute("data-index"));
  }

  let searchRenderTimer = 0;
  function onMainInput(ev) {
    const input = ev.target.closest && ev.target.closest('[data-node-search]');
    if (!input) return;
    nodeQuery = input.value || '';
    clearTimeout(searchRenderTimer);
    const caret = input.selectionStart == null ? nodeQuery.length : input.selectionStart;
    searchRenderTimer = setTimeout(function () {
      render();
      requestAnimationFrame(function () {
        const next = main.querySelector('[data-node-search]');
        if (!next) return;
        next.focus({ preventScroll: true });
        try { next.setSelectionRange(caret, caret); } catch (e) {}
      });
    }, 60);
  }

  function onWindowClick(ev) {
    const historyBtn = ev.target.closest("[data-system-history-range]");
    if (historyBtn) {
      systemHistoryRange = historyBtn.getAttribute("data-system-history-range") || "1h";
      const r = route();
      if (r.node != null) renderWindow(r.node, "system");
      return;
    }
    const pageBtn = ev.target.closest("[data-page]");
    if (pageBtn) {
      const r = route();
      go(viewHash(r.view || lastView, r.node, pageBtn.getAttribute("data-page")));
      return;
    }
    const rangeBtn = ev.target.closest("[data-range]");
    if (rangeBtn) {
      range = rangeBtn.getAttribute("data-range");
      Promise.all([loadSeries(route().node), loadSeries(route().node, latencyTargetKey || "all"), loadSeries(route().node, "all")]).then(function () { renderWindow(route().node, route().page); });
      return;
    }
    const latencyTargetBtn = ev.target.closest("[data-latency-target]");
    if (latencyTargetBtn) {
      latencyTargetKey = latencyTargetBtn.getAttribute("data-latency-target") || "all";
      loadSeries(route().node, latencyTargetKey).then(function () { renderWindow(route().node, route().page); });
      return;
    }
    const targetBtn = ev.target.closest("[data-target]");
    if (targetBtn) {
      targetKey = targetBtn.getAttribute("data-target");
      loadSeries(route().node).then(function () { renderWindow(route().node, route().page); });
      return;
    }
  }

  function onKey(ev) {
    if (ev.key === "Escape" && financeOverlay && !financeOverlay.hidden) {
      closeFinanceDetail();
      return;
    }
    if ((ev.key === "Enter" || ev.key === " ") && ev.target && ev.target.closest && ev.target.closest("[data-finance-detail]")) {
      ev.preventDefault();
      openFinanceDetail();
      return;
    }
    if (ev.key === "Escape" && route().node != null) {
      closeWindow();
      return;
    }
    if (ev.target !== document.body && ev.target.tagName !== "BODY" && ev.target.tagName !== "BUTTON") return;
    if (ev.key === "g") go(viewHash("grid", route().node, route().page, "nodes"));
    if (ev.key === "c") go(viewHash("column", route().node, route().page, "nodes"));
    if (ev.key === "l") go(viewHash("list", route().node, route().page, "nodes"));
  }

  setTheme(currentTheme(), { instant: true });
  const themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      setTheme(currentTheme() === "light" ? "dark" : "light", { after: render });
    });
  }

  document.getElementById("site-nav").addEventListener("click", function (ev) {
    const btn = ev.target.closest("[data-home]");
    if (!btn) return;
    const sec = btn.getAttribute("data-home");
    if (sec === "nodes") go(viewHash(lastView || "list", null, null, "nodes"));
    else go(viewHash(lastView, null, null, sec));
  });
  document.getElementById("win-close").addEventListener("click", closeWindow);
  const financeClose = document.getElementById("finance-close");
  if (financeClose) financeClose.addEventListener("click", closeFinanceDetail);
  if (financeOverlay) financeOverlay.addEventListener("click", function (ev) {
    const sortBtn = ev.target.closest && ev.target.closest("[data-finance-sort]");
    if (sortBtn) {
      const key = sortBtn.getAttribute("data-finance-sort") || "";
      if (financeSortKey !== key) { financeSortKey = key; financeSortDir = -1; }
      else if (financeSortDir < 0) financeSortDir = 1;
      else { financeSortKey = ""; financeSortDir = 0; }
      openFinanceDetail(true);
      return;
    }
    if (ev.target === financeOverlay) closeFinanceDetail();
  });
  document.getElementById("win-back").addEventListener("click", closeWindow);
  overlay.addEventListener("click", onWindowClick);
  main.addEventListener("click", onMainClick);
  main.addEventListener("input", onMainInput);
  main.addEventListener("pointerdown", onGlobeDown);
  main.addEventListener("pointermove", onGlobeMove);
  main.addEventListener("pointerup", onGlobeUp);
  main.addEventListener("pointercancel", onGlobeUp);
  main.addEventListener("dblclick", function (ev) {
    if (!ev.target.closest(".atlas")) return;
    globeLon = 80;
    globeLat = 30;
    queueGlobePaint();
    wakeGlobeIdle();
  });
  window.addEventListener("hashchange", render);
  window.addEventListener("keydown", onKey);
  document.addEventListener("mmwx-fx", function () {
    if (main.querySelector(".atlas svg")) queueGlobePaint();
  });

  function rebuildPulse() {
    const servers = state.servers || [];
    const byDate = {};
    servers.forEach(function (s) {
      (s.daily_traffic || []).forEach(function (d) {
        if (!d || !d.date) return;
        if (!byDate[d.date]) byDate[d.date] = { date: d.date, total: 0, peak: s.name, peakV: 0, loss: 0, offline: 0, acc: 0 };
        byDate[d.date].total += d.total || 0;
        if ((d.total || 0) > byDate[d.date].peakV) {
          byDate[d.date].peakV = d.total || 0;
          byDate[d.date].peak = s.name;
        }
      });
    });
    // Month pulse is a calendar-month visualization. Per-node billing reset days
    // only affect traffic-period quota accounting, never the calendar axis here.
    const todayKey = todayKeyInZone(state.billing_timezone || 'Asia/Shanghai');
    const todayParts = todayKey.split('-').map(Number);
    const year = todayParts[0], month = todayParts[1], todayDay = todayParts[2];
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (!pulse.length || !Number.isInteger(pulseDay) || pulseDay < 1 || pulseDay > daysInMonth) pulseDay = todayDay;
    const rows = [];
    let acc = 0;
    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = year + "-" + pad(month) + "-" + pad(d);
      const hit = byDate[date];
      acc += hit ? hit.total : 0;
      rows.push({
        day: d,
        date: date,
        total: hit ? hit.total : 0,
        peak: hit ? hit.peak : "—",
        loss: 0,
        offline: 0,
        acc: acc,
      });
    }
    pulse = rows;
  }

  function nodeMarkup(view, item) {
    if (view === 'column') return slab(item.s, item.i);
    if (view === 'grid') return card(item.s, item.i);
    return row(item.s, item.i);
  }

  function patchDOMAttributes(current, next) {
    const currentAttrs = Array.prototype.slice.call(current.attributes || []);
    currentAttrs.forEach(function (item) {
      if (!next.hasAttribute(item.name)) current.removeAttribute(item.name);
    });
    Array.prototype.forEach.call(next.attributes || [], function (item) {
      if (current.getAttribute(item.name) !== item.value) current.setAttribute(item.name, item.value);
    });
  }

  function patchDOMNode(current, next) {
    if (!current || !next) return current;
    if (current.nodeType !== next.nodeType) {
      const replacement = next.cloneNode(true);
      current.replaceWith(replacement);
      return replacement;
    }
    if (current.nodeType === 3 || current.nodeType === 8) {
      if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      return current;
    }
    if (current.nodeType !== 1) return current;
    if (current.tagName !== next.tagName || current.namespaceURI !== next.namespaceURI) {
      const replacement = next.cloneNode(true);
      current.replaceWith(replacement);
      return replacement;
    }
    if (domPatchFreezeSVG && current.namespaceURI === 'http://www.w3.org/2000/svg') return current;
    if (current.isEqualNode && current.isEqualNode(next)) return current;
    if (current.namespaceURI === 'http://www.w3.org/2000/svg') {
      const replacement = next.cloneNode(true);
      current.replaceWith(replacement);
      return replacement;
    }
    const focused = current === document.activeElement;
    patchDOMAttributes(current, next);
    if (!focused && current.tagName === 'INPUT' && current.value !== next.value) current.value = next.value;
    if (!focused && current.tagName === 'TEXTAREA' && current.value !== next.value) current.value = next.value;
    patchDOMChildren(current, next);
    return current;
  }

  function patchDOMChildren(current, next) {
    let i = 0;
    while (i < next.childNodes.length) {
      const wanted = next.childNodes[i];
      const have = current.childNodes[i];
      if (!have) current.appendChild(wanted.cloneNode(true));
      else patchDOMNode(have, wanted);
      i += 1;
    }
    while (current.childNodes.length > next.childNodes.length) current.removeChild(current.lastChild);
  }

  function htmlElement(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html == null ? '' : html).trim();
    return template.content.firstElementChild || null;
  }

  function patchElementFromHTML(current, html) {
    if (!current) return null;
    const next = htmlElement(html);
    if (!next) return current;
    return patchDOMNode(current, next);
  }

  function patchInnerHTML(target, html) {
    if (!target) return;
    const template = document.createElement('template');
    template.innerHTML = String(html == null ? '' : html);
    patchDOMChildren(target, template.content);
  }

  function patchNodeCollection(view, items) {
    const host = main.querySelector(view === 'column' ? '.stack' : view === 'grid' ? '.board' : '.list');
    if (!host) return false;
    const existing = Array.prototype.filter.call(host.children, function (el) { return el && el.hasAttribute && el.hasAttribute('data-index'); });
    const byKey = Object.create(null);
    existing.forEach(function (el) { byKey[String(el.getAttribute('data-index'))] = el; });
    const expected = Object.create(null);
    let cursor;
    if (view === 'list') {
      const mobileHead = host.querySelector('.mobile-row-h');
      cursor = mobileHead ? mobileHead.nextSibling : host.firstChild;
    } else cursor = host.firstChild;

    items.forEach(function (item) {
      const key = String(item.i);
      expected[key] = true;
      let el = byKey[key] || null;
      if (!el) el = htmlElement(nodeMarkup(view, item));
      else {
        const sig = liveSignature(item.s);
        if (el.getAttribute('data-live-sig') !== sig) el = patchElementFromHTML(el, nodeMarkup(view, item));
      }
      if (!el) return;
      if (el !== cursor) host.insertBefore(el, cursor || null);
      cursor = el.nextSibling;
    });

    existing.forEach(function (el) {
      const key = String(el.getAttribute('data-index'));
      if (!expected[key]) el.remove();
    });
    return true;
  }

  function patchLiveUI(info) {
    const r = route();
    const force = !!(info && info.kind === 'metric-ping');
    domPatchActive = true;
    domPatchFreezeSVG = !!(info && info.kind === 'latest');
    try {
      renderFoot();
      if (r.home === "nodes") {
        const fleet = main.querySelector(".fleet");
        if (fleet) patchElementFromHTML(fleet, fleetStrip());
        const items = listedServers(r.view === "list", true);
        if (!patchNodeCollection(r.view || 'list', items)) renderBoard(r);
        const count = main.querySelector('[data-anomaly-count]');
        if (count) count.textContent = String(anomalySummary().total);
        const notice = main.querySelector('.filter-notice');
        const noticeHTML = anomalyNotice();
        if (notice && noticeHTML) patchElementFromHTML(notice, noticeHTML);
        else if (notice && !noticeHTML) notice.remove();
        globeLiveTick += 1;
        if (globeLiveTick % 6 === 0 && globeViewportReady()) queueGlobePaint();
      } else {
        subpageLiveTick += 1;
        if (force || subpageLiveTick % 3 === 0) renderBoard(r);
      }
      if (r.node != null) renderWindow(r.node, r.page);
    } finally {
      domPatchFreezeSVG = false;
      domPatchActive = false;
    }
  }

  function applyLive(payload, info) {
    if (!payload || payload.enabled === false) return;
    applyFontMode(payload);
    var theme = payload.appearance && payload.appearance.theme;
    var builtin = { follow: 1, flat: 1, pixel: 1, anime: 1, premium: 1 };
    if (theme && builtin[theme] && location.pathname.indexOf("/line-grid") === 0) {
      location.replace("/");
      return;
    }
    state = payload;
    globeQuality = normalizeGlobeQuality(state.globe_quality || "medium");
    state._loading = false;
    state._error = "";
    liveMode = true;
    if (state.title) {
      document.title = state.title;
    }
    if (state.show_globe === false && localStorage.getItem("mmwx-globe") == null) {
      showGlobe = false;
    }
    if (info && (info.kind === "latest" || info.kind === "metric-ping")) {
      if (!globeDrag) patchLiveUI(info);
      return;
    }
    rebuildPulse();
    if (globeDrag) return;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  function loadSeries(index, tgt) {
    if (!liveMode || index == null) return Promise.resolve();
    const t = tgt !== undefined ? tgt : (targetKey || "all");
    const key = String(index) + ":" + range + ":" + (t || "all");
    return ProbeAPI.fetchSeries(index, range, t || "all").then(function (payload) {
      if (payload) seriesPut(key, payload);
      return payload;
    }).catch(function () { return null; });
  }

  const chartPointCache = new WeakMap();

  (function bindChartTip() {
    const tip = document.getElementById("chart-tip");
    if (!tip) return;
    let lastSvg = null;
    document.addEventListener("pointermove", function (ev) {
      const svg = ev.target.closest && ev.target.closest("svg.spark, svg.multi-spark");
      if (lastSvg && lastSvg !== svg) {
        const prev = lastSvg.querySelector(".scope-cur");
        if (prev) prev.setAttribute("hidden", "");
      }
      lastSvg = svg;
      if (svg) {
        const rawPoints = svg.getAttribute("data-pts") || "";
        let cachedPoints = chartPointCache.get(svg);
        if (!cachedPoints || cachedPoints.raw !== rawPoints) {
          cachedPoints = { raw: rawPoints, pack: rawPoints.split(";").map(function (row) {
            const p = row.split(",");
            return { x: Number(p[0]), y: Number(p[1]), v: Number(p[2]) };
          }).filter(function (p) { return Number.isFinite(p.x); }) };
          chartPointCache.set(svg, cachedPoints);
        }
        const pack = cachedPoints.pack;
        const box = svg.getBoundingClientRect();
        const vb = svg.viewBox.baseVal;
        const rawX = ((ev.clientX - box.left) / Math.max(1, box.width)) * vb.width;
        const plotL = Number(svg.getAttribute("data-plot-l") || 0);
        const plotR = Number(svg.getAttribute("data-plot-r") || vb.width);
        const x = Math.max(plotL, Math.min(plotR, rawX));
        let best = pack[0];
        let bestD = 1e9;
        pack.forEach(function (p) {
          const d = Math.abs(p.x - x);
          if (d < bestD) { bestD = d; best = p; }
        });
        const cur = svg.querySelector(".scope-cur");
        if (cur) {
          cur.removeAttribute("hidden");
          const line = cur.querySelector(".scope-v");
          const dot = cur.querySelector(".scope-dot");
          if (line) {
            line.setAttribute("x1", x);
            line.setAttribute("x2", x);
          }
          if (dot && best && Number.isFinite(best.v) && best.v >= 0) {
            dot.removeAttribute("hidden");
            dot.setAttribute("cx", best.x);
            dot.setAttribute("cy", best.y);
          } else if (dot) {
            dot.setAttribute("hidden", "");
          }
        }
      }
      const el = ev.target.closest && ev.target.closest("[data-tip]");
      if (!el) {
        tip.hidden = true;
        return;
      }
      tip.hidden = false;
      tip.textContent = el.getAttribute("data-tip") || "";
      const tx = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
      const ty = Math.min(ev.clientY + 12, window.innerHeight - tip.offsetHeight - 8);
      tip.style.left = tx + "px";
      tip.style.top = ty + "px";
    });
  })();

  setInterval(renderFoot, 10000);

  (function startGlobeIdle() {
    let timer = 0;
    let last = 0;
    const reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

    function schedule(delay) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, Math.max(16, Number(delay) || 16));
    }

    function canAdvance() {
      if (!globeViewportReady() || globeDrag || globePinned) return false;
      if (overlay && !overlay.hidden) return false;
      if (reduce && reduce.matches) return false;
      return true;
    }

    function tick() {
      timer = 0;
      const now = Date.now();
      if (!canAdvance()) {
        last = now;
        schedule(500);
        return;
      }
      const cfg = globeProfile();
      const dt = last ? Math.min(1000, Math.max(cfg.idleMs, now - last)) : cfg.idleMs;
      last = now;
      globeLon = wrapLon(globeLon + dt * 0.0075);
      queueGlobePaint();
      schedule(cfg.idleMs);
    }

    wakeGlobeIdle = function () {
      last = 0;
      schedule(16);
    };
    document.addEventListener("visibilitychange", wakeGlobeIdle);
    window.addEventListener("hashchange", wakeGlobeIdle);
    window.addEventListener("resize", wakeGlobeIdle);
    if (reduce && typeof reduce.addEventListener === "function") reduce.addEventListener("change", wakeGlobeIdle);
    wakeGlobeIdle();
  })();

  function boot() {
    render();
    const bootstrap = ProbeAPI.fetchBootstrap ? ProbeAPI.fetchBootstrap() : ProbeAPI.fetchServers().then(function (payload) {
      const accessUuid = payload && payload.servers && payload.servers[0] && payload.servers[0].uuid;
      return ProbeAPI.fetchAccess(accessUuid).catch(function () {
        return { known: true, logged_in: false, is_admin: false };
      }).then(function (access) { return { payload: payload, access: access }; });
    });
    bootstrap.then(function (result) {
      const payload = result && result.payload ? result.payload : result;
      if (!payload || payload.enabled === false) return;
      if (result && result.access) accessState = result.access;
      applyLive(payload);
      ProbeAPI.connectWS(applyLive);

      let hydrationPayload = payload;
      const hydrationTasks = [];
      if (ProbeAPI.enrich) {
        hydrationTasks.push(ProbeAPI.enrich(payload, { loadFx: accessState.logged_in === true }).then(function (next) {
          if (next) hydrationPayload = next;
        }));
      }
      hydrationTasks.push(ProbeAPI.fetchPingOverview().then(function (next) {
        if (next) hydrationPayload = next;
      }));
      hydrationTasks.push(ProbeAPI.fetchTrafficHistory().then(function (next) {
        if (next) hydrationPayload = next;
      }));
      Promise.allSettled(hydrationTasks).then(function () {
        if (hydrationPayload && hydrationPayload.enabled !== false) applyLive(hydrationPayload, { kind: 'hydration' });
      });
    }).catch(function (err) {
      state = { enabled: true, title: "节点状态", servers: [], _loading: false, _error: err && err.message ? err.message : String(err), _source: "lite-rpc2" };
      liveMode = false;
      render();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else setTimeout(boot, 0);
})();
