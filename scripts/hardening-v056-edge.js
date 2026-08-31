'use strict';

function functionBounds(source, name) {
  const marker = '  function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('v0.5.6 edge hardening function missing: ' + name);
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
  if (depth !== 0) throw new Error('v0.5.6 edge hardening unclosed function: ' + name);
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

function hardenAppEdge(input) {
  let source = String(input || '');
  source = replaceFunction(source, 'pingMs', [
    '  function pingMs(server) {',
    '    const p = primaryPing(server);',
    '    if (!p || p.current_ms == null) return null;',
    '    const v = Number(p.current_ms);',
    '    return Number.isFinite(v) && v >= 0 ? v : null;',
    '  }'
  ].join('\n'));
  source = replaceFunction(source, 'latencyTone', [
    '  function latencyTone(ms) {',
    "    if (ms == null || ms === '') return '';",
    '    const v = Number(ms);',
    '    if (!Number.isFinite(v) || v < 0) return "";',
    '    if (v > 180) return " is-bad";',
    '    if (v > 80) return " is-hot";',
    '    return " is-good";',
    '  }'
  ].join('\n'));
  source = replaceFunction(source, 'lossTone', [
    '  function lossTone(value) {',
    "    if (value == null || value === '') return '';",
    '    const v = Number(value);',
    '    if (!Number.isFinite(v) || v < 0) return "";',
    '    if (v >= 10) return " is-bad";',
    '    if (v >= 1) return " is-hot";',
    '    return " is-good";',
    '  }'
  ].join('\n'));
  source = replaceFunction(source, 'anomalyDetails', [
    '  function anomalyDetails(server) {',
    '    const out = [];',
    "    if (!server || !server.online) out.push({ key: 'offline', label: '离线', tone: 'bad' });",
    '    const pings = server && server.online && Array.isArray(server.ping) ? server.ping : [];',
    '    const latencies = pings.map(function (p) { return p && p.current_ms != null ? Number(p.current_ms) : null; }).filter(function (v) { return v != null && Number.isFinite(v) && v >= 0; });',
    '    const losses = pings.map(function (p) { return p && p.loss_pct != null ? Number(p.loss_pct) : null; }).filter(function (v) { return v != null && Number.isFinite(v) && v >= 0; });',
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
  return source;
}

module.exports = { hardenAppEdge };
