'use strict';

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error('v0.5.1 app marker missing: ' + label);
  return source.replace(before, after);
}

function bounds(source, name) {
  const marker = '  function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('v0.5.1 app function missing: ' + name);
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
  if (depth !== 0) throw new Error('v0.5.1 app unclosed function: ' + name);
  let end = i + 1;
  while (end < source.length && /[ \t]/.test(source[end])) end += 1;
  if (source[end] === '\n') end += 1;
  if (source[end] === '\n') end += 1;
  return { start, end };
}

function replaceFunction(source, name, body) {
  const b = bounds(source, name);
  return source.slice(0, b.start) + body.trimEnd() + '\n\n' + source.slice(b.end);
}

function refineApp(input) {
  let source = String(input || '');

  source = replaceFunction(source, 'remainingTimeText', [
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
  ].join('\n'));
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

  source = replaceRequired(source,
    '              "<div>CPU <b>" + h(s.cpu_model || "—") + " · " + h(s.cpu_cores == null ? "—" : s.cpu_cores) + "C/" + h(s.cpu_threads == null ? "—" : s.cpu_threads) + "T</b></div>" +\n',
    '              "<div>CPU <b>" + h(s.cpu_model || "—") + "</b></div>" +\n', 'desktop CPU label');
  source = replaceRequired(source,
    "              '<div class=\"wide\"><span>CPU</span><b>' + h(compactCPU(s.cpu_model)) + (s.cpu_cores != null || s.cpu_threads != null ? ' · ' + h(s.cpu_cores == null ? \"—\" : s.cpu_cores) + 'C/' + h(s.cpu_threads == null ? \"—\" : s.cpu_threads) + 'T' : '') + '</b></div>' +\n",
    "              '<div class=\"wide\"><span>CPU</span><b>' + h(compactCPU(s.cpu_model)) + '</b></div>' +\n", 'mobile CPU label');
  source = replaceRequired(source,
    '      ["处理器", (s.cpu_model || "—") + " · " + (s.cpu_cores == null ? "—" : s.cpu_cores) + "C / " + (s.cpu_threads == null ? "—" : s.cpu_threads) + "T"],\n',
    '      ["处理器", s.cpu_model || "—"],\n', 'system CPU label');

  source = replaceRequired(source,
    '      return day + "  合计 " + fmtBytes(d.total, 1) + "  ↑ " + fmtBytes(d.uplink, 1) + "  ↓ " + fmtBytes(d.downlink, 1);\n',
    '      if (d && d._missing) return day + "  无历史记录";\n      return day + "  合计 " + fmtBytes(d.total, 1) + "  ↑ " + fmtBytes(d.uplink, 1) + "  ↓ " + fmtBytes(d.downlink, 1);\n', 'missing traffic tooltip');

  source = replaceRequired(source,
    "            '<div class=\"meta\"><span>在线' + h(fmtDays(server.uptime).replace(/\\s+/g, \"\")) + ' · 剩余' + remainingHTMLFor(server) + '</span></div>' +\n",
    "            '<div class=\"meta\"><span>' + h(server.online ? ('运行 ' + fmtDays(server.uptime).replace(/\\s+/g, '')) : ('最后在线 ' + (lastSeenText(server) || '—'))) + ' · 剩余' + remainingHTMLFor(server) + '</span></div>' +\n", 'offline card copy');

  const helpers = [
    '  function calendarShiftKey(key, delta) {',
    "    const m = String(key || '').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);",
    "    if (!m) return '';",
    '    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(delta || 0)));',
    "    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());",
    '  }',
    '',
    '  function resourceWeekRows(servers) {',
    '    const byDate = {};',
    '    (servers || []).forEach(function (s) {',
    '      (s.daily_traffic || []).forEach(function (row) {',
    '        if (!row || !row.date) return;',
    '        if (!byDate[row.date]) byDate[row.date] = { date: row.date, uplink: 0, downlink: 0, total: 0 };',
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
    ''
  ].join('\n');
  source = replaceRequired(source, '  function renderResource() {\n', helpers + '  function renderResource() {\n', 'resource helpers');

  const oldWeek = [
    '    const byDate = {};',
    '    servers.forEach(function (s) {',
    '      (s.daily_traffic || []).slice(-7).forEach(function (row) {',
    '        if (!row || !row.date) return;',
    '        if (!byDate[row.date]) byDate[row.date] = { date: row.date, uplink: 0, downlink: 0, total: 0 };',
    '        byDate[row.date].uplink += Number(row.uplink || 0);',
    '        byDate[row.date].downlink += Number(row.downlink || 0);',
    '        byDate[row.date].total += Number(row.total || 0);',
    '      });',
    '    });',
    '    const last7 = Object.keys(byDate).sort().slice(-7).map(function (key) { return byDate[key]; });'
  ].join('\n') + '\n';
  source = replaceRequired(source, oldWeek, '    const week = resourceWeekRows(servers);\n    const last7 = week.rows;\n', 'fixed resource week');
  source = replaceRequired(source,
    '    const heat = servers.slice().sort(function (a, b) { return Number(b.cpu_pct || 0) - Number(a.cpu_pct || 0); });\n',
    '    const offlineCount = servers.filter(function (s) { return !s.online; }).length;\n    const heat = servers.filter(function (s) { return s.online; }).slice().sort(function (a, b) { return resourcePressure(b) - resourcePressure(a); }).slice(0, 10);\n', 'resource pressure');
  source = replaceRequired(source,
    '    const t = totals();\n    const on = function (key) { return !liveMode || state[key] !== false; };\n',
    '    const t = totals();\n    const trafficScope = t.limit ? ("有限额合计 " + fmtBytes(t.limit, 2) + (t.unlimited ? " · 无限流量 " + t.unlimited + " 台" : "")) : "全部无限流量";\n    const on = function (key) { return !liveMode || state[key] !== false; };\n', 'resource traffic scope');
  source = replaceRequired(source,
    '    let body = \'<section class="subpage"><p class="lead">\' + t.online + "/" + t.all + " 台在线。费用按 Lite 原生 price / billing_cycle 折算；汇率使用每日缓存的公开 CNY 基准数据，并保留原币种明细。</p>";\n',
    '    let body = \'<section class="subpage"><p class="lead">\' + t.online + "/" + t.all + " 台在线 · 资源压力仅统计在线节点 · 费用按 Lite 节点账单字段折算。</p>";\n', 'resource lead');
  source = replaceRequired(source,
    '      "<article><div class=\'lbl\'>流量累计</div><div class=\'val\'>" + fmtBytes(t.used, 1) + "</div><div class=\'sub\'>限额 " + fmtBytes(t.limit, 2) + "</div></article>" +\n',
    '      "<article><div class=\'lbl\'>流量累计</div><div class=\'val\'>" + fmtBytes(t.used, 1) + "</div><div class=\'sub\'>" + h(trafficScope) + "</div></article>" +\n', 'resource traffic copy');
  source = replaceRequired(source,
    '(last7.length ? ProbeCharts.stacked(last7, { w: 520, h: 140, tips: trafficTips(last7) }) : \'<div class="chart-empty">Lite 当前没有足够的 7 日 network 历史记录</div>\')',
    '(week.observed ? ProbeCharts.stacked(last7, { w: 520, h: 140, tips: trafficTips(last7) }) : \'<div class="chart-empty">暂无近 7 日流量历史</div>\')', 'resource chart state');
  source = replaceRequired(source,
    '<div class="panel"><div class="panel-h"><h3>近 7 日上下行</h3><span class="hero-sub">金 = 上行　灰 = 下行</span></div>',
    '<div class="panel"><div class="panel-h"><h3>近 7 日上下行</h3><span class="hero-sub">\' + week.observed + \'/7 天有记录</span></div>', 'resource history coverage');
  source = replaceRequired(source,
    '<div class="panel" style="margin-top:16px"><div class="panel-h"><h3>资源压力</h3><span class="hero-sub">CPU · 内存 · 硬盘</span></div>\' +\n        \'<table class="heat">',
    '<div class="panel" style="margin-top:16px"><div class="panel-h"><h3>资源压力</h3><span class="hero-sub">最高项排序 · 离线 \' + offlineCount + \' 台不参与</span></div>\' +\n        \'<div class="resource-heat-wrap"><table class="heat">', 'resource heat wrapper');
  source = replaceRequired(source, '        }).join("") + "</tbody></table></div>";\n', '        }).join("") + "</tbody></table></div></div>";\n', 'resource heat close');
  source = replaceRequired(source,
    '          const days = Math.max(0, Math.round((new Date(s.expires_at_raw) - new Date()) / 86400000));\n          return "<article><div>" + h(s.expires_at || "—") + "</div><b>" + h(s.name) + "</b>" + days + " 天后　" + h(canSeeFinance ? renewalText(s) : "*") + "</article>";\n',
    '          return "<article><div>" + h(s.expires_at || "—") + "</div><b>" + h(s.name) + "</b>" + h(remainingDaysText(s)) + "　" + h(canSeeFinance ? renewalText(s) : "*") + "</article>";\n', 'renewal timeline');

  source = replaceRequired(source,
    '    const now = new Date();\n    const start = new Date(now.getFullYear(), now.getMonth(), 1);\n    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();\n',
    "    const todayKey = todayKeyInZone(state.billing_timezone || 'Asia/Shanghai');\n    const todayParts = todayKey.split('-').map(Number);\n    const year = todayParts[0], month = todayParts[1], todayDay = todayParts[2];\n    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();\n    if (!pulse.length || !Number.isInteger(pulseDay) || pulseDay < 1 || pulseDay > daysInMonth) pulseDay = todayDay;\n", 'pulse timezone');
  source = replaceRequired(source,
    '      const date = start.getFullYear() + "-" + pad(start.getMonth() + 1) + "-" + pad(d);\n',
    '      const date = year + "-" + pad(month) + "-" + pad(d);\n', 'pulse day key');
  source = replaceRequired(source,
    '    const today = new Date().getDate();\n    const days = pulse.length || 31;\n',
    "    const today = Number(todayKeyInZone(state.billing_timezone || 'Asia/Shanghai').slice(8, 10));\n    const days = pulse.length || 31;\n", 'cycle timezone');
  return source;
}

module.exports = { refineApp };
