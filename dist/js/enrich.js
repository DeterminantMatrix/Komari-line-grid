(function (global) {
  'use strict';

  const GEO_CACHE_PREFIX = 'linegrid:geo:v1:';
  const GEO_PUBLIC_PREFIX = 'linegrid:geo-public:v1:';
  const GEO_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
  const GEO_NEG_TTL = 6 * 60 * 60 * 1000;
  const FX_CACHE_KEY = 'linegrid:fx:cny:v1';
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
  let geoCursor = 0;

  function lookupIpGeo(ip) {
    const raw = String(ip || '').trim();
    if (!raw || raw.indexOf('*') >= 0) return Promise.resolve(null);
    const cacheKey = GEO_CACHE_PREFIX + hashKey(raw);
    const cached = cacheRead(cacheKey, GEO_CACHE_TTL);
    if (cached && validGeo(cached)) return Promise.resolve(cached);
    const neg = cacheRead(cacheKey + ':neg', GEO_NEG_TTL);
    if (neg) return Promise.resolve(null);
    if (inflightGeo.has(raw)) return inflightGeo.get(raw);
    const start = geoCursor++ % GEO_PROVIDERS.length;
    const ordered = GEO_PROVIDERS.slice(start).concat(GEO_PROVIDERS.slice(0, start));
    const task = (async function () {
      for (let i = 0; i < ordered.length; i += 1) {
        try {
          const res = await withTimeout(ordered[i].url(raw), 5000);
          if (!res.ok) continue;
          const data = await res.json();
          const geo = ordered[i].parse(data);
          if (validGeo(geo)) {
            cacheWrite(cacheKey, geo);
            return geo;
          }
        } catch (e) {}
      }
      cacheWrite(cacheKey + ':neg', true);
      return null;
    })();
    inflightGeo.set(raw, task);
    return task.finally(function () { inflightGeo.delete(raw); });
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

    // A sanitized city/coordinate cache is keyed only by node UUID. It contains
    // no IP, ASN or organisation data, so logged-out views can still keep the
    // same city-level region labels without exposing administrator-only data.
    payload.servers.forEach(function (server) {
      if (!server || !server.uuid) return;
      const cached = cacheRead(publicGeoKey(server.uuid), GEO_CACHE_TTL);
      if (cached && validGeo(cached)) applyGeo(server, cached, false);
    });

    if (payload.enable_ip_geo_asn !== true) return payload;
    const nodes = payload.servers.filter(function (s) { return s && s._lookup_ip && String(s._lookup_ip).indexOf('*') < 0; });
    const batchSize = 4;
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(function (s) {
        return lookupIpGeo(s._lookup_ip).then(function (geo) { return { s: s, geo: geo }; });
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
    const s = String(value || 'CNY').trim().toUpperCase();
    if (s === '$') return 'USD';
    if (s === 'HK$') return 'HKD';
    if (s === '€') return 'EUR';
    if (s === '£') return 'GBP';
    if (s === '¥' || s === '￥' || s === 'RMB' || s === 'CNH') return 'CNY';
    return FX_DEFAULT[s] != null ? s : 'CNY';
  }

  function sanitizeRates(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const out = Object.assign({}, FX_DEFAULT, { CNY: 1 });
    let count = 0;
    Object.keys(FX_DEFAULT).forEach(function (code) {
      if (code === 'CNY') return;
      const v = number(raw[code]);
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
