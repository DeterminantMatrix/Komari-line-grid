'use strict';

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error('v0.5.1 refine marker missing: ' + label);
  return source.replace(before, after);
}

function functionBounds(source, name) {
  const marker = '  function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('v0.5.1 function marker missing: ' + name);
  const brace = source.indexOf('{', start);
  if (brace < 0) throw new Error('v0.5.1 function body missing: ' + name);
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
  if (depth !== 0) throw new Error('v0.5.1 unclosed function: ' + name);
  let end = i + 1;
  while (end < source.length && (source[end] === ' ' || source[end] === '\t')) end += 1;
  if (source[end] === '\n') end += 1;
  if (source[end] === '\n') end += 1;
  return { start, end };
}

function replaceFunction(source, name, replacement) {
  const bounds = functionBounds(source, name);
  return source.slice(0, bounds.start) + replacement.trimEnd() + '\n\n' + source.slice(bounds.end);
}

function removeFunction(source, name) {
  const bounds = functionBounds(source, name);
  return source.slice(0, bounds.start) + source.slice(bounds.end);
}

function refineAdapter(input) {
  let source = String(input || '');
  source = replaceRequired(
    source,
    "    const hasLive = !!(live && typeof live === 'object');\n    const trafficType =",
    "    const hasLive = !!(live && typeof live === 'object');\n    const onlineNow = hasLive && live.online === true;\n    const trafficType =",
    'adapter online state'
  );
  source = replaceRequired(source, '      online: hasLive && live.online === true,\n', '      online: onlineNow,\n', 'adapter initial online');
  source = replaceRequired(source, '      cpu_pct: hasLive ? numberOrNull(live.cpu) : null,\n', '      cpu_pct: onlineNow ? numberOrNull(live.cpu) : null,\n', 'adapter CPU online gating');
  source = replaceRequired(source, '      mem_used: hasLive ? numberOrNull(live.ram) : null,\n', '      mem_used: onlineNow ? numberOrNull(live.ram) : null,\n', 'adapter RAM online gating');
  source = replaceRequired(source, '      mem_total: numberOrNull(node.mem_total) != null ? numberOrNull(node.mem_total) : (hasLive ? numberOrNull(live.ram_total) : null),\n', "      mem_total: hasLive && numberOrNull(live.ram_total) != null && numberOrNull(live.ram_total) > 0 ? numberOrNull(live.ram_total) : numberOrNull(node.mem_total),\n", 'live RAM total priority');
  source = replaceRequired(source, '      swap_used: hasLive ? numberOrNull(live.swap) : null,\n', '      swap_used: onlineNow ? numberOrNull(live.swap) : null,\n', 'adapter swap online gating');
  source = replaceRequired(source, '      swap_total: numberOrNull(node.swap_total) != null ? numberOrNull(node.swap_total) : (hasLive ? numberOrNull(live.swap_total) : null),\n', "      swap_total: hasLive && numberOrNull(live.swap_total) != null ? numberOrNull(live.swap_total) : numberOrNull(node.swap_total),\n", 'live swap total priority');
  source = replaceRequired(source, '      disk_used: hasLive ? numberOrNull(live.disk) : null,\n', '      disk_used: onlineNow ? numberOrNull(live.disk) : null,\n', 'adapter disk online gating');
  source = replaceRequired(source, '      disk_total: numberOrNull(node.disk_total) != null ? numberOrNull(node.disk_total) : (hasLive ? numberOrNull(live.disk_total) : null),\n', "      disk_total: hasLive && numberOrNull(live.disk_total) != null && numberOrNull(live.disk_total) > 0 ? numberOrNull(live.disk_total) : numberOrNull(node.disk_total),\n", 'live disk total priority');
  source = replaceRequired(source, '      download_speed: hasLive ? numberOrNull(live.net_in) : null,\n', '      download_speed: onlineNow ? numberOrNull(live.net_in) : null,\n', 'download online gating');
  source = replaceRequired(source, '      upload_speed: hasLive ? numberOrNull(live.net_out) : null,\n', '      upload_speed: onlineNow ? numberOrNull(live.net_out) : null,\n', 'upload online gating');
  source = replaceRequired(source, '      uptime: hasLive ? numberOrNull(live.uptime) : null,\n', '      uptime: onlineNow ? numberOrNull(live.uptime) : null,\n', 'uptime online gating');
  source = replaceRequired(source, "      loadavg: hasLive ? [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)].filter(function (v) { return v != null; }).join(' ') : '',\n", "      loadavg: onlineNow ? [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)].filter(function (v) { return v != null; }).join(' ') : '',\n", 'load online gating');
  source = replaceRequired(source, '      process_count: hasLive ? numberOrNull(live.process) : null,\n', '      process_count: onlineNow ? numberOrNull(live.process) : null,\n', 'process online gating');
  source = replaceRequired(source, '      connections_tcp: hasLive ? Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0)) : null,\n', '      connections_tcp: onlineNow ? Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0)) : null,\n', 'TCP online gating');
  source = replaceRequired(source, '      connections_udp: hasLive ? numberOrNull(live.connections_udp) : null,\n', '      connections_udp: onlineNow ? numberOrNull(live.connections_udp) : null,\n', 'UDP online gating');

  source = replaceRequired(
    source,
    "    const hasLive = !!(live && typeof live === 'object');\n    server.has_live = hasLive;\n    server.online = hasLive && live.online === true;\n",
    "    const hasLive = !!(live && typeof live === 'object');\n    const onlineNow = hasLive && live.online === true;\n    server.has_live = hasLive;\n    server.online = onlineNow;\n",
    'live merge online state'
  );
  source = replaceRequired(
    source,
    '    server.cpu_pct = numberOrNull(live.cpu);\n    server.mem_used = numberOrNull(live.ram);\n    server.swap_used = numberOrNull(live.swap);\n    server.disk_used = numberOrNull(live.disk);\n    server.download_speed = numberOrNull(live.net_in);\n    server.upload_speed = numberOrNull(live.net_out);\n    server.uptime = numberOrNull(live.uptime);\n    server.loadavg = [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)].filter(function (v) { return v != null; }).join(\' \');\n    server.process_count = numberOrNull(live.process);\n    server.connections_tcp = Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0));\n    server.connections_udp = numberOrNull(live.connections_udp);\n',
    "    const liveRamTotal = numberOrNull(live.ram_total);\n    const liveSwapTotal = numberOrNull(live.swap_total);\n    const liveDiskTotal = numberOrNull(live.disk_total);\n    if (liveRamTotal != null && liveRamTotal > 0) server.mem_total = liveRamTotal;\n    if (liveSwapTotal != null) server.swap_total = liveSwapTotal;\n    if (liveDiskTotal != null && liveDiskTotal > 0) server.disk_total = liveDiskTotal;\n    server.cpu_pct = onlineNow ? numberOrNull(live.cpu) : null;\n    server.mem_used = onlineNow ? numberOrNull(live.ram) : null;\n    server.swap_used = onlineNow ? numberOrNull(live.swap) : null;\n    server.disk_used = onlineNow ? numberOrNull(live.disk) : null;\n    server.download_speed = onlineNow ? numberOrNull(live.net_in) : null;\n    server.upload_speed = onlineNow ? numberOrNull(live.net_out) : null;\n    server.uptime = onlineNow ? numberOrNull(live.uptime) : null;\n    server.loadavg = onlineNow ? [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)].filter(function (v) { return v != null; }).join(' ') : '';\n    server.process_count = onlineNow ? numberOrNull(live.process) : null;\n    server.connections_tcp = onlineNow ? Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0)) : null;\n    server.connections_udp = onlineNow ? numberOrNull(live.connections_udp) : null;\n",
    'live totals and offline gating'
  );
  return source;
}

