'use strict';

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error('Runtime fix marker missing: ' + label);
  return source.replace(before, after);
}

function removeFunction(source, name) {
  const marker = '  function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const brace = source.indexOf('{', start);
  if (brace < 0) throw new Error('Cannot find function body: ' + name);

  let depth = 1;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let i = brace + 1;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1] || '';
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error('Unclosed function body: ' + name);
  let end = i + 1;
  while (end < source.length && (source[end] === ' ' || source[end] === '\t')) end += 1;
  if (source[end] === '\n') end += 1;
  if (source[end] === '\n') end += 1;
  return source.slice(0, start) + source.slice(end);
}

function fixApp(input) {
  let source = String(input || '');

  source = replaceRequired(
    source,
    '  function fmtDays(sec) {\n    if (sec == null) return "—";\n    return Math.floor(sec / U.DAY) + " 天";\n  }\n',
    '  function fmtDays(sec) {\n    const value = Number(sec);\n    if (!Number.isFinite(value) || value < 0) return "—";\n    if (value < 3600) return Math.floor(value / 60) + " 分";\n    if (value < 86400) return Math.floor(value / 3600) + " 小时";\n    return Math.floor(value / 86400) + " 天";\n  }\n',
    'uptime formatter'
  );

  source = replaceRequired(
    source,
    '    if (q === "low") return { key: "low", land: "coarse", coastStride: 1, gridLon: 60, gridLat: 30, curveStep: 8, sweepCount: 0, linkMode: 0, idleMs: 440 };\n    if (q === "high") return { key: "high", land: "detailed", coastStride: 1, gridLon: 30, gridLat: 30, curveStep: 3, sweepCount: 6, linkMode: 2, idleMs: 120 };\n    return { key: "medium", land: "detailed", coastStride: 2, gridLon: 30, gridLat: 30, curveStep: 6, sweepCount: 2, linkMode: 1, idleMs: 240 };\n',
    '    if (q === "low") return { key: "low", land: "coarse", coastStride: 1, gridLon: 60, gridLat: 30, curveStep: 8, sweepCount: 0, linkMode: 0, idleMs: 90 };\n    if (q === "high") return { key: "high", land: "detailed", coastStride: 2, gridLon: 30, gridLat: 30, curveStep: 4, sweepCount: 4, linkMode: 2, idleMs: 48 };\n    return { key: "medium", land: "detailed", coastStride: 3, gridLon: 30, gridLat: 30, curveStep: 7, sweepCount: 1, linkMode: 1, idleMs: 64 };\n',
    'globe profiles'
  );
  source = replaceRequired(
    source,
    '      globeLon = wrapLon(globeLon + dt * 0.00255);\n',
    '      globeLon = wrapLon(globeLon + dt * 0.0075);\n',
    'globe rotation speed'
  );

  source = replaceRequired(
    source,
    '    const sourceLabel = s.traffic_source === \'metric_period\' ? \'Metric Store · 当前账期\' : s.traffic_source === \'record_period\' ? \'历史记录差分 · 当前账期\' : \'当前账期数据不可用\';\n',
    '    const resetDays = trafficResetDays(s);\n    const cycleLabel = s.period_start && s.period_end ? (\'账期 \' + s.period_start.slice(5) + \' → \' + s.period_end.slice(5)) : \'当前账期\';\n    const cycleHint = resetDays == null ? cycleLabel : (cycleLabel + \' · \' + resetDays + \' 天后重置\');\n    const historyLabel = ctx.last7.length ? (\'已有 \' + ctx.last7.length + \' 天历史\') : \'暂无历史流量\';\n',
    'traffic labels'
  );
  source = replaceRequired(
    source,
    "        '<div class=\"traffic-forecast' + (forecast && forecast.kind === 'bad' ? ' is-bad' : forecast && forecast.kind === 'good' ? ' is-good' : '') + '\"><span>流量预测</span><b>' + h(forecast ? forecast.text : '暂无额度或历史数据') + '</b><small>' + h(sourceLabel) + '</small></div>' +\n",
    "        '<div class=\"traffic-forecast' + (forecast && forecast.kind === 'bad' ? ' is-bad' : forecast && forecast.kind === 'good' ? ' is-good' : '') + '\"><span>流量预测</span><b>' + h(forecast ? forecast.text : (s.traffic_limit ? '历史数据不足，暂不预测' : '无限额，无需额度预测')) + '</b><small>' + h(cycleHint) + '</small></div>' +\n",
    'traffic forecast copy'
  );
  source = replaceRequired(
    source,
    "          '<article><div class=\"lbl\">本账期上行</div><div class=\"val\">' + fmtBytes(s.traffic_used_up, 1) + '</div><div class=\"sub\">' + h(sourceLabel) + '</div></article>' +\n          '<article><div class=\"lbl\">本账期下行</div><div class=\"val\">' + fmtBytes(s.traffic_used_down, 1) + '</div><div class=\"sub\">' + h(sourceLabel) + '</div></article>' +\n",
    "          '<article><div class=\"lbl\">本账期上行</div><div class=\"val\">' + fmtBytes(s.traffic_used_up, 1) + '</div><div class=\"sub\">' + h(cycleLabel) + '</div></article>' +\n          '<article><div class=\"lbl\">本账期下行</div><div class=\"val\">' + fmtBytes(s.traffic_used_down, 1) + '</div><div class=\"sub\">' + h(cycleLabel) + '</div></article>' +\n",
    'traffic cycle subtitles'
  );
  source = replaceRequired(
    source,
    "        '<div class=\"chart-fill\"><div class=\"panel-h\"><h3>近 7 日流量</h3><span class=\"hero-sub\">' + h(sourceLabel) + \"</span></div>\" +\n",
    "        '<div class=\"chart-fill\"><div class=\"panel-h\"><h3>近 7 日流量</h3><span class=\"hero-sub\">' + h(historyLabel) + \"</span></div>\" +\n",
    'traffic history subtitle'
  );

  source = replaceRequired(
    source,
    '      ["IPv4", maskIP(s.ipv4)],\n      ["IPv6", maskIP(s.ipv6)],\n',
    '      ["IPv4", s.ipv4 || "—"],\n      ["IPv6", s.ipv6 || "—"],\n',
    'backend-authorized IP display'
  );
  source = replaceRequired(
    source,
    "        '<span class=\"name\">' + h(server.name || \"未命名\") + \"</span>\" +\n        statusHTML(server, false) +\n",
    "        '<span class=\"name node-name\">' + h(server.name || \"未命名\") + ((server.ipv4 || server.ipv6) ? '<small class=\"node-ip\">' + h(server.ipv4 || server.ipv6) + '</small>' : '') + \"</span>\" +\n        statusHTML(server, false) +\n",
    'list IP display'
  );
  source = replaceRequired(
    source,
    '      ? ("在线 " + fmtDays(s.uptime))\n',
    '      ? ("运行 " + fmtDays(s.uptime))\n',
    'detail uptime wording'
  );
  source = removeFunction(source, 'maskIP');

  return source;
}

