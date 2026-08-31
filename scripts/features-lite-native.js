'use strict';

function functionBounds(source, name) {
  const marker = '  function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Lite-native feature function missing: ' + name);
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
  if (depth !== 0) throw new Error('Lite-native feature unclosed function: ' + name);
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

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error('Lite-native feature marker missing: ' + label);
  return source.replace(before, after);
}

function featureApp(input) {
  let source = String(input || '');

  source = replaceRequired(source,
    '  let globeLiveTick = 0;\n',
    '  let globeLiveTick = 0;\n  let globePinned = false;\n  let systemHistoryRange = "1h";\n  const systemHistoryCache = Object.create(null);\n  const systemHistoryInFlight = Object.create(null);\n  let externalFontsRequested = false;\n',
    'feature state');

  source = insertBeforeFunction(source, 'lookAtCountry', [
    '  function regionAimLL(server) {',
    '    if (server && server.longitude != null && server.latitude != null && Number.isFinite(Number(server.longitude)) && Number.isFinite(Number(server.latitude))) {',
    '      return [Number(server.longitude), Number(server.latitude)];',
    '    }',
    '    const hint = cityHintInfo(server);',
    '    if (hint && Array.isArray(hint.ll)) return hint.ll.slice(0, 2);',
    '    const base = COUNTRY_LL[server && (server.geo_country || server.region_country)];',
    '    return base ? base.slice(0, 2) : null;',
    '  }',
    '',
    '  function lookAtLocation(lon, lat) {',
    '    const x = Number(lon), y = Number(lat);',
    '    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;',
    '    globeLon = wrapLon(x);',
    '    globeLat = Math.max(-78, Math.min(78, y));',
    '    globePinned = true;',
    '    queueGlobePaint();',
    '    return true;',
    '  }'
  ].join('\n'));

  source = replaceFunction(source, 'globePanel', [
    '  function globePanel() {',
    '    if (!showGlobe || (window.matchMedia && window.matchMedia("(max-width: 720px)").matches)) return "";',
    '    const regions = {};',
    '    (state.servers || []).forEach(function (s) {',
    '      const rd = regionDisplay(s);',
    '      const key = rd.label;',
    '      if (!regions[key]) regions[key] = { count: 0, lon: 0, lat: 0, coordCount: 0, aim: s.geo_country || s.region_country || rd.code };',
    '      const item = regions[key];',
    '      item.count += 1;',
    '      const ll = regionAimLL(s);',
    '      if (ll) { item.lon += Number(ll[0]); item.lat += Number(ll[1]); item.coordCount += 1; }',
    '    });',
    '    const side = \'<button type="button" class="reg\' + (!regionFilter ? \' is-on\' : \'\') + \'" data-region-filter=""><span>ALL</span><b>\' + (state.servers || []).length + \'</b></button>\' +',
    '      Object.keys(regions).sort().map(function (k) {',
    '        const item = regions[k];',
    '        const lon = item.coordCount ? item.lon / item.coordCount : null;',
    '        const lat = item.coordCount ? item.lat / item.coordCount : null;',
    '        const coords = lon != null && lat != null ? (\' data-aim-lon="\' + attr(lon.toFixed(5)) + \'" data-aim-lat="\' + attr(lat.toFixed(5)) + \'"\') : \'\';',
    '        return \'<button type="button" class="reg\' + (regionFilter === k ? \' is-on\' : \'\') + \'" data-region-filter="\' + attr(k) + \'" data-aim="\' + attr(item.aim) + \'"\' + coords + \'><span>\' + h(k) + "</span><b>" + item.count + "</b></button>";',
    '      }).join("");',
    '    return (',
    '      \'<section class="home-globe" aria-label="节点地球">\' +',
    '        \'<div class="atlas">\' +',
    '          \'<svg viewBox="0 0 460 240" preserveAspectRatio="xMidYMid meet">\' + globeMarkup() + "</svg>" +',
    '        "</div>" +',
    '        \'<aside class="atlas-side"><div class="lbl atlas-title">地区\' + (globePinned && regionFilter ? \' · 已定位\' : \'\') + \'</div>\' + side + "</aside>" +',
    '      "</section>"',
    '    );',
    '  }'
  ].join('\n'));

  source = replaceRequired(source,
    '    const regionBtn = ev.target.closest("[data-region-filter]");\n    if (regionBtn) {\n      const selected = regionBtn.getAttribute("data-region-filter") || "";\n      regionFilter = selected && regionFilter === selected ? "" : selected;\n      const aimCode = regionBtn.getAttribute("data-aim");\n      if (regionFilter && aimCode) lookAtCountry(aimCode);\n      render();\n      return;\n    }\n',
    '    const regionBtn = ev.target.closest("[data-region-filter]");\n    if (regionBtn) {\n      const selected = regionBtn.getAttribute("data-region-filter") || "";\n      if (!selected || regionFilter === selected) {\n        regionFilter = "";\n        globePinned = false;\n        render();\n        return;\n      }\n      regionFilter = selected;\n      const lon = regionBtn.getAttribute("data-aim-lon");\n      const lat = regionBtn.getAttribute("data-aim-lat");\n      const aimCode = regionBtn.getAttribute("data-aim");\n      if (!lookAtLocation(lon, lat) && aimCode) { lookAtCountry(aimCode); globePinned = true; }\n      render();\n      return;\n    }\n',
    'globe region selection');

  source = replaceRequired(source,
    '      regionFilter = "";\n      render();\n',
    '      regionFilter = "";\n      globePinned = false;\n      render();\n',
    'clear filters resumes globe');

  source = replaceRequired(source,
    '      if (rect.bottom < 0 || rect.top > window.innerHeight) return;\n      globeLon = wrapLon(globeLon + dt * 0.0075);\n',
    '      if (rect.bottom < 0 || rect.top > window.innerHeight) return;\n      if (globePinned) return;\n      globeLon = wrapLon(globeLon + dt * 0.0075);\n',
    'pinned globe stops auto rotation');

  source = insertBeforeFunction(source, 'systemAsnText', [
    '  function fontModeFromPayload(payload) {',
    '    const settings = payload && payload._public && payload._public.theme_settings;',
    '    return String(settings && settings.fontMode || "Web").toLowerCase() === "system" ? "system" : "web";',
    '  }',
    '',
    '  function applyFontMode(payload) {',
    '    const mode = fontModeFromPayload(payload);',
    '    document.documentElement.setAttribute("data-font-mode", mode);',
    '    if (mode === "system") {',
    '      document.querySelectorAll("[data-line-grid-font]").forEach(function (node) { node.remove(); });',
    '      externalFontsRequested = false;',
    '      return;',
    '    }',
    '    if (externalFontsRequested) return;',
    '    externalFontsRequested = true;',
    '    [',
    '      ["preconnect", "https://fonts.googleapis.com", false],',
    '      ["preconnect", "https://fonts.gstatic.com", true],',
    '      ["stylesheet", "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap", false]',
    '    ].forEach(function (row) {',
    '      const link = document.createElement("link");',
    '      link.rel = row[0]; link.href = row[1]; link.setAttribute("data-line-grid-font", "1");',
    '      if (row[2]) link.crossOrigin = "anonymous";',
    '      document.head.appendChild(link);',
    '    });',
    '  }',
    '',
    '  function systemHistoryHours(value) {',
    '    return value === "7d" ? 168 : value === "24h" ? 24 : 1;',
    '  }',
    '',
    '  function systemHistoryKey(uuid, value) { return String(uuid || "") + ":" + value; }',
    '',
    '  function systemHistoryRows(raw, uuid) {',
    '    const root = raw && raw.data && typeof raw.data === "object" ? raw.data : (raw || {});',
    '    const records = root.records;',
    '    if (Array.isArray(records)) return records.slice();',
    '    if (!records || typeof records !== "object") return [];',
    '    if (Array.isArray(records[String(uuid)])) return records[String(uuid)].slice();',
    '    const keys = Object.keys(records);',
    '    for (let i = 0; i < keys.length; i += 1) if (Array.isArray(records[keys[i]])) return records[keys[i]].slice();',
    '    return [];',
    '  }',
    '',
    '  function systemHistoryData(raw, uuid, value) {',
    '    const rows = systemHistoryRows(raw, uuid).sort(function (a, b) { return Date.parse(a && a.time || 0) - Date.parse(b && b.time || 0); });',
    '    const out = { range: value, hours: systemHistoryHours(value), cpu: [], ram: [], disk: [], count: rows.length };',
    '    rows.forEach(function (row) {',
    '      const t = Date.parse(row && row.time || "");',
    '      if (!Number.isFinite(t)) return;',
    '      const cpu = row.cpu == null ? null : Number(row.cpu);',
    '      const ram = row.ram == null ? null : Number(row.ram), ramTotal = row.ram_total == null ? null : Number(row.ram_total);',
    '      const disk = row.disk == null ? null : Number(row.disk), diskTotal = row.disk_total == null ? null : Number(row.disk_total);',
    '      if (Number.isFinite(cpu) && cpu >= 0) out.cpu.push({ v: Math.max(0, Math.min(100, cpu)), t: t });',
    '      if (Number.isFinite(ram) && Number.isFinite(ramTotal) && ramTotal > 0) out.ram.push({ v: Math.max(0, Math.min(100, ram / ramTotal * 100)), t: t });',
    '      if (Number.isFinite(disk) && Number.isFinite(diskTotal) && diskTotal > 0) out.disk.push({ v: Math.max(0, Math.min(100, disk / diskTotal * 100)), t: t });',
    '    });',
    '    return out;',
    '  }',
    '',
    '  function systemHistoryChart(label, values, data) {',
    '    const last = values.length ? Number(values[values.length - 1].v) : null;',
    '    const chart = values.length && window.ProbeCharts ? ProbeCharts.spark(values, {',
    '      w: 960, h: 150, showYAxis: true, showXAxis: true, adaptiveY: true, yUnit: "%",',
    '      domainStart: Date.now() - data.hours * 3600000, domainEnd: Date.now(), windowHours: data.hours',
    '    }) : \'<div class="chart-empty">暂无历史记录</div>\';',
    '    return \'<article class="system-history-card"><header><span>\' + h(label) + \'</span><b>\' + (last == null || !Number.isFinite(last) ? \'—\' : last.toFixed(1) + \'%\') + \'</b></header><div class="system-history-chart">\' + chart + \'</div></article>\';',
    '  }',
    '',
    '  function paintSystemHistory(uuid, value, data) {',
    '    const host = winBody.querySelector("[data-system-history]");',
    '    if (!host || String(host.getAttribute("data-uuid") || "") !== String(uuid || "")) return;',
    '    host.querySelectorAll("[data-system-history-range]").forEach(function (btn) { btn.classList.toggle("is-on", btn.getAttribute("data-system-history-range") === value); });',
    '    const body = host.querySelector("[data-system-history-body]");',
    '    const meta = host.querySelector("[data-system-history-meta]");',
    '    if (meta) meta.textContent = data && data.error ? "Lite 历史读取失败" : (data && data.count ? (data.count + " 条记录 · Lite common:getRecords") : "暂无历史记录");',
    '    if (!body) return;',
    '    if (!data || data.error) { body.innerHTML = \'<div class="chart-empty">暂时无法读取 Lite 资源历史</div>\'; return; }',
    '    body.innerHTML = systemHistoryChart("CPU", data.cpu, data) + systemHistoryChart("RAM", data.ram, data) + systemHistoryChart("Disk", data.disk, data);',
    '  }',
    '',
    '  function loadSystemHistory(uuid, value) {',
    '    value = value === "7d" || value === "24h" ? value : "1h";',
    '    const key = systemHistoryKey(uuid, value);',
    '    if (systemHistoryCache[key]) { paintSystemHistory(uuid, value, systemHistoryCache[key]); return Promise.resolve(systemHistoryCache[key]); }',
    '    if (systemHistoryInFlight[key]) return systemHistoryInFlight[key];',
    '    const hours = systemHistoryHours(value);',
    '    const host = winBody.querySelector("[data-system-history]");',
    '    const meta = host && host.querySelector("[data-system-history-meta]");',
    '    if (meta) meta.textContent = "正在读取 Lite 历史…";',
    '    const task = ProbeAPI.rpc("common:getRecords", { type: "load", uuid: String(uuid || ""), hours: hours, load_type: "all", maxCount: hours >= 168 ? 1200 : hours >= 24 ? 720 : 360 }, hours >= 168 ? 18000 : 12000)',
    '      .then(function (raw) { const data = systemHistoryData(raw, uuid, value); systemHistoryCache[key] = data; paintSystemHistory(uuid, value, data); return data; })',
    '      .catch(function () { const data = { range: value, hours: hours, count: 0, cpu: [], ram: [], disk: [], error: true }; paintSystemHistory(uuid, value, data); return data; })',
    '      .finally(function () { delete systemHistoryInFlight[key]; });',
    '    systemHistoryInFlight[key] = task;',
    '    return task;',
    '  }',
    '',
    '  function systemHistoryHTML(server) {',
    '    return \'<section class="system-history" data-system-history data-uuid="\' + attr(server && server.uuid || "") + \'"><header class="system-history-head"><div><div class="lbl">资源历史</div><small data-system-history-meta>按需读取 Lite 历史</small></div><div class="system-history-ranges">\' +',
    '      [["1h","1H"],["24h","24H"],["7d","7D"]].map(function (row) { return \'<button type="button" class="\' + (systemHistoryRange === row[0] ? \'is-on\' : \'\') + \'" data-system-history-range="\' + row[0] + \'">\' + row[1] + \'</button>\'; }).join("") +',
    '      \'</div></header><div class="system-history-grid" data-system-history-body><div class="chart-empty">正在读取 Lite 历史…</div></div></section>\';',
    '  }'
  ].join('\n'));

  source = replaceFunction(source, 'pageSystem', [
    '  function pageSystem(ctx) {',
    '    const s = ctx.s;',
    '    const cells = [',
    '      ["系统", s.os || "—"],',
    '      ["内核", s.kernel || "—"],',
    '      ["架构", s.arch || "—"],',
    '      ["虚拟化", s.virtualization || "—"],',
    '      ["处理器", s.cpu_model || "—"],',
    '      ["内存 / Swap", fmtBytes(s.mem_total, 1) + " / " + fmtBytes(s.swap_total, 1)],',
    '      ["磁盘总量", fmtBytes(s.disk_total, 1)],',
    '      ["负载", (s.loadavg || "—").toString().trim().split(/\\s+/).join(" · ")],',
    '      ["到期", s.expires_at || "—"],',
    '      ["续费", renewalText(s)],',
    '      ["自动续费", s.auto_renewal ? "是" : "否"],',
    '      ["流量限额", s.traffic_limit ? fmtBytes(s.traffic_limit, 2) + " · " + h(s.traffic_limit_type || "sum") : "无限流量"],',
    '      ["IPv4", s.ipv4 || "—"],',
    '      ["IPv6", s.ipv6 || "—"],',
    '      ["ASN", systemAsnText(s)],',
    '      ["Agent", s.agent_version || "—"],',
    '    ];',
    '    return (',
    '      \'<article class="page page-system">\' +',
    '        \'<section class="spec">\' + cells.map(function (c) { return "<article><div class=\'lbl\'>" + h(c[0]) + "</div><div class=\'val\'>" + h(c[1]) + "</div></article>"; }).join("") + "</section>" +',
    '        systemHistoryHTML(s) +',
    '      "</article>"',
    '    );',
    '  }'
  ].join('\n'));

  source = replaceRequired(source,
    '    else if (current === "system") winBody.innerHTML = pageSystem(ctx);\n    else winBody.innerHTML = pageHTML(index);\n',
    '    else if (current === "system") { winBody.innerHTML = pageSystem(ctx); setTimeout(function () { loadSystemHistory(s.uuid, systemHistoryRange); }, 0); }\n    else winBody.innerHTML = pageHTML(index);\n',
    'lazy system history load');

  source = replaceRequired(source,
    '  function onWindowClick(ev) {\n    const pageBtn = ev.target.closest("[data-page]");\n',
    '  function onWindowClick(ev) {\n    const historyBtn = ev.target.closest("[data-system-history-range]");\n    if (historyBtn) {\n      systemHistoryRange = historyBtn.getAttribute("data-system-history-range") || "1h";\n      const r = route();\n      if (r.node != null) renderWindow(r.node, "system");\n      return;\n    }\n    const pageBtn = ev.target.closest("[data-page]");\n',
    'system history range handler');

  source = replaceRequired(source,
    '  function applyLive(payload, info) {\n    if (!payload || payload.enabled === false) return;\n',
    '  function applyLive(payload, info) {\n    if (!payload || payload.enabled === false) return;\n    applyFontMode(payload);\n',
    'font mode follows Lite settings');

  return source;
}

