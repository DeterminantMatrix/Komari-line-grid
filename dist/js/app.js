(function () {
  'use strict';

  window.__KOMARI_LINE_GRID_APP_STARTED__ = true;
  var API = window.KomariLineGridAPI;
  var Charts = window.LineGridCharts || {
    spark: function () { return '<div class="chart-empty">图表组件未加载</div>'; },
    multiSpark: function () { return '<div class="chart-empty">图表组件未加载</div>'; },
    bars: function () { return '<div class="chart-empty">图表组件未加载</div>'; },
    stacked: function () { return '<div class="chart-empty">图表组件未加载</div>'; },
    wave: function () { return ''; },
    ruler: function () { return '';}
  };
  var U = { KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024, TB: 1024 * 1024 * 1024 * 1024, DAY: 86400 };

  var main = document.getElementById('main');
  var foot = document.getElementById('foot');
  var titleEl = document.getElementById('page-title');
  var liveMark = document.getElementById('live-mark');
  var overlay = document.getElementById('overlay');
  var winBody = document.getElementById('win-body');
  var winTitle = document.getElementById('win-title');
  var winKicker = document.getElementById('win-kicker');
  var stageNav = document.getElementById('stage-nav');

  var state = { enabled: true, title: 'Komari', description: '', show_globe: true, servers: [], metadata: {} };
  var loading = true;
  var error = '';
  var lastUpdate = 0;
  var view = localStorage.getItem('komari-line-grid-view') || 'grid';
  if (['grid', 'column', 'list'].indexOf(view) < 0) view = 'grid';
  var home = 'nodes';
  var showGlobe = localStorage.getItem('komari-line-grid-globe') !== '0';
  var range = '1h';
  var targetKey = 'all';
  var detailTargetKey = '';
  var seriesCache = {};
  var seriesLoading = {};
  var globeLon = 80;
  var globeLat = 30;
  var globeDrag = null;
  var globeSkipClick = false;
  var globeLabelSide = {};
  var pulseDay = new Date().getDate();
  var liveBusy = false;
  var trafficBusy = false;

  var COUNTRY_LL = {
    HK: [114.2, 22.3], JP: [139.7, 35.7], DE: [8.7, 50.1], NL: [4.9, 52.4],
    US: [-118.2, 34.05], TW: [121.56, 25.03], AU: [151.21, -33.87], SG: [103.82, 1.35],
    KR: [126.98, 37.57], GB: [-0.13, 51.51], FR: [2.35, 48.86], CN: [121.47, 31.23],
    CA: [-123.12, 49.28], TH: [100.5, 13.75], MY: [101.69, 3.14], ID: [106.85, -6.21],
    VN: [106.63, 10.82], IN: [77.21, 28.61], AE: [55.27, 25.2], RU: [37.62, 55.75], BR: [-46.63, -23.55]
  };
  var CARRIER = { telecom: '电信', unicom: '联通', mobile: '移动' };
  var PAGES = ['overview', 'ping', 'traffic', 'routes', 'system'];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function css(name, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function hexToRgba(hex, alpha) {
    var raw = String(hex || '').replace('#', '').trim();
    if (raw.length === 3) raw = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
    var n = parseInt(raw, 16);
    if (!Number.isFinite(n)) return 'rgba(213,208,196,' + alpha + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function pad(value) { return String(value).padStart(2, '0'); }

  function clock(date) {
    date = date || new Date();
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  function isNum(value) { return value != null && Number.isFinite(Number(value)); }

  function fmtBytes(bytes, digits) {
    if (!isNum(bytes)) return '—';
    bytes = Number(bytes);
    var abs = Math.abs(bytes);
    var units = [[U.TB, 'TB'], [U.GB, 'GB'], [U.MB, 'MB'], [U.KB, 'KB'], [1, 'B']];
    for (var i = 0; i < units.length; i += 1) {
      if (abs >= units[i][0] || units[i][1] === 'B') {
        var value = bytes / units[i][0];
        var d = digits;
        if (d == null) d = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
        if (Math.abs(value - Math.round(value)) < 0.005 && units[i][1] !== 'TB') d = 0;
        return value.toFixed(d) + ' ' + units[i][1];
      }
    }
    return '0 B';
  }

  function fmtSpeed(value) { return isNum(value) ? fmtBytes(value, 1) + '/s' : '—'; }

  function fmtDays(seconds) {
    if (!isNum(seconds)) return '—';
    var value = Number(seconds);
    var days = Math.floor(value / U.DAY);
    if (days > 0) return days + ' 天';
    var hours = Math.floor(value / 3600);
    if (hours > 0) return hours + ' 小时';
    var minutes = Math.floor(value / 60);
    return minutes > 0 ? minutes + ' 分钟' : '< 1 分钟';
  }

  function pct(used, total) {
    if (!isNum(used) || !isNum(total) || Number(total) <= 0) return null;
    return Math.max(0, Math.min(100, Number(used) / Number(total) * 100));
  }

  function pctText(used, total) {
    var value = pct(used, total);
    return value == null ? '—' : Math.round(value) + '%';
  }

  function primaryPing(server) { return server && server.ping && server.ping[0] || null; }
  function pingMs(server) { var p = primaryPing(server); return p && isNum(p.current_ms) && p.current_ms >= 0 ? Number(p.current_ms) : null; }
  function pingLoss(server) { var p = primaryPing(server); return p && isNum(p.loss_pct) ? Number(p.loss_pct) : null; }

  function dailyStats(server) {
    var rows = server && server.daily_traffic || [];
    var values = rows.map(function (row) { return Number(row.total || 0); });
    if (!values.length) return { high: null, low: null, avg: null };
    var sum = values.reduce(function (a, b) { return a + b; }, 0);
    return { high: Math.max.apply(null, values), low: Math.min.apply(null, values), avg: sum / values.length };
  }

  function totals() {
    var used = 0;
    var limit = 0;
    var trafficCount = 0;
    var online = 0;
    var down = 0;
    var up = 0;
    state.servers.forEach(function (server) {
      if (isNum(server.traffic_used)) { used += Number(server.traffic_used); trafficCount += 1; }
      if (isNum(server.traffic_limit)) limit += Number(server.traffic_limit);
      if (server.online) online += 1;
      if (isNum(server.download_speed)) down += Number(server.download_speed);
      if (isNum(server.upload_speed)) up += Number(server.upload_speed);
    });
    return { used: trafficCount ? used : null, limit: limit, online: online, all: state.servers.length, down: down, up: up };
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function iconSun() {
    return '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.3 3.3l1.3 1.3M11.4 11.4l1.3 1.3M3.3 12.7l1.3-1.3M11.4 4.6l1.3-1.3"/></svg>';
  }

  function iconMoon() {
    return '<svg viewBox="0 0 16 16"><path d="M10.4 2.6a5.7 5.7 0 1 0 2.9 7.6 4.5 4.5 0 0 1-2.9-7.6z"/></svg>';
  }

  function iconGrid() {
    return '<svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="5" height="5"/><rect x="9.5" y="1.5" width="5" height="5"/><rect x="1.5" y="9.5" width="5" height="5"/><rect x="9.5" y="9.5" width="5" height="5"/></svg>';
  }

  function iconColumn() {
    return '<svg viewBox="0 0 16 16"><rect x="2" y="1.5" width="12" height="3.2"/><rect x="2" y="6.4" width="12" height="3.2"/><rect x="2" y="11.3" width="12" height="3.2"/></svg>';
  }

  function iconList() {
    return '<svg viewBox="0 0 16 16"><path d="M2 3.5h12M2 8h12M2 12.5h12"/></svg>';
  }

  function iconGlobe() {
    return '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2.2 2.2 2.2 9.8 0 12M8 2C5.8 4.2 5.8 11.8 8 14"/></svg>';
  }

  function setTheme(mode, persist) {
    var next = mode === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    if (persist !== false) {
      localStorage.setItem('komari-line-grid-theme', next);
      localStorage.setItem('mmwx-theme', next);
      localStorage.setItem('appearance', next);
    }
    var button = document.getElementById('theme-toggle');
    if (button) {
      button.innerHTML = next === 'light' ? iconMoon() : iconSun();
      button.setAttribute('aria-pressed', next === 'light' ? 'true' : 'false');
      button.setAttribute('aria-label', next === 'light' ? '切换夜间模式' : '切换日间模式');
      button.title = next === 'light' ? '夜间' : '日间';
    }
  }

  function decodePart(part) {
    try { return decodeURIComponent(part); } catch (_) { return part; }
  }

  function route() {
    var raw = (location.hash || '#/').replace(/^#/, '') || '/';
    var parts = raw.split('/').filter(Boolean).map(decodePart);
    var result = { home: 'nodes', view: view, uuid: null, page: 'overview' };
    if (parts[0] === 'network' || parts[0] === 'resource') {
      result.home = parts[0];
      home = result.home;
      if (parts[1] === 'node' && parts[2]) result.uuid = parts[2];
      if (PAGES.indexOf(parts[3]) >= 0) result.page = parts[3];
      return result;
    }
    home = 'nodes';
    if (parts[0] === 'grid' || parts[0] === 'column' || parts[0] === 'list') {
      result.view = parts[0];
      view = result.view;
      localStorage.setItem('komari-line-grid-view', view);
      if (parts[1] === 'node' && parts[2]) result.uuid = parts[2];
      if (PAGES.indexOf(parts[3]) >= 0) result.page = parts[3];
    } else if (parts[0] === 'node' && parts[1]) {
      result.uuid = parts[1];
      if (PAGES.indexOf(parts[2]) >= 0) result.page = parts[2];
    }
    return result;
  }

  function hashFor(options) {
    options = options || {};
    var section = options.home || home || 'nodes';
    var selectedView = options.view || view || 'grid';
    var uuid = options.uuid;
    var page = options.page || 'overview';
    var parts = [];
    if (section === 'network' || section === 'resource') {
      parts.push(section);
    } else if (selectedView !== 'grid') {
      parts.push(selectedView);
    }
    if (uuid) {
      parts.push('node', encodeURIComponent(uuid));
      if (page !== 'overview') parts.push(page);
    }
    return '#/' + parts.join('/');
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function nodeByUuid(uuid) {
    for (var i = 0; i < state.servers.length; i += 1) if (state.servers[i].uuid === uuid) return state.servers[i];
    return null;
  }

  function quotaTone(value) { return value != null && value >= 85 ? ' is-full' : value != null && value >= 60 ? ' is-hot' : ''; }

  function quotaBar(server) {
    if (!server.traffic_available || !isNum(server.traffic_used)) {
      return '<div class="quota"><div class="quota-h"><span>流量统计 <b>暂不可用</b></span><span>—</span></div><div class="quota-bar"><i style="width:0"></i></div></div>';
    }
    var used = Number(server.traffic_used);
    var limit = Number(server.traffic_limit || 0);
    var value = limit > 0 ? pct(used, limit) : null;
    var remain = limit > 0 ? Math.max(0, limit - used) : null;
    return '<div class="quota"><div class="quota-h"><span>已用 <b>' + fmtBytes(used, 1) + '</b>' + (limit > 0 ? ' / ' + fmtBytes(limit, 2) : '') + '</span><span>' + (limit > 0 ? '剩余 <b>' + fmtBytes(remain, 1) + '</b>' : '无限额') + '</span></div><div class="quota-bar' + quotaTone(value) + '" style="--p:' + (value == null ? 0 : value) + '%" data-tip="' + (value == null ? '无限额' : '已用 ' + value.toFixed(1) + '%') + '"><i></i></div></div>';
  }

  function quotaMini(server) {
    if (!server.traffic_available || !isNum(server.traffic_used)) return '<span class="quota-cell hide-sm"><span class="quota-cell-n">暂无统计</span><span class="quota-mini"><i style="width:0"></i></span></span>';
    var used = Number(server.traffic_used);
    var limit = Number(server.traffic_limit || 0);
    var value = limit > 0 ? pct(used, limit) : null;
    return '<span class="quota-cell hide-sm" title="' + (value == null ? '无限额' : '已用 ' + value.toFixed(1) + '%') + '"><span class="quota-cell-n">' + fmtBytes(used, 1) + (limit > 0 ? ' / ' + fmtBytes(limit, 2) : '') + '</span><span class="quota-mini' + quotaTone(value) + '" style="--p:' + (value == null ? 0 : value) + '%"><i></i></span></span>';
  }

  function relativePingTips(values, stepMinutes) {
    var count = values.length;
    return values.map(function (value, index) {
      var time = new Date(Date.now() - (count - 1 - index) * stepMinutes * 60000);
      return pad(time.getHours()) + ':' + pad(time.getMinutes()) + '  ' + (value < 0 ? '无数据' : Math.round(value) + ' ms');
    });
  }

  function trafficTips(rows) {
    return (rows || []).map(function (row) {
      return (row.date || '').slice(5) + '  合计 ' + fmtBytes(row.total, 1) + '  ↑ ' + fmtBytes(row.uplink, 1) + '  ↓ ' + fmtBytes(row.downlink, 1);
    });
  }

  function sparkValues(server) {
    var ping = primaryPing(server);
    if (!ping) return [];
    if (ping.buckets && ping.buckets.length > 1) return ping.buckets.map(function (bucket) { return Number(bucket.ms); });
    return [ping.avg_ms, ping.min_ms, ping.avg_ms, ping.max_ms, ping.current_ms].filter(isNum).map(Number);
  }

  function sparkOf(server, tall) {
    var values = sparkValues(server);
    var ms = pingMs(server);
    if (!values.length) return '<div class="spark-wrap is-empty"><span class="spark-empty">暂无延迟</span>' + (tall ? '' : '<span class="ms" data-live="ping">—</span>') + '</div>';
    return '<div class="spark-wrap">' + Charts.spark(values, { w: tall ? 420 : 240, h: tall ? 64 : 40, color: ms != null && ms >= 100 ? css('--gold', '#c4a56a') : css('--ink', '#d5d0c4'), tips: relativePingTips(values, 5) }) + (tall ? '' : '<span class="ms' + (ms != null && ms >= 100 ? ' is-hot' : '') + '" data-live="ping">' + (ms == null ? '—' : Math.round(ms) + ' ms') + '</span>') + '</div>';
  }

  function meter(name, value, total, liveName) {
    var amount = total == null ? (isNum(value) ? Number(value) : null) : pct(value, total);
    var text = amount == null ? '—' : Math.round(amount) + '%';
    return '<div class="meter"><span>' + name + ' <b data-live="' + liveName + '">' + text + '</b></span><i data-live-meter="' + liveName + '" style="--p:' + (amount == null ? 0 : amount) + '%"></i></div>';
  }

  function meters(server) {
    return '<div class="meters">' + meter('CPU', server.cpu_pct, 100, 'cpu') + meter('内存', server.mem_used, server.mem_total, 'mem') + meter('硬盘', server.disk_used, server.disk_total, 'disk') + '</div>';
  }

  function card(server) {
    return '<button class="cell" type="button" data-uuid="' + esc(server.uuid) + '" data-node="' + esc(server.uuid) + '"><div class="card"><div class="card-face"><div class="head"><span class="cc">' + esc(server.region_country || '--') + '</span><span class="name">' + esc(server.name) + '</span><span class="dot' + (server.online ? '' : ' is-off') + '" data-live-dot></span><span class="status" data-live="status">' + (server.online ? '在线' : '离线') + '</span></div><div class="speeds"><span>实时网速　↓ <b data-live="down">' + fmtSpeed(server.download_speed) + '</b>　↑ <b data-live="up">' + fmtSpeed(server.upload_speed) + '</b></span></div>' + sparkOf(server, false) + meters(server) + quotaBar(server) + '<div class="meta"><span>' + esc(server.region_city || server.region_name || '') + '</span><span>在线 <b data-live="uptime">' + fmtDays(server.uptime) + '</b></span></div></div></div></button>';
  }

  function row(server) {
    var ms = pingMs(server);
    return '<button class="row" type="button" data-uuid="' + esc(server.uuid) + '" data-node="' + esc(server.uuid) + '"><span class="cc">' + esc(server.region_country || '--') + '</span><span class="name">' + esc(server.name) + '</span><span class="status" data-live="status">' + (server.online ? '在线' : '离线') + '</span><span class="speeds">↓ <b data-live="down">' + fmtSpeed(server.download_speed) + '</b>　↑ <b data-live="up">' + fmtSpeed(server.upload_speed) + '</b></span><span class="ms' + (ms != null && ms >= 100 ? ' is-hot' : '') + '" data-live="ping">' + (ms == null ? '—' : Math.round(ms) + ' ms') + '</span>' + sparkOf(server, true) + '<span class="hide-sm" data-live="cpu">' + (isNum(server.cpu_pct) ? Math.round(server.cpu_pct) + '%' : '—') + '</span><span class="hide-sm" data-live="mem">' + pctText(server.mem_used, server.mem_total) + '</span><span class="hide-sm" data-live="disk">' + pctText(server.disk_used, server.disk_total) + '</span>' + quotaMini(server) + '<span class="hide-sm" data-live="uptime">' + fmtDays(server.uptime) + '</span></button>';
  }

  function listHead() {
    return '<div class="row row-h" aria-hidden="true"><span>地区</span><span>名称</span><span>状态</span><span>实时网速</span><span>延迟</span><span>曲线</span><span>CPU</span><span>内存</span><span>硬盘</span><span>流量</span><span>在线</span></div>';
  }

  function slab(server) {
    var ms = pingMs(server);
    var stats = dailyStats(server);
    var last7 = server.daily_traffic || [];
    var routes = (server.return_routes || []).map(function (route) { return (CARRIER[route.carrier] || route.carrier || 'route') + ' <b>' + esc(route.route_type || '—') + '</b>'; }).join('　');
    return '<button class="slab" type="button" data-uuid="' + esc(server.uuid) + '" data-node="' + esc(server.uuid) + '"><div class="slab-top"><div class="head"><span class="cc">' + esc(server.region_country || '--') + '</span><span class="name">' + esc(server.name) + '</span><span class="dot' + (server.online ? '' : ' is-off') + '" data-live-dot></span><span class="status"><b data-live="status">' + (server.online ? '在线' : '离线') + '</b> · ' + esc(server.region_city || server.region_name || '') + '</span></div><span class="more">打开窗口 →</span></div><div class="slab-grid"><div><div class="slab-ms' + (ms != null && ms >= 100 ? ' is-hot' : '') + '"><span data-live="ping-plain">' + (ms == null ? '—' : Math.round(ms)) + '</span><small>MS</small></div><div class="speeds">↓ <b data-live="down">' + fmtSpeed(server.download_speed) + '</b>　↑ <b data-live="up">' + fmtSpeed(server.upload_speed) + '</b></div>' + sparkOf(server, true) + '</div><div>' + meters(server) + '<div style="margin-top:14px">' + quotaBar(server) + '</div><div class="meta" style="margin-top:10px"><span>在线 <b data-live="uptime">' + fmtDays(server.uptime) + '</b></span></div></div><div><div class="stat-col" style="margin-bottom:8px">近 7 日　均 ' + fmtBytes(stats.avg, 1) + '　丢包 <span data-live="loss">' + (pingLoss(server) == null ? '—' : pingLoss(server).toFixed(2) + '%') + '</span></div>' + Charts.bars(last7, { w: 280, h: 52, tips: trafficTips(last7) }) + '<div class="slab-routes">' + (routes || '暂无回程') + '</div></div></div></button>';
  }

  function listToolbar() {
    return '<div class="list-bar" id="views"><span class="list-bar-k">机器清单</span><div class="views"><button class="icon-btn' + (view === 'grid' ? ' is-on' : '') + '" data-view="grid" type="button" aria-label="网格排列" title="网格">' + iconGrid() + '</button><button class="icon-btn' + (view === 'column' ? ' is-on' : '') + '" data-view="column" type="button" aria-label="列排列" title="列">' + iconColumn() + '</button><button class="icon-btn' + (view === 'list' ? ' is-on' : '') + '" data-view="list" type="button" aria-label="横向排列" title="横向">' + iconList() + '</button><button class="icon-btn' + (showGlobe ? ' is-on' : '') + '" data-globe type="button" aria-label="显示地球" title="地球开/关">' + iconGlobe() + '</button></div></div>';
  }

  function fleetStrip() {
    var total = totals();
    var regions = {};
    state.servers.forEach(function (server) { regions[server.region_name || server.region_country || '—'] = 1; });
    return '<section class="fleet" aria-label="集群概览"><article><div class="lbl">节点</div><div class="val"><span data-fleet="all">' + total.all + '</span></div><div class="sub">在线 <b data-fleet="online">' + total.online + '</b> · 离线 <b data-fleet="offline">' + (total.all - total.online) + '</b></div></article><article><div class="lbl">地区</div><div class="val">' + Object.keys(regions).length + '</div><div class="sub">独立地域</div></article><article><div class="lbl">下行合计</div><div class="val" data-fleet="down">' + fmtSpeed(total.down) + '</div><div class="sub">上行 <b data-fleet="up">' + fmtSpeed(total.up) + '</b></div></article><article><div class="lbl">周期流量</div><div class="val">' + fmtBytes(total.used, 1) + '</div><div class="sub">限额 ' + fmtBytes(total.limit, 2) + '</div></article></section>';
  }

  function wrapLon(value) { return ((value + 180) % 360 + 360) % 360 - 180; }

  function coordFor(server) {
    if (isNum(server.longitude) && isNum(server.latitude)) return [Number(server.longitude), Number(server.latitude)];
    return COUNTRY_LL[server.region_country] || [80, 30];
  }

  function globeCaption() {
    var lon = Math.round(globeLon);
    var lat = Math.round(globeLat);
    return 'ORTHOGRAPHIC · ' + Math.abs(lon) + '°' + (lon >= 0 ? 'E' : 'W') + ' ' + Math.abs(lat) + '°' + (lat >= 0 ? 'N' : 'S');
  }

  function labelWidth(text) {
    var width = 0;
    for (var i = 0; i < text.length; i += 1) width += text.charCodeAt(i) > 255 ? 8.6 : 5.05;
    return width + 2;
  }

  function layoutGlobeLabels(cx, project) {
    var items = [];
    state.servers.forEach(function (server, index) {
      var ll = coordFor(server);
      var point = project(ll[0], ll[1]);
      if (!point) return;
      var label = (server.region_country || '') + ' · ' + server.name;
      items.push({ uuid: server.uuid, order: index, server: server, px: point.x, py: point.y, label: label, w: labelWidth(label) });
    });
    var buckets = {};
    items.forEach(function (item) {
      var key = item.server.region_country || '?';
      (buckets[key] = buckets[key] || []).push(item);
    });
    Object.keys(buckets).forEach(function (key) {
      var group = buckets[key];
      if (group.length < 2) return;
      group.forEach(function (item, index) {
        var angle = index / group.length * Math.PI * 2 - Math.PI / 2;
        item.px += Math.cos(angle) * 4.2;
        item.py += Math.sin(angle) * 4.2;
      });
    });
    var left = [];
    var right = [];
    items.forEach(function (item) {
      var side = item.px >= cx ? 'R' : 'L';
      if (globeLabelSide[item.uuid] && Math.abs(item.px - cx) < 22) side = globeLabelSide[item.uuid];
      if (side === 'L' && item.w > 64) side = 'R';
      (side === 'L' ? left : right).push(item);
    });
    function stack(list, x, endSide) {
      list.sort(function (a, b) { return a.py - b.py || a.order - b.order; });
      if (!list.length) return;
      var gap = list.length > 14 ? 11 : 13;
      var mean = list.reduce(function (sum, item) { return sum + item.py; }, 0) / list.length;
      var start = mean - (list.length - 1) * gap / 2;
      if (start < 12) start = 12;
      var last = start + (list.length - 1) * gap;
      if (last > 204) start -= last - 204;
      if (start < 12) start = 12;
      list.forEach(function (item, index) {
        item.lx = x;
        item.ly = start + index * gap;
        item.end = endSide;
        globeLabelSide[item.uuid] = endSide ? 'L' : 'R';
      });
    }
    stack(left, 70, true);
    stack(right, 270, false);
    return items;
  }

  function globeMarkup() {
    var cx = 168;
    var cy = 112;
    var radius = 92;
    var lon0 = globeLon * Math.PI / 180;
    var lat0 = globeLat * Math.PI / 180;
    var ink = hexToRgba(css('--ink', '#d5d0c4'), 0.38);
    var dim = hexToRgba(css('--ink', '#d5d0c4'), 0.14);
    function project(lonDegrees, latDegrees) {
      var lon = lonDegrees * Math.PI / 180;
      var lat = latDegrees * Math.PI / 180;
      var cosc = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(lon - lon0);
      if (cosc <= 0.02) return null;
      return {
        x: cx + radius * Math.cos(lat) * Math.sin(lon - lon0),
        y: cy - radius * (Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(lon - lon0)),
        k: cosc
      };
    }
    function curve(lonFixed, latFixed, from, to, step) {
      var d = '';
      var started = false;
      for (var value = from; value <= to; value += step) {
        var point = lonFixed != null ? project(lonFixed, value) : project(value, latFixed);
        if (!point) { started = false; continue; }
        d += (started ? ' L ' : 'M ') + point.x.toFixed(2) + ' ' + point.y.toFixed(2);
        started = true;
      }
      return d ? '<path d="' + d + '" fill="none" stroke="' + dim + '" stroke-width="0.9"/>' : '';
    }
    var wire = '<defs><radialGradient id="globe-shade" cx="38%" cy="36%" r="68%"><stop offset="0%" stop-color="' + css('--ink', '#d5d0c4') + '" stop-opacity="0.05"/><stop offset="70%" stop-color="' + css('--ink', '#d5d0c4') + '" stop-opacity="0"/><stop offset="100%" stop-color="' + css('--void', '#0c0c0c') + '" stop-opacity="0.28"/></radialGradient></defs><circle class="globe-disk" cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="url(#globe-shade)" stroke="' + ink + '" stroke-width="1.05"/>';
    for (var lon = -180; lon < 180; lon += 30) wire += curve(lon, null, -80, 80, 4);
    for (var lat = -60; lat <= 60; lat += 30) wire += curve(null, lat, -180, 180, 4);
    wire += curve(null, 0, -180, 180, 3).replace('stroke-width="0.9"', 'stroke-width="1.15"');
    var sweepLon = ((Date.now() / 28) % 360) - 180;
    for (var sweepIndex = 0; sweepIndex < 6; sweepIndex += 1) {
      var sweep = curve(sweepLon - sweepIndex * 8, null, -80, 80, 3);
      if (sweep) wire += sweep.replace('stroke-width="0.9"', 'stroke-width="' + (sweepIndex === 0 ? 1.6 : 1.1) + '"').replace(dim, hexToRgba(css('--ink', '#d5d0c4'), 0.42 - sweepIndex * 0.06));
    }
    wire += '<line x1="48" y1="' + (cy + radius + 16) + '" x2="288" y2="' + (cy + radius + 16) + '" stroke="' + ink + '" stroke-width="1"/>';
    var laid = layoutGlobeLabels(cx, project);
    var links = '';
    var online = laid.filter(function (item) { return item.server.online; });
    online.forEach(function (a, i) {
      online.forEach(function (b, j) {
        if (j <= i) return;
        if ((a.server.region_country || '') === (b.server.region_country || '')) return;
        if ((a.order * 7 + b.order * 3) % 4 !== 1) return;
        var mx = (a.px + b.px) / 2;
        var my = (a.py + b.py) / 2;
        var qx = cx + (mx - cx) * 0.42;
        var qy = cy + (my - cy) * 0.42;
        links += '<path class="globe-link" d="M ' + a.px.toFixed(1) + ' ' + a.py.toFixed(1) + ' Q ' + qx.toFixed(1) + ' ' + qy.toFixed(1) + ' ' + b.px.toFixed(1) + ' ' + b.py.toFixed(1) + '" fill="none" stroke="' + ink + '" stroke-width="0.55" opacity="0.32"/>';
      });
    });
    var pins = laid.map(function (item) {
      var textX = item.end ? item.lx - 3 : item.lx + 3;
      return '<g class="globe-node" data-globe-node="' + esc(item.uuid) + '"><path d="M ' + item.px.toFixed(1) + ' ' + item.py.toFixed(1) + ' L ' + item.lx.toFixed(1) + ' ' + item.ly.toFixed(1) + '" fill="none" stroke="' + ink + '" stroke-width="0.75"/><circle class="globe-pin" cx="' + item.px.toFixed(1) + '" cy="' + item.py.toFixed(1) + '" r="2.1" fill="none" stroke="' + (item.server.online ? ink : css('--down', '#b06d52')) + '" stroke-width="1"/><text x="' + textX.toFixed(1) + '" y="' + (item.ly + 3).toFixed(1) + '" text-anchor="' + (item.end ? 'end' : 'start') + '" fill="' + css('--ink-soft', '#b8b2a4') + '" font-size="8.5" font-family="IBM Plex Mono, ui-monospace, monospace" stroke="' + css('--void', '#0c0c0c') + '" stroke-width="3" paint-order="stroke" stroke-linejoin="round">' + esc(item.label) + '</text><circle class="hit" cx="' + item.px.toFixed(1) + '" cy="' + item.py.toFixed(1) + '" r="9" fill="transparent" data-uuid="' + esc(item.uuid) + '"/></g>';
    }).join('');
    return wire + links + pins + '<text x="168" y="' + (cy + radius + 28) + '" text-anchor="middle" fill="' + hexToRgba(css('--ink', '#d5d0c4'), 0.28) + '" font-size="8" font-family="IBM Plex Mono, ui-monospace, monospace" letter-spacing="1.4">' + globeCaption() + '</text>';
  }

  function globePanel() {
    if (!showGlobe) return '';
    var regions = {};
    var order = [];
    state.servers.forEach(function (server) {
      var key = (server.region_country || '--') + ' · ' + (server.region_city || server.region_name || '');
      if (!Object.prototype.hasOwnProperty.call(regions, key)) order.push(key);
      regions[key] = (regions[key] || 0) + 1;
    });
    var side = order.map(function (key) { return '<div class="reg"><span>' + esc(key) + '</span><b>' + regions[key] + '</b></div>'; }).join('');
    return '<section class="home-globe" aria-label="节点地球"><div class="atlas"><svg viewBox="0 0 420 240" preserveAspectRatio="xMidYMid meet">' + globeMarkup() + '</svg></div><aside class="atlas-side"><div class="lbl">地区</div>' + side + '</aside></section>';
  }

  function paintGlobe() {
    var svg = main.querySelector('.atlas svg');
    if (svg) svg.innerHTML = globeMarkup();
  }

  function monthPulse() {
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var days = new Date(year, month + 1, 0).getDate();
    var map = {};
    state.servers.forEach(function (server) {
      (server.traffic_history || []).forEach(function (row) {
        if (!row.date || new Date(row.date + 'T00:00:00').getMonth() !== month) return;
        var item = map[row.date] || (map[row.date] = { date: row.date, total: 0, peak: '', peakValue: 0 });
        item.total += Number(row.total || 0);
        if (Number(row.total || 0) > item.peakValue) { item.peakValue = Number(row.total || 0); item.peak = server.name; }
      });
    });
    var rows = [];
    var acc = 0;
    for (var day = 1; day <= days; day += 1) {
      var date = year + '-' + pad(month + 1) + '-' + pad(day);
      var item = map[date] || { date: date, total: 0, peak: '', peakValue: 0 };
      acc += item.total;
      rows.push({ day: day, date: date, total: item.total, peak: item.peak || '—', acc: acc });
    }
    return rows;
  }

  function cycleBlock() {
    var rows = monthPulse();
    if (!rows.length) return '';
    var today = Math.min(new Date().getDate(), rows.length);
    if (pulseDay < 1 || pulseDay > rows.length) pulseDay = today;
    var selected = rows[pulseDay - 1] || rows[today - 1];
    var usedNow = rows.slice(0, today).reduce(function (sum, row) { return sum + row.total; }, 0);
    var half = rows.find(function (row) { return row.day <= today && row.acc >= usedNow * 0.5; });
    var hits = rows.map(function (row) { return '<button type="button" data-day="' + row.day + '" aria-label="' + row.date + '"></button>'; }).join('');
    return '<section class="cycle" aria-label="本月脉搏"><div class="cycle-head"><span>本月脉搏　<b>' + selected.date.slice(5) + '</b>　全网 ' + fmtBytes(selected.total, 1) + (selected.total ? '　最忙 ' + esc(selected.peak) : '') + '</span><span>已过 ' + today + '/' + rows.length + '　累计 ' + fmtBytes(usedNow, 1) + '　空心点 = 过半</span></div><div class="ruler">' + Charts.ruler(today, rows.length, { heights: rows.map(function (row) { return row.total; }), selected: pulseDay, halfDay: half ? half.day : 0 }) + '<div class="ruler-hit">' + hits + '</div></div></section>';
  }

  function renderNodes() {
    if (!state.servers.length) { main.innerHTML = emptyHTML('暂无节点', 'Komari 当前没有可公开展示的节点。'); return; }
    var html = fleetStrip() + globePanel() + listToolbar();
    if (view === 'column') html += '<section class="stack" aria-label="列排列">' + state.servers.map(slab).join('') + '</section>';
    else if (view === 'list') html += '<section class="list" aria-label="横向排列">' + listHead() + state.servers.map(row).join('') + '</section>';
    else html += '<section class="board" aria-label="网格排列">' + state.servers.map(card).join('') + '</section>';
    main.innerHTML = html + cycleBlock();
  }

  function seriesKey(uuid, selectedRange, selectedTarget) { return uuid + ':' + selectedRange + ':' + (selectedTarget || 'all'); }

  function seriesStepMinutes() { return range === '24h' ? 30 : range === '6h' ? 10 : 5; }

  function loadSeries(uuid, selectedTarget, force) {
    if (!uuid) return Promise.resolve(null);
    var target = selectedTarget == null ? targetKey : selectedTarget;
    var key = seriesKey(uuid, range, target || 'all');
    if (seriesCache[key] && !force) return Promise.resolve(seriesCache[key]);
    if (seriesLoading[key]) return seriesLoading[key];
    var hours = range === '24h' ? 24 : range === '6h' ? 6 : 1;
    seriesLoading[key] = API.getPingHistory(uuid, hours, target && target !== 'all' ? target : null).then(function (result) {
      var records = (result.records || []).filter(function (record) { return !target || target === 'all' || String(record.task_id) === String(target); });
      records.sort(function (a, b) { return new Date(a.time) - new Date(b.time); });
      var values = [];
      var times = [];
      if (!target || target === 'all') {
        var bucketSize = seriesStepMinutes() * 60000;
        var buckets = {};
        records.forEach(function (record) {
          var time = new Date(record.time).getTime();
          if (!Number.isFinite(time)) return;
          var bucket = Math.floor(time / bucketSize) * bucketSize;
          (buckets[bucket] = buckets[bucket] || []).push(Number(record.value));
        });
        Object.keys(buckets).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (keyName) {
          var group = buckets[keyName];
          var good = group.filter(function (value) { return Number.isFinite(value) && value >= 0; });
          values.push(good.length ? good.reduce(function (a, b) { return a + b; }, 0) / good.length : -1);
          times.push(new Date(Number(keyName)).toISOString());
        });
      } else {
        records.forEach(function (record) {
          var value = Number(record.value);
          if (!Number.isFinite(value)) return;
          values.push(value);
          times.push(record.time);
        });
      }
      var output = { values: values, times: times, raw: result };
      seriesCache[key] = output;
      return output;
    }).catch(function (err) {
      var output = { values: [], times: [], error: err.message || String(err) };
      seriesCache[key] = output;
      return output;
    }).finally(function () { delete seriesLoading[key]; });
    return seriesLoading[key];
  }

  function rangeButtons() {
    return '<div class="seg">' + ['1h', '6h', '24h'].map(function (key) { return '<button type="button" data-range="' + key + '" class="' + (range === key ? 'is-on' : '') + '">' + key + '</button>'; }).join('') + '</div>';
  }

  function networkTargetButtons(server) {
    var targets = server.ping || [];
    return '<div class="pick"><button type="button" class="chip' + (targetKey === 'all' ? ' is-on' : '') + '" data-nett="all">全部平均</button>' + targets.map(function (ping) { return '<button type="button" class="chip' + (targetKey === ping.key ? ' is-on' : '') + '" data-nett="' + esc(ping.key) + '">' + esc(ping.label) + ' · ' + (ping.current_ms < 0 ? '—' : Math.round(ping.current_ms) + 'ms') + '</button>'; }).join('') + '</div>';
  }

  function validPingTargets(server) { return (server.ping || []).filter(function (ping) { return isNum(ping.current_ms) && Number(ping.current_ms) >= 0; }); }

  function currentNetworkStats(server) {
    var targets = validPingTargets(server);
    if (targetKey !== 'all') {
      var chosen = (server.ping || []).find(function (ping) { return ping.key === targetKey; });
      return { ms: chosen && chosen.current_ms >= 0 ? Number(chosen.current_ms) : null, loss: chosen && isNum(chosen.loss_pct) ? Number(chosen.loss_pct) : null };
    }
    if (!targets.length) return { ms: null, loss: null };
    return {
      ms: targets.reduce(function (sum, ping) { return sum + Number(ping.current_ms); }, 0) / targets.length,
      loss: targets.reduce(function (sum, ping) { return sum + Number(ping.loss_pct || 0); }, 0) / targets.length
    };
  }

  function seriesChart(uuid) {
    var cache = seriesCache[seriesKey(uuid, range, targetKey || 'all')];
    if (!cache) return '<div class="chart-empty">正在读取历史数据…</div>';
    if (!cache.values.length) return '<div class="chart-empty">没有可用的历史 Ping 数据。</div>';
    return Charts.spark(cache.values, { w: 960, h: 210, color: css('--ink', '#d5d0c4'), tips: cache.times.map(function (time, index) { return new Date(time).toLocaleString() + ' · ' + (cache.values[index] < 0 ? '无数据' : Math.round(cache.values[index]) + ' ms'); }) });
  }

  function renderNetwork() {
    if (!state.servers.length) { main.innerHTML = emptyHTML('暂无网络数据', '没有可展示的节点。'); return; }
    var r = route();
    var selected = nodeByUuid(r.uuid) || state.servers.find(function (server) { return server.online && server.ping && server.ping.length; }) || state.servers[0];
    var targets = selected.ping || [];
    if (targetKey !== 'all' && !targets.some(function (ping) { return ping.key === targetKey; })) targetKey = 'all';
    var stats = currentNetworkStats(selected);
    main.innerHTML = '<section class="subpage" data-node="' + esc(selected.uuid) + '"><p class="lead">按服务器与探测目标查看延迟、丢包和时间桶。</p><div class="pick server-pick">' + state.servers.map(function (server) { return '<button type="button" class="chip' + (server.uuid === selected.uuid ? ' is-on' : '') + '" data-net="' + esc(server.uuid) + '">' + esc(server.name) + '</button>'; }).join('') + '</div><section class="kpi"><article><div class="lbl">平均延迟</div><div class="val" data-net-live="ms">' + (stats.ms == null ? '—' : Math.round(stats.ms) + ' ms') + '</div><div class="sub">' + esc(selected.name) + '</div></article><article><div class="lbl">平均丢包</div><div class="val" data-net-live="loss">' + (stats.loss == null ? '—' : stats.loss.toFixed(2) + '%') + '</div><div class="sub">' + (targetKey === 'all' ? '全部目标' : '所选目标') + '</div></article><article><div class="lbl">时间范围</div><div class="val">' + range + '</div><div class="sub">1h / 6h / 24h</div></article><article><div class="lbl">探测目标</div><div class="val">' + targets.length + '</div><div class="sub">Komari Ping Tasks</div></article></section><div class="panel-h network-controls">' + networkTargetButtons(selected) + rangeButtons() + '</div><div class="chart-fill network-chart">' + seriesChart(selected.uuid) + '</div></section>' + cycleBlock();
    if (!seriesCache[seriesKey(selected.uuid, range, targetKey || 'all')]) loadSeries(selected.uuid, targetKey).then(function () { if (route().home === 'network') renderNetwork(); });
  }

  function dateKey(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }

  function aggregateLast7() {
    var map = {};
    state.servers.forEach(function (server) {
      (server.daily_traffic || []).forEach(function (row) {
        var item = map[row.date] || (map[row.date] = { date: row.date, uplink: 0, downlink: 0, total: 0 });
        item.uplink += Number(row.uplink || 0);
        item.downlink += Number(row.downlink || 0);
        item.total = item.uplink + item.downlink;
      });
    });
    var rows = [];
    for (var i = 6; i >= 0; i -= 1) {
      var date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);
      var key = dateKey(date);
      rows.push(map[key] || { date: key, uplink: 0, downlink: 0, total: 0 });
    }
    return rows;
  }

  function monthlyEquivalent(price, days) {
    if (!isNum(price) || Number(price) <= 0) return null;
    if (!isNum(days) || Number(days) <= 0) return Number(price);
    return Number(price) * 30 / Number(days);
  }

  function costSummary() {
    var groups = {};
    var priced = 0;
    state.servers.forEach(function (server) {
      var currency;
      var price;
      if (isNum(server.renewal_price_cny) && Number(server.renewal_price_cny) > 0) { currency = 'CNY'; price = Number(server.renewal_price_cny); }
      else if (isNum(server.renewal_price) && Number(server.renewal_price) > 0) { currency = String(server.renewal_currency || 'OTHER').toUpperCase(); price = Number(server.renewal_price); }
      else return;
      var monthly = monthlyEquivalent(price, server.renewal_cycle_days);
      if (monthly == null) return;
      groups[currency] = (groups[currency] || 0) + monthly;
      priced += 1;
    });
    var keys = Object.keys(groups);
    if (!keys.length) return { main: '—', sub: '未配置有效价格', priced: 0 };
    if (keys.length === 1) return { main: API.currencySymbol(keys[0]) + groups[keys[0]].toFixed(groups[keys[0]] >= 100 ? 0 : 2), sub: '按账单天数折算', priced: priced };
    var detail = keys.map(function (key) { return API.currencySymbol(key) + groups[key].toFixed(groups[key] >= 100 ? 0 : 2); }).join(' · ');
    return { main: '多币种', sub: detail, priced: priced };
  }

  function fmtRenewal(server) {
    var price = isNum(server.renewal_price_cny) && Number(server.renewal_price_cny) > 0 ? '¥' + Number(server.renewal_price_cny).toFixed(Number(server.renewal_price_cny) >= 100 ? 0 : 2) : (isNum(server.renewal_price) && Number(server.renewal_price) > 0 ? API.currencySymbol(server.renewal_currency) + Number(server.renewal_price).toFixed(Number(server.renewal_price) >= 100 ? 0 : 2) : '—');
    return price === '—' ? '—' : price + ' / ' + (server.renewal_cycle_days ? Number(server.renewal_cycle_days) + 'd' : '?');
  }

  function renderResource() {
    var total = totals();
    var cost = costSummary();
    var last7 = aggregateLast7();
    var ranked = state.servers.slice().sort(function (a, b) { return (pct(b.traffic_used, b.traffic_limit) || -1) - (pct(a.traffic_used, a.traffic_limit) || -1); });
    var heat = state.servers.slice().sort(function (a, b) { return (Number(b.cpu_pct) || -1) - (Number(a.cpu_pct) || -1); });
    var soon = state.servers.filter(function (server) { return !!server.expires_at; }).sort(function (a, b) { return a.expires_at.localeCompare(b.expires_at); }).slice(0, 6);
    main.innerHTML = '<section class="subpage"><p class="lead"><b data-fleet="online">' + total.online + '</b>/' + total.all + ' 台在线。聚合 Komari 实时指标与历史流量。</p><section class="kpi"><article><div class="lbl">节点月成本</div><div class="val">' + esc(cost.main) + '</div><div class="sub">' + esc(cost.sub) + '</div></article><article><div class="lbl">已配置价格</div><div class="val">' + cost.priced + '</div><div class="sub">有效节点</div></article><article><div class="lbl">周期用量</div><div class="val">' + fmtBytes(total.used, 1) + '</div><div class="sub">限额 ' + fmtBytes(total.limit, 1) + '</div></article><article><div class="lbl">有限额</div><div class="val">' + state.servers.filter(function (server) { return Number(server.traffic_limit || 0) > 0; }).length + '</div><div class="sub">台服务器</div></article></section><section class="panels resource-panels"><div class="panel"><div class="panel-h"><h3>近 7 日上下行</h3><span class="hero-sub">金 = 上行 · 灰 = 下行</span></div>' + Charts.stacked(last7, { w: 520, h: 150, tips: trafficTips(last7) }) + '</div><div class="panel"><div class="panel-h"><h3>额度使用率</h3></div>' + ranked.slice(0, 6).map(function (server) { var value = pct(server.traffic_used, server.traffic_limit); return '<div class="rank"><div class="reg"><span>' + esc(server.name) + '</span><b>' + (value == null ? '—' : Math.round(value) + '%') + '</b></div><i style="--p:' + (value == null ? 0 : value) + '%"></i></div>'; }).join('') + '</div></section><div class="panel resource-heat"><div class="panel-h"><h3>资源压力</h3><span class="hero-sub">CPU · 内存 · 硬盘</span></div><table class="heat"><thead><tr><th>服务器</th><th>CPU</th><th>内存</th><th>硬盘</th><th>Load</th></tr></thead><tbody>' + heat.map(function (server) { return '<tr data-node="' + esc(server.uuid) + '"><td>' + esc(server.name) + '</td><td><span data-live="cpu">' + (isNum(server.cpu_pct) ? Math.round(server.cpu_pct) + '%' : '—') + '</span><i class="bar"><i data-live-meter="cpu" style="width:' + (isNum(server.cpu_pct) ? server.cpu_pct : 0) + '%"></i></i></td><td data-live="mem">' + pctText(server.mem_used, server.mem_total) + '</td><td data-live="disk">' + pctText(server.disk_used, server.disk_total) + '</td><td data-live="load">' + esc(server.loadavg ? server.loadavg.split(' ')[0] : '—') + '</td></tr>'; }).join('') + '</tbody></table></div><div class="panel renewal-panel"><div class="panel-h"><h3>续费与到期</h3><span class="hero-sub">异常/永久日期不会显示</span></div>' + (soon.length ? '<div class="timeline">' + soon.map(function (server) { var days = Math.ceil((new Date(server.expires_at + 'T00:00:00') - new Date()) / 86400000); return '<article><div>' + esc(server.expires_at) + '</div><b>' + esc(server.name) + '</b><span>' + (days >= 0 ? days + ' 天' : '已到期') + ' · ' + esc(fmtRenewal(server)) + '</span></article>'; }).join('') + '</div>' : '<div class="chart-empty">没有有效的到期日期。</div>') + '</div></section>' + cycleBlock();
  }

  function detailTargetButtons(server) {
    var targets = server.ping || [];
    var merge = targets.length > 1 ? '<button type="button" class="chip' + (detailTargetKey === 'merge' ? ' is-on' : '') + '" data-target="merge">' + targets.length + '线合并</button>' : '';
    return '<div class="targets">' + merge + targets.map(function (ping) { return '<button type="button" class="chip' + (detailTargetKey === ping.key ? ' is-on' : '') + '" data-target="' + esc(ping.key) + '">' + esc(ping.label) + ' · ' + (ping.current_ms < 0 ? '—' : Math.round(ping.current_ms) + 'ms') + '</button>'; }).join('') + '</div>';
  }

  function detailSeries(server) {
    if (detailTargetKey === 'merge') return null;
    var target = detailTargetKey || (server.ping && server.ping[0] ? server.ping[0].key : 'all');
    return seriesCache[seriesKey(server.uuid, range, target)] || null;
  }

  function detailSeriesReady(server) {
    var targets = server.ping || [];
    if (detailTargetKey !== 'merge') return !!detailSeries(server);
    return targets.length > 0 && targets.every(function (ping) { return !!seriesCache[seriesKey(server.uuid, range, ping.key)]; });
  }

  function loadDetailSeries(server, force) {
    if (!server || !server.ping || !server.ping.length) return Promise.resolve([]);
    if (detailTargetKey === 'merge') {
      return Promise.all(server.ping.map(function (ping) { return loadSeries(server.uuid, ping.key, force); }));
    }
    return loadSeries(server.uuid, detailTargetKey || server.ping[0].key, force);
  }

  function mergedLegend(server) {
    if (detailTargetKey !== 'merge') return '';
    var colors = [css('--ink', '#d5d0c4'), css('--gold', '#c4a56a'), css('--live', '#8fa676'), css('--ink-dim', '#aea89a'), css('--down', '#b06d52')];
    return '<div class="line-legend">' + (server.ping || []).map(function (ping, index) { return '<span><i style="background:' + colors[index % colors.length] + '"></i>' + esc(ping.label) + '</span>'; }).join('') + '</div>';
  }

  function detailSeriesChart(server, width, height) {
    if (detailTargetKey === 'merge') {
      var rows = (server.ping || []).map(function (ping, index) {
        var cache = seriesCache[seriesKey(server.uuid, range, ping.key)];
        if (!cache || !cache.values.length) return null;
        return {
          label: ping.label,
          values: cache.values,
          tips: cache.times.map(function (time, pointIndex) { return new Date(time).toLocaleString() + ' · ' + ping.label + ' · ' + (cache.values[pointIndex] < 0 ? '无数据' : Math.round(cache.values[pointIndex]) + ' ms'); }),
          dash: index === 1 ? '5 3' : index === 2 ? '2 3' : ''
        };
      }).filter(Boolean);
      if (!rows.length) return '<div class="chart-empty">正在读取合并历史数据…</div>';
      return Charts.multiSpark(rows, { w: width || 520, h: height || 88 });
    }
    var cache = detailSeries(server);
    if (!cache) return '<div class="chart-empty">读取历史中…</div>';
    if (!cache.values.length) return '<div class="chart-empty">暂无历史 Ping 数据。</div>';
    return Charts.spark(cache.values, { w: width || 520, h: height || 88, color: css('--ink', '#d5d0c4'), tips: cache.times.map(function (time, index) { return new Date(time).toLocaleString() + ' · ' + (cache.values[index] < 0 ? '无数据' : Math.round(cache.values[index]) + ' ms'); }) });
  }

  function detailOverview(server) {
    var ping = primaryPing(server);
    var stats = dailyStats(server);
    var rows = server.daily_traffic || [];
    var routes = server.return_routes || [];
    var note = server.online ? '在线' : (server.has_live ? '离线' : '离线 · 暂无最新上报');
    return '<article class="sheet" data-node="' + esc(server.uuid) + '"><header class="sheet-head"><div class="hero-sub">' + note + ' · ' + esc(server.region_name || server.region_city || '') + (server.provider_name ? ' · ' + esc(server.provider_name) : '') + ' · 在线 <span data-live="uptime">' + fmtDays(server.uptime) + '</span></div><div class="ms-xl"><span data-live="ping-plain">' + (pingMs(server) == null ? '—' : Math.round(pingMs(server))) + '</span><small>MS</small></div></header>' + Charts.wave({ w: 960, h: 36 }) + '<section class="kpi"><article><div class="lbl">下行</div><div class="val" data-live="down">' + fmtSpeed(server.download_speed) + '</div><div class="sub">上行 <span data-live="up">' + fmtSpeed(server.upload_speed) + '</span></div></article><article><div class="lbl">CPU</div><div class="val" data-live="cpu">' + (isNum(server.cpu_pct) ? Math.round(server.cpu_pct) + '%' : '—') + '</div><div class="sub">负载 <span data-live="load">' + esc(server.loadavg || '—') + '</span></div></article><article><div class="lbl">内存</div><div class="val" data-live="mem">' + pctText(server.mem_used, server.mem_total) + '</div><div class="sub">' + fmtBytes(server.mem_used, 1) + ' / ' + fmtBytes(server.mem_total, 0) + '</div></article><article><div class="lbl">硬盘</div><div class="val" data-live="disk">' + pctText(server.disk_used, server.disk_total) + '</div><div class="sub">' + fmtBytes(server.disk_used, 1) + ' / ' + fmtBytes(server.disk_total, 0) + '</div></article><article><div class="lbl">周期流量</div><div class="val">' + fmtBytes(server.traffic_used, 1) + '</div><div class="sub">限额 ' + fmtBytes(server.traffic_limit, 2) + '</div></article></section><section class="sheet-mid"><div class="panel tight"><div class="panel-h"><h3>延迟</h3>' + rangeButtons() + '</div>' + detailTargetButtons(server) + detailSeriesChart(server, 520, 88) + '</div><div class="panel tight"><div class="panel-h"><h3>近 7 日</h3><span class="hero-sub">均 ' + fmtBytes(stats.avg, 1) + ' · 高 ' + fmtBytes(stats.high, 1) + '</span></div>' + Charts.bars(rows, { w: 320, h: 88, tips: trafficTips(rows) }) + '<div class="day-inline">' + rows.map(function (row) { return '<span>' + esc(row.date.slice(8)) + ' ' + fmtBytes(row.total, 1) + '</span>'; }).join('') + '</div></div></section><section class="sheet-bot"><div class="panel tight"><div class="panel-h"><h3>三网回程</h3></div><div class="routes compact">' + (routes.length ? routes.map(function (route) { return '<div class="route"><span class="car">' + esc(CARRIER[route.carrier] || route.carrier || 'route') + '</span><span>' + esc(route.route_type || '—') + (route.region ? ' · ' + esc(route.region) : '') + '</span></div>'; }).join('') : '<div class="hero-sub">暂无回程数据；可在扩展元数据层补充。</div>') + '</div></div><div class="panel tight"><div class="panel-h"><h3>系统</h3></div><div class="sys-grid"><div>系统 <b>' + esc(server.os || '—') + '</b></div><div>内核 <b>' + esc(server.kernel || '—') + '</b></div><div>架构 <b>' + esc(server.arch || '—') + '</b></div><div>CPU <b>' + esc(server.cpu_model || '—') + ' · ' + esc(server.cpu_cores || '—') + 'C/' + esc(server.cpu_threads || '—') + 'T</b></div><div>到期 <b>' + esc(server.expires_at || '—') + '</b></div><div>续费 <b>' + esc(fmtRenewal(server)) + '</b></div></div></div></section></article>';
  }

  function detailPing(server) {
    var ready = detailSeriesReady(server);
    return '<article class="page page-ping" data-node="' + esc(server.uuid) + '"><div class="panel-h"><h3>Latency / Packet Loss</h3>' + rangeButtons() + '</div>' + detailTargetButtons(server) + mergedLegend(server) + '<div class="chart-fill detail-chart">' + (ready ? detailSeriesChart(server, 960, 260) : '<div class="chart-empty">正在读取历史数据…</div>') + '</div><section class="kpi ping-kpi">' + (server.ping || []).slice(0, 5).map(function (ping) { return '<article><div class="lbl">' + esc(ping.label) + '</div><div class="val">' + (ping.current_ms < 0 ? '—' : Math.round(ping.current_ms) + 'ms') + '</div><div class="sub">loss ' + Number(ping.loss_pct || 0).toFixed(2) + '% · avg ' + (isNum(ping.avg_ms) ? Math.round(ping.avg_ms) : '—') + '</div></article>'; }).join('') + '</section></article>';
  }

  function detailTraffic(server) {
    var stats = dailyStats(server);
    var rows = server.daily_traffic || [];
    return '<article class="page page-traffic">' + quotaBar(server) + '<section class="kpi"><article><div class="lbl">已用</div><div class="val">' + fmtBytes(server.traffic_used, 1) + '</div><div class="sub">限额 ' + fmtBytes(server.traffic_limit, 1) + '</div></article><article><div class="lbl">上行</div><div class="val">' + fmtBytes(server.traffic_used_up, 1) + '</div><div class="sub">本周期</div></article><article><div class="lbl">下行</div><div class="val">' + fmtBytes(server.traffic_used_down, 1) + '</div><div class="sub">本周期</div></article><article><div class="lbl">最高日</div><div class="val">' + fmtBytes(stats.high, 1) + '</div><div class="sub">日均 ' + fmtBytes(stats.avg, 1) + '</div></article><article><div class="lbl">周期</div><div class="val">' + esc(server.period_start ? server.period_start.slice(5) : '—') + '</div><div class="sub">至 ' + esc(server.period_end ? server.period_end.slice(5) : '—') + '</div></article></section><div class="chart-fill traffic-chart"><div class="panel-h"><h3>近 7 日流量</h3><span class="hero-sub">Komari traffic.up/down</span></div>' + Charts.stacked(rows, { w: 960, h: 220, tips: trafficTips(rows) }) + '</div><section class="day-grid">' + rows.map(function (row) { return '<article><div class="lbl">' + esc(row.date.slice(5)) + '</div><div class="val">' + fmtBytes(row.total, 1) + '</div><div class="hero-sub">↑ ' + fmtBytes(row.uplink, 1) + ' · ↓ ' + fmtBytes(row.downlink, 1) + '</div></article>'; }).join('') + '</section></article>';
  }

  function detailRoutes(server) {
    var rows = server.return_routes || [];
    return '<article class="page page-routes"><div class="panel-h"><h3>三网回程</h3><span class="hero-sub">扩展元数据</span></div><div class="route-cards">' + (rows.length ? rows.map(function (route) { return '<article class="route-card"><div class="car">' + esc(CARRIER[route.carrier] || route.carrier || 'route') + '</div><div><h3>' + esc(route.route_type || '—') + '</h3><span class="hero-sub">' + esc(route.region || '') + '</span></div></article>'; }).join('') : '<div class="state compact-state"><h2>暂无回程数据</h2><p>Komari 原生不提供此字段，可在 metadata/nodes.json 按 UUID 补充。</p></div>') + '</div></article>';
  }

  function detailSystem(server) {
    var cells = [['系统', server.os], ['内核', server.kernel], ['架构', server.arch], ['虚拟化', server.virtualization], ['处理器', (server.cpu_model || '—') + ' · ' + (server.cpu_cores || '—') + 'C / ' + (server.cpu_threads || '—') + 'T'], ['GPU', server.gpu || '—'], ['负载', server.loadavg || '—'], ['分组', server.group || '—'], ['标签', server.tags || '—'], ['到期', server.expires_at || '—'], ['续费', fmtRenewal(server)], ['周期', (server.period_start || '—') + ' → ' + (server.period_end || '—')]];
    return '<article class="page page-system"><section class="spec">' + cells.map(function (cell) { return '<article><div class="lbl">' + esc(cell[0]) + '</div><div class="val">' + esc(cell[1] || '—') + '</div></article>'; }).join('') + '</section></article>';
  }

  function renderWindow(uuid, page) {
    var server = nodeByUuid(uuid);
    if (!server) { hideWindow(); return; }
    page = PAGES.indexOf(page) >= 0 ? page : 'overview';
    if (!detailTargetKey && server.ping && server.ping[0]) detailTargetKey = server.ping[0].key;
    if (detailTargetKey && !server.ping.some(function (ping) { return ping.key === detailTargetKey; })) detailTargetKey = server.ping[0] ? server.ping[0].key : '';
    winTitle.textContent = server.name;
    winKicker.textContent = (server.region_country || 'NODE') + ' / ' + (server.region_city || server.region_name || 'DETAIL');
    Array.prototype.forEach.call(stageNav.querySelectorAll('[data-page]'), function (button) { button.classList.toggle('is-on', button.dataset.page === page); });
    if (page === 'ping') winBody.innerHTML = detailPing(server);
    else if (page === 'traffic') winBody.innerHTML = detailTraffic(server);
    else if (page === 'routes') winBody.innerHTML = detailRoutes(server);
    else if (page === 'system') winBody.innerHTML = detailSystem(server);
    else winBody.innerHTML = detailOverview(server);
    overlay.hidden = false;
    document.documentElement.classList.add('is-locked');
    document.body.classList.add('is-locked');
    if ((page === 'overview' || page === 'ping') && server.ping && server.ping.length) {
      if (!detailSeriesReady(server)) loadDetailSeries(server, false).then(function () { var current = route(); if (current.uuid === server.uuid) renderWindow(server.uuid, current.page); });
    }
  }

  function hideWindow() {
    overlay.hidden = true;
    document.documentElement.classList.remove('is-locked');
    document.body.classList.remove('is-locked');
    winBody.innerHTML = '';
  }

  function closeWindow() { go(hashFor({ home: home, view: view })); }

  function emptyHTML(title, text) {
    return '<section class="state">' + Charts.wave({ w: 300, h: 60 }) + '<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p></section>';
  }

  function renderChrome(r) {
    var titles = { nodes: state.title || '节点状态', network: '网络状况', resource: '资源概况' };
    titleEl.textContent = titles[r.home] || titles.nodes;
    document.title = (state.title || 'Komari') + ' · Line Grid';
    Array.prototype.forEach.call(document.querySelectorAll('#site-nav [data-home]'), function (button) { button.classList.toggle('is-on', button.dataset.home === r.home); });
    liveMark.textContent = error ? '连接异常' : loading ? '连接中' : '实时';
    liveMark.classList.toggle('is-off', !!error);
  }

  function renderFoot() {
    var total = totals();
    foot.innerHTML = '<div>总使用流量　<b>' + fmtBytes(total.used, 2) + ' / ' + fmtBytes(total.limit, 2) + '</b></div><div>在线服务器　<b>' + total.online + ' / ' + total.all + '</b></div><div>最后更新　<b>' + (lastUpdate ? clock(new Date(lastUpdate)) : '—') + '</b>　·　<a href="https://github.com/komari-monitor/komari" target="_blank" rel="noopener">Powered by Komari Monitor</a></div>';
  }

  function render() {
    var r = route();
    renderChrome(r);
    if (loading && !state.servers.length) {
      main.innerHTML = emptyHTML('正在连接 Komari', '读取节点与实时状态。');
      renderFoot();
      hideWindow();
      return;
    }
    if (error && !state.servers.length) {
      main.innerHTML = '<div class="error-note">' + esc(error) + '</div>' + emptyHTML('无法读取 Komari', '请确认主题与 Komari 同源部署，且 /api/rpc2 可访问。');
      renderFoot();
      hideWindow();
      return;
    }
    if (r.home === 'network') renderNetwork();
    else if (r.home === 'resource') renderResource();
    else renderNodes();
    renderFoot();
    if (r.uuid) renderWindow(r.uuid, r.page);
    else hideWindow();
  }

  function setAll(scope, selector, text) {
    Array.prototype.forEach.call(scope.querySelectorAll(selector), function (element) { element.textContent = text; });
  }

  function setMeter(scope, name, value) {
    Array.prototype.forEach.call(scope.querySelectorAll('[data-live-meter="' + name + '"]'), function (element) {
      element.style.setProperty('--p', (value == null ? 0 : value) + '%');
      if (element.classList.contains('bar') || element.parentElement && element.parentElement.classList.contains('bar')) element.style.width = (value == null ? 0 : value) + '%';
    });
  }

  function patchNodeShell(scope, server) {
    setAll(scope, '[data-live="status"]', server.online ? '在线' : '离线');
    setAll(scope, '[data-live="down"]', fmtSpeed(server.download_speed));
    setAll(scope, '[data-live="up"]', fmtSpeed(server.upload_speed));
    var ms = pingMs(server);
    setAll(scope, '[data-live="ping"]', ms == null ? '—' : Math.round(ms) + ' ms');
    setAll(scope, '[data-live="ping-plain"]', ms == null ? '—' : String(Math.round(ms)));
    setAll(scope, '[data-live="loss"]', pingLoss(server) == null ? '—' : pingLoss(server).toFixed(2) + '%');
    setAll(scope, '[data-live="cpu"]', isNum(server.cpu_pct) ? Math.round(server.cpu_pct) + '%' : '—');
    setAll(scope, '[data-live="mem"]', pctText(server.mem_used, server.mem_total));
    setAll(scope, '[data-live="disk"]', pctText(server.disk_used, server.disk_total));
    setAll(scope, '[data-live="uptime"]', fmtDays(server.uptime));
    setAll(scope, '[data-live="load"]', server.loadavg || '—');
    setMeter(scope, 'cpu', isNum(server.cpu_pct) ? Number(server.cpu_pct) : null);
    setMeter(scope, 'mem', pct(server.mem_used, server.mem_total));
    setMeter(scope, 'disk', pct(server.disk_used, server.disk_total));
    Array.prototype.forEach.call(scope.querySelectorAll('[data-live-dot]'), function (dot) { dot.classList.toggle('is-off', !server.online); });
  }

  function patchLiveDOM() {
    var allNodeScopes = document.querySelectorAll('[data-node]');
    state.servers.forEach(function (server) {
      Array.prototype.forEach.call(allNodeScopes, function (scope) {
        if (scope.getAttribute('data-node') === server.uuid) patchNodeShell(scope, server);
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-globe-node]'), function (group) {
        if (group.getAttribute('data-globe-node') !== server.uuid) return;
        var pin = group.querySelector('.globe-pin');
        if (pin) pin.setAttribute('stroke', server.online ? css('--live', '#8fa676') : css('--down', '#b06d52'));
      });
    });
    var total = totals();
    Array.prototype.forEach.call(document.querySelectorAll('[data-fleet="online"]'), function (element) { element.textContent = total.online; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-fleet="offline"]'), function (element) { element.textContent = total.all - total.online; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-fleet="down"]'), function (element) { element.textContent = fmtSpeed(total.down); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-fleet="up"]'), function (element) { element.textContent = fmtSpeed(total.up); });
    var r = route();
    if (r.home === 'network') {
      var selected = nodeByUuid(r.uuid) || state.servers.find(function (server) { return server.online && server.ping && server.ping.length; }) || state.servers[0];
      if (selected) {
        var stats = currentNetworkStats(selected);
        Array.prototype.forEach.call(document.querySelectorAll('[data-net-live="ms"]'), function (element) { element.textContent = stats.ms == null ? '—' : Math.round(stats.ms) + ' ms'; });
        Array.prototype.forEach.call(document.querySelectorAll('[data-net-live="loss"]'), function (element) { element.textContent = stats.loss == null ? '—' : stats.loss.toFixed(2) + '%'; });
      }
    }
    renderFoot();
    renderChrome(r);
  }

  function openNode(uuid) {
    detailTargetKey = '';
    range = '1h';
    go(hashFor({ home: 'nodes', view: view, uuid: uuid, page: 'overview' }));
  }

  function onGlobeDown(event) {
    var atlas = event.target.closest('.atlas');
    if (!atlas || event.button) return;
    globeDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, lon: globeLon, lat: globeLat, moved: false };
    atlas.classList.add('is-drag');
    try { atlas.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function onGlobeMove(event) {
    if (!globeDrag || event.pointerId !== globeDrag.id) return;
    var dx = event.clientX - globeDrag.x;
    var dy = event.clientY - globeDrag.y;
    if (!globeDrag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    globeDrag.moved = true;
    event.preventDefault();
    globeLon = wrapLon(globeDrag.lon - dx * 0.48);
    globeLat = Math.max(-78, Math.min(78, globeDrag.lat + dy * 0.36));
    paintGlobe();
  }

  function onGlobeUp(event) {
    if (!globeDrag || event.pointerId !== globeDrag.id) return;
    var atlas = main.querySelector('.atlas');
    if (atlas) {
      atlas.classList.remove('is-drag');
      try { atlas.releasePointerCapture(event.pointerId); } catch (_) {}
    }
    if (globeDrag.moved) globeSkipClick = true;
    globeDrag = null;
  }

  main.addEventListener('click', function (event) {
    var day = event.target.closest('[data-day]');
    if (day) { pulseDay = Number(day.dataset.day); render(); return; }
    var viewButton = event.target.closest('[data-view]');
    if (viewButton) { view = viewButton.dataset.view; localStorage.setItem('komari-line-grid-view', view); go(hashFor({ home: 'nodes', view: view })); return; }
    if (event.target.closest('[data-globe]')) { showGlobe = !showGlobe; localStorage.setItem('komari-line-grid-globe', showGlobe ? '1' : '0'); render(); return; }
    var netButton = event.target.closest('[data-net]');
    if (netButton) { targetKey = 'all'; range = '1h'; go(hashFor({ home: 'network', uuid: netButton.dataset.net })); return; }
    var netTarget = event.target.closest('[data-nett]');
    if (netTarget) { targetKey = netTarget.dataset.nett; var nr = route(); var ns = nodeByUuid(nr.uuid) || state.servers[0]; if (ns) loadSeries(ns.uuid, targetKey, true).then(renderNetwork); renderNetwork(); return; }
    var rangeButton = event.target.closest('[data-range]');
    if (rangeButton) { range = rangeButton.dataset.range; var rr = route(); if (rr.home === 'network') { var rs = nodeByUuid(rr.uuid) || state.servers[0]; if (rs) loadSeries(rs.uuid, targetKey, true).then(renderNetwork); renderNetwork(); } return; }
    if (globeSkipClick && event.target.closest('.atlas')) { globeSkipClick = false; return; }
    var node = event.target.closest('[data-uuid]');
    if (node) openNode(node.dataset.uuid);
  });

  main.addEventListener('pointerdown', onGlobeDown);
  main.addEventListener('pointermove', onGlobeMove);
  main.addEventListener('pointerup', onGlobeUp);
  main.addEventListener('pointercancel', onGlobeUp);

  winBody.addEventListener('click', function (event) {
    var rangeButton = event.target.closest('[data-range]');
    if (rangeButton) {
      range = rangeButton.dataset.range;
      var r = route();
      var server = nodeByUuid(r.uuid);
      if (server) loadDetailSeries(server, true).then(function () { renderWindow(server.uuid, r.page); });
      return;
    }
    var target = event.target.closest('[data-target]');
    if (target) {
      detailTargetKey = target.dataset.target;
      var rr = route();
      var selected = nodeByUuid(rr.uuid);
      if (selected) loadDetailSeries(selected, true).then(function () { renderWindow(selected.uuid, rr.page); });
    }
  });

  stageNav.addEventListener('click', function (event) {
    var button = event.target.closest('[data-page]');
    if (!button) return;
    var r = route();
    go(hashFor({ home: r.home, view: r.view, uuid: r.uuid, page: button.dataset.page }));
  });

  document.getElementById('site-nav').addEventListener('click', function (event) {
    var button = event.target.closest('[data-home]');
    if (!button) return;
    home = button.dataset.home;
    targetKey = 'all';
    range = '1h';
    go(hashFor({ home: home, view: view }));
  });

  document.getElementById('win-close').addEventListener('click', closeWindow);
  document.getElementById('win-back').addEventListener('click', closeWindow);
  overlay.addEventListener('click', function (event) { if (event.target === overlay) closeWindow(); });
  document.getElementById('theme-toggle').addEventListener('click', function () { setTheme(currentTheme() === 'light' ? 'dark' : 'light', true); render(); });
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !overlay.hidden) { closeWindow(); return; }
    if (/input|textarea/i.test(event.target.tagName)) return;
    if (event.key === 'g') { view = 'grid'; go(hashFor({ home: 'nodes', view: view })); }
    if (event.key === 'c') { view = 'column'; go(hashFor({ home: 'nodes', view: view })); }
    if (event.key === 'l') { view = 'list'; go(hashFor({ home: 'nodes', view: view })); }
  });

  document.addEventListener('pointermove', function (event) {
    var tip = document.getElementById('chart-tip');
    var element = event.target.closest && event.target.closest('[data-tip]');
    if (!element) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.textContent = element.getAttribute('data-tip') || '';
    var x = Math.min(event.clientX + 12, innerWidth - tip.offsetWidth - 8);
    var y = Math.min(event.clientY + 12, innerHeight - tip.offsetHeight - 8);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  });

  function refreshLive() {
    if (document.hidden || liveBusy || !state.servers.length) return;
    liveBusy = true;
    API.applyLatest(state).then(function () {
      error = '';
      lastUpdate = Date.now();
      patchLiveDOM();
    }).catch(function (err) {
      error = err.message || String(err);
      renderChrome(route());
    }).finally(function () { liveBusy = false; });
  }

  function refreshTraffic() {
    if (document.hidden || trafficBusy || !state.servers.length) return;
    trafficBusy = true;
    API.loadTraffic(state.servers).then(function () {
      var y = scrollY;
      var r = route();
      var innerY = winBody.scrollTop;
      if (r.home === 'nodes') renderNodes();
      else if (r.home === 'resource') renderResource();
      else if (r.home === 'network') renderNetwork();
      if (r.uuid) { renderWindow(r.uuid, r.page); winBody.scrollTop = innerY; }
      scrollTo(0, y);
      renderFoot();
    }).catch(function () {}).finally(function () { trafficBusy = false; });
  }

  function bootstrap() {
    setTheme(currentTheme(), false);
    render();
    if (!API || typeof API.snapshot !== 'function') {
      loading = false;
      error = 'Komari RPC2 适配器未加载';
      render();
      return;
    }
    API.snapshot().then(function (snapshot) {
      state = snapshot;
      if (localStorage.getItem('komari-line-grid-globe') == null) showGlobe = snapshot.show_globe !== false;
      loading = false;
      error = '';
      lastUpdate = Date.now();
      render();
      refreshLive();
      refreshTraffic();
      setInterval(refreshLive, 2000);
      setInterval(refreshTraffic, 300000);
    }).catch(function (err) {
      loading = false;
      error = err.message || String(err);
      render();
    });
  }

  bootstrap();
})();