function refineApp(input) {
  let source = String(input || '');

  const expiryHelpers = [
    '  function expiryDeltaDays(server) {',
    '    if (!server || server.long_term || !server.expires_at_raw) return null;',
    "    const end = dateKeyOrdinal(String(server.expires_at_raw).slice(0, 10));",
    "    const today = dateKeyOrdinal(todayKeyInZone(server.billing_timezone || state.billing_timezone || 'Asia/Shanghai'));",
    '    if (end == null || today == null) return null;',
    '    return end - today;',
    '  }',
    '',
    '  function remainingTimeText(server) {',
    '    if (!server) return "—";',
    '    if (server.long_term) return "长期";',
    '    const days = expiryDeltaDays(server);',
    '    if (days == null) return "—";',
    '    if (days < 0) return "已过期 " + Math.abs(days) + " 天";',
    '    if (days === 0) return "今天到期";',
    '    if (days <= 60) return days + " 天";',
    '    if (days < 730) return (days / 30.4375).toFixed(days < 180 ? 1 : 0) + " 月";',
    '    return (days / 365.25).toFixed(1) + " 年";',
    '  }'
  ].join('\n');
  source = replaceFunction(source, 'remainingTimeText', expiryHelpers);
  source = replaceFunction(source, 'remainingDaysText', [
    '  function remainingDaysText(server) {',
    '    if (!server) return "—";',
    '    if (server.long_term) return "长期";',
    '    const days = expiryDeltaDays(server);',
    '    if (days == null) return "—";',
    '    if (days < 0) return "已过期 " + Math.abs(days) + " 天";',
    '    if (days === 0) return "今天到期";',
    '    return days + " 天";',
    '  }'
  ].join('\n'));
  source = replaceFunction(source, 'remainingDaysNumber', [
    '  function remainingDaysNumber(server) {',
    '    const days = expiryDeltaDays(server);',
    '    return days == null ? null : Math.max(0, days);',
    '  }'
  ].join('\n'));

  source = replaceRequired(
    source,
    '              "<div>CPU <b>" + h(s.cpu_model || "—") + " · " + h(s.cpu_cores == null ? "—" : s.cpu_cores) + "C/" + h(s.cpu_threads == null ? "—" : s.cpu_threads) + "T</b></div>" +\n',
    '              "<div>CPU <b>" + h(s.cpu_model || "—") + "</b></div>" +\n',
    'overview CPU truthfulness'
  );
  source = replaceRequired(
    source,
    "              '<div class=\"wide\"><span>CPU</span><b>' + h(compactCPU(s.cpu_model)) + (s.cpu_cores != null || s.cpu_threads != null ? ' · ' + h(s.cpu_cores == null ? \"—\" : s.cpu_cores) + 'C/' + h(s.cpu_threads == null ? \"—\" : s.cpu_threads) + 'T' : '') + '</b></div>' +\n",
    "              '<div class=\"wide\"><span>CPU</span><b>' + h(compactCPU(s.cpu_model)) + '</b></div>' +\n",
    'mobile CPU truthfulness'
  );
  source = replaceRequired(
    source,
    '      ["处理器", (s.cpu_model || "—") + " · " + (s.cpu_cores == null ? "—" : s.cpu_cores) + "C / " + (s.cpu_threads == null ? "—" : s.cpu_threads) + "T"],\n',
    '      ["处理器", s.cpu_model || "—"],\n',
    'system CPU truthfulness'
  );

  source = replaceRequired(
    source,
    "    return (rows || []).map(function (d) {\n      const day = (d.date || \"\").slice(5) || \"当日\";\n      return day + \"  合计 \" + fmtBytes(d.total, 1) + \"  ↑ \" + fmtBytes(d.uplink, 1) + \"  ↓ \" + fmtBytes(d.downlink, 1);\n    });\n",
    "    return (rows || []).map(function (d) {\n      const day = (d.date || \"\").slice(5) || \"当日\";\n      if (d && d._missing) return day + \"  无历史记录\";\n      return day + \"  合计 \" + fmtBytes(d.total, 1) + \"  ↑ \" + fmtBytes(d.uplink, 1) + \"  ↓ \" + fmtBytes(d.downlink, 1);\n    });\n",
    'traffic missing-day tooltip'
  );

  source = replaceRequired(
    source,
    "            '<div class=\"meta\"><span>在线' + h(fmtDays(server.uptime).replace(/\\s+/g, \"\")) + ' · 剩余' + remainingHTMLFor(server) + '</span></div>' +\n",
    "            '<div class=\"meta\"><span>' + h(server.online ? ('运行 ' + fmtDays(server.uptime).replace(/\\s+/g, '')) : ('最后在线 ' + (lastSeenText(server) || '—'))) + ' · 剩余' + remainingHTMLFor(server) + '</span></div>' +\n",
    'offline card status'
  );

  const resourceHelpers = [
    '  function calendarShiftKey(key, delta) {',
    "    const m = String(key || '').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);",
    "    if (!m) return '';",
    '    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(delta || 0)));',
    "    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());",
    '  }',
    '',
    '  function resourceWeekRows(servers) {',
    '    const byDate = {};',
    '    (servers || []).forEach(function (s) {',
    '      (s.daily_traffic || []).forEach(function (row) {',
    '        if (!row || !row.date) return;',
    "        if (!byDate[row.date]) byDate[row.date] = { date: row.date, uplink: 0, downlink: 0, total: 0 };",
    '        byDate[row.date].uplink += Number(row.uplink || 0);',
    '        byDate[row.date].downlink += Number(row.downlink || 0);',
    '        byDate[row.date].total += Number(row.total || 0);',
    '      });',
    '    });',
    "    const today = todayKeyInZone(state.billing_timezone || 'Asia/Shanghai');",
    '    const rows = [];',
    '    let observed = 0;',
    '    for (let i = 6; i >= 0; i -= 1) {',
    '      const key = calendarShiftKey(today, -i);',
    '      if (byDate[key]) { rows.push(byDate[key]); observed += 1; }',
    '      else rows.push({ date: key, uplink: 0, downlink: 0, total: 0, _missing: true });',
    '    }',
    '    return { rows: rows, observed: observed };',
    '  }',
    '',
    '  function resourcePressure(server) {',
    '    const values = [server && server.cpu_pct, pctMetric(server && server.mem_used, server && server.mem_total), pctMetric(server && server.disk_used, server && server.disk_total)]',
    '      .map(Number).filter(Number.isFinite);',
    '    return values.length ? Math.max.apply(null, values) : -1;',
    '  }',
    '',
    '  function renderResource() {'
  ].join('\n');
  source = replaceRequired(source, '  function renderResource() {\n', resourceHelpers + '\n', 'resource helpers');
  source = replaceRequired(
    source,
    "    const byDate = {};\n    servers.forEach(function (s) {\n      (s.daily_traffic || []).slice(-7).forEach(function (row) {\n        if (!row || !row.date) return;\n        if (!byDate[row.date]) byDate[row.date] = { date: row.date, uplink: 0, downlink: 0, total: 0 };\n        byDate[row.date].uplink += Number(row.uplink || 0);\n        byDate[row.date].downlink += Number(row.downlink || 0);\n        byDate[row.date].total += Number(row.total || 0);\n      });\n    });\n    const last7 = Object.keys(byDate).sort().slice(-7).map(function (key) { return byDate[key]; });\n",
    "    const week = resourceWeekRows(servers);\n    const last7 = week.rows;\n",
    'resource fixed seven-day calendar'
  );
  source = replaceRequired(
    source,
    '    const heat = servers.slice().sort(function (a, b) { return Number(b.cpu_pct || 0) - Number(a.cpu_pct || 0); });\n',
    '    const offlineCount = servers.filter(function (s) { return !s.online; }).length;\n    const heat = servers.filter(function (s) { return s.online; }).slice().sort(function (a, b) { return resourcePressure(b) - resourcePressure(a); }).slice(0, 10);\n',
    'resource pressure ranking'
  );
  source = replaceRequired(
    source,
    '    const t = totals();\n    const on = function (key) { return !liveMode || state[key] !== false; };\n',
    '    const t = totals();\n    const trafficScope = t.limit ? ("有限额合计 " + fmtBytes(t.limit, 2) + (t.unlimited ? " · 无限流量 " + t.unlimited + " 台" : "")) : "全部无限流量";\n    const on = function (key) { return !liveMode || state[key] !== false; };\n',
    'resource traffic scope'
  );
  source = replaceRequired(
    source,
    '    let body = \'<section class="subpage"><p class="lead">\' + t.online + "/" + t.all + " 台在线。费用按 Lite 原生 price / billing_cycle 折算；汇率使用每日缓存的公开 CNY 基准数据，并保留原币种明细。</p>";\n',
    '    let body = \'<section class="subpage"><p class="lead">\' + t.online + "/" + t.all + " 台在线 · 资源压力仅统计在线节点 · 费用按 Lite 节点账单字段折算。</p>";\n',
    'resource lead copy'
  );
  source = replaceRequired(
    source,
    '      "<article><div class=\'lbl\'>流量累计</div><div class=\'val\'>" + fmtBytes(t.used, 1) + "</div><div class=\'sub\'>限额 " + fmtBytes(t.limit, 2) + "</div></article>" +\n',
    '      "<article><div class=\'lbl\'>流量累计</div><div class=\'val\'>" + fmtBytes(t.used, 1) + "</div><div class=\'sub\'>" + h(trafficScope) + "</div></article>" +\n',
    'resource traffic semantics'
  );
  source = replaceRequired(
    source,
    "        body += '<div class=\"panel\"><div class=\"panel-h\"><h3>近 7 日上下行</h3><span class=\"hero-sub\">金 = 上行　灰 = 下行</span></div>' +\n          (last7.length ? ProbeCharts.stacked(last7, { w: 520, h: 140, tips: trafficTips(last7) }) : '<div class=\"chart-empty\">Lite 当前没有足够的 7 日 network 历史记录</div>') + \"</div>\";\n",
    "        body += '<div class=\"panel\"><div class=\"panel-h\"><h3>近 7 日上下行</h3><span class=\"hero-sub\">' + week.observed + '/7 天有记录</span></div>' +\n          (week.observed ? ProbeCharts.stacked(last7, { w: 520, h: 140, tips: trafficTips(last7) }) : '<div class=\"chart-empty\">暂无近 7 日流量历史</div>') + \"</div>\";\n",
    'resource seven-day chart state'
  );
  source = replaceRequired(
    source,
    '      body += \'<div class="panel" style="margin-top:16px"><div class="panel-h"><h3>资源压力</h3><span class="hero-sub">CPU · 内存 · 硬盘</span></div>\' +\n        \'<table class="heat"><thead><tr><th>服务器</th><th>CPU</th><th>内存</th><th>硬盘</th></tr></thead><tbody>\' +\n',
    '      body += \'<div class="panel" style="margin-top:16px"><div class="panel-h"><h3>资源压力</h3><span class="hero-sub">最高项排序 · 离线 \' + offlineCount + \' 台不参与</span></div>\' +\n        \'<div class="resource-heat-wrap"><table class="heat"><thead><tr><th>服务器</th><th>CPU</th><th>内存</th><th>硬盘</th></tr></thead><tbody>\' +\n',
    'resource heat header'
  );
  source = replaceRequired(source, '        }).join("") + "</tbody></table></div>";\n', '        }).join("") + "</tbody></table></div></div>";\n', 'resource heat wrapper close');
  source = replaceRequired(
    source,
    '          const days = Math.max(0, Math.round((new Date(s.expires_at_raw) - new Date()) / 86400000));\n          return "<article><div>" + h(s.expires_at || "—") + "</div><b>" + h(s.name) + "</b>" + days + " 天后　" + h(canSeeFinance ? renewalText(s) : "*") + "</article>";\n',
    '          return "<article><div>" + h(s.expires_at || "—") + "</div><b>" + h(s.name) + "</b>" + h(remainingDaysText(s)) + "　" + h(canSeeFinance ? renewalText(s) : "*") + "</article>";\n',
    'renewal timeline truthful expiry state'
  );

  source = replaceRequired(
    source,
    '    const now = new Date();\n    const start = new Date(now.getFullYear(), now.getMonth(), 1);\n    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();\n',
    "    const todayKey = todayKeyInZone(state.billing_timezone || 'Asia/Shanghai');\n    const todayParts = todayKey.split('-').map(Number);\n    const year = todayParts[0], month = todayParts[1], todayDay = todayParts[2];\n    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();\n    if (!pulse.length || !Number.isInteger(pulseDay) || pulseDay < 1 || pulseDay > daysInMonth) pulseDay = todayDay;\n",
    'month pulse timezone'
  );
  source = replaceRequired(
    source,
    '      const date = start.getFullYear() + "-" + pad(start.getMonth() + 1) + "-" + pad(d);\n',
    '      const date = year + "-" + pad(month) + "-" + pad(d);\n',
    'month pulse date key'
  );
  source = replaceRequired(
    source,
    '    const today = new Date().getDate();\n    const days = pulse.length || 31;\n',
    "    const today = Number(todayKeyInZone(state.billing_timezone || 'Asia/Shanghai').slice(8, 10));\n    const days = pulse.length || 31;\n",
    'cycle timezone alignment'
  );
  return source;
}

