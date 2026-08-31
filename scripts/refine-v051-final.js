'use strict';

function functionBounds(source, name) {
  const marker = '  function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('final polish function missing: ' + name);
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
  if (depth !== 0) throw new Error('final polish unclosed function: ' + name);
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

function insertBeforeFunction(source, name, body) {
  const b = functionBounds(source, name);
  return source.slice(0, b.start) + body.trimEnd() + '\n\n' + source.slice(b.start);
}

function countCalls(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = source.match(new RegExp('\\b' + escaped + '\\s*\\(', 'g'));
  return matches ? matches.length : 0;
}

function removeOrphanFunction(source, name) {
  if (countCalls(source, name) !== 1) return source;
  const b = functionBounds(source, name);
  return source.slice(0, b.start) + source.slice(b.end);
}

function refineFinalApp(input) {
  let source = String(input || '');

  source = insertBeforeFunction(source, 'anomalyKinds', [
    '  function anomalyDetails(server) {',
    '    const out = [];',
    "    if (!server || !server.online) out.push({ key: 'offline', label: '离线', tone: 'bad' });",
    '    const ms = pingMs(server);',
    '    const loss = pingLoss(server);',
    '    const traffic = trafficQuotaPct(server);',
    '    const expiry = expiryDeltaDays(server);',
    '    const pressure = server && server.online ? resourcePressure(server) : -1;',
    "    if (loss != null && loss >= 10) out.push({ key: 'loss', label: '丢包 ' + lossText(loss), tone: loss >= 20 ? 'bad' : 'hot' });",
    "    if (ms != null && ms > 180) out.push({ key: 'latency', label: '延迟 ' + Math.round(ms) + 'ms', tone: ms >= 250 ? 'bad' : 'hot' });",
    "    if (pressure >= 90) out.push({ key: 'resource', label: '资源 ' + Math.round(pressure) + '%', tone: pressure >= 95 ? 'bad' : 'hot' });",
    "    if (traffic != null && traffic >= 90) out.push({ key: 'traffic', label: '流量 ' + Math.round(traffic) + '%', tone: traffic >= 98 ? 'bad' : 'hot' });",
    '    if (expiry != null && expiry < 0) out.push({ key: \'expiry\', label: \'已过期 \' + Math.abs(expiry) + \'天\', tone: \'bad\' });',
    '    else if (expiry != null && expiry <= 7) out.push({ key: \'expiry\', label: expiry === 0 ? \'今天到期\' : (expiry + \'天到期\'), tone: expiry <= 3 ? \'bad\' : \'hot\' });',
    '    return out;',
    '  }',
    '',
    '  function anomalyBadgeHTML(server) {',
    "    const rows = anomalyDetails(server).filter(function (item) { return item.key !== 'offline'; });",
    "    if (!rows.length) return '';",
    '    const first = rows[0];',
    "    const title = rows.map(function (item) { return item.label; }).join(' · ');",
    "    return '<small class=\"node-alert is-' + first.tone + '\" title=\"' + attr(title) + '\">' + h(first.label) + (rows.length > 1 ? (' +' + (rows.length - 1)) : '') + '</small>';",
    '  }'
  ].join('\n'));

  source = replaceFunction(source, 'anomalyKinds', [
    '  function anomalyKinds(server) {',
    '    return anomalyDetails(server).map(function (item) { return item.key; });',
    '  }'
  ].join('\n'));

  source = replaceFunction(source, 'anomalySummary', [
    '  function anomalySummary() {',
    '    const out = { total: 0, offline: 0, latency: 0, loss: 0, resource: 0, expiry: 0, traffic: 0 };',
    '    (state.servers || []).forEach(function (server) {',
    '      const kinds = anomalyKinds(server);',
    '      if (kinds.length) out.total += 1;',
    '      kinds.forEach(function (kind) { if (out[kind] != null) out[kind] += 1; });',
    '    });',
    '    return out;',
    '  }'
  ].join('\n'));

  source = replaceFunction(source, 'anomalyNotice', [
    '  function anomalyNotice() {',
    '    const a = anomalySummary();',
    "    if (!anomalyFilter && !nodeQuery) return '';",
    '    const bits = [];',
    "    if (anomalyFilter) bits.push('异常 ' + a.total + '：离线 ' + a.offline + ' · 延迟 ' + a.latency + ' · 丢包 ' + a.loss + ' · 资源 ' + a.resource + ' · 流量 ' + a.traffic + ' · 到期 ' + a.expiry);",
    "    if (nodeQuery) bits.push('搜索：' + nodeQuery);",
    "    return '<div class=\"filter-notice\"><span>' + h(bits.join('　')) + '</span><button type=\"button\" data-clear-filters>清除筛选</button></div>';",
    '  }'
  ].join('\n'));

  source = replaceFunction(source, 'statusHTML', [
    '  function statusHTML(server, compact) {',
    '    const online = !!(server && server.online);',
    '    const seen = online ? "" : lastSeenText(server);',
    "    const detail = seen ? '<small>' + h(seen) + '</small>' : '';",
    '    const alert = anomalyBadgeHTML(server);',
    "    return '<span class=\"status ' + (online ? 'is-online' : 'is-offline') + (compact ? ' is-compact' : '') + '\"><span>' + (online ? '在线' : '离线') + '</span>' + detail + alert + '</span>';",
    '  }'
  ].join('\n'));

  source = replaceFunction(source, 'listToolbar', [
    '  function listToolbar(r) {',
    '    const a = anomalySummary();',
    "    const anomalyTitle = '离线 ' + a.offline + ' · 高延迟 ' + a.latency + ' · 高丢包 ' + a.loss + ' · 高资源 ' + a.resource + ' · 高流量 ' + a.traffic + ' · 临期/过期 ' + a.expiry;",
    '    return (',
    "      '<div class=\"list-bar\" id=\"views\">' +",
    "        '<div class=\"list-bar-left\">' +",
    "          '<span class=\"list-bar-k\">机器清单</span>' +",
    "          '<button class=\"filter-pill' + (anomalyFilter ? ' is-on' : '') + '\" data-anomaly-filter type=\"button\" title=\"' + attr(anomalyTitle) + '\">异常 <b data-anomaly-count>' + a.total + '</b></button>' +",
    "          '<label class=\"node-search\"><span>筛选</span><input data-node-search type=\"search\" value=\"' + attr(nodeQuery) + '\" autocomplete=\"off\" spellcheck=\"false\" placeholder=\"VPS / 地区 / ASN / 服务商\"></label>' +",
    "        '</div>' +",
    "        '<div class=\"views\">' +",
    "          '<button class=\"icon-btn' + (r.view === 'list' ? ' is-on' : '') + '\" data-view=\"list\" type=\"button\" aria-label=\"横向排列\" title=\"横向\">' + iconList() + '</button>' +",
    "          '<button class=\"icon-btn' + (r.view === 'grid' ? ' is-on' : '') + '\" data-view=\"grid\" type=\"button\" aria-label=\"网格排列\" title=\"网格\">' + iconGrid() + '</button>' +",
    "          '<button class=\"icon-btn' + (r.view === 'column' ? ' is-on' : '') + '\" data-view=\"column\" type=\"button\" aria-label=\"列排列\" title=\"列\">' + iconColumn() + '</button>' +",
    "          '<button class=\"icon-btn' + (showGlobe ? ' is-on' : '') + '\" data-globe type=\"button\" aria-label=\"显示地球\" title=\"地球开/关\">' + iconGlobe() + '</button>' +",
    "        '</div>' +",
    "      '</div>'",
    '    );',
    '  }'
  ].join('\n'));

  source = insertBeforeFunction(source, 'openFinanceDetail', [
    '  function financeSummaryHTML(rows, masked) {',
    '    let monthly = 0, monthlyCount = 0, remaining = 0, remainingCount = 0;',
    '    let free = 0, oneTime = 0, due30 = 0, expired = 0;',
    '    (rows || []).forEach(function (row) {',
    '      if (Number.isFinite(Number(row.monthly))) { monthly += Number(row.monthly); monthlyCount += 1; }',
    '      if (Number.isFinite(Number(row.remainingValue))) { remaining += Number(row.remainingValue); remainingCount += 1; }',
    '      if (Number(row.server && row.server.price) === -1) free += 1;',
    '      if (Number(row.server && row.server.billing_cycle) === -1) oneTime += 1;',
    '      const d = expiryDeltaDays(row.server);',
    '      if (d != null && d < 0) expired += 1;',
    '      else if (d != null && d <= 30) due30 += 1;',
    '    });',
    '    const annual = accessState.logged_in ? aggregateCNY(state.servers || [], true) : null;',
    "    const value = function (n, suffix) { return masked ? '*' : (n == null || !Number.isFinite(Number(n)) ? '—' : ('≈ ¥' + Number(n).toFixed(2) + (suffix || ''))); };",
    '    return \'<section class="finance-summary">\' +',
    "      '<article><span>月均总计</span><b>' + value(monthlyCount ? monthly : null, '') + '</b><small>周期账单 ' + monthlyCount + ' 台 · 免费 ' + free + ' · 一次性 ' + oneTime + '</small></article>' +",
    "      '<article><span>年化预算</span><b>' + value(annual, '') + '</b><small>按 365.25 天折算</small></article>' +",
    "      '<article><span>剩余价值</span><b>' + value(remainingCount ? remaining : null, '') + '</b><small>按剩余天数估算</small></article>' +",
    "      '<article><span>到期风险</span><b>' + (expired + due30) + ' 台</b><small>已过期 ' + expired + ' · 30 天内 ' + due30 + '</small></article>' +",
    "    '</section>';",
    '  }'
  ].join('\n'));

  source = replaceFunction(source, 'openFinanceDetail', [
    '  function openFinanceDetail(preserveSort) {',
    '    if (!financeOverlay || !financeBody) return;',
    '    if (!preserveSort) { financeSortKey = ""; financeSortDir = 0; }',
    '    const rows = financeRows();',
    '    const maskFinance = !accessState.logged_in;',
    '    const table = rows.length ?',
    "      '<div class=\"finance-table-wrap\"><table class=\"finance-table\"><thead><tr>' +",
    "      '<th>' + financeSortHead('区域', 'region') + '</th>' +",
    "      '<th>' + financeSortHead('VPS', 'name') + '</th>' +",
    "      '<th>原始账单</th>' +",
    "      '<th>' + financeSortHead('月均续费', 'monthly') + '</th>' +",
    "      '<th>' + financeSortHead('到期', 'remaining') + '</th>' +",
    "      '<th>' + financeSortHead('剩余价值', 'value') + '</th>' +",
    "      '</tr></thead><tbody>' +",
    '      rows.map(function (row) {',
    '        const d = expiryDeltaDays(row.server);',
    "        const rowClass = d != null && d < 0 ? ' is-expired' : d != null && d <= 7 ? ' is-due' : '';",
    "        const nativeHTML = maskFinance ? '<strong class=\"finance-mask\">*</strong>' : '<strong>' + h(renewalText(row.server)) + '</strong>';",
    "        const monthlyHTML = maskFinance ? '<strong class=\"finance-mask\">*</strong>' : financeMonthlyHTML(row);",
    "        const valueHTML = maskFinance ? '<strong class=\"finance-mask\">*</strong>' : '<strong>' + (row.remainingValue == null ? '—' : ('≈ ¥' + row.remainingValue.toFixed(2))) + '</strong>';",
    "        const expiry = row.server.long_term ? '长期' : (row.server.expires_at || '—');",
    "        return '<tr class=\"' + rowClass.trim() + '\"><td>' + h(row.region) + '</td><td><b>' + h(row.server.name || '未命名') + '</b></td><td class=\"money-cell\">' + nativeHTML + '</td><td class=\"money-cell\">' + monthlyHTML + '</td><td class=\"expiry-cell\"><strong>' + h(expiry) + '</strong><small>' + remainingHTMLFor(row.server) + '</small></td><td class=\"money-cell\">' + valueHTML + '</td></tr>';",
    "      }).join('') + '</tbody></table></div>' : '<div class=\"chart-empty\">暂无费用数据</div>';",
    '    financeBody.innerHTML = financeSummaryHTML(rows, maskFinance) + table;',
    '    financeOverlay.hidden = false;',
    "    document.body.classList.add('modal-open');",
    '  }'
  ].join('\n'));

  source = replaceFunction(source, 'slab', [
    '  function slab(server, i) {',
    '    const ms = pingMs(server);',
    '    return (',
    "      '<button class=\"slab\" data-index=\"' + attr(i) + '\" data-live-sig=\"' + liveSignature(server) + '\" type=\"button\">' +",
    "        '<div class=\"slab-top\">' +",
    "          '<div class=\"head\">' +",
    "            '<span class=\"cc\">' + h(displayCountry(server) || '') + '</span>' +",
    "            '<span class=\"name\">' + h(server.name || '未命名') + '</span>' +",
    "            '<span class=\"dot' + (server.online ? '' : ' is-off') + '\"></span>' +",
    "            statusHTML(server, true) + '<span class=\"slab-region\">' + h(server.region_city || server.region_name || '') + '</span>' +",
    "          '</div>' +",
    "          '<span class=\"more\">打开窗口 →</span>' +",
    "        '</div>' +",
    "        '<div class=\"slab-grid slab-grid-final\">' +",
    "          '<div>' +",
    "            '<div class=\"slab-ms' + latencyTone(ms) + '\">' + (ms == null ? '—' : ms) + '<small>MS</small></div>' +",
    "            '<div class=\"slab-loss' + lossTone(pingLoss(server)) + '\">' + lossText(pingLoss(server)) + '</div>' +",
    "            '<div class=\"speeds\">↓ <b>' + fmtSpeed(server.download_speed) + '</b>　↑ <b>' + fmtSpeed(server.upload_speed) + '</b></div>' +",
    "            sparkOf(server, true) +",
    "          '</div>' +",
    "          '<div>' +",
    '            meters(server) +',
    "            '<div style=\"margin-top:14px\">' + quotaBar(server) + '</div>' +",
    "            '<div class=\"meta\" style=\"margin-top:10px\"><span>' + h(server.online ? ('运行 ' + fmtDays(server.uptime).replace(/\\s+/g, '')) : ('最后在线 ' + (lastSeenText(server) || '—'))) + ' · 剩余' + remainingHTMLFor(server) + '</span></div>' +",
    "          '</div>' +",
    "        '</div>' +",
    "      '</button>'",
    '    );',
    '  }'
  ].join('\n'));

  ['nfmt', 'remainingTimeText', 'monthlyCostText', 'expiryShortText'].forEach(function (name) {
    if (source.includes('  function ' + name + '(')) source = removeOrphanFunction(source, name);
  });

  return source;
}

function refineFinalCss(input) {
  return String(input || '') + '\n' + [
    '/* v0.5.1 final polish: finance, anomalies, density and mobile detail */',
    '.node-alert { display:block; margin-top:2px; max-width:96px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:8px/1.25 var(--mono); letter-spacing:0; }',
    '.node-alert.is-hot { color:var(--gold); }',
    '.node-alert.is-bad { color:var(--down); }',
    '.status.is-compact .node-alert { text-align:right; align-self:flex-end; }',
    '.slab-grid-final { grid-template-columns:1fr 1fr !important; }',
    '.slab-grid-final > div { padding:0 22px; }',
    '.slab-grid-final > div:first-child { padding-left:0; }',
    '.slab-grid-final > div:last-child { padding-right:0; border-right:0; }',
    '.finance-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border-bottom:1px solid var(--line); margin:0 -20px 8px; }',
    '.finance-summary article { min-width:0; padding:14px 16px 15px; border-right:1px solid var(--line); }',
    '.finance-summary article:last-child { border-right:0; }',
    '.finance-summary span,.finance-summary small { display:block; color:var(--ink-dim); font-size:10px; }',
    '.finance-summary b { display:block; margin:5px 0 4px; color:var(--ink); font-size:20px; font-weight:500; }',
    '.finance-table { min-width:920px; table-layout:auto; }',
    '.finance-table th:nth-child(n),.finance-table td:nth-child(n) { width:auto; }',
    '.finance-table td:nth-child(n+3),.finance-table th:nth-child(n+3) { text-align:right; }',
    '.finance-table .expiry-cell strong,.finance-table .expiry-cell small { display:block; white-space:nowrap; }',
    '.finance-table .expiry-cell small { margin-top:3px; color:var(--ink-dim); }',
    '.finance-table tr.is-due td { background:color-mix(in srgb,var(--gold) 5%,transparent); }',
    '.finance-table tr.is-expired td { background:color-mix(in srgb,var(--down) 6%,transparent); }',
    '.spec { grid-template-rows:none; grid-auto-rows:minmax(108px,auto); }',
    '.spec article:nth-child(n) { border-right:1px solid var(--line); border-bottom:1px solid var(--line); }',
    '.spec article:nth-child(4n) { border-right:0; }',
    '.spec article:nth-last-child(-n+4) { border-bottom:0; }',
    '@media (max-width:900px) {',
    '  .spec { grid-template-columns:repeat(2,minmax(0,1fr)); grid-template-rows:none; }',
    '  .spec article:nth-child(n) { border-right:1px solid var(--line); border-bottom:1px solid var(--line); }',
    '  .spec article:nth-child(2n) { border-right:0; }',
    '  .spec article:nth-last-child(-n+2) { border-bottom:0; }',
    '}',
    '@media (max-width:720px) {',
    '  .row .node-alert { display:none; }',
    '  .slab-grid-final { grid-template-columns:1fr !important; }',
    '  .slab-grid-final > div { padding:0 0 12px; border-right:0; }',
    '  .slab-grid-final > div:last-child { padding-bottom:0; }',
    '  .finance-summary { grid-template-columns:repeat(2,minmax(0,1fr)); margin:0 -10px 8px; }',
    '  .finance-summary article { padding:10px 9px 11px; border-bottom:1px solid var(--line); }',
    '  .finance-summary article:nth-child(2n) { border-right:0; }',
    '  .finance-summary article:nth-last-child(-n+2) { border-bottom:0; }',
    '  .finance-summary b { font-size:16px; }',
    '  .finance-table { min-width:960px; }',
    '  .stage .sheet > .kpi { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }',
    '  .stage .sheet > .kpi article:last-child { grid-column:1 / -1; }',
    '  .page-ping .targets { flex-wrap:nowrap; overflow-x:auto; padding-bottom:4px; scrollbar-width:none; }',
    '  .page-ping .targets::-webkit-scrollbar { display:none; }',
    '  .page-ping .targets .chip { flex:0 0 auto; }',
    '  .page-ping .chart-fill { min-height:220px; }',
    '  .page-ping .ping-stat-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }',
    '  .page-traffic .kpi { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }',
    '  .page-traffic .kpi article:last-child { grid-column:1 / -1; }',
    '  .page-traffic .day-grid { grid-template-columns:repeat(7,minmax(86px,1fr)); overflow-x:auto; }',
    '  .page-system .spec { grid-template-columns:repeat(2,minmax(0,1fr)); grid-auto-rows:minmax(88px,auto); }',
    '  .page-system .spec .val { font-size:14px; overflow-wrap:anywhere; }',
    '}',
    ''
  ].join('\n');
}

module.exports = { refineFinalApp, refineFinalCss };