function fixCharts(input) {
  let source = String(input || '');
  const layout = [
    '    const slotCount = Math.max(vals.length, Number(opt.slotCount) || 7);',
    '    const slotW = w / Math.max(slotCount, 1);',
    '    const bw = Math.max(4, Math.min(Number(opt.maxBarWidth) || 56, slotW * 0.62));',
    '    const slotOffset = Math.max(0, slotCount - vals.length);',
  ].join('\n') + '\n';
  source = replaceRequired(
    source,
    '    const gap = 6;\n    const bw = (w - gap * (vals.length + 1)) / Math.max(vals.length, 1);\n',
    layout,
    'bar slot layout'
  );
  source = replaceRequired(
    source,
    '      const x = gap + i * (bw + gap);\n',
    '      const x = (slotOffset + i) * slotW + (slotW - bw) / 2;\n',
    'bar x position'
  );
  return source;
}

function fixAdapter(input) {
  let source = String(input || '');
  source = replaceRequired(
    source,
    '      ipv4: maskIPv4(node.ipv4),\n      ipv6: maskIPv6(node.ipv6),\n',
    '      ipv4: String(node.ipv4 || \'\'),\n      ipv6: String(node.ipv6 || \'\'),\n',
    'preserve backend IP authorization'
  );
  source = replaceRequired(
    source,
    '      connections_tcp: hasLive ? numberOrNull(live.connections) : null,\n      connections_udp: hasLive ? numberOrNull(live.connections_udp) : null,\n',
    '      connections_tcp: hasLive ? Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0)) : null,\n      connections_udp: hasLive ? numberOrNull(live.connections_udp) : null,\n',
    'initial TCP connection count'
  );
  source = replaceRequired(
    source,
    '    server.connections_tcp = numberOrNull(live.connections);\n    server.connections_udp = numberOrNull(live.connections_udp);\n',
    '    server.connections_tcp = Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0));\n    server.connections_udp = numberOrNull(live.connections_udp);\n',
    'live TCP connection count'
  );
  source = removeFunction(source, 'maskIPv4');
  source = removeFunction(source, 'maskIPv6');
  return source;
}

function fixLite(input) {
  let source = String(input || '');
  source = removeFunction(source, 'normalizeLiteTrafficUI');
  source = removeFunction(source, 'setTextIfChanged');
  source = replaceRequired(source, '    normalizeLiteTrafficUI();\n', '', 'obsolete traffic DOM rewrite');
  return source;
}

module.exports = { fixApp, fixCharts, fixAdapter, fixLite };