function refineCharts(input) {
  let source = String(input || '');
  source = replaceRequired(
    source,
    '      const up = ups[i];\n      const bhD = Math.max(1, (d / max) * (h - 8));\n      const bhU = Math.max(1, (up / max) * (h - 8));\n      const x = gap + i * (bw + gap);\n      const tip = (opt.tips && opt.tips[i]) || "";\n',
    '      const up = ups[i];\n      const x = gap + i * (bw + gap);\n      const tip = (opt.tips && opt.tips[i]) || "";\n      if (list[i] && list[i]._missing) return \'<rect class="chart-hit" data-tip="\' + esc(tip) + '\'" x="\' + x.toFixed(2) + '\'" y="0" width="\' + Math.max(2, bw).toFixed(2) + '\'" height="\' + h + '\'" fill="transparent"/>\';\n      const bhD = Math.max(1, (d / max) * (h - 8));\n      const bhU = Math.max(1, (up / max) * (h - 8));\n',
    'stacked missing calendar slots'
  );
  return source;
}

function refineApi(input) {
  let source = String(input || '');
  source = replaceFunction(source, 'loadMetadata', [
    '  function loadMetadata() {',
    "    return Promise.resolve(global.LINE_GRID_METADATA && typeof global.LINE_GRID_METADATA === 'object' ? global.LINE_GRID_METADATA : {});",
    '  }'
  ].join('\n'));
  source = removeFunction(source, 'sparkFromSeries');
  source = replaceRequired(source, '    sparkFromSeries: sparkFromSeries,\n', '', 'remove unused sparkFromSeries export');
  return source;
}

