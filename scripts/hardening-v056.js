'use strict';

function findFunctionStart(source, name) {
  const markers = ['  function ' + name + '(', '  async function ' + name + '('];
  for (const marker of markers) {
    const start = source.indexOf(marker);
    if (start >= 0) return start;
  }
  throw new Error('v0.5.6 hardening function missing: ' + name);
}

function functionBounds(source, name) {
  const start = findFunctionStart(source, name);
  const brace = source.indexOf('{', start);
  let depth = 1, quote = '', escaped = false, line = false, block = false, i = brace + 1;
  for (; i < source.length; i += 1) {
    const ch = source[i], next = source[i + 1] || '';
    if (line) { if (ch === '\n') line = false; continue; }
    if (block) { if (ch === '*' && next === '/') { block = false; i += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '/' && next === '/') { line = true; i += 1; continue; }
    if (ch === '/' && next === '*') { block = true; i += 1; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) break;
  }
  if (depth !== 0) throw new Error('v0.5.6 hardening unclosed function: ' + name);
  let end = i + 1;
  while (end < source.length && /[ \t]/.test(source[end])) end += 1;
  if (source[end] === '\n') end += 1;
  if (source[end] === '\n') end += 1;
  return { start, end };
}

function replaceFunction(source, name, body) {
  const b = functionBounds(source, name);
  return source.slice(0, b.start) + body.trimEnd() + '\n\n' + source.slice(b.end);
}

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error('v0.5.6 hardening marker missing: ' + label);
  return source.replace(before, after);
}

function hardenEnrich(input) {
  let source = String(input || '');
  source = replaceRequired(source, "const FX_CACHE_KEY = 'linegrid:fx:cny:v1';", "const FX_CACHE_KEY = 'linegrid:fx:cny:v2';", 'FX cache schema');
  source = replaceFunction(source, 'enrichNodes', [
    '  async function enrichNodes(payload) {',
    '    if (!payload || !Array.isArray(payload.servers)) return payload;',
    '    // Disabled means disabled: do not even apply browser-cached GeoIP-derived',
    '    // city/coordinate data. Explicit Lite/metadata fields remain untouched.',
    '    if (payload.enable_ip_geo_asn !== true) return payload;',
    '',
    '    payload.servers.forEach(function (server) {',
    '      if (!server || !server.uuid) return;',
    '      const cached = cacheRead(publicGeoKey(server.uuid), GEO_CACHE_TTL);',
    '      if (cached && validGeo(cached)) applyGeo(server, cached, false);',
    '    });',
    '',
    "    const nodes = payload.servers.filter(function (s) { return s && s._lookup_ip && String(s._lookup_ip).indexOf('*') < 0; });",
    '    const batchSize = 4;',
    "    const lookupOptions = { provider: payload.geo_ip_provider || 'ip.sb', fallback: payload.geo_ip_fallback === true };",
    '    for (let i = 0; i < nodes.length; i += batchSize) {',
    '      const batch = nodes.slice(i, i + batchSize);',
    '      const results = await Promise.all(batch.map(function (s) {',
    '        return lookupIpGeo(s._lookup_ip, lookupOptions).then(function (geo) { return { s: s, geo: geo }; });',
    '      }));',
    '      results.forEach(function (r) {',
    '        if (!r.geo) return;',
    '        const s = r.s, g = r.geo;',
    '        applyGeo(s, g, true);',
    '        if (s.uuid) {',
    '          const safe = publicGeo(g);',
    '          if (safe) cacheWrite(publicGeoKey(s.uuid), safe);',
    '        }',
    '      });',
    '    }',
    '    payload._geo_enriched = true;',
    '    return payload;',
    '  }'
  ].join('\n'));
  source = replaceFunction(source, 'normalizeCurrency', [
    '  function normalizeCurrency(value) {',
    "    const s = String(value == null || value === '' ? 'CNY' : value).trim().toUpperCase();",
    "    if (s === '$' || s === 'US$') return 'USD';",
    "    if (s === 'HK$') return 'HKD';",
    "    if (s === '€') return 'EUR';",
    "    if (s === '£') return 'GBP';",
    "    if (s === '¥' || s === '￥' || s === 'RMB' || s === 'CNH') return 'CNY';",
    "    return /^[A-Z]{3}$/.test(s) ? s : '';",
    '  }'
  ].join('\n'));
  source = replaceFunction(source, 'sanitizeRates', [
    '  function sanitizeRates(raw) {',
    "    if (!raw || typeof raw !== 'object') return null;",
    '    const out = Object.assign({}, FX_DEFAULT, { CNY: 1 });',
    '    let count = 0;',
    '    Object.keys(raw).forEach(function (rawCode) {',
    '      const code = String(rawCode || "").trim().toUpperCase();',
    "      if (code === 'CNY' || !/^[A-Z]{3}$/.test(code)) return;",
    '      const v = number(raw[rawCode]);',
    '      if (v != null && v > 0) { out[code] = v; count += 1; }',
    '    });',
    '    return count >= 4 ? out : null;',
    '  }'
  ].join('\n'));
  return source;
}

