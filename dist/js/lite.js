(function (global) {
  'use strict';

  function calcTraffic(up, down, type) {
    if (global.KomariAdapt && typeof global.KomariAdapt.calcTraffic === 'function') {
      return global.KomariAdapt.calcTraffic(up, down, type);
    }
    return Number(up || 0) + Number(down || 0);
  }

  function restoreLitePeriod(payload, latestRaw) {
    if (!payload || payload._runtime !== 'lite' || !Array.isArray(payload.servers)) return payload;
    let latest = latestRaw && latestRaw.data && typeof latestRaw.data === 'object' ? latestRaw.data : (latestRaw || {});
    if (Array.isArray(latest)) {
      const mapped = {};
      latest.forEach(function (row) {
        const id = row && (row.client || row.uuid || row.id);
        if (id) mapped[String(id)] = row;
      });
      latest = mapped;
    }
    payload.servers.forEach(function (server) {
      const live = latest && latest[String(server.uuid)];
      if (!live) return;
      const up = Number(live.net_total_up);
      const down = Number(live.net_total_down);
      if (!Number.isFinite(up) && !Number.isFinite(down)) return;
      const safeUp = Number.isFinite(up) && up >= 0 ? up : 0;
      const safeDown = Number.isFinite(down) && down >= 0 ? down : 0;
      const used = calcTraffic(safeUp, safeDown, server.traffic_limit_type);
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
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }

  function validPublicIPv6(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s || s.indexOf(':') < 0 || s.indexOf('*') >= 0 || /[^0-9a-f:.]/.test(s)) return false;
    if (s === '::' || s === '::1') return false;
    if (/^f[cd]/.test(s)) return false;
    if (/^fe[89ab]/.test(s)) return false;
    if (/^ff/.test(s)) return false;
    return true;
  }

  function isPublicIPLiteral(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.indexOf('*') >= 0) return false;
    return raw.indexOf(':') >= 0 ? validPublicIPv6(raw) : validPublicIPv4(raw);
  }

  if (global.KomariAdapt && typeof global.KomariAdapt.mergeLatest === 'function') {
    const originalMergeLatest = global.KomariAdapt.mergeLatest;
    global.KomariAdapt.mergeLatest = function (payload, latestRaw) {
      const result = originalMergeLatest(payload, latestRaw);
      return restoreLitePeriod(result || payload, latestRaw);
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
      return Promise.resolve(originalEnrichNodes(payload)).finally(function () {
        hidden.forEach(function (item) { item[0]._lookup_ip = item[1]; });
      });
    };
  }

  global.LineGridLite = {
    isPublicIPLiteral: isPublicIPLiteral,
    restoreLitePeriod: restoreLitePeriod,
  };
})(window);