function refineLite(input) {
  let source = String(input || '');
  source = replaceRequired(
    source,
    '    uiRefreshQueued = true;\n    Promise.resolve().then(refreshUICompatibility);\n',
    '    uiRefreshQueued = true;\n    setTimeout(refreshUICompatibility, 0);\n',
    'defer compatibility after app render'
  );
  source = replaceRequired(
    source,
    "  if (global.MutationObserver) {\n    new global.MutationObserver(scheduleUICompatibility).observe(global.document.documentElement, { childList: true, subtree: true });\n  }\n\n",
    '',
    'remove global DOM observer'
  );
  return source;
}

function refineCss(input) {
  return String(input || '') + '\n' + [
    '/* v0.5.1 Lite-only polish: mobile resource/detail density */',
    '.resource-heat-wrap { width: 100%; overflow-x: auto; }',
    '@media (max-width: 720px) {',
    '  .subpage > .kpi { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }',
    '  .subpage > .kpi article { min-width: 0; }',
    '  .subpage .lead { font-size: 11px; line-height: 1.55; }',
    '  .subpage .timeline { grid-template-columns: 1fr !important; }',
    '  .resource-heat-wrap .heat { min-width: 520px; }',
    '  .stage .seg { max-width: 100%; overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }',
    '  .stage .seg::-webkit-scrollbar { display: none; }',
    '  .stage .seg button { flex: 0 0 auto; }',
    '  .row .node-ip { display: none !important; }',
    '}',
    ''
  ].join('\n');
}

module.exports = { refineAdapter, refineApp, refineCharts, refineApi, refineLite, refineCss };