function hardenApi(input) {
  let source = String(input || '');
  source = replaceRequired(source, '  let pollHandle = null;\n', '', 'unused poll handle state');
  source = replaceFunction(source, 'fetchPingOverview', [
    '  function fetchPingOverview() {',
    '    if (!lastPayload) return Promise.resolve(null);',
    "    return rpc('common:getRecords', { type: 'ping', uuid: '', hours: 1, task_id: -1, maxCount: 8000 }, 12000)",
    '      .then(function (raw) {',
    '        LiteAdapt.mergePingHistory(lastPayload, raw);',
    '        return lastPayload;',
    '      })',
    '      .catch(function () {',
    "        lastPayload._ping_history_status = 'unavailable';",
    '        return lastPayload;',
    '      });',
    '  }'
  ].join('\n'));
  source = replaceFunction(source, 'connectWS', [
    '  function connectWS(onPayload) {',
    '    let stopped = false;',
    '    let running = false;',
    '    let timer = null;',
    '    let statusTick = 0;',
    '',
    '    function clear() {',
    '      if (timer) clearTimeout(timer);',
    '      timer = null;',
    '    }',
    '',
    '    function schedule() {',
    '      clear();',
    '      if (!stopped && !document.hidden) timer = setTimeout(refresh, 2000);',
    '    }',
    '',
    '    function refresh() {',
    '      if (stopped || running || document.hidden || !lastPayload) return;',
    '      running = true;',
    '      statusTick += 1;',
    '      // High-frequency status refreshes do not need the relatively expensive',
    '      // Ping summary. Refresh Ping once per minute; initial fetch is already full.',
    '      const includePing = statusTick % 30 === 0;',
    "      rpc('common:getNodesLatestStatus', includePing ? {} : { compact: true }, 8000)",
    '        .then(function (latest) {',
    '          if (stopped) return;',
    '          LiteAdapt.mergeLatest(lastPayload, latest);',
    "          if (typeof onPayload === 'function') onPayload(lastPayload, { kind: 'latest', ping: includePing });",
    '        })',
    '        .catch(function () {})',
    '        .finally(function () {',
    '          running = false;',
    '          schedule();',
    '        });',
    '    }',
    '',
    '    function visible() {',
    '      if (document.hidden) clear();',
    '      else if (!running) {',
    '        // Force a full refresh after returning to the tab so Ping badges do not',
    '        // remain stale after a long suspension.',
    '        statusTick = 29;',
    '        refresh();',
    '      }',
    '    }',
    '',
    "    document.addEventListener('visibilitychange', visible);",
    '    schedule();',
    '    return {',
    '      close: function () {',
    '        stopped = true;',
    '        clear();',
    "        document.removeEventListener('visibilitychange', visible);",
    '      },',
    '    };',
    '  }'
  ].join('\n'));
  return source;
}