function featureCss(input) {
  return String(input || '') + '\n' + [
    '/* Lite-native v0.5.7 feature set */',
    'html[data-font-mode="system"] {',
    '  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;',
    '  --serif: "Songti SC", STSong, SimSun, serif;',
    '  --mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;',
    '}',
    '.system-history { margin-top:14px; border:1px solid var(--line); }',
    '.system-history-head { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:12px 14px; border-bottom:1px solid var(--line); }',
    '.system-history-head small { display:block; margin-top:3px; color:var(--ink-dim); font:9px/1.4 var(--mono); }',
    '.system-history-ranges { display:flex; flex:none; border:1px solid var(--line); }',
    '.system-history-ranges button { appearance:none; border:0; border-left:1px solid var(--line); background:transparent; color:var(--ink-dim); font:10px/1 var(--mono); padding:7px 9px; cursor:pointer; }',
    '.system-history-ranges button:first-child { border-left:0; }',
    '.system-history-ranges button.is-on { color:var(--ink); background:var(--wash); }',
    '.system-history-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); }',
    '.system-history-card { min-width:0; padding:12px 12px 10px; border-right:1px solid var(--line); }',
    '.system-history-card:last-child { border-right:0; }',
    '.system-history-card header { display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin-bottom:8px; }',
    '.system-history-card header span { color:var(--ink-soft); font:10px/1.2 var(--mono); letter-spacing:.08em; text-transform:uppercase; }',
    '.system-history-card header b { color:var(--ink); font-size:15px; font-weight:500; }',
    '.system-history-chart { min-height:150px; }',
    '.system-history-chart svg { width:100%; height:150px; display:block; }',
    '@media (max-width:900px) { .system-history-grid { grid-template-columns:1fr; } .system-history-card { border-right:0; border-bottom:1px solid var(--line); } .system-history-card:last-child { border-bottom:0; } }',
    '@media (max-width:520px) { .system-history-head { align-items:flex-start; flex-direction:column; } .system-history-ranges { width:100%; } .system-history-ranges button { flex:1; } }',
    ''
  ].join('\n');
}

module.exports = { featureApp, featureCss };
