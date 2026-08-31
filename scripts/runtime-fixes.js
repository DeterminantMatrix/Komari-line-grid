'use strict';

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error('Runtime fix marker missing: ' + label);
  return source.replace(before, after);
}

function replaceAllRequired(source, before, after, label, expectedCount) {
  const count = source.split(before).length - 1;
  if (!count) throw new Error('Runtime fix marker missing: ' + label);
  if (expectedCount != null && count !== expectedCount) {
    throw new Error('Runtime fix marker count mismatch: ' + label + ' expected=' + expectedCount + ' actual=' + count);
  }
  return source.split(before).join(after);
}

function removeFunction(source, name) {
  const marker = '  function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const brace = source.indexOf('{', start);
  if (brace < 0) throw new Error('Cannot find function body: ' + name);
  let depth = 1, quote = '', escaped = false, lineComment = false, blockComment = false;
  let i = brace + 1;
  for (; i < source.length; i += 1) {
    const ch = source[i], next = source[i + 1] || '';
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
    else if (ch === '}' && --depth === 0) break;
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

  source = replaceAllRequired(source, '["1h", "6h", "24h"]', '["1h", "6h", "24h", "7D"]', '7D latency controls', 3);
  source = replaceRequired(
    source,
    '    const hours = range === "24h" ? 24 : range === "6h" ? 6 : 1;\n',
    '    const hours = range === "7D" ? 168 : range === "24h" ? 24 : range === "6h" ? 6 : 1;\n',
    '7D latency axis range'
  );
  source = replaceRequired(
    source,
    '    function tm(ts) {\n      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });\n    }\n',
    '    function tm(ts) {\n      const d = new Date(ts);\n      if (range === "7D") return pad(d.getMonth() + 1) + "-" + pad(d.getDate());\n      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });\n    }\n',
    '7D latency axis labels'
  );
  source = replaceRequired(
    source,
    '  function pingTips(values, stepMin) {\n    const n = (values || []).length;\n    const step = stepMin || 5;\n    return (values || []).map(function (v, i) {\n      const t = new Date(Date.now() - (n - 1 - i) * step * 60000);\n      const clock = pad(t.getHours()) + ":" + pad(t.getMinutes());\n      return clock + "  " + (v < 0 ? "无数据" : v + " ms");\n    });\n  }\n',
    '  function pingTips(values, stepMin) {\n    const n = (values || []).length;\n    const step = stepMin || 5;\n    return (values || []).map(function (v, i) {\n      const t = new Date(Date.now() - (n - 1 - i) * step * 60000);\n      const clock = range === "7D" ? (pad(t.getMonth() + 1) + "-" + pad(t.getDate()) + " " + pad(t.getHours()) + ":" + pad(t.getMinutes())) : (pad(t.getHours()) + ":" + pad(t.getMinutes()));\n      return clock + "  " + (v < 0 ? "无数据" : v + " ms");\n    });\n  }\n\n  function rangeStepMinutes(values) {\n    const n = (values || []).length;\n    const span = range === "7D" ? 10080 : range === "24h" ? 1440 : range === "6h" ? 360 : 60;\n    return n > 1 ? Math.max(0.1, span / (n - 1)) : span;\n  }\n',
    'range-aware ping tooltips'
  );
  source = replaceAllRequired(source, 'pingTips(vals, range === "24h" ? 30 : range === "6h" ? 10 : 5)', 'pingTips(vals, rangeStepMinutes(vals))', 'range-aware latency tips vals', 2);
  source = replaceAllRequired(source, 'pingTips(ctx.sparkVals, range === "24h" ? 30 : range === "6h" ? 10 : 5)', 'pingTips(ctx.sparkVals, rangeStepMinutes(ctx.sparkVals))', 'range-aware latency tips context', 2);

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
  source = replaceRequired(source, '      globeLon = wrapLon(globeLon + dt * 0.00255);\n', '      globeLon = wrapLon(globeLon + dt * 0.0075);\n', 'globe rotation speed');

  source = replaceRequired(
    source,
    '  function totals() {\n    const servers = state.servers || [];\n    let used = 0;\n    let limit = 0;\n    let online = 0;\n    servers.forEach(function (s) {\n      used += s.traffic_used || 0;\n      limit += s.traffic_limit || 0;\n      if (s.online) online += 1;\n    });\n    return { used: used, limit: limit, online: online, all: servers.length };\n  }\n',
    '  function totals() {\n    const servers = state.servers || [];\n    let used = 0;\n    let limit = 0;\n    let online = 0;\n    let unlimited = 0;\n    servers.forEach(function (s) {\n      used += s.traffic_used || 0;\n      limit += s.traffic_limit || 0;\n      if (!Number(s.traffic_limit || 0)) unlimited += 1;\n      if (s.online) online += 1;\n    });\n    return { used: used, limit: limit, unlimited: unlimited, online: online, all: servers.length };\n  }\n',
    'aggregate unlimited traffic semantics'
  );
  source = replaceRequired(
    source,
    '    const t = totals();\n    const regions = {};\n',
    '    const t = totals();\n    const trafficScope = t.limit ? ("有限额合计 " + fmtBytes(t.limit, 2) + (t.unlimited ? " · 无限流量 " + t.unlimited + " 台" : "")) : "全部无限流量";\n    const regions = {};\n',
    'fleet traffic scope'
  );
  source = replaceRequired(
    source,
    '        "<article><div class=\'lbl\'>流量累计</div><div class=\'val\'>" + fmtBytes(t.used, 1) + "</div><div class=\'sub\'>限额 " + fmtBytes(t.limit, 2) + "</div></article>" +\n',
    '        "<article><div class=\'lbl\'>流量累计</div><div class=\'val\'>" + fmtBytes(t.used, 1) + "</div><div class=\'sub\'>" + h(trafficScope) + "</div></article>" +\n',
    'fleet traffic summary'
  );
  source = replaceRequired(
    source,
    '  function renderFoot() {\n    const t = totals();\n    const source = liveMode ? "Komari RPC2" : "连接中";\n    foot.innerHTML =\n      "<div>总使用流量　<b>" + fmtBytes(t.used, 2) + " / " + fmtBytes(t.limit, 2) + "</b></div>" +\n',
    '  function renderFoot() {\n    const t = totals();\n    const trafficScope = t.limit ? ("有限额合计 " + fmtBytes(t.limit, 2) + (t.unlimited ? " · 无限流量 " + t.unlimited + " 台" : "")) : "全部无限流量";\n    const source = liveMode ? "Komari RPC2" : "连接中";\n    foot.innerHTML =\n      "<div>总使用流量　<b>" + fmtBytes(t.used, 2) + "</b>　" + h(trafficScope) + "</div>" +\n',
    'footer traffic semantics'
  );

  source = replaceRequired(
    source,
    '        \'<span class="quota-reset">\' + (trafficResetDays(server) == null ? "重置 —" : ("距重置 " + trafficResetDays(server) + " 天")) + "</span>" +\n',
    '        \'<span class="quota-reset">\' + (!limit ? "无限流量" : (trafficResetDays(server) == null ? "重置 —" : ("距重置 " + trafficResetDays(server) + " 天"))) + "</span>" +\n',
    'unlimited quota reset label'
  );

  source = replaceRequired(
    source,
    '    const sourceLabel = s.traffic_source === \'metric_period\' ? \'Metric Store · 当前账期\' : s.traffic_source === \'record_period\' ? \'历史记录差分 · 当前账期\' : \'当前账期数据不可用\';\n',
    '    const resetDays = trafficResetDays(s);\n    const unlimitedTraffic = !Number(s.traffic_limit || 0);\n    const cycleLabel = unlimitedTraffic ? \'无限流量 · 不设重置\' : (s.period_start && s.period_end ? (\'账期 \' + s.period_start.slice(5) + \' → \' + s.period_end.slice(5)) : \'当前账期\');\n    const cycleHint = unlimitedTraffic ? cycleLabel : (resetDays == null ? cycleLabel : (cycleLabel + \' · \' + resetDays + \' 天后重置\'));\n    const historyLabel = ctx.last7.length ? (\'已有 \' + ctx.last7.length + \' 天历史\') : \'暂无历史流量\';\n',
    'traffic labels'
  );
  source = replaceRequired(
    source,
    "        '<div class=\"traffic-forecast' + (forecast && forecast.kind === 'bad' ? ' is-bad' : forecast && forecast.kind === 'good' ? ' is-good' : '') + '\"><span>流量预测</span><b>' + h(forecast ? forecast.text : '暂无额度或历史数据') + '</b><small>' + h(sourceLabel) + '</small></div>' +\n",
    "        '<div class=\"traffic-forecast' + (forecast && forecast.kind === 'bad' ? ' is-bad' : forecast && forecast.kind === 'good' ? ' is-good' : '') + '\"><span>流量预测</span><b>' + h(forecast ? forecast.text : (s.traffic_limit ? '历史数据不足，暂不预测' : '无限流量，无需额度预测')) + '</b><small>' + h(cycleHint) + '</small></div>' +\n",
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
    "          '<article><div class=\"lbl\">账期</div><div class=\"val\">' + h((s.period_start || '').slice(5) || '—') + '</div><div class=\"sub\">至 ' + h((s.period_end || '').slice(5) || '—') + \"</div></article>\" +\n",
    "          '<article><div class=\"lbl\">账期</div><div class=\"val\">' + h(unlimitedTraffic ? '不重置' : ((s.period_start || '').slice(5) || '—')) + '</div><div class=\"sub\">' + h(unlimitedTraffic ? '无限流量' : ('至 ' + ((s.period_end || '').slice(5) || '—'))) + \"</div></article>\" +\n",
    'unlimited traffic cycle card'
  );
  source = replaceRequired(
    source,
    "        '<div class=\"chart-fill\"><div class=\"panel-h\"><h3>近 7 日流量</h3><span class=\"hero-sub\">' + h(sourceLabel) + \"</span></div>\" +\n",
    "        '<div class=\"chart-fill\"><div class=\"panel-h\"><h3>近 7 日流量</h3><span class=\"hero-sub\">' + h(historyLabel) + \"</span></div>\" +\n",
    'traffic history subtitle'
  );
  source = replaceRequired(
    source,
    '      const status = ctx.s.traffic_history_status === "loading" ? "历史流量加载中…" : "Komari 当前没有可用的近 7 日历史记录";\n',
    '      const status = ctx.s.traffic_history_status === "loading" ? "正在加载历史流量…" : "暂无近 7 日历史流量";\n',
    'traffic empty state'
  );

  source = replaceRequired(source, '  function heroPingChart(ctx, w, ht, mode) {\n', '  function hasLatencyValues(values) {\n    return (values || []).some(function (value) { return Number.isFinite(Number(value)) && Number(value) >= 0; });\n  }\n\n  function heroPingChart(ctx, w, ht, mode) {\n', 'latency data helper');
  source = replaceRequired(
    source,
    '  function pingChart(ctx, w, ht, mode) {\n    if (targetKey === "all" && ctx.multiSeries && ctx.multiSeries.length > 1 && ProbeCharts.multiSpark) {\n      return ProbeCharts.multiSpark(ctx.multiSeries, pingChartOpts(mode || "y", { w: w, h: ht }));\n    }\n    const idx = Math.max(0, (ctx.s.ping || []).findIndex(function (p) { return ctx.ping && p.key === ctx.ping.key; }));\n    return ProbeCharts.spark(ctx.sparkVals, pingChartOpts(mode || "y", { w: w, h: ht, color: pingColor(ctx.ping, idx), fillOpacity: 0.11, tips: pingTips(ctx.sparkVals, rangeStepMinutes(ctx.sparkVals)) }));\n  }\n',
    '  function pingChart(ctx, w, ht, mode) {\n    if (targetKey === "all" && ctx.multiSeries && ctx.multiSeries.length > 1 && ProbeCharts.multiSpark) {\n      return ProbeCharts.multiSpark(ctx.multiSeries, pingChartOpts(mode || "y", { w: w, h: ht }));\n    }\n    if (!hasLatencyValues(ctx.sparkVals)) return \'<div class="chart-empty">暂无该时间范围的延迟历史</div>\';\n    const idx = Math.max(0, (ctx.s.ping || []).findIndex(function (p) { return ctx.ping && p.key === ctx.ping.key; }));\n    return ProbeCharts.spark(ctx.sparkVals, pingChartOpts(mode || "y", { w: w, h: ht, color: pingColor(ctx.ping, idx), fillOpacity: 0.11, tips: pingTips(ctx.sparkVals, rangeStepMinutes(ctx.sparkVals)) }));\n  }\n',
    'detail latency empty state'
  );
  source = replaceRequired(
    source,
    '  function latencyPageChart(ctx, w, ht) {\n    if (!ctx) return \'<div class="chart-empty">暂无 Ping Task 数据</div>\';\n    if (latencyTargetKey === "all" && ctx.multiSeries && ctx.multiSeries.length > 1 && ProbeCharts.multiSpark) {\n      return ProbeCharts.multiSpark(ctx.multiSeries, pingChartOpts("xy", { w: w, h: ht }));\n    }\n    const idx = Math.max(0, (ctx.s.ping || []).findIndex(function (p) { return ctx.ping && p.key === ctx.ping.key; }));\n    return ProbeCharts.spark(ctx.sparkVals, pingChartOpts("xy", { w: w, h: ht, color: pingColor(ctx.ping, idx), fillOpacity: 0.11, tips: pingTips(ctx.sparkVals, rangeStepMinutes(ctx.sparkVals)) }));\n  }\n',
    '  function latencyPageChart(ctx, w, ht) {\n    if (!ctx) return \'<div class="chart-empty">暂无 Ping Task 数据</div>\';\n    if (latencyTargetKey === "all" && ctx.multiSeries && ctx.multiSeries.length > 1 && ProbeCharts.multiSpark) {\n      return ProbeCharts.multiSpark(ctx.multiSeries, pingChartOpts("xy", { w: w, h: ht }));\n    }\n    if (!hasLatencyValues(ctx.sparkVals)) return \'<div class="chart-empty">暂无该时间范围的延迟历史</div>\';\n    const idx = Math.max(0, (ctx.s.ping || []).findIndex(function (p) { return ctx.ping && p.key === ctx.ping.key; }));\n    return ProbeCharts.spark(ctx.sparkVals, pingChartOpts("xy", { w: w, h: ht, color: pingColor(ctx.ping, idx), fillOpacity: 0.11, tips: pingTips(ctx.sparkVals, rangeStepMinutes(ctx.sparkVals)) }));\n  }\n',
    'latency page empty state'
  );

  source = replaceRequired(source, '    let chart = \'\';\n    if (netTarget === \'all\' && cached && cached.seriesByTask && cached.seriesByTask.length > 1) {\n', '    let chart = \'\';\n    if (!targets.length) {\n      chart = \'<div class="chart-empty">暂无 Ping Task 数据</div>\';\n    } else if (netTarget === \'all\' && cached && cached.seriesByTask && cached.seriesByTask.length > 1) {\n', 'network no-task state');
  source = replaceRequired(source, '      chart = ProbeCharts.spark(vals, { w: 960, h: 200, color: pingColor(sparkSrc, sparkIndex), fillOpacity: 0.11, tips: pingTips(vals, rangeStepMinutes(vals)) });\n', '      chart = hasLatencyValues(vals) ? ProbeCharts.spark(vals, { w: 960, h: 200, color: pingColor(sparkSrc, sparkIndex), fillOpacity: 0.11, tips: pingTips(vals, rangeStepMinutes(vals)) }) : \'<div class="chart-empty">暂无该时间范围的 Ping 历史</div>\';\n', 'network latency empty state');
  source = replaceRequired(source, '          "<article><div class=\'lbl\'>时间范围</div><div class=\'val\'>" + range + "</div><div class=\'sub\'>1h / 6h / 24h</div></article>" +\n', '          "<article><div class=\'lbl\'>时间范围</div><div class=\'val\'>" + range + "</div><div class=\'sub\'>1h / 6h / 24h / 7D</div></article>" +\n', 'network range legend');

  source = replaceRequired(source, '  function listEmpty() {\n    return \'<section class="state"><h2>暂无节点</h2><p>官方接口还没有返回可展示的服务器。</p></section>\';\n  }\n', '  function listEmpty() {\n    if (nodeQuery || anomalyFilter || regionFilter) return \'<section class="state"><h2>没有匹配节点</h2><p>调整搜索词或清除筛选条件后重试。</p></section>\';\n    return \'<section class="state"><h2>暂无节点</h2><p>Lite 当前没有返回可展示的服务器。</p></section>\';\n  }\n', 'filtered node empty state');
  source = replaceRequired(source, 'placeholder="VPS / 地区 / ASN / 回程"', 'placeholder="VPS / 地区 / ASN / 服务商"', 'search placeholder after Return removal');

  source = replaceRequired(source, '      ["IPv4", maskIP(s.ipv4)],\n      ["IPv6", maskIP(s.ipv6)],\n', '      ["IPv4", s.ipv4 || "—"],\n      ["IPv6", s.ipv6 || "—"],\n', 'backend-authorized IP display');
  source = replaceRequired(source, "        '<span class=\"name\">' + h(server.name || \"未命名\") + \"</span>\" +\n        statusHTML(server, false) +\n", "        '<span class=\"name node-name\">' + h(server.name || \"未命名\") + ((server.ipv4 || server.ipv6) ? '<small class=\"node-ip\">' + h(server.ipv4 || server.ipv6) + '</small>' : '') + \"</span>\" +\n        statusHTML(server, false) +\n", 'list IP display');
  source = replaceRequired(source, '      ? ("在线 " + fmtDays(s.uptime))\n', '      ? ("运行 " + fmtDays(s.uptime))\n', 'detail uptime wording');
  source = removeFunction(source, 'maskIP');
  source = source.replace(/无限额/g, '无限流量');
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
  source = replaceRequired(source, '    const gap = 6;\n    const bw = (w - gap * (vals.length + 1)) / Math.max(vals.length, 1);\n', layout, 'bar slot layout');
  source = replaceRequired(source, '      const x = gap + i * (bw + gap);\n', '      const x = (slotOffset + i) * slotW + (slotW - bw) / 2;\n', 'bar x position');
  return source;
}

function fixAdapter(input) {
  let source = String(input || '');
  source = replaceRequired(source, '      ipv4: maskIPv4(node.ipv4),\n      ipv6: maskIPv6(node.ipv6),\n', '      ipv4: String(node.ipv4 || \'\'),\n      ipv6: String(node.ipv6 || \'\'),\n', 'preserve backend IP authorization');
  source = replaceRequired(source, '      connections_tcp: hasLive ? numberOrNull(live.connections) : null,\n      connections_udp: hasLive ? numberOrNull(live.connections_udp) : null,\n', '      connections_tcp: hasLive ? Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0)) : null,\n      connections_udp: hasLive ? numberOrNull(live.connections_udp) : null,\n', 'initial TCP connection count');
  source = replaceRequired(source, '    server.connections_tcp = numberOrNull(live.connections);\n    server.connections_udp = numberOrNull(live.connections_udp);\n', '    server.connections_tcp = Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0));\n    server.connections_udp = numberOrNull(live.connections_udp);\n', 'live TCP connection count');
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