function hardenLite(input) {
  let source = String(input || '');
  source = replaceFunction(source, 'validPublicIPv4', [
    '  function validPublicIPv4(raw) {',
    "    const m = String(raw || '').match(/^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$/);",
    '    if (!m) return false;',
    '    const p = m.slice(1).map(Number);',
    '    if (p.some(function (n) { return n < 0 || n > 255; })) return false;',
    '    const a = p[0], b = p[1], c = p[2];',
    '    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;',
    '    if (a === 100 && b >= 64 && b <= 127) return false;',
    '    if (a === 169 && b === 254) return false;',
    '    if (a === 172 && b >= 16 && b <= 31) return false;',
    '    if (a === 192 && b === 168) return false;',
    '    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;',
    '    if (a === 198 && (b === 18 || b === 19)) return false;',
    '    if (a === 198 && b === 51 && c === 100) return false;',
    '    if (a === 203 && b === 0 && c === 113) return false;',
    '    return true;',
    '  }'
  ].join('\n'));
  source = replaceFunction(source, 'validPublicIPv6', [
    '  function validPublicIPv6(raw) {',
    "    const value = String(raw || '').trim().toLowerCase();",
    "    if (!value || value.indexOf(':') < 0 || value.indexOf('*') >= 0 || /[^0-9a-f:.]/.test(value)) return false;",
    '    // Do not send IPv4-mapped/embedded dotted literals to third-party GeoIP;',
    '    // validating their embedded IPv4 semantics here would be error-prone.',
    "    if (value.indexOf('.') >= 0) return false;",
    "    if (value === '::' || value === '::1') return false;",
    '    if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value) || /^ff/.test(value)) return false;',
    '    if (/^2001:db8(?::|$)/.test(value)) return false;',
    '    return true;',
    '  }'
  ].join('\n'));
  return source;
}

function hardenApp(input) {
  let source = String(input || '');
  source = replaceFunction(source, 'resourcePressure', [
    '  function resourcePressure(server) {',
    '    const values = [server && server.cpu_pct, pctMetric(server && server.mem_used, server && server.mem_total), pctMetric(server && server.disk_used, server && server.disk_total)]',
    "      .filter(function (value) { return value != null && value !== ''; })",
    '      .map(Number).filter(Number.isFinite);',
    '    return values.length ? Math.max.apply(null, values) : -1;',
    '  }'
  ].join('\n'));
  source = replaceFunction(source, 'anomalyDetails', [
    '  function anomalyDetails(server) {',
    '    const out = [];',
    "    if (!server || !server.online) out.push({ key: 'offline', label: '离线', tone: 'bad' });",
    '    const pings = server && server.online && Array.isArray(server.ping) ? server.ping : [];',
    '    const latencies = pings.map(function (p) { return Number(p && p.current_ms); }).filter(function (v) { return Number.isFinite(v) && v >= 0; });',
    '    const losses = pings.map(function (p) { return Number(p && p.loss_pct); }).filter(function (v) { return Number.isFinite(v) && v >= 0; });',
    '    const ms = latencies.length ? Math.max.apply(null, latencies) : null;',
    '    const loss = losses.length ? Math.max.apply(null, losses) : null;',
    '    const traffic = trafficQuotaPct(server);',
    '    const expiry = expiryDeltaDays(server);',
    '    const pressure = server && server.online ? resourcePressure(server) : -1;',
    "    if (loss != null && loss >= 10) out.push({ key: 'loss', label: '丢包 ' + lossText(loss), tone: loss >= 20 ? 'bad' : 'hot' });",
    "    if (ms != null && ms > 180) out.push({ key: 'latency', label: '延迟 ' + Math.round(ms) + 'ms', tone: ms >= 250 ? 'bad' : 'hot' });",
    "    if (pressure >= 90) out.push({ key: 'resource', label: '资源 ' + Math.round(pressure) + '%', tone: pressure >= 95 ? 'bad' : 'hot' });",
    "    if (traffic != null && traffic >= 90) out.push({ key: 'traffic', label: '流量 ' + Math.round(traffic) + '%', tone: traffic >= 98 ? 'bad' : 'hot' });",
    "    if (expiry != null && expiry < 0) out.push({ key: 'expiry', label: '已过期 ' + Math.abs(expiry) + '天', tone: 'bad' });",
    "    else if (expiry != null && expiry <= 7) out.push({ key: 'expiry', label: expiry === 0 ? '今天到期' : (expiry + '天到期'), tone: expiry <= 3 ? 'bad' : 'hot' });",
    '    return out;',
    '  }'
  ].join('\n'));
  source = replaceFunction(source, 'financeSummaryHTML', [
    '  function financeSummaryHTML(rows, masked) {',
    '    let monthly = 0, monthlyCount = 0, remaining = 0, remainingCount = 0;',
    '    let free = 0, oneTime = 0, due30 = 0, expired = 0;',
    '    (rows || []).forEach(function (row) {',
    '      if (row.monthly != null && Number.isFinite(Number(row.monthly))) { monthly += Number(row.monthly); monthlyCount += 1; }',
    '      if (row.remainingValue != null && Number.isFinite(Number(row.remainingValue))) { remaining += Number(row.remainingValue); remainingCount += 1; }',
    '      if (Number(row.server && row.server.price) === -1) free += 1;',
    '      if (Number(row.server && row.server.billing_cycle) === -1) oneTime += 1;',
    '      const d = expiryDeltaDays(row.server);',
    '      if (d != null && d < 0) expired += 1;',
    '      else if (d != null && d <= 30) due30 += 1;',
    '    });',
    '    const annual = accessState.logged_in ? aggregateCNY(state.servers || [], true) : null;',
    "    const value = function (n, suffix) { return masked ? '*' : (n == null || !Number.isFinite(Number(n)) ? '—' : ('≈ ¥' + Number(n).toFixed(2) + (suffix || ''))); };",
    "    return '<section class=\"finance-summary\">' +",
    "      '<article><span>月均总计</span><b>' + value(monthlyCount ? monthly : null, '') + '</b><small>周期账单 ' + monthlyCount + ' 台 · 免费 ' + free + ' · 一次性 ' + oneTime + '</small></article>' +",
    "      '<article><span>年化预算</span><b>' + value(annual, '') + '</b><small>按 365.25 天折算</small></article>' +",
    "      '<article><span>剩余价值</span><b>' + value(remainingCount ? remaining : null, '') + '</b><small>按剩余天数估算</small></article>' +",
    "      '<article><span>到期风险</span><b>' + (expired + due30) + ' 台</b><small>已过期 ' + expired + ' · 30 天内 ' + due30 + '</small></article>' +",
    "    '</section>';",
    '  }'
  ].join('\n'));
  source = replaceFunction(source, 'renderFoot', [
    '  function renderFoot() {',
    '    const t = totals();',
    '    const trafficScope = t.limit ? ("有限额合计 " + fmtBytes(t.limit, 2) + (t.unlimited ? " · 无限流量 " + t.unlimited + " 台" : "")) : "全部无限流量";',
    '    const stamps = (state.servers || []).map(function (server) { return Number(server && server.last_seen_at); }).filter(Number.isFinite);',
    '    const latestAt = stamps.length ? Math.max.apply(null, stamps) : null;',
    '    const ageSeconds = latestAt == null ? null : Math.max(0, Math.floor((Date.now() - latestAt) / 1000));',
    '    const stale = liveMode && ageSeconds != null && ageSeconds > 15;',
    '    const source = !liveMode ? "连接中" : (stale ? ("Lite RPC2 · 状态 " + ageSeconds + "s 前") : "Lite RPC2");',
    '    const statusTime = latestAt == null ? "—" : clock(new Date(latestAt));',
    '    foot.innerHTML =',
    '      "<div>总使用流量　<b>" + fmtBytes(t.used, 2) + "</b>　" + h(trafficScope) + "</div>" +',
    '      "<div>在线服务器　<b>" + t.online + " / " + t.all + "</b></div>" +',
    '      "<div class=\'foot-update\'><span>状态时间　<b>" + h(statusTime) + "</b></span><span class=\'foot-meta\'>" + h(source) + "　·　Line Grid · Lite</span></div>";',
    '  }'
  ].join('\n'));
  source = replaceRequired(source,
    '  (function bindChartTip() {\n',
    '  const chartPointCache = new WeakMap();\n\n  (function bindChartTip() {\n',
    'chart point cache declaration');
  source = replaceRequired(source,
    '        const pack = (svg.getAttribute("data-pts") || "").split(";").map(function (row) {\n          const p = row.split(",");\n          return { x: Number(p[0]), y: Number(p[1]), v: Number(p[2]) };\n        }).filter(function (p) { return Number.isFinite(p.x); });\n',
    '        const rawPoints = svg.getAttribute("data-pts") || "";\n        let cachedPoints = chartPointCache.get(svg);\n        if (!cachedPoints || cachedPoints.raw !== rawPoints) {\n          cachedPoints = { raw: rawPoints, pack: rawPoints.split(";").map(function (row) {\n            const p = row.split(",");\n            return { x: Number(p[0]), y: Number(p[1]), v: Number(p[2]) };\n          }).filter(function (p) { return Number.isFinite(p.x); }) };\n          chartPointCache.set(svg, cachedPoints);\n        }\n        const pack = cachedPoints.pack;\n',
    'chart tooltip parsing cache');
  source = replaceRequired(source, '  setInterval(renderFoot, 1000);\n', '  setInterval(renderFoot, 10000);\n', 'footer refresh cadence');
  return source;
}

module.exports = { hardenEnrich, hardenApi, hardenLite, hardenApp };
