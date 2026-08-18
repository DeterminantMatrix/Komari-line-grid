(function () {
  const U = ProbeDemo.units;
  const main = document.getElementById("main");
  const foot = document.getElementById("foot");
  const titleEl = document.getElementById("page-title");
  const overlay = document.getElementById("overlay");
  const winBody = document.getElementById("win-body");
  const winTitle = document.getElementById("win-title");
  const winKicker = document.getElementById("win-kicker");
  const financeOverlay = document.getElementById("finance-overlay");
  const financeBody = document.getElementById("finance-body");

  const demoMode = new URLSearchParams(location.search).get("demo") === "1";
  let state = demoMode ? ProbeDemo.snapshot() : { enabled: true, title: "节点状态", servers: [], _loading: true, _source: "komari-rpc2" };
  let range = "1h";
  let targetKey = "";
  let latencyTargetKey = "all";
  let lastFocus = null;
  let lastView = "list";
  let home = "nodes";
  let showGlobe = localStorage.getItem("mmwx-globe") !== "0";
  let globeLon = 80;
  let globeLat = 30;
  let globeDrag = null;
  let globeSkipClick = false;
  let globeLabelSide = {};
  let netKey = "";
  let netTarget = "all";
  let pulseDay = new Date().getDate();
  let pulse = ProbeDemo.monthPulse();
  let liveMode = false;
  let seriesCache = {};
  let lastWindowKey = "";
  let subpageLiveTick = 0;
  let accessState = { known: false, logged_in: false, is_admin: false };
  let listSortKey = "";
  let listSortDir = 0; // 0=Komari default, -1=desc, 1=asc
  let regionFilter = "";
  let financeSortKey = "";
  let financeSortDir = 0; // 0=default monthly desc, -1=desc, 1=asc

  function h(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function attr(value) { return h(value); }

  function nfmt(value, digits) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    return Number(value).toFixed(digits == null ? 0 : digits);
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function parseColor(v) {
    v = String(v || "").trim();
    const rgb = v.match(/rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    let hex = v.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      const n = parseInt(hex, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return null;
  }

  function hexToRgba(color, a) {
    const p = parseColor(color);
    if (!p) return "rgba(221,214,200," + a + ")";
    return "rgba(" + p[0] + "," + p[1] + "," + p[2] + "," + a + ")";
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function iconSun() {
    return '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.3 3.3l1.3 1.3M11.4 11.4l1.3 1.3M3.3 12.7l1.3-1.3M11.4 4.6l1.3-1.3"/></svg>';
  }

  function iconMoon() {
    return '<svg viewBox="0 0 16 16"><path d="M10.4 2.6a5.7 5.7 0 1 0 2.9 7.6 4.5 4.5 0 0 1-2.9-7.6z"/></svg>';
  }

  function paintTheme(next) {
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("mmwx-theme", next);
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.innerHTML = next === "light" ? iconMoon() : iconSun();
    btn.setAttribute("aria-pressed", next === "light" ? "true" : "false");
    btn.setAttribute("aria-label", next === "light" ? "切换夜间模式" : "切换日间模式");
    btn.title = next === "light" ? "夜间" : "日间";
    if (window.ProbeFX) ProbeFX.apply();
  }

  function setTheme(mode, opts) {
    const next = mode === "light" ? "light" : "dark";
    paintTheme(next);
    if (opts && opts.after) opts.after();
  }
  const PAGES = ["overview", "ping", "traffic", "routes", "system"];
  const PAGE_LABEL = { overview: "Overview", ping: "Latency", traffic: "Traffic", routes: "Return", system: "System" };
  const HOMES = ["nodes", "network", "resource"];
  const COUNTRY_LL = {
    HK: [114.2, 22.3], JP: [139.7, 35.7], DE: [8.7, 50.1], NL: [4.9, 52.4],
    US: [-98.6, 39.8], TW: [121.0, 23.7], AU: [134.5, -25.7], SG: [103.82, 1.35],
    KR: [127.8, 36.3], GB: [-2.5, 54.5], FR: [2.2, 46.2], CN: [104.2, 35.8],
  };

  // Komari exposes a region label but no native latitude/longitude. These hints
  // provide a better automatic approximation when a city/airport code exists
  // in the region or node name. Exact metadata coordinates always win.
  const CITY_HINTS = [
    [/\b(SJC|SAN JOSE)\b|圣何塞/i, [-121.8863, 37.3382], "San Jose"],
    [/\b(LAX|LOS ANGELES)\b|洛杉矶/i, [-118.2437, 34.0522], "Los Angeles"],
    [/\b(NYC|NEW YORK)\b|纽约/i, [-74.0060, 40.7128], "New York"],
    [/\b(ORD|CHICAGO)\b|芝加哥/i, [-87.6298, 41.8781], "Chicago"],
    [/\b(SEA|SEATTLE)\b|西雅图/i, [-122.3321, 47.6062], "Seattle"],
    [/\b(DAL|DFW|DALLAS)\b|达拉斯/i, [-96.7970, 32.7767], "Dallas"],
    [/\b(HKG|HONG KONG|HK)\b|香港/i, [114.1694, 22.3193], "Hong Kong"],
    [/\b(TYO|TOKYO)\b|东京|東京/i, [139.6917, 35.6895], "Tokyo"],
    [/\b(OSA|OSAKA)\b|大阪/i, [135.5023, 34.6937], "Osaka"],
    [/\b(SEL|SEOUL)\b|首尔|首爾|서울/i, [126.9780, 37.5665], "Seoul"],
    [/\b(SIN|SINGAPORE|SG)\b|新加坡/i, [103.8198, 1.3521], "Singapore"],
    [/\b(TPE|TAIPEI)\b|台北|臺北/i, [121.5654, 25.0330], "Taipei"],
    [/\b(AMS|AMSTERDAM)\b|阿姆斯特丹/i, [4.9041, 52.3676], "Amsterdam"],
    [/\b(FRA|FRANKFURT)\b|法兰克福|法蘭克福/i, [8.6821, 50.1109], "Frankfurt am Main"],
    [/\b(LON|LONDON)\b|伦敦|倫敦/i, [-0.1276, 51.5072], "London"],
    [/\b(PAR|PARIS)\b|巴黎/i, [2.3522, 48.8566], "Paris"],
    [/\b(SYD|SYDNEY)\b|悉尼|雪梨/i, [151.2093, -33.8688], "Sydney"],
    [/\b(SHA|SHANGHAI)\b|上海/i, [121.4737, 31.2304], "Shanghai"],
    [/\b(PEK|BEIJING)\b|北京/i, [116.4074, 39.9042], "Beijing"],
    [/\b(CAN|GUANGZHOU)\b|广州|廣州/i, [113.2644, 23.1291], "Guangzhou"],
    [/\b(TXG|TAICHUNG)\b|台中|臺中/i, [120.6736, 24.1477], "Taichung"],
    [/\b(BUF|BUFFALO)\b/i, [-78.8784, 42.8864], "Buffalo"],
    [/\b(HACIENDA[ _.-]*HEIGHTS)\b/i, [-117.9687, 33.9931], "Hacienda Heights"],
    [/\b(NYC|NEW[ _.-]*YORK)\b|CHICAGO[^A-Z0-9]*VPS[^A-Z0-9]*NY/i, [-74.0060, 40.7128], "New York"],
  ];

  function cityHintInfo(server) {
    const text = [server && server.region_city, server && server.region_name, server && server.group, server && server.name].filter(Boolean).join(' ');
    for (let i = 0; i < CITY_HINTS.length; i += 1) {
      if (CITY_HINTS[i][0].test(text)) return { ll: CITY_HINTS[i][1], name: CITY_HINTS[i][2] || '' };
    }
    return null;
  }

  function displayCountry(server) {
    return String(server && (server.geo_country || server.region_country) || '').toUpperCase();
  }

  function displayRegionCountry(server) {
    const raw = displayCountry(server);
    return raw === 'HK' || raw === 'TW' ? 'CN' : raw;
  }

  function fallbackCity(server) {
    const raw = String(server && (server.region_city || server.region_name || '') || '').trim();
    const hint = cityHintInfo(server);
    if (hint && hint.name) return hint.name;
    const cc = String(server && (server.geo_country || server.region_country) || '').toUpperCase();
    if (cc === 'HK') return 'Hong Kong';
    if (cc === 'TW') return /TAICHUNG|台中|臺中/i.test(raw) ? 'Taichung' : /TAIPEI|台北|臺北/i.test(raw) ? 'Taipei' : 'Taiwan';
    if (cc === 'SG') return 'Singapore';
    if (cc === 'JP' && !raw) return 'Japan';
    if (cc === 'KR' && !raw) return 'Korea';
    const countryWords = {
      US: /^(US|USA|美国|美國|United States|United States of America)$/i,
      GB: /^(GB|UK|英国|英國|United Kingdom|Britain)$/i,
      NL: /^(NL|荷兰|荷蘭|Netherlands|德国|德國|Germany)$/i,
      KR: /^(KR|韩国|韓國|Korea|South Korea)$/i,
      JP: /^(JP|日本|Japan)$/i,
      SG: /^(SG|新加坡|Singapore)$/i,
      CN: /^(CN|中国|中國|China)$/i,
      HK: /^(HK|香港|Hong Kong)$/i,
      TW: /^(TW|台湾|台灣|Taiwan)$/i
    };
    if (raw && countryWords[cc] && countryWords[cc].test(raw)) return '';
    if (raw && !/^([A-Z]{2}|[\u{1F1E6}-\u{1F1FF}]{2})$/u.test(raw) && raw.toUpperCase() !== cc) return raw.replace(/^([A-Z]{2})[\s·_.-]+/i, '').trim();
    return '';
  }

  function regionDisplay(server) {
    const cc = displayRegionCountry(server) || '—';
    const city = fallbackCity(server);
    return { code: cc, city: city, label: city ? cc + ' · ' + city : cc };
  }

  // Coarse public-domain-style geographic outlines, intentionally simplified.
  // They are visual orientation aids, not a GIS dataset.
  const WORLD_OUTLINES = [
    [[-168,72],[-145,70],[-130,55],[-124,48],[-123,38],[-117,32],[-105,25],[-97,19],[-85,22],[-81,30],[-75,40],[-66,47],[-60,54],[-78,62],[-100,72],[-130,72],[-168,72]],
    [[-82,12],[-75,8],[-70,-5],[-63,-15],[-58,-25],[-52,-33],[-58,-43],[-67,-55],[-74,-48],[-75,-32],[-80,-15],[-82,0],[-82,12]],
    [[-10,36],[-6,44],[4,51],[15,56],[28,58],[42,55],[55,49],[68,52],[84,56],[100,60],[120,58],[140,50],[150,42],[145,32],[130,30],[122,20],[110,12],[100,7],[88,20],[75,24],[62,30],[48,28],[36,34],[28,40],[18,42],[8,39],[-10,36]],
    [[-17,35],[-5,36],[10,33],[25,31],[35,23],[43,11],[51,2],[45,-12],[38,-25],[30,-34],[18,-35],[5,-30],[-5,-18],[-12,0],[-17,16],[-17,35]],
    [[112,-11],[126,-13],[138,-18],[151,-26],[153,-37],[144,-43],[130,-40],[116,-34],[112,-22],[112,-11]],
    [[130,32],[136,35],[141,41],[145,44],[143,36],[139,33],[130,32]],
    [[-8,50],[-5,58],[-3,59],[1,54],[-2,50],[-8,50]],
    [[-52,60],[-44,66],[-34,72],[-26,76],[-40,82],[-55,80],[-62,70],[-52,60]],
  ];

  const CARRIER = { telecom: "电信", unicom: "联通", mobile: "移动" };
  const ROUTE_PRESET_ALL = [
    ["", "未填写"],
    ["163", "普通 · 163"],
    ["4837", "普通 · 4837"],
    ["CMI", "普通 · CMI"],
    ["CN2GIA", "精品 · CN2GIA"],
    ["9929/10999", "精品 · 9929/10999"],
    ["CMIN2", "精品 · CMIN2"],
  ];
  const ROUTE_PRESETS = { telecom: ROUTE_PRESET_ALL, unicom: ROUTE_PRESET_ALL, mobile: ROUTE_PRESET_ALL };
  const ROUTE_STORE_KEY = "line-grid-return-routes-v1";
  const CYCLE = { month: "月", quarter: "季", half_year: "半年", year: "年" };

  function pad(n) { return String(n).padStart(2, "0"); }

  function fmtBytes(bytes, digits) {
    if (bytes == null) return "—";
    const abs = Math.abs(bytes);
    const units = [
      [U.TB, "TB"],
      [U.GB, "GB"],
      [U.MB, "MB"],
      [U.KB, "KB"],
      [1, "B"],
    ];
    for (let i = 0; i < units.length; i += 1) {
      if (abs >= units[i][0] || units[i][1] === "B") {
        const v = bytes / units[i][0];
        let d = digits;
        if (d == null) d = v >= 100 ? 0 : v >= 10 ? 1 : 2;
        if (Math.abs(v - Math.round(v)) < 0.005 && units[i][1] !== "TB") d = 0;
        return v.toFixed(d) + " " + units[i][1];
      }
    }
    return "0 B";
  }

  function fmtSpeed(bps) {
    if (bps == null) return "—";
    return fmtBytes(bps, 1) + "/s";
  }

  function fmtDays(sec) {
    if (sec == null) return "—";
    return Math.floor(sec / U.DAY) + " 天";
  }

  function pct(used, total) {
    if (!total || used == null) return 0;
    return Math.max(0, Math.min(100, (used / total) * 100));
  }

  function pctMetric(used, total) {
    if (used == null || total == null || !Number(total)) return null;
    return Math.max(0, Math.min(100, (Number(used) / Number(total)) * 100));
  }

  function pctText(value) {
    return value == null || !Number.isFinite(Number(value)) ? "—" : Math.round(Number(value)) + "%";
  }

  function currencyCode(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(¥|￥|RMB|CNH)$/i.test(raw)) return "CNY";
    if (raw === "$") return "USD";
    if (raw === "€") return "EUR";
    if (raw === "£") return "GBP";
    return raw.toUpperCase();
  }

  function money(value, currency) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    if (Number(value) === -1) return "免费";
    const code = currencyCode(currency);
    const n = Number(value);
    const digits = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2;
    if (code === "CNY") return "¥" + n.toFixed(digits);
    if (code === "USD") return "$" + n.toFixed(digits);
    if (code === "EUR") return "€" + n.toFixed(digits);
    if (code === "GBP") return "£" + n.toFixed(digits);
    return (code ? code + " " : "") + n.toFixed(digits);
  }

  function billingCycleText(days) {
    const d = Number(days);
    if (!Number.isFinite(d)) return "—";
    if (d === -1) return "一次性";
    if (d >= 27 && d <= 32) return "月";
    if (d >= 87 && d <= 95) return "季";
    if (d >= 175 && d <= 185) return "半年";
    if (d >= 360 && d <= 370) return "年";
    if (d >= 720 && d <= 750) return "两年";
    if (d >= 1080 && d <= 1150) return "三年";
    return d > 0 ? d + " 天" : "—";
  }

  function renewalText(server) {
    if (server.price == null) return "—";
    if (Number(server.price) === -1) return "免费";
    return money(server.price, server.currency) + " / " + billingCycleText(server.billing_cycle);
  }

  function remainingTimeText(server) {
    if (!server) return "—";
    if (server.long_term) return "长期";
    if (!server.expires_at_raw) return "—";
    const ts = new Date(server.expires_at_raw).getTime();
    if (!Number.isFinite(ts)) return "—";
    const days = Math.ceil((ts - Date.now()) / 86400000);
    if (days < 0) return "已到期";
    if (days <= 60) return days + " 天";
    if (days < 730) return (days / 30.4375).toFixed(days < 180 ? 1 : 0) + " 月";
    return (days / 365.25).toFixed(1) + " 年";
  }

  function remainingDaysText(server) {
    if (!server) return "—";
    if (server.long_term) return "长期";
    if (!server.expires_at_raw) return "—";
    const ts = new Date(server.expires_at_raw).getTime();
    if (!Number.isFinite(ts)) return "—";
    const days = Math.ceil((ts - Date.now()) / 86400000);
    if (days < 0) return "已到期";
    return days + " 天";
  }


  function remainingIsUrgent(server) {
    const days = remainingDaysNumber(server);
    return days != null && days <= 7;
  }

  function remainingHTMLFor(server) {
    const urgent = remainingIsUrgent(server);
    return '<span class="remaining-value' + (urgent ? ' is-bad' : '') + '">' + h(remainingDaysText(server)) + (urgent ? '<span class="remaining-warn" aria-label="临近到期" title="临近到期">⚠</span>' : '') + '</span>';
  }

  function monthlyCostText(server) {
    if (!server || server.price == null) return "—";
    if (Number(server.price) === -1) return "免费";
    if (Number(server.billing_cycle) === -1) return "一次性";
    const value = recurringEquivalent(server, false);
    return value == null ? "—" : money(value, server.currency);
  }

  function expiryShortText(server) {
    if (!server || server.long_term || !server.expires_at_raw) return '';
    const raw = String(server.expires_at_raw).slice(0, 10);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[1].slice(2) + '-' + m[2] + '-' + m[3] : '';
  }

  function cnyValue(value, currency) {
    if (value == null || !state || !state._fx_rates || !window.LineGridEnrich) return null;
    return LineGridEnrich.toCNY(value, currency, state._fx_rates);
  }

  function monthlyCostCNY(server) {
    const native = recurringEquivalent(server, false);
    return native == null ? null : cnyValue(native, server.currency);
  }

  function aggregateCNY(servers, annual) {
    if (!state || !state._fx_rates || !window.LineGridEnrich) return null;
    let total = 0, count = 0;
    (servers || []).forEach(function (server) {
      const native = recurringEquivalent(server, annual);
      if (native == null) return;
      const value = cnyValue(native, server.currency);
      if (value == null) return;
      total += value; count += 1;
    });
    return count ? total : null;
  }

  function remainingDaysNumber(server) {
    if (!server || server.long_term || !server.expires_at_raw) return null;
    const ts = new Date(server.expires_at_raw).getTime();
    if (!Number.isFinite(ts)) return null;
    return Math.max(0, Math.ceil((ts - Date.now()) / 86400000));
  }

  function remainingValueCNY(server) {
    if (!server) return null;
    if (Number(server.price) === -1) return 0;
    const monthly = monthlyCostCNY(server);
    const days = remainingDaysNumber(server);
    if (monthly == null || days == null) return null;
    return Math.max(0, monthly * days / 30.4375);
  }

  function financeSortValue(row, key) {
    if (key === "region") return String(row.region || "");
    if (key === "name") return String(row.server.name || "");
    if (key === "monthly") return row.monthly;
    if (key === "remaining") return row.remainingDays;
    if (key === "value") return row.remainingValue;
    return null;
  }

  function financeRows() {
    const rows = (state.servers || []).map(function (server) {
      const monthly = monthlyCostCNY(server);
      const remainingValue = remainingValueCNY(server);
      const nativeMonthly = recurringEquivalent(server, false);
      return {
        server: server,
        region: regionDisplay(server).label,
        monthly: monthly,
        monthlyNative: nativeMonthly,
        remaining: remainingDaysText(server),
        remainingDays: remainingDaysNumber(server),
        remainingValue: remainingValue
      };
    });
    const key = financeSortKey || "monthly";
    const dir = financeSortKey ? financeSortDir : -1;
    return rows.sort(function (a, b) {
      const av = financeSortValue(a, key);
      const bv = financeSortValue(b, key);
      const an = typeof av === "number" && Number.isFinite(av);
      const bn = typeof bv === "number" && Number.isFinite(bv);
      if ((av == null || (typeof av === "number" && !an)) && (bv != null && !(typeof bv === "number" && !bn))) return 1;
      if ((bv == null || (typeof bv === "number" && !bn)) && (av != null && !(typeof av === "number" && !an))) return -1;
      let cmp = 0;
      if (an && bn) cmp = av === bv ? 0 : (av > bv ? 1 : -1);
      else cmp = String(av == null ? "" : av).localeCompare(String(bv == null ? "" : bv), 'zh-CN', { numeric: true, sensitivity: 'base' });
      if (cmp) return cmp * dir;
      const monthlyCmp = (Number(b.monthly) || -1) - (Number(a.monthly) || -1);
      if (monthlyCmp) return monthlyCmp;
      return String(a.server.name || '').localeCompare(String(b.server.name || ''), 'zh-CN');
    });
  }

  function financeSortHead(label, key) {
    const active = financeSortKey === key;
    const mark = active ? (financeSortDir < 0 ? " ↓" : financeSortDir > 0 ? " ↑" : "") : "";
    return '<button type="button" class="finance-sort-head' + (active ? ' is-on' : '') + '" data-finance-sort="' + attr(key) + '" title="点击排序：降序 → 升序 → 默认">' + h(label + mark) + '</button>';
  }

  function financeMonthlyHTML(row) {
    if (Number(row.server.price) === -1) return '<strong>免费</strong>';
    if (Number(row.server.billing_cycle) === -1) return '<strong>一次性</strong>';
    if (row.monthlyNative == null) return '<strong>—</strong>';
    const native = money(row.monthlyNative, row.server.currency) + '/月';
    const cny = row.monthly == null ? '—' : ('≈ ¥' + row.monthly.toFixed(2) + '/月');
    return '<strong>' + h(cny) + '</strong><small>' + h(native) + '</small>';
  }

  function openFinanceDetail(preserveSort) {
    if (!financeOverlay || !financeBody) return;
    if (!preserveSort) { financeSortKey = ""; financeSortDir = 0; }
    const rows = financeRows();
    const maskFinance = !accessState.logged_in;
    financeBody.innerHTML = rows.length ?
      '<div class="finance-table-wrap"><table class="finance-table"><thead><tr>' +
      '<th>' + financeSortHead('区域', 'region') + '</th>' +
      '<th>' + financeSortHead('VPS', 'name') + '</th>' +
      '<th>' + financeSortHead('月均续费', 'monthly') + '</th>' +
      '<th>' + financeSortHead('剩余时间', 'remaining') + '</th>' +
      '<th>' + financeSortHead('剩余价值', 'value') + '</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (row) {
        const monthlyHTML = maskFinance ? '<strong class="finance-mask">*</strong>' : financeMonthlyHTML(row);
        const remainingHTML = maskFinance ? '<strong class="finance-mask">*</strong>' : '<strong>' + (row.remainingValue == null ? '—' : ('≈ ¥' + row.remainingValue.toFixed(2))) + '</strong>';
        return '<tr><td>' + h(row.region) + '</td><td><b>' + h(row.server.name || '未命名') + '</b></td><td class="money-cell">' + monthlyHTML + '</td><td>' + remainingHTMLFor(row.server) + '</td><td class="money-cell">' + remainingHTML + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="chart-empty">暂无费用数据</div>';
    financeOverlay.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeFinanceDetail() {
    if (!financeOverlay) return;
    financeOverlay.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function recurringEquivalent(server, annual) {
    const price = Number(server.price);
    const days = Number(server.billing_cycle);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(days) || days <= 0) return null;
    return price * (annual ? 365.25 : 30.4375) / days;
  }

  function costGroups(servers, annual) {
    const groups = {};
    (servers || []).forEach(function (server) {
      const value = recurringEquivalent(server, annual);
      if (value == null) return;
      const code = currencyCode(server.currency) || "未标币种";
      groups[code] = (groups[code] || 0) + value;
    });
    return groups;
  }

  function costGroupsHTML(groups) {
    const keys = Object.keys(groups || {}).sort();
    if (!keys.length) return "—";
    return keys.map(function (key) { return h(money(groups[key], key)); }).join('<span class="cost-plus"> + </span>');
  }

  function primaryPing(server) {
    return (server.ping && server.ping[0]) || null;
  }

  function pingMs(server) {
    const p = primaryPing(server);
    const v = p && Number(p.current_ms);
    return Number.isFinite(v) && v >= 0 ? v : null;
  }

  function pingLoss(server) {
    const p = primaryPing(server);
    if (!p || p.loss_pct == null) return null;
    const v = Number(p.loss_pct);
    return Number.isFinite(v) && v >= 0 ? v : null;
  }

  function lossText(value) {
    return value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(2) + "%";
  }

  function latencyTone(ms) {
    const v = Number(ms);
    if (!Number.isFinite(v) || v < 0) return "";
    if (v > 180) return " is-bad";
    if (v > 80) return " is-hot";
    return " is-good";
  }

  function lossTone(value) {
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) return "";
    if (v >= 10) return " is-bad";
    if (v >= 1) return " is-hot";
    return " is-good";
  }

  function lossHTML(value) {
    return '<span class="loss-value' + lossTone(value) + '">' + lossText(value) + '</span>';
  }

  function pingColor(p, fallbackIndex) {
    const label = String(p && (p.label || p.key) || "");
    if (/电信|telecom/i.test(label)) return "#e2ad45";
    if (/移动|mobile/i.test(label)) return "#58a6ff";
    if (/联通|unicom/i.test(label)) return "#e06c75";
    const palette = ["#e2ad45", "#58a6ff", "#e06c75", "#65c18c"];
    return palette[(Number(fallbackIndex) || 0) % palette.length];
  }

  function maskIP(value) {
    const text = String(value || "").trim();
    if (!text) return "—";
    const v4 = text.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) return v4[1] + "." + v4[2] + ".*.*";
    if (text.indexOf(":") >= 0) {
      const parts = text.split(":").filter(Boolean);
      if (!parts.length) return "—";
      return parts.slice(0, 2).join(":") + ":*:*:*:*:*:*";
    }
    return "—";
  }


  function compactOS(value) {
    let v = String(value || "—").trim();
    if (!v || v === "—") return "—";
    v = v.replace(/\s*\([^)]*\)\s*$/g, "");
    v = v.replace(/\bGNU\/Linux\b/ig, "").replace(/\s{2,}/g, " ").trim();
    return v || "—";
  }

  function compactKernel(value) {
    const v = String(value || "").trim();
    if (!v) return "—";
    const m = v.match(/^\d+\.\d+(?:\.\d+)?/);
    return m ? m[0] : v.split("-")[0] || v;
  }

  function compactCPU(value) {
    let v = String(value || "—").trim();
    if (!v || v === "—") return "—";
    v = v.replace(/\(R\)|\(TM\)/gi, "").replace(/\bCPU\b/gi, "").replace(/\s*@\s*[0-9.]+\s*GHz\b/ig, "").replace(/\s{2,}/g, " ").trim();
    if (v.length > 34) v = v.slice(0, 33).trim() + "…";
    return v;
  }

  function pingText(p) {
    if (!p || p.current_ms == null || Number(p.current_ms) < 0) return "—";
    return Math.round(Number(p.current_ms)) + " ms";
  }

  function dailyStats(server) {
    const rows = server.daily_traffic || [];
    const vals = rows.map(function (r) { return r.total; }).filter(function (v) { return v != null && Number.isFinite(Number(v)); });
    if (!vals.length) return { high: null, low: null, avg: null };
    const high = Math.max.apply(null, vals);
    const low = Math.min.apply(null, vals);
    const avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    return { high: high, low: low, avg: avg };
  }

  function totals() {
    const servers = state.servers || [];
    let used = 0;
    let limit = 0;
    let online = 0;
    servers.forEach(function (s) {
      used += s.traffic_used || 0;
      limit += s.traffic_limit || 0;
      if (s.online) online += 1;
    });
    return { used: used, limit: limit, online: online, all: servers.length };
  }

  function clock(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "  " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function route() {
    const raw = (location.hash || "#/").replace(/^#/, "") || "/";
    const parts = raw.split("/").filter(Boolean);
    let view = "list";
    let node = null;
    let page = "overview";
    let section = "nodes";
    if (parts[0] === "network" || parts[0] === "resource") {
      section = parts[0];
      if (parts[1] === "node" && parts[2] != null) {
        node = decodeURIComponent(parts[2]);
        if (PAGES.indexOf(parts[3]) >= 0) page = parts[3];
      }
      home = section;
      return { view: view, node: node, page: page, home: section };
    }
    if (parts[0] === "column" || parts[0] === "list" || parts[0] === "grid") {
      view = parts[0];
      if (parts[1] === "node" && parts[2] != null) {
        node = decodeURIComponent(parts[2]);
        if (PAGES.indexOf(parts[3]) >= 0) page = parts[3];
      }
    } else if (parts[0] === "node" && parts[1] != null) {
      node = decodeURIComponent(parts[1]);
      if (PAGES.indexOf(parts[2]) >= 0) page = parts[2];
    } else if (parts[0] === "globe") {
      showGlobe = true;
      if (parts[1] === "node" && parts[2] != null) {
        node = decodeURIComponent(parts[2]);
        if (PAGES.indexOf(parts[3]) >= 0) page = parts[3];
      }
    }
    if (view === "grid" || view === "column" || view === "list") lastView = view;
    home = "nodes";
    return { view: view, node: node, page: page, home: "nodes" };
  }

  function viewHash(view, node, page, section) {
    const sec = section || home || "nodes";
    if (sec === "network" || sec === "resource") {
      if (node == null) return "#/" + sec;
      return "#/" + sec + "/node/" + encodeURIComponent(node) + (page && page !== "overview" ? "/" + page : "");
    }
    const base = !view || view === "list" ? "" : "/" + view;
    if (node == null) return "#" + (base || "/");
    const rest = page && page !== "overview" ? "/" + page : "";
    return "#" + (base || "") + "/node/" + encodeURIComponent(node) + rest;
  }

  function go(hash, ev) {
    if (ev) ev.preventDefault();
    location.hash = hash;
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

  function pingTips(values, stepMin) {
    const n = (values || []).length;
    const step = stepMin || 5;
    return (values || []).map(function (v, i) {
      const t = new Date(Date.now() - (n - 1 - i) * step * 60000);
      const clock = pad(t.getHours()) + ":" + pad(t.getMinutes());
      return clock + "  " + (v < 0 ? "无数据" : v + " ms");
    });
  }

  function trafficTips(rows) {
    return (rows || []).map(function (d) {
      const day = (d.date || "").slice(5) || "当日";
      return day + "  合计 " + fmtBytes(d.total, 1) + "  ↑ " + fmtBytes(d.uplink, 1) + "  ↓ " + fmtBytes(d.downlink, 1);
    });
  }

  function sparkOf(server, tall) {
    const p = primaryPing(server);
    let vals = p && p.buckets ? p.buckets.map(function (b) { return b.ms; }) : [];
    const ms = pingMs(server);
    if (!vals.length && ms != null) vals = [ms, ms];
    return (
      '<div class="spark-wrap">' +
        ProbeCharts.spark(vals, { w: tall ? 420 : 240, h: tall ? 64 : 40, color: ms != null && ms > 180 ? cssVar("--down", "#b06d52") : ms != null && ms > 80 ? cssVar("--gold", "#c4a56a") : cssVar("--live", "#8fa676"), tips: pingTips(vals, 5) }) +
        (tall ? "" : '<span class="ms' + latencyTone(ms) + '">' + (ms == null ? "—" : String(ms).padStart(3, "0") + " ms") + "</span>") +
      "</div>"
    );
  }

  function quotaTone(p) {
    return p >= 85 ? " is-full" : p >= 60 ? " is-hot" : "";
  }

  function quotaBar(server) {
    const used = server.traffic_used == null ? null : Number(server.traffic_used);
    const limit = Number(server.traffic_limit || 0);
    const p = used == null ? 0 : pct(used, limit);
    const remain = limit && used != null ? Math.max(0, limit - used) : null;
    const tip = used == null ? "暂无流量累计" : (limit ? ("已用 " + p.toFixed(1) + "%") : "无限额");
    return (
      '<div class="quota">' +
        '<div class="quota-h">' +
          "<span>已用 <b>" + fmtBytes(used, 1) + "</b>" + (limit ? " / " + fmtBytes(limit, 2) : "") + "</span>" +
          "<span>" + (limit ? "剩余 <b>" + fmtBytes(remain, 1) + "</b>" : "无限额") + "</span>" +
        "</div>" +
        '<div class="quota-bar' + quotaTone(p) + '" style="--p:' + (limit && used != null ? p : 0) + '%" data-tip="' + h(tip) + '"><i></i></div>' +
      "</div>"
    );
  }

  function quotaMini(server) {
    const used = server.traffic_used == null ? null : Number(server.traffic_used);
    const limit = Number(server.traffic_limit || 0);
    const p = used == null ? 0 : pct(used, limit);
    return (
      '<span class="quota-cell hide-sm" title="' + h(used == null ? "暂无流量累计" : (limit ? ("已用 " + p.toFixed(1) + "%") : "无限额")) + '">' +
        '<span class="quota-cell-n">' + fmtBytes(used, 1) + (limit ? " / " + fmtBytes(limit, 2) : "") + "</span>" +
        '<span class="quota-cell-mobile">' + fmtBytes(used, 1) + "</span>" +
        '<span class="quota-mini' + quotaTone(p) + '" style="--p:' + (limit && used != null ? p : 0) + '%"><i></i></span>' +
      "</span>"
    );
  }

  function meters(server) {
    const mem = pctMetric(server.mem_used, server.mem_total);
    const disk = pctMetric(server.disk_used, server.disk_total);
    const cpu = server.cpu_pct == null ? null : Number(server.cpu_pct);
    return (
      '<div class="meters">' +
        '<div class="meter"><span>CPU ' + pctText(cpu) + '</span><i style="--p:' + (cpu == null ? 0 : cpu) + '%"></i></div>' +
        '<div class="meter"><span>内存 ' + pctText(mem) + '</span><i style="--p:' + (mem == null ? 0 : mem) + '%"></i></div>' +
        '<div class="meter"><span>硬盘 ' + pctText(disk) + '</span><i style="--p:' + (disk == null ? 0 : disk) + '%"></i></div>' +
      "</div>"
    );
  }

  function cardTone(server) {
    if (!server.online) return " is-down";
    const ms = pingMs(server);
    const loss = pingLoss(server);
    if ((ms != null && ms > 180) || (loss != null && loss > 20)) return " is-bad";
    if (ms != null && ms > 80) return " is-hot";
    return " is-ok";
  }

  function hashText(text) {
    let x = 2166136261;
    String(text || "").split("").forEach(function (ch) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); });
    return x >>> 0;
  }

  function cityHintLL(server) {
    const text = [server.region_city, server.region_name, server.name].filter(Boolean).join(" ");
    for (let i = 0; i < CITY_HINTS.length; i += 1) {
      if (CITY_HINTS[i][0].test(text)) return CITY_HINTS[i][1].slice();
    }
    return null;
  }

  function scatterLL(base, server, index, scope) {
    const same = (state.servers || []).filter(function (s) {
      if (scope === "city") {
        const ll = cityHintLL(s);
        return ll && Math.abs(ll[0] - base[0]) < 0.01 && Math.abs(ll[1] - base[1]) < 0.01;
      }
      return (s.geo_country || s.region_country) === (server.geo_country || server.region_country) && !cityHintLL(s);
    });
    if (same.length <= 1) return base.slice();
    const rank = Math.max(0, same.findIndex(function (s) { return s.uuid === server.uuid; }));
    const seed = hashText(server.uuid || server.name || index);
    const angle = ((rank / same.length) * Math.PI * 2) + ((seed % 31) / 31) * 0.45;
    const ring = scope === "city" ? 0.28 + (rank % 2) * 0.16 : 2.2 + (rank % 3) * 0.9;
    const latScale = Math.max(0.4, Math.cos(base[1] * Math.PI / 180));
    return [wrapLon(base[0] + Math.cos(angle) * ring / latScale), Math.max(-78, Math.min(78, base[1] + Math.sin(angle) * ring))];
  }

  function serverLL(server, index) {
    // Important: Number(null) is 0, so test null explicitly before conversion.
    if (server.longitude != null && server.latitude != null && Number.isFinite(Number(server.longitude)) && Number.isFinite(Number(server.latitude))) {
      return [Number(server.longitude), Number(server.latitude)];
    }
    const city = cityHintLL(server);
    if (city) return scatterLL(city, server, index, "city");
    const base = COUNTRY_LL[server.geo_country || server.region_country];
    if (!base) return null;
    return scatterLL(base, server, index, "country");
  }

  function readRouteOverrides() {
    try {
      const raw = JSON.parse(localStorage.getItem(ROUTE_STORE_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (_) {
      return {};
    }
  }

  function writeRouteOverrides(value) {
    localStorage.setItem(ROUTE_STORE_KEY, JSON.stringify(value || {}));
  }

  function effectiveRoutes(server) {
    const byCarrier = {};
    (server && server.return_routes || []).forEach(function (rt) {
      if (rt && rt.carrier) byCarrier[rt.carrier] = Object.assign({}, rt);
    });
    const local = readRouteOverrides()[server && server.uuid] || {};
    Object.keys(local).forEach(function (carrier) {
      const value = String(local[carrier] || "").trim();
      if (value) byCarrier[carrier] = { carrier: carrier, region: "", route_type: value, source: "local" };
      else delete byCarrier[carrier];
    });
    return ["telecom", "unicom", "mobile"].map(function (carrier) { return byCarrier[carrier]; }).filter(Boolean);
  }

  function routeValue(server, carrier) {
    const row = effectiveRoutes(server).find(function (rt) { return rt.carrier === carrier; });
    return row ? String(row.route_type || "") : "";
  }

  function routeSelect(server, carrier) {
    const value = routeValue(server, carrier);
    const choices = (ROUTE_PRESETS[carrier] || []).slice();
    if (value && !choices.some(function (p) { return p[0] === value; })) choices.push([value, "自定义 · " + value]);
    return '<label class="route-edit"><span>' + h(CARRIER[carrier] || carrier) + '</span><select data-route-carrier="' + attr(carrier) + '">' +
      choices.map(function (pair) { return '<option value="' + attr(pair[0]) + '"' + (pair[0] === value ? ' selected' : '') + '>' + h(pair[1]) + '</option>'; }).join("") +
      '</select></label>';
  }

  function cardCoord(server) {
    const ll = serverLL(server, 0);
    if (!ll) return (server.region_country || "——");
    return Math.abs(ll[1]).toFixed(1) + (ll[1] >= 0 ? "N" : "S") + "  " + Math.abs(ll[0]).toFixed(1) + (ll[0] >= 0 ? "E" : "W");
  }

  function lookAtCountry(cc) {
    const ll = COUNTRY_LL[cc];
    if (!ll) return;
    globeLon = ll[0];
    globeLat = Math.max(-78, Math.min(78, ll[1]));
    paintGlobe();
  }

  function card(server, i) {
    const loss = pingLoss(server);
    return (
      '<button class="cell' + cardTone(server) + '" data-index="' + attr(i) + '" type="button">' +
        '<div class="card">' +
          '<span class="card-coord">' + h(cardCoord(server)) + "</span>" +
          '<div class="card-face">' +
            '<div class="head">' +
              '<span class="cc">' + h(displayCountry(server) || "") + "</span>" +
              '<span class="name">' + h(server.name || "未命名") + "</span>" +
              '<span class="dot' + (server.online ? "" : " is-off") + '"></span>' +
              '<span class="status">' + (server.online ? "在线" : "离线") + "</span>" +
            "</div>" +
            '<div class="speeds">' +
              '<span>实时网速　↓ <b>' + fmtSpeed(server.download_speed) + "</b>　↑ <b>" + fmtSpeed(server.upload_speed) + "</b></span>" +
            "</div>" +
            sparkOf(server) +
            '<div class="card-loss' + lossTone(loss) + '">' + lossText(loss) + '</div>' +
            meters(server) +
            quotaBar(server) +
            '<div class="meta"><span>在线' + h(fmtDays(server.uptime).replace(/\s+/g, "")) + ' · 剩余' + remainingHTMLFor(server) + '</span></div>' +
          "</div>" +
        "</div>" +
      "</button>"
    );
  }

  function rowSpeedPair(server) {
    return '<span class="speed-part"><i>↓</i><b>' + fmtSpeed(server.download_speed) + '</b></span>' +
      '<span class="speed-part"><i>↑</i><b>' + fmtSpeed(server.upload_speed) + '</b></span>';
  }

  function row(server, i) {
    const ms = pingMs(server);
    const mem = pctMetric(server.mem_used, server.mem_total);
    const disk = pctMetric(server.disk_used, server.disk_total);
    return (
      '<button class="row" data-index="' + attr(i) + '" type="button">' +
        '<span class="cc">' + h(displayCountry(server) || "") + "</span>" +
        '<span class="name">' + h(server.name || "未命名") + "</span>" +
        '<span class="status">' + (server.online ? "在线" : "离线") + "</span>" +
        '<span class="speeds row-speeds">' + rowSpeedPair(server) + '</span>' +
        '<span class="latency-cell"><span class="ms' + latencyTone(ms) + '">' + (ms == null ? "—" : ms + " ms") + '</span><small class="' + lossTone(pingLoss(server)).trim() + '">' + lossText(pingLoss(server)) + '</small></span>' +
        sparkOf(server) +
        '<span class="hide-sm">' + pctText(server.cpu_pct) + "</span>" +
        '<span class="hide-sm">' + pctText(mem) + "</span>" +
        '<span class="hide-sm">' + pctText(disk) + "</span>" +
        quotaMini(server) +
        '<span class="hide-sm">' + fmtDays(server.uptime) + "</span>" +
        '<span class="life-cost"><span class="life-remain">' + remainingHTMLFor(server) + '</span></span>' +
      "</button>"
    );
  }

  function sortHead(label, key) {
    const mark = listSortKey === key ? (listSortDir < 0 ? " ↓" : listSortDir > 0 ? " ↑" : "") : "";
    return '<button type="button" class="sort-head' + (listSortKey === key ? ' is-on' : '') + '" data-sort="' + attr(key) + '" title="点击排序：降序 → 升序 → 默认">' + h(label + mark) + '</button>';
  }

  function listHead() {
    return (
      '<div class="row row-h">' +
        sortHead("地区", "region") + sortHead("名称", "name") + sortHead("状态", "status") + sortHead("实时网速", "speed") + sortHead("延迟 / %", "latency") + "<span>曲线</span>" +
        sortHead("CPU", "cpu") + sortHead("内存", "memory") + sortHead("硬盘", "disk") + sortHead("流量", "traffic") + sortHead("在线", "uptime") + sortHead("剩余", "remaining") +
      "</div>" +
      '<div class="mobile-row-h" aria-hidden="true"><span>地区</span><span>VPS</span><span>状态</span><span>延迟</span><span>丢包</span><span>流量</span><span>剩余</span></div>'
    );
  }

  function slab(server, i) {
    const ms = pingMs(server);
    const st = dailyStats(server);
    const last7 = (server.daily_traffic || []).slice(-7);
    const routes = effectiveRoutes(server).map(function (rt) {
      return h(CARRIER[rt.carrier] || rt.carrier || "—") + " <b>" + h(rt.route_type || "—") + "</b>";
    }).join("　");
    return (
      '<button class="slab" data-index="' + attr(i) + '" type="button">' +
        '<div class="slab-top">' +
          '<div class="head">' +
            '<span class="cc">' + h(displayCountry(server) || "") + "</span>" +
            '<span class="name">' + h(server.name || "未命名") + "</span>" +
            '<span class="dot' + (server.online ? "" : " is-off") + '"></span>' +
            '<span class="status">' + (server.online ? "在线" : "离线") + " · " + h(server.region_city || server.region_name || "") + "</span>" +
          "</div>" +
          '<span class="more">打开窗口 →</span>' +
        "</div>" +
        '<div class="slab-grid">' +
          "<div>" +
            '<div class="slab-ms' + latencyTone(ms) + '">' + (ms == null ? "—" : ms) + "<small>MS</small></div>" +
            '<div class="slab-loss' + lossTone(pingLoss(server)) + '">' + lossText(pingLoss(server)) + '</div>' +
            '<div class="speeds">↓ <b>' + fmtSpeed(server.download_speed) + "</b>　↑ <b>" + fmtSpeed(server.upload_speed) + "</b></div>" +
            sparkOf(server, true) +
          "</div>" +
          "<div>" +
            meters(server) +
            '<div style="margin-top:14px">' + quotaBar(server) + "</div>" +
            '<div class="meta" style="margin-top:10px"><span>在线' + h(fmtDays(server.uptime).replace(/\s+/g, "")) + ' · 剩余' + remainingHTMLFor(server) + '</span></div>' +
          "</div>" +
          "<div>" +
            '<div class="stat-col" style="margin-bottom:8px">近 7 日　均 ' + fmtBytes(st.avg, 1) + "　" + lossHTML(pingLoss(server)) + "</div>" +
            (last7.length ? ProbeCharts.bars(last7, { w: 280, h: 52, tips: trafficTips(last7) }) : '<div class="mini-empty">暂无历史</div>') +
            '<div class="slab-routes">' + (routes || "暂无回程") + "</div>" +
          "</div>" +
        "</div>" +
      "</button>"
    );
  }

  function pulseInfo(day) {
    return pulse.find(function (p) { return p.day === day; }) || pulse[0];
  }

  function cycleBlock() {
    const today = new Date().getDate();
    const days = pulse.length || 31;
    const heights = pulse.map(function (p) { return p.total; });
    const usedToNow = pulse.filter(function (p) { return p.day <= today; }).reduce(function (a, b) { return a + b.total; }, 0);
    const half = pulse.find(function (p) { return p.acc >= usedToNow * 0.5 && p.day <= today; });
    const info = pulseInfo(pulseDay);
    const hits = pulse.map(function (p) {
      return '<button type="button" data-day="' + attr(p.day) + '" aria-label="' + attr(p.date) + '"></button>';
    }).join("");
    return (
      '<section class="cycle" aria-label="本月脉搏">' +
        '<div class="cycle-head">' +
          "<span>本月脉搏　<b>" + info.date.slice(5) + "</b>　全网 " + fmtBytes(info.total, 1) +
          (info.total ? "　最忙 " + h(info.peak) : "") +
          (info.offline ? "　·　曾掉线" : "") +
          (info.loss >= 1 ? "　·　" + info.loss + "%" : "") +
          "</span>" +
          "<span>已过 " + today + "/" + days + "　累计 " + fmtBytes(usedToNow, 1) + "　空心点 = 过半</span>" +
        "</div>" +
        '<div class="ruler">' +
          ProbeCharts.ruler(today, days, { heights: heights, selected: pulseDay, halfDay: half ? half.day : 0 }) +
          '<div class="ruler-hit">' + hits + "</div>" +
        "</div>" +
      "</section>"
    );
  }

  function fleetStrip() {
    const t = totals();
    const regions = {};
    (state.servers || []).forEach(function (s) {
      const k = s.region_name || s.region_country || "—";
      regions[k] = (regions[k] || 0) + 1;
    });
    const down = (state.servers || []).reduce(function (a, s) { return a + (s.download_speed || 0); }, 0);
    const up = (state.servers || []).reduce(function (a, s) { return a + (s.upload_speed || 0); }, 0);
    const monthCNY = aggregateCNY(state.servers || [], false);
    const monthGroups = costGroups(state.servers || [], false);
    const fxLabel = state._fx_source ? (state._fx_source === "cache" ? "汇率缓存" : state._fx_source === "stale-cache" ? "旧汇率缓存" : state._fx_source === "default" ? "备用汇率" : state._fx_source) : "汇率加载中";
    return (
      '<section class="fleet" aria-label="集群概览">' +
        "<article><div class='lbl'>节点</div><div class='val'>" + t.all + "</div><div class='sub'>在线 " + t.online + " · 离线 " + (t.all - t.online) + "</div></article>" +
        "<article><div class='lbl'>地区</div><div class='val'>" + Object.keys(regions).length + "</div><div class='sub'>独立地域</div></article>" +
        "<article><div class='lbl'>下行合计</div><div class='val'>" + fmtSpeed(down) + "</div><div class='sub'>上行 " + fmtSpeed(up) + "</div></article>" +
        "<article><div class='lbl'>流量累计</div><div class='val'>" + fmtBytes(t.used, 1) + "</div><div class='sub'>限额 " + fmtBytes(t.limit, 2) + "</div></article>" +
        "<article class='fleet-finance' data-finance-detail role='button' tabindex='0' aria-label='查看月均成本明细'><div class='lbl'>月均成本</div><div class='val'>" + (monthCNY == null ? "—" : ("≈ ¥" + monthCNY.toFixed(2))) + "</div><div class='sub'>" + h(fxLabel) + " · " + costGroupsHTML(monthGroups) + "</div></article>" +
      "</section>"
    );
  }

  function empty(title, text) {
    main.innerHTML =
      '<section class="state">' +
        ProbeCharts.wave({ w: 280, h: 64 }) +
        "<h2>" + h(title) + "</h2>" +
        "<p>" + h(text) + "</p>" +
      "</section>";
  }

  function renderChrome(r) {
    const titles = { nodes: state.title || "节点状态", network: "网络状况", resource: "资源概况" };
    titleEl.textContent = titles[r.home] || titles.nodes;
    titleEl.hidden = false;
    Array.prototype.forEach.call(document.querySelectorAll("#site-nav [data-home]"), function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-home") === r.home);
    });
    const bar = document.getElementById("views");
    if (bar) {
      Array.prototype.forEach.call(bar.querySelectorAll("[data-view]"), function (el) {
        const on = r.view === el.getAttribute("data-view");
        el.classList.toggle("is-on", on);
        el.setAttribute("aria-pressed", on ? "true" : "false");
      });
      const g = bar.querySelector("[data-globe]");
      if (g) {
        g.classList.toggle("is-on", showGlobe);
        g.setAttribute("aria-pressed", showGlobe ? "true" : "false");
      }
    }
  }

  function defaultListedServers() {
    const policy = String(state.offline_server_position || "Last");
    return (state.servers || []).map(function (s, i) { return { s: s, i: s.uuid || String(i), order: i }; }).sort(function (a, b) {
      if (policy === "First" && a.s.online !== b.s.online) return a.s.online ? 1 : -1;
      if (policy !== "Keep" && policy !== "First" && a.s.online !== b.s.online) return a.s.online ? -1 : 1;
      const aw = Number(a.s.weight || 0);
      const bw = Number(b.s.weight || 0);
      if (aw !== bw) return aw - bw;
      return Number(a.s._order == null ? a.order : a.s._order) - Number(b.s._order == null ? b.order : b.s._order);
    });
  }

  function remainingSortValue(server) {
    if (server.long_term) return Number.POSITIVE_INFINITY;
    if (!server.expires_at_raw) return Number.POSITIVE_INFINITY;
    const ts = new Date(server.expires_at_raw).getTime();
    return Number.isFinite(ts) ? Math.ceil((ts - Date.now()) / 86400000) : Number.POSITIVE_INFINITY;
  }

  function listSortValue(server, key) {
    if (key === "region") { const rd = regionDisplay(server); return (displayCountry(server) + " " + (rd.city || server.region_name || "")).toLowerCase(); }
    if (key === "name") return String(server.name || "").toLowerCase();
    if (key === "status") return server.online ? 1 : 0;
    if (key === "speed") return Number(server.download_speed || 0) + Number(server.upload_speed || 0);
    if (key === "latency") { const v = pingMs(server); return v == null ? -1 : v; }
    if (key === "cpu") return Number(server.cpu_pct == null ? -1 : server.cpu_pct);
    if (key === "memory") return pctMetric(server.mem_used, server.mem_total) ?? -1;
    if (key === "disk") return pctMetric(server.disk_used, server.disk_total) ?? -1;
    if (key === "traffic") return Number(server.traffic_used == null ? -1 : server.traffic_used);
    if (key === "uptime") return Number(server.uptime || 0);
    if (key === "remaining") return remainingSortValue(server);
    return 0;
  }

  function listedServers(applyInteractiveSort, applyRegionFilter) {
    let base = defaultListedServers();
    if (applyRegionFilter && regionFilter) {
      base = base.filter(function (item) { return regionDisplay(item.s).label === regionFilter; });
    }
    if (!applyInteractiveSort || !listSortKey || !listSortDir) return base;
    return base.map(function (item, idx) { return { item: item, idx: idx, value: listSortValue(item.s, listSortKey) }; }).sort(function (a, b) {
      let cmp = 0;
      if (typeof a.value === "string" || typeof b.value === "string") cmp = String(a.value).localeCompare(String(b.value), "zh-CN", { numeric: true, sensitivity: "base" });
      else cmp = Number(a.value) - Number(b.value);
      if (!Number.isFinite(cmp) || cmp === 0) cmp = a.idx - b.idx;
      return listSortDir < 0 ? -cmp : cmp;
    }).map(function (x) { return x.item; });
  }

  function serverByKey(key) {
    const k = String(key == null ? "" : key);
    return (state.servers || []).find(function (s, i) { return String(s.uuid || i) === k; }) || null;
  }

  function listToolbar(r) {
    return (
      '<div class="list-bar" id="views">' +
        '<span class="list-bar-k">机器清单</span>' +
        '<div class="views">' +
          '<button class="icon-btn' + (r.view === "list" ? " is-on" : "") + '" data-view="list" type="button" aria-label="横向排列" title="横向">' + iconList() + "</button>" +
          '<button class="icon-btn' + (r.view === "grid" ? " is-on" : "") + '" data-view="grid" type="button" aria-label="网格排列" title="网格">' + iconGrid() + "</button>" +
          '<button class="icon-btn' + (r.view === "column" ? " is-on" : "") + '" data-view="column" type="button" aria-label="列排列" title="列">' + iconColumn() + "</button>" +
          '<button class="icon-btn' + (showGlobe ? " is-on" : "") + '" data-globe type="button" aria-label="显示地球" title="地球开/关">' + iconGlobe() + "</button>" +
        "</div>" +
      "</div>"
    );
  }

  function renderFoot() {
    const t = totals();
    const source = liveMode ? "Komari RPC2" : (demoMode ? "演示数据" : "连接中");
    foot.innerHTML =
      "<div>总使用流量　<b>" + fmtBytes(t.used, 2) + " / " + fmtBytes(t.limit, 2) + "</b></div>" +
      "<div>在线服务器　<b>" + t.online + " / " + t.all + "</b></div>" +
      "<div class='foot-update'><span>最后更新　<b>" + clock(new Date()) + "</b></span><span class='foot-meta'>" + source + "　·　Powered by Komari Monitor</span></div>";
  }

  function listEmpty() {
    return '<section class="state"><h2>暂无节点</h2><p>官方接口还没有返回可展示的服务器。</p></section>';
  }

  function renderGrid(r) {
    const items = listedServers(false, true);
    main.innerHTML = fleetStrip() + globePanel() + listToolbar(r) + (items.length
      ? '<section class="board" aria-label="网格排列">' + items.map(function (item) {
        return card(item.s, item.i);
      }).join("") + "</section>"
      : listEmpty()) + cycleBlock();
  }

  function renderColumn(r) {
    const items = listedServers(false, true);
    main.innerHTML = fleetStrip() + globePanel() + listToolbar(r) + '<section class="stack" aria-label="列排列">' + items.map(function (item) {
      return slab(item.s, item.i);
    }).join("") + "</section>" + cycleBlock();
  }

  function renderList(r) {
    const items = listedServers(true, true);
    main.innerHTML = fleetStrip() + globePanel() + listToolbar(r) + '<section class="list" aria-label="横向排列">' + listHead() + items.map(function (item) {
      return row(item.s, item.i);
    }).join("") + "</section>" + cycleBlock();
  }

  function nodeCtx(index) {
    const s = serverByKey(index);
    if (!s) return null;
    if ((!targetKey || targetKey === "all") && s.ping && s.ping.length) targetKey = s.ping[0].key;
    const ping = (s.ping || []).find(function (p) { return p.key === targetKey; }) || (s.ping || [])[0] || null;
    const cacheKey = s.uuid + ":" + range + ":" + (targetKey || "all");
    const cached = seriesCache[cacheKey];
    let sparkVals = [];
    let multiSeries = [];
    if (cached) {
      sparkVals = (cached.series || []).map(function (p) { return p && p.value != null && Number.isFinite(Number(p.value)) ? Number(p.value) : -1; });
      multiSeries = cached.seriesByTask || [];
    } else if (range === "1h" && targetKey === "all") {
      multiSeries = (s.ping || []).map(function (p) { return { key: p.key, label: p.label, points: (p.buckets || []).map(function (b) { return { value: b.ms, t: b.t }; }) }; });
    } else if (range === "1h" && ping && ping.buckets) {
      sparkVals = ping.buckets.map(function (b) { return b.ms; });
    } else if (!liveMode && ping) {
      const hist = ProbeDemo.pingSeries(s, range, ping.key);
      sparkVals = (hist.series || []).map(function (p) { return p.value; });
    }
    return { s: s, ping: ping, sparkVals: sparkVals, multiSeries: multiSeries, st: dailyStats(s), last7: (s.daily_traffic || []).slice(-7) };
  }

  function heroMultiSeries(ctx) {
    const s = ctx.s;
    const cacheKey = s.uuid + ":" + range + ":all";
    const cached = seriesCache[cacheKey];
    if (cached && cached.seriesByTask && cached.seriesByTask.length) return cached.seriesByTask;
    if (range === "1h") {
      return (s.ping || []).map(function (p) {
        return { key: p.key, label: p.label, points: (p.buckets || []).map(function (b) { return { value: b.ms, t: b.t }; }) };
      }).filter(function (item) { return item.points.length; });
    }
    return [];
  }

  function heroPingSummary(s) {
    const pings = (s.ping || []).filter(function (p) { return p && p.current_ms != null && Number(p.current_ms) >= 0; });
    if (!pings.length) return null;
    const ms = pings.reduce(function (sum, p) { return sum + Number(p.current_ms); }, 0) / pings.length;
    const losses = pings.map(function (p) { return p.loss_pct == null ? null : Number(p.loss_pct); }).filter(Number.isFinite);
    return { current_ms: ms, loss_pct: losses.length ? losses.reduce(function (a, b) { return a + b; }, 0) / losses.length : null };
  }

  function pingAxisLabels() {
    const hours = range === "24h" ? 24 : range === "6h" ? 6 : 1;
    const end = Date.now();
    const start = end - hours * 3600000;
    const mid = start + (end - start) / 2;
    function tm(ts) {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return [tm(start), tm(mid), tm(end)];
  }

  function pingChartOpts(mode, base) {
    const opt = Object.assign({}, base || {});
    opt.showYAxis = mode === "y" || mode === "xy";
    opt.showXAxis = mode === "xy";
    opt.adaptiveY = true;
    opt.yUnit = "ms";
    if (opt.showXAxis) opt.xLabels = pingAxisLabels();
    return opt;
  }

  function heroPingChart(ctx, w, ht, mode) {
    const series = heroMultiSeries(ctx);
    if (series.length > 1 && ProbeCharts.multiSpark) return ProbeCharts.multiSpark(series, pingChartOpts(mode || "y", { w: w, h: ht }));
    if (series.length === 1) {
      const vals = (series[0].points || []).map(function (p) { return p && p.value != null ? Number(p.value) : -1; });
      const p = (ctx.s.ping || []).find(function (item) { return item.key === series[0].key; }) || (ctx.s.ping || [])[0] || null;
      const idx = Math.max(0, (ctx.s.ping || []).indexOf(p));
      return ProbeCharts.spark(vals, pingChartOpts(mode || "y", { w: w, h: ht, color: pingColor(p, idx), fillOpacity: 0.11, tips: pingTips(vals, range === "24h" ? 30 : range === "6h" ? 10 : 5) }));
    }
    return '<div class="chart-empty">暂无多线路延迟历史</div>';
  }

  function pingChart(ctx, w, ht, mode) {
    if (targetKey === "all" && ctx.multiSeries && ctx.multiSeries.length > 1 && ProbeCharts.multiSpark) {
      return ProbeCharts.multiSpark(ctx.multiSeries, pingChartOpts(mode || "y", { w: w, h: ht }));
    }
    const idx = Math.max(0, (ctx.s.ping || []).findIndex(function (p) { return ctx.ping && p.key === ctx.ping.key; }));
    return ProbeCharts.spark(ctx.sparkVals, pingChartOpts(mode || "y", { w: w, h: ht, color: pingColor(ctx.ping, idx), fillOpacity: 0.11, tips: pingTips(ctx.sparkVals, range === "24h" ? 30 : range === "6h" ? 10 : 5) }));
  }

  function trafficHistoryHTML(ctx, w, ht) {
    if (!ctx.last7.length) {
      const status = ctx.s.traffic_history_status === "loading" ? "历史流量加载中…" : "Komari 当前没有可用的近 7 日历史记录";
      return '<div class="chart-empty">' + h(status) + '</div>';
    }
    return ProbeCharts.bars(ctx.last7, { w: w, h: ht, tips: trafficTips(ctx.last7) });
  }

  function heroLine(s, ping) {
    const ms = ping && ping.current_ms != null ? Math.round(Number(ping.current_ms)) : null;
    return (
      '<header class="hero">' +
        "<div>" +
          '<div class="hero-sub">' +
            (s.online ? "在线" : "离线") + " · " + h(s.region_name || s.region_city || "") +
            (s.provider_name ? " · " + h(s.provider_name) : "") +
            " · 在线 " + fmtDays(s.uptime) +
          "</div>" +
        "</div>" +
        '<div class="hero-pulse">' +
          '<div class="ms-xl' + latencyTone(ms) + '">' + (ms == null ? "—" : ms) + "<small>MS</small></div>" +
          '<div class="hero-loss' + lossTone(ping && ping.loss_pct) + '">' + lossText(ping && ping.loss_pct) + '</div>' +
        "</div>" +
      "</header>"
    );
  }

  function pingTargetsHTML(s) {
    const pings = s.ping || [];
    if (!pings.length) return '<span class="hero-sub">暂无 Ping Task 数据</span>';
    let html = '';
    html += pings.map(function (p) {
      const danger = (p.current_ms != null && Number(p.current_ms) > 180) || (p.loss_pct != null && Number(p.loss_pct) > 20);
      return '<button type="button" class="chip' + (p.key === targetKey ? " is-on" : "") + (danger ? " is-bad" : "") + '" data-target="' + attr(p.key) + '">' + h(p.label) + ' · ' + h(pingText(p)) + ' · ' + lossHTML(p.loss_pct) + '</button>';
    }).join('');
    return html;
  }

  function pageHTML(index) {
    const ctx = nodeCtx(index);
    if (!ctx) return "";
    const s = ctx.s;
    const routes = effectiveRoutes(s);
    const mem = pctMetric(s.mem_used, s.mem_total);
    const disk = pctMetric(s.disk_used, s.disk_total);
    const trafficSub = s.traffic_limit ? ('限额 ' + fmtBytes(s.traffic_limit, 2)) : '无限额';
    return (
      '<article class="sheet">' +
        heroLine(s, heroPingSummary(s)) +
        heroPingChart(ctx, 960, 50, "y") +
        '<section class="kpi">' +
          '<article><div class="lbl">下行</div><div class="val">' + fmtSpeed(s.download_speed) + '</div><div class="sub">上行 ' + fmtSpeed(s.upload_speed) + "</div></article>" +
          '<article><div class="lbl">CPU</div><div class="val">' + pctText(s.cpu_pct) + '</div><div class="sub">负载 ' + h((s.loadavg || "—").toString().trim().split(/\s+/).join(" · ")) + "</div></article>" +
          '<article><div class="lbl">内存</div><div class="val">' + pctText(mem) + '</div><div class="sub">' + fmtBytes(s.mem_used, 1) + " / " + fmtBytes(s.mem_total, 0) + "</div></article>" +
          '<article><div class="lbl">硬盘</div><div class="val">' + pctText(disk) + '</div><div class="sub">' + fmtBytes(s.disk_used, 0) + " / " + fmtBytes(s.disk_total, 0) + "</div></article>" +
          '<article><div class="lbl">流量累计</div><div class="val">' + fmtBytes(s.traffic_used, 1) + '</div><div class="sub">' + trafficSub + " · " + lossHTML(ctx.ping && ctx.ping.loss_pct) + "</div></article>" +
        "</section>" +
        '<section class="sheet-mid">' +
          '<div class="panel tight">' +
            '<div class="panel-h"><h3>延迟</h3>' +
              '<div class="seg">' + ["1h", "6h", "24h"].map(function (k) {
                return '<button type="button" data-range="' + k + '" class="' + (range === k ? "is-on" : "") + '">' + k + "</button>";
              }).join("") + "</div>" +
            "</div>" +
            '<div class="targets">' + pingTargetsHTML(s) + "</div>" +
            pingChart(ctx, 520, 96, "y") +
          "</div>" +
          '<div class="panel tight">' +
            '<div class="panel-h"><h3>近 7 日</h3><span class="hero-sub">' + (ctx.last7.length ? ('均 ' + fmtBytes(ctx.st.avg, 1) + ' · 高 ' + fmtBytes(ctx.st.high, 1)) : '按 Komari 历史记录') + "</span></div>" +
            trafficHistoryHTML(ctx, 320, 88) +
            (ctx.last7.length ? '<div class="day-inline">' + ctx.last7.map(function (d) {
              return "<span>" + h(d.date.slice(8)) + " " + fmtBytes(d.total, 1) + "</span>";
            }).join("") + "</div>" : '') +
          "</div>" +
        "</section>" +
        '<section class="sheet-bot">' +
          '<div class="panel tight">' +
            '<div class="panel-h"><h3>三网回程</h3></div>' +
            '<div class="routes compact">' +
              (routes.length ? routes.map(function (rt) {
                return '<div class="route"><span class="car">' + h(CARRIER[rt.carrier] || rt.carrier || "—") + "</span><span>" + h(rt.route_type || "—") + "</span></div>";
              }).join("") : '<div class="hero-sub">暂无回程；可在 metadata/nodes.json 按 UUID 补充</div>') +
            "</div>" +
          "</div>" +
          '<div class="panel tight">' +
            '<div class="panel-h"><h3>系统</h3></div>' +
            '<div class="sys-grid desktop-sys-grid">' +
              "<div>系统 <b>" + h(s.os || "—") + "</b></div>" +
              "<div>内核 <b>" + h(s.kernel || "—") + "</b></div>" +
              "<div>架构 <b>" + h(s.arch || "—") + "</b></div>" +
              "<div>CPU <b>" + h(s.cpu_model || "—") + " · " + h(s.cpu_cores == null ? "—" : s.cpu_cores) + "C/" + h(s.cpu_threads == null ? "—" : s.cpu_threads) + "T</b></div>" +
              "<div>到期 <b>" + h(s.expires_at || "—") + "</b></div>" +
              "<div>续费 <b>" + h(renewalText(s)) + "</b></div>" +
            "</div>" +
            '<div class="mobile-sys-grid">' +
              '<div><span>系统</span><b>' + h(compactOS(s.os)) + '</b></div>' +
              '<div><span>架构</span><b>' + h((s.arch || "—") + (s.virtualization ? " · " + s.virtualization : "")) + '</b></div>' +
              '<div class="wide"><span>CPU</span><b>' + h(compactCPU(s.cpu_model)) + (s.cpu_cores != null || s.cpu_threads != null ? ' · ' + h(s.cpu_cores == null ? "—" : s.cpu_cores) + 'C/' + h(s.cpu_threads == null ? "—" : s.cpu_threads) + 'T' : '') + '</b></div>' +
              '<div><span>内核</span><b>' + h(compactKernel(s.kernel)) + '</b></div>' +
              '<div><span>到期</span><b>' + h(s.expires_at || "—") + '</b></div>' +
              '<div><span>续费</span><b>' + h(renewalText(s)) + '</b></div>' +
              (s.asn ? '<div class="wide"><span>ASN</span><b>' + h(s.asn + (s.asn_org ? " · " + s.asn_org : "")) + '</b></div>' : '') +
            '</div>' +
          "</div>" +
        "</section>" +
      "</article>"
    );
  }

  function latencyPageCtx(index) {
    const s = serverByKey(index);
    if (!s) return null;
    const key = latencyTargetKey || "all";
    const ping = key === "all" ? null : ((s.ping || []).find(function (p) { return p.key === key; }) || (s.ping || [])[0] || null);
    const cacheKey = s.uuid + ":" + range + ":" + key;
    const cached = seriesCache[cacheKey];
    let sparkVals = [];
    let multiSeries = [];
    if (cached) {
      sparkVals = (cached.series || []).map(function (p) { return p && p.value != null && Number.isFinite(Number(p.value)) ? Number(p.value) : -1; });
      multiSeries = cached.seriesByTask || [];
    } else if (range === "1h" && key === "all") {
      multiSeries = (s.ping || []).map(function (p) { return { key: p.key, label: p.label, points: (p.buckets || []).map(function (b) { return { value: b.ms, t: b.t }; }) }; });
    } else if (range === "1h" && ping && ping.buckets) {
      sparkVals = ping.buckets.map(function (b) { return b.ms; });
    }
    return { s: s, ping: ping, sparkVals: sparkVals, multiSeries: multiSeries, st: dailyStats(s), last7: (s.daily_traffic || []).slice(-7) };
  }

  function latencyPageTargetsHTML(s) {
    const pings = s.ping || [];
    if (!pings.length) return '<span class="hero-sub">暂无 Ping Task 数据</span>';
    let html = '';
    if (pings.length > 1) html += '<button type="button" class="chip' + (latencyTargetKey === "all" ? ' is-on' : '') + '" data-latency-target="all">多线合并</button>';
    html += pings.map(function (p) {
      const danger = (p.current_ms != null && Number(p.current_ms) > 180) || (p.loss_pct != null && Number(p.loss_pct) >= 10);
      return '<button type="button" class="chip' + (latencyTargetKey === p.key ? ' is-on' : '') + (danger ? ' is-bad' : '') + '" data-latency-target="' + attr(p.key) + '">' + h(p.label) + ' · ' + h(pingText(p)) + ' · ' + lossHTML(p.loss_pct) + '</button>';
    }).join('');
    return html;
  }

  function latencyPageChart(ctx, w, ht) {
    if (!ctx) return '<div class="chart-empty">暂无 Ping Task 数据</div>';
    if (latencyTargetKey === "all" && ctx.multiSeries && ctx.multiSeries.length > 1 && ProbeCharts.multiSpark) {
      return ProbeCharts.multiSpark(ctx.multiSeries, pingChartOpts("xy", { w: w, h: ht }));
    }
    const idx = Math.max(0, (ctx.s.ping || []).findIndex(function (p) { return ctx.ping && p.key === ctx.ping.key; }));
    return ProbeCharts.spark(ctx.sparkVals, pingChartOpts("xy", { w: w, h: ht, color: pingColor(ctx.ping, idx), fillOpacity: 0.11, tips: pingTips(ctx.sparkVals, range === "24h" ? 30 : range === "6h" ? 10 : 5) }));
  }

  function pagePing(ctx) {
    const s = ctx.s;
    const pings = s.ping || [];
    const pctx = latencyPageCtx(s.uuid) || ctx;
    return (
      '<article class="page page-ping">' +
        '<div class="panel-h">' +
          "<div><h3 style='margin:0'>Latency / Packet Loss</h3></div>" +
          '<div class="seg">' +
            ["1h", "6h", "24h"].map(function (k) {
              return '<button type="button" data-range="' + k + '" class="' + (range === k ? "is-on" : "") + '">' + k + "</button>";
            }).join("") +
          "</div>" +
        "</div>" +
        '<div class="targets">' + latencyPageTargetsHTML(s) + "</div>" +
        '<div class="chart-fill latency-axis-panel">' + latencyPageChart(pctx, 960, 280) + "</div>" +
        '<section class="ping-stat-grid">' + pings.map(function (p) {
          return '<article><div class="lbl">' + h(p.label) + '</div><div class="val' + latencyTone(p.current_ms) + '">' + h(pingText(p)) + '</div><div class="sub"><span class="loss-value' + lossTone(p.loss_pct) + '">' + lossText(p.loss_pct) + '</span> · avg ' + h(p.avg_ms == null ? '—' : Math.round(p.avg_ms) + 'ms') + ' · p99 ' + h(p.p99_ms == null ? '—' : Math.round(p.p99_ms) + 'ms') + '</div></article>';
        }).join('') + '</section>' +
      "</article>"
    );
  }

  function pageTraffic(ctx) {
    const s = ctx.s;
    return (
      '<article class="page page-traffic">' +
        '<div style="margin:0 0 16px">' + quotaBar(s) + "</div>" +
        '<section class="kpi">' +
          '<article><div class="lbl">已用</div><div class="val">' + fmtBytes(s.traffic_used, 1) + '</div><div class="sub">' + (s.traffic_limit ? ('限额 ' + fmtBytes(s.traffic_limit, 2)) : '无限额') + "</div></article>" +
          '<article><div class="lbl">上行累计</div><div class="val">' + fmtBytes(s.traffic_used_up, 1) + '</div><div class="sub">Komari totalUp</div></article>' +
          '<article><div class="lbl">下行累计</div><div class="val">' + fmtBytes(s.traffic_used_down, 1) + '</div><div class="sub">Komari totalDown</div></article>' +
          '<article><div class="lbl">最高日</div><div class="val">' + (ctx.last7.length ? fmtBytes(ctx.st.high, 1) : '—') + '</div><div class="sub">日均 ' + (ctx.last7.length ? fmtBytes(ctx.st.avg, 1) : '—') + "</div></article>" +
          '<article><div class="lbl">账期提示</div><div class="val">' + h((s.period_start || '').slice(5) || '—') + '</div><div class="sub">至 ' + h((s.period_end || '').slice(5) || '—') + "</div></article>" +
        "</section>" +
        '<div class="chart-fill"><div class="panel-h"><h3>近 7 日流量</h3><span class="hero-sub">由 Komari network total 记录差分</span></div>' +
          trafficHistoryHTML(ctx, 960, 220) +
        "</div>" +
        (ctx.last7.length ? '<section class="day-grid">' +
          ctx.last7.map(function (d) {
            return "<article><div class='lbl'>" + h(d.date.slice(5)) + "</div><div class='val' style='font-size:16px'>" + fmtBytes(d.total, 1) + "</div><div class='hero-sub'>↑ " + fmtBytes(d.uplink, 1) + "　↓ " + fmtBytes(d.downlink, 1) + "</div></article>";
          }).join("") +
        "</section>" : '') +
      "</article>"
    );
  }

  function pageRoutes(ctx) {
    const s = ctx.s;
    const rows = effectiveRoutes(s);
    const editor = accessState.is_admin ? (
      '<section class="route-editor" data-route-node="' + attr(s.uuid) + '">' +
        '<div class="panel-h"><h3>后台路线</h3><span class="hero-sub">管理员 · 保存到 Komari 节点 tags</span></div>' +
        '<div class="route-edit-grid">' + ["telecom", "unicom", "mobile"].map(function (carrier) { return routeSelect(s, carrier); }).join("") + '</div>' +
        '<div class="route-actions"><button type="button" class="chip" data-route-save>保存到 Komari 后台</button><button type="button" class="chip" data-route-export>复制 metadata JSON</button><button type="button" class="chip" data-route-reset>撤销本次修改</button><span class="hero-sub" id="route-save-status">修改后点击保存；后台会保留其他已有 tags。</span></div>' +
      '</section>'
    ) : '';
    return (
      '<article class="page page-routes">' +
        '<div class="panel-h"><h3 style="margin:0">三网回程</h3><span class="hero-sub">' + (accessState.is_admin ? '管理员可持久化修改' : '只读') + '</span></div>' +
        '<div class="route-cards">' +
          (["telecom", "unicom", "mobile"].map(function (carrier) {
            const rt = rows.find(function (item) { return item.carrier === carrier; });
            return '<article class="route-card"><div class="car">' + h(CARRIER[carrier]) + '</div><div><h3>' + h(rt && rt.route_type || '未填写') + '</h3><div class="hero-sub">' + h(rt && rt.region || '') + '</div></div></article>';
          }).join("")) +
        "</div>" + editor +
      "</article>"
    );
  }

  function pageSystem(ctx) {
    const s = ctx.s;
    const cells = [
      ["系统", s.os || "—"],
      ["内核", s.kernel || "—"],
      ["架构", s.arch || "—"],
      ["虚拟化", s.virtualization || "—"],
      ["处理器", (s.cpu_model || "—") + " · " + (s.cpu_cores == null ? "—" : s.cpu_cores) + "C / " + (s.cpu_threads == null ? "—" : s.cpu_threads) + "T"],
      ["负载", (s.loadavg || "—").toString().trim().split(/\s+/).join(" · ")],
      ["到期", s.expires_at || "—"],
      ["续费", renewalText(s)],
      ["自动续费", s.auto_renewal ? "是" : "否"],
      ["流量限额", s.traffic_limit ? fmtBytes(s.traffic_limit, 2) + " · " + h(s.traffic_limit_type || 'sum') : "无限额"],
      ["IPv4", maskIP(s.ipv4)],
      ["IPv6", maskIP(s.ipv6)],
      ["ASN", s.asn ? (s.asn + (s.asn_org ? " · " + s.asn_org : "")) : (state.enable_ip_geo_asn ? "查询不可用" : "未启用")],
      ["Agent", s.agent_version || "—"],
    ];
    return (
      '<article class="page page-system">' +
        '<section class="spec">' +
          cells.map(function (c) {
            return "<article><div class='lbl'>" + h(c[0]) + "</div><div class='val'>" + h(c[1]) + "</div></article>";
          }).join("") +
        "</section>" +
      "</article>"
    );
  }

  function closeWindow() {
    const r = route();
    go(viewHash(r.view || lastView));
    if (lastFocus) {
      const el = Array.prototype.find.call(document.querySelectorAll("[data-index]"), function (node) { return node.getAttribute("data-index") === lastFocus; });
      if (el) el.focus();
    }
  }

  function renderWindow(index, page) {
    const s = serverByKey(index);
    if (s == null) {
      overlay.hidden = true;
      document.body.classList.remove("is-locked");
      document.documentElement.classList.remove("is-locked");
      return;
    }
    const visiblePages = accessState.is_admin ? PAGES : ["overview"];
    const current = visiblePages.indexOf(page) >= 0 ? page : "overview";
    const ctx = nodeCtx(index);
    winTitle.textContent = s.name || "未命名";
    const rd = regionDisplay(s);
    winKicker.textContent = rd.code + " / " + (rd.city || "DETAIL");
    const nav = document.getElementById("stage-nav");
    if (nav) {
      nav.style.display = accessState.is_admin ? "" : "none";
      nav.innerHTML = visiblePages.map(function (key) {
        return '<button type="button" data-page="' + key + '" class="' + (current === key ? "is-on" : "") + '">' + PAGE_LABEL[key] + '</button>';
      }).join("");
    }
    if (current === "ping") winBody.innerHTML = pagePing(ctx);
    else if (current === "traffic") winBody.innerHTML = pageTraffic(ctx);
    else if (current === "routes") winBody.innerHTML = pageRoutes(ctx);
    else if (current === "system") winBody.innerHTML = pageSystem(ctx);
    else winBody.innerHTML = pageHTML(index);
    overlay.hidden = false;
    document.body.classList.add("is-locked");
    document.documentElement.classList.add("is-locked");
    const key = String(index) + ":" + current;
    if (lastWindowKey !== key) winBody.scrollTop = 0;
    lastWindowKey = key;
  }

  function wrapLon(lon) {
    return ((lon + 180) % 360 + 360) % 360 - 180;
  }

  function globeCaption() {
    const lon = Math.round(globeLon);
    const lat = Math.round(globeLat);
    return "ORTHOGRAPHIC · " + Math.abs(lon) + "°" + (lon >= 0 ? "E" : "W") + " " + Math.abs(lat) + "°" + (lat >= 0 ? "N" : "S");
  }

  function labelWidth(text) {
    let w = 0;
    for (let i = 0; i < text.length; i += 1) {
      w += text.charCodeAt(i) > 255 ? 8.6 : 5.05;
    }
    return w + 2;
  }

  function layoutGlobeLabels(cx, ortho) {
    const items = [];
    (state.servers || []).forEach(function (s, i) {
      const ll = serverLL(s, i) || [80, 30];
      const p = ortho(ll[0], ll[1]);
      if (!p) return;
      const label = displayCountry(s) + " · " + s.name;
      items.push({ i: i, key: s.uuid || String(i), s: s, px: p.x, py: p.y, label: label, w: labelWidth(label) });
    });

    const buckets = {};
    items.forEach(function (n) {
      const key = displayCountry(n.s) || "?";
      (buckets[key] = buckets[key] || []).push(n);
    });
    Object.keys(buckets).forEach(function (key) {
      const g = buckets[key];
      if (g.length < 2) return;
      g.forEach(function (n, idx) {
        const a = (idx / g.length) * Math.PI * 2 - Math.PI / 2;
        n.px += Math.cos(a) * 4.2;
        n.py += Math.sin(a) * 4.2;
      });
    });

    const left = [];
    const right = [];
    items.forEach(function (n) {
      let side = n.px >= cx ? "R" : "L";
      if (globeLabelSide[n.key] && Math.abs(n.px - cx) < 22) side = globeLabelSide[n.key];
      if (side === "L" && n.w > 64) side = "R";
      (side === "L" ? left : right).push(n);
    });

    function stack(list, x, end) {
      list.sort(function (a, b) { return a.py - b.py || a.i - b.i; });
      if (!list.length) return;
      const gap = list.length > 14 ? 11 : 13;
      const mean = list.reduce(function (sum, n) { return sum + n.py; }, 0) / list.length;
      let y0 = mean - (list.length - 1) * gap / 2;
      if (y0 < 12) y0 = 12;
      const last = y0 + (list.length - 1) * gap;
      if (last > 204) y0 -= last - 204;
      if (y0 < 12) y0 = 12;
      list.forEach(function (n, idx) {
        n.lx = x;
        n.ly = y0 + idx * gap;
        n.end = end;
        globeLabelSide[n.key] = end ? "L" : "R";
      });
    }

    stack(left, 70, true);
    stack(right, 270, false);
    return items;
  }

  function globeMarkup() {
    const cx = 168;
    const cy = 112;
    const R = 92;
    const lon0 = globeLon * Math.PI / 180;
    const lat0 = globeLat * Math.PI / 180;
    function ortho(lonD, latD) {
      const lon = lonD * Math.PI / 180;
      const lat = latD * Math.PI / 180;
      const cosc = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(lon - lon0);
      if (cosc <= 0.02) return null;
      return {
        x: cx + R * Math.cos(lat) * Math.sin(lon - lon0),
        y: cy - R * (Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(lon - lon0)),
        k: cosc,
      };
    }
    function curve(lonFixed, latFixed, from, to, step) {
      let d = "";
      let started = false;
      for (let a = from; a <= to; a += step) {
        const p = lonFixed != null ? ortho(lonFixed, a) : ortho(a, latFixed);
        if (!p) { started = false; continue; }
        d += (started ? " L " : "M ") + p.x.toFixed(2) + " " + p.y.toFixed(2);
        started = true;
      }
      return d ? '<path class="globe-wire" d="' + d + '" fill="none" stroke-width="0.9"/>' : "";
    }
    function landOutlines() {
      return WORLD_OUTLINES.map(function (shape) {
        let d = "";
        let started = false;
        shape.forEach(function (ll) {
          const p = ortho(ll[0], ll[1]);
          if (!p) { started = false; return; }
          d += (started ? " L " : "M ") + p.x.toFixed(2) + " " + p.y.toFixed(2);
          started = true;
        });
        return d ? '<path class="globe-land" d="' + d + '" fill="none" stroke-width="1.15"/>' : "";
      }).join("");
    }
    let wire =
      '<defs><radialGradient id="globe-shade" cx="38%" cy="36%" r="68%">' +
        '<stop offset="0%" stop-color="var(--ink)" stop-opacity="0.06"/>' +
        '<stop offset="70%" stop-color="var(--ink)" stop-opacity="0"/>' +
        '<stop offset="100%" stop-color="var(--globe-rim)" stop-opacity="1"/>' +
      "</radialGradient></defs>" +
      '<circle class="globe-disk" cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#globe-shade)" stroke="var(--ink)" stroke-width="1.05"/>' + landOutlines();
    for (let lon = -180; lon < 180; lon += 30) wire += curve(lon, null, -80, 80, 4);
    for (let lat = -60; lat <= 60; lat += 30) wire += curve(null, lat, -180, 180, 4);
    wire += curve(null, 0, -180, 180, 3).replace('stroke-width="0.9"', 'stroke-width="1.15"');
    const sweepLon = ((Date.now() / 28) % 360) - 180;
    const sweepBase = currentTheme() === "light" ? 0.52 : 0.42;
    for (let k = 0; k < 6; k += 1) {
      const lon = sweepLon - k * 8;
      const sweep = curve(lon, null, -80, 80, 3);
      if (sweep) {
        wire += sweep
          .replace('class="globe-wire"', 'class="globe-sweep"')
          .replace('stroke-width="0.9"', 'stroke-width="' + (k === 0 ? 1.6 : 1.1) + '" style="stroke-opacity:' + (sweepBase - k * 0.06).toFixed(2) + '"');
      }
    }
    wire += '<line class="globe-base" x1="48" y1="' + (cy + R + 16) + '" x2="288" y2="' + (cy + R + 16) + '" stroke-width="1"/>';
    const laid = layoutGlobeLabels(cx, ortho);
    let links = "";
    const online = laid.filter(function (n) { return n.s.online; });
    online.forEach(function (a, i) {
      online.forEach(function (b, j) {
        if (j <= i) return;
        if ((a.s.geo_country || a.s.region_country || "") === (b.s.geo_country || b.s.region_country || "")) return;
        if ((a.i * 7 + b.i * 3) % 4 !== 1) return;
        const mx = (a.px + b.px) / 2;
        const my = (a.py + b.py) / 2;
        const qx = cx + (mx - cx) * 0.42;
        const qy = cy + (my - cy) * 0.42;
        links += '<path class="globe-link" d="M ' + a.px.toFixed(1) + " " + a.py.toFixed(1) + " Q " + qx.toFixed(1) + " " + qy.toFixed(1) + " " + b.px.toFixed(1) + " " + b.py.toFixed(1) + '" fill="none" stroke-width="0.55"/>';
      });
    });
    const pins = laid.map(function (n) {
      const tx = n.end ? n.lx - 3 : n.lx + 3;
      return (
        '<g class="globe-node">' +
          '<path d="M ' + n.px.toFixed(1) + " " + n.py.toFixed(1) + " L " + n.lx.toFixed(1) + " " + n.ly.toFixed(1) + '" fill="none" stroke="var(--ink)" stroke-width="0.75"/>' +
          '<circle cx="' + n.px.toFixed(1) + '" cy="' + n.py.toFixed(1) + '" r="2.1" fill="none" stroke="' + (n.s.online ? "var(--ink)" : "var(--down)") + '" stroke-width="1"/>' +
          '<text x="' + tx.toFixed(1) + '" y="' + (n.ly + 3).toFixed(1) + '" text-anchor="' + (n.end ? "end" : "start") + '" fill="var(--ink-soft)" font-size="8.5" font-family="IBM Plex Mono, monospace" stroke="var(--void)" stroke-width="3" paint-order="stroke" stroke-linejoin="round">' + h(n.label) + "</text>" +
          '<circle class="hit" cx="' + n.px.toFixed(1) + '" cy="' + n.py.toFixed(1) + '" r="9" fill="transparent" data-index="' + attr(n.key) + '"/>' +
        "</g>"
      );
    }).join("");
    return wire + links + pins +
      '<text class="globe-caption" x="168" y="' + (cy + R + 28) + '" text-anchor="middle" font-size="8" font-family="IBM Plex Mono, monospace" letter-spacing="1.4">' + globeCaption() + "</text>";
  }

  function globePanel() {
    if (!showGlobe || (window.matchMedia && window.matchMedia("(max-width: 720px)").matches)) return "";
    const regions = {};
    (state.servers || []).forEach(function (s) {
      const rd = regionDisplay(s);
      const key = rd.label;
      if (!regions[key]) regions[key] = { count: 0, aim: s.geo_country || s.region_country || rd.code };
      regions[key].count += 1;
    });
    const side = '<button type="button" class="reg' + (!regionFilter ? ' is-on' : '') + '" data-region-filter=""><span>ALL</span><b>' + (state.servers || []).length + '</b></button>' +
      Object.keys(regions).sort().map(function (k) {
        const item = regions[k];
        return '<button type="button" class="reg' + (regionFilter === k ? ' is-on' : '') + '" data-region-filter="' + attr(k) + '" data-aim="' + attr(item.aim) + '"><span>' + h(k) + "</span><b>" + item.count + "</b></button>";
      }).join("");
    return (
      '<section class="home-globe" aria-label="节点地球">' +
        '<div class="atlas">' +
          '<svg viewBox="0 0 420 240" preserveAspectRatio="xMidYMid meet">' +
            globeMarkup() +
          "</svg>" +
        "</div>" +
        '<aside class="atlas-side"><div class="lbl atlas-title">地区</div>' + side + "</aside>" +
      "</section>"
    );
  }

  function paintGlobe() {
    const svg = main.querySelector(".atlas svg");
    if (svg) svg.innerHTML = globeMarkup();
  }

  function onGlobeDown(ev) {
    const atlas = ev.target.closest(".atlas");
    if (!atlas || ev.button) return;
    globeDrag = {
      id: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      lon: globeLon,
      lat: globeLat,
      moved: false,
    };
    atlas.classList.add("is-drag");
    try { atlas.setPointerCapture(ev.pointerId); } catch (e) {}
  }

  function onGlobeMove(ev) {
    if (!globeDrag || ev.pointerId !== globeDrag.id) return;
    const dx = ev.clientX - globeDrag.x;
    const dy = ev.clientY - globeDrag.y;
    if (!globeDrag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    globeDrag.moved = true;
    ev.preventDefault();
    globeLon = wrapLon(globeDrag.lon - dx * 0.48);
    globeLat = Math.max(-78, Math.min(78, globeDrag.lat + dy * 0.36));
    paintGlobe();
  }

  function onGlobeUp(ev) {
    if (!globeDrag || ev.pointerId !== globeDrag.id) return;
    const atlas = main.querySelector(".atlas");
    if (atlas) {
      atlas.classList.remove("is-drag");
      try { atlas.releasePointerCapture(ev.pointerId); } catch (e) {}
    }
    if (globeDrag.moved) globeSkipClick = true;
    globeDrag = null;
  }

  function hideWindow() {
    overlay.hidden = true;
    document.body.classList.remove("is-locked");
    document.documentElement.classList.remove("is-locked");
    winBody.innerHTML = "";
  }

  function renderNetwork() {
    const servers = listedServers().map(function (item) { return item.s; });
    if (!servers.length) {
      main.innerHTML = listEmpty();
      return;
    }
    if (!netKey || !servers.some(function (item) { return String(item.uuid) === String(netKey); })) netKey = servers[0].uuid;
    const s = servers.find(function (item) { return String(item.uuid) === String(netKey); }) || servers[0];
    const targets = s.ping || [];
    const chosen = netTarget === "all" ? null : targets.find(function (p) { return p.key === netTarget; });
    const valid = chosen ? [chosen] : targets.filter(function (p) { return p.current_ms != null && Number(p.current_ms) >= 0; });
    const avgMs = valid.length ? Math.round(valid.reduce(function (a, p) { return a + Number(p.current_ms); }, 0) / valid.length) : null;
    const lossValues = chosen ? (chosen.loss_pct == null ? [] : [Number(chosen.loss_pct)]) : targets.map(function (p) { return p.loss_pct == null ? null : Number(p.loss_pct); }).filter(Number.isFinite);
    const avgLoss = lossValues.length ? lossValues.reduce(function (a, b) { return a + b; }, 0) / lossValues.length : null;
    const cacheKey = s.uuid + ":" + range + ":" + (netTarget || "all");
    const cached = seriesCache[cacheKey] || null;
    let chart = '';
    if (netTarget === 'all' && cached && cached.seriesByTask && cached.seriesByTask.length > 1) {
      chart = ProbeCharts.multiSpark(cached.seriesByTask, { w: 960, h: 200 });
    } else {
      let vals = cached ? (cached.series || []).map(function (p) { return p.value; }) : [];
      const sparkSrc = chosen || targets[0];
      if (!vals.length && range === "1h" && sparkSrc && sparkSrc.buckets) vals = sparkSrc.buckets.map(function (b) { return b.ms; });
      const sparkIndex = Math.max(0, targets.indexOf(sparkSrc));
      chart = ProbeCharts.spark(vals, { w: 960, h: 200, color: pingColor(sparkSrc, sparkIndex), fillOpacity: 0.11, tips: pingTips(vals, range === "24h" ? 30 : range === "6h" ? 10 : 5) });
    }
    if (!chart) chart = '<div class="chart-empty">暂无该时间范围的 Ping 历史</div>';
    main.innerHTML =
      '<section class="subpage">' +
        "<p class='lead'>按服务器与探测目标查看延迟、丢包和时间范围；负值 Ping 会按丢包处理，不显示为负延迟。</p>" +
        '<div class="pick" style="margin-bottom:16px">' +
          servers.map(function (item) {
            return '<button type="button" class="chip' + (String(item.uuid) === String(netKey) ? " is-on" : "") + '" data-net="' + attr(item.uuid) + '">' + h(item.name) + "</button>";
          }).join("") +
        "</div>" +
        '<section class="kpi">' +
          "<article><div class='lbl'>平均延迟</div><div class='val'>" + (avgMs == null ? '—' : avgMs + ' ms') + "</div><div class='sub'>" + h(s.name) + "</div></article>" +
          "<article><div class='lbl'>平均丢包</div><div class='val'>" + lossHTML(avgLoss) + "</div><div class='sub'>所选目标</div></article>" +
          "<article><div class='lbl'>时间范围</div><div class='val'>" + range + "</div><div class='sub'>1h / 6h / 24h</div></article>" +
          "<article><div class='lbl'>探测目标</div><div class='val'>" + targets.length + "</div><div class='sub'>Komari Ping Tasks</div></article>" +
        "</section>" +
        '<div class="panel-h" style="margin:16px 0 10px">' +
          '<div class="pick">' +
            '<button type="button" class="chip' + (netTarget === "all" ? " is-on" : "") + '" data-nett="all">多线合并</button>' +
            targets.map(function (p) {
              return '<button type="button" class="chip' + (netTarget === p.key ? " is-on" : "") + '" data-nett="' + attr(p.key) + '">' + h(p.label) + ' · ' + h(pingText(p)) + ' · ' + lossHTML(p.loss_pct) + '</button>';
            }).join("") +
          "</div>" +
          '<div class="seg">' +
            ["1h", "6h", "24h"].map(function (k) {
              return '<button type="button" data-range="' + k + '" class="' + (range === k ? "is-on" : "") + '">' + k + "</button>";
            }).join("") +
          "</div>" +
        "</div>" +
        '<div class="chart-fill" style="height:240px">' + chart + "</div>" +
        '<div class="bucket-strip" style="margin-top:14px">' +
          targets.map(function (p) {
            return "<article><div class='lbl'>" + h(p.label) + "</div><div class='val' style='font-size:16px'>" + h(pingText(p)) + "</div><div class='hero-sub'>" + lossHTML(p.loss_pct) + " · avg " + h(p.avg_ms == null ? '—' : Math.round(p.avg_ms) + 'ms') + "</div></article>";
          }).join("") +
        "</div>" +
      "</section>" + cycleBlock();
  }

  function renderResource() {
    const servers = state.servers || [];
    const byDate = {};
    servers.forEach(function (s) {
      (s.daily_traffic || []).slice(-7).forEach(function (row) {
        if (!row || !row.date) return;
        if (!byDate[row.date]) byDate[row.date] = { date: row.date, uplink: 0, downlink: 0, total: 0 };
        byDate[row.date].uplink += Number(row.uplink || 0);
        byDate[row.date].downlink += Number(row.downlink || 0);
        byDate[row.date].total += Number(row.total || 0);
      });
    });
    const last7 = Object.keys(byDate).sort().slice(-7).map(function (key) { return byDate[key]; });
    const monthGroups = costGroups(servers, false);
    const annualGroups = costGroups(servers, true);
    const monthCNY = aggregateCNY(servers, false);
    const annualCNY = aggregateCNY(servers, true);
    const fxLabel = state._fx_source ? (state._fx_source === 'cache' ? '汇率缓存' : state._fx_source === 'stale-cache' ? '旧汇率缓存' : state._fx_source === 'default' ? '备用汇率' : state._fx_source) : '汇率加载中';
    const ranked = servers.filter(function (s) { return Number(s.traffic_limit || 0) > 0 && s.traffic_used != null; }).slice().sort(function (a, b) {
      return pct(b.traffic_used, b.traffic_limit) - pct(a.traffic_used, a.traffic_limit);
    });
    const heat = servers.slice().sort(function (a, b) { return Number(b.cpu_pct || 0) - Number(a.cpu_pct || 0); });
    const soon = servers.filter(function (s) { return s.expires_at_raw && !s.long_term; }).slice().sort(function (a, b) { return a.expires_at_raw.localeCompare(b.expires_at_raw); }).slice(0, 6);
    const t = totals();
    const on = function (key) { return !liveMode || state[key] !== false; };
    let body = '<section class="subpage"><p class="lead">' + t.online + "/" + t.all + " 台在线。费用按 Komari 原生 price / billing_cycle 折算；汇率使用每日缓存的公开 CNY 基准数据，并保留原币种明细。</p>";
    body += '<section class="kpi">' +
      "<article><div class='lbl'>月均成本</div><div class='val cost-value'>" + (monthCNY == null ? '—' : ('≈ ¥' + monthCNY.toFixed(2))) + "</div><div class='sub'>" + h(fxLabel) + " · 原币种 " + costGroupsHTML(monthGroups) + "</div></article>" +
      "<article><div class='lbl'>年化预算</div><div class='val cost-value'>" + (annualCNY == null ? '—' : ('≈ ¥' + annualCNY.toFixed(2))) + "</div><div class='sub'>按 365.25 天 · 原币种 " + costGroupsHTML(annualGroups) + "</div></article>" +
      "<article><div class='lbl'>流量累计</div><div class='val'>" + fmtBytes(t.used, 1) + "</div><div class='sub'>限额 " + fmtBytes(t.limit, 2) + "</div></article>" +
      "<article><div class='lbl'>有限额</div><div class='val'>" + servers.filter(function (s) { return s.traffic_limit; }).length + "</div><div class='sub'>台服务器</div></article></section>";
    if (on("show_traffic_7d") || on("show_traffic_quota")) {
      body += '<section class="panels" style="margin-top:16px">';
      if (on("show_traffic_7d")) {
        body += '<div class="panel"><div class="panel-h"><h3>近 7 日上下行</h3><span class="hero-sub">金 = 上行　灰 = 下行</span></div>' +
          (last7.length ? ProbeCharts.stacked(last7, { w: 520, h: 140, tips: trafficTips(last7) }) : '<div class="chart-empty">Komari 当前没有足够的 7 日 network 历史记录</div>') + "</div>";
      }
      if (on("show_traffic_quota")) {
        body += '<div class="panel"><div class="panel-h"><h3>额度使用率</h3></div>' +
          (ranked.length ? ranked.slice(0, 5).map(function (s) {
            const p = pct(s.traffic_used, s.traffic_limit);
            return '<div class="rank" style="margin:10px 0"><div class="reg"><span>' + h(s.name) + "</span><b>" + Math.round(p) + "%</b></div><i style='--p:" + p + "%'></i></div>";
          }).join("") : '<div class="chart-empty">没有设置流量限额的节点</div>') + "</div>";
      }
      body += "</section>";
    }
    if (on("show_resource_heatmap")) {
      body += '<div class="panel" style="margin-top:16px"><div class="panel-h"><h3>资源压力</h3><span class="hero-sub">CPU · 内存 · 硬盘</span></div>' +
        '<table class="heat"><thead><tr><th>服务器</th><th>CPU</th><th>内存</th><th>硬盘</th></tr></thead><tbody>' +
        heat.map(function (s) {
          const mem = pctMetric(s.mem_used, s.mem_total);
          const disk = pctMetric(s.disk_used, s.disk_total);
          const cpu = s.cpu_pct == null ? null : Number(s.cpu_pct);
          return "<tr><td>" + h(s.name) + "</td><td>" + pctText(cpu) + "<i class='bar'><i style='width:" + (cpu == null ? 0 : cpu) + "%'></i></i></td><td>" +
            pctText(mem) + "</td><td>" + pctText(disk) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    if (on("show_renewal_timeline")) {
      body += '<div class="panel" style="margin-top:16px"><div class="panel-h"><h3>续费与到期</h3><span class="hero-sub">按到期日</span></div><div class="timeline">' +
        (soon.length ? soon.map(function (s) {
          const days = Math.max(0, Math.round((new Date(s.expires_at_raw) - new Date()) / 86400000));
          return "<article><div>" + h(s.expires_at || "—") + "</div><b>" + h(s.name) + "</b>" + days + " 天后　" + h(renewalText(s)) + "</article>";
        }).join("") : '<div class="hero-sub">暂无可用的到期日期</div>') + "</div></div>";
    }
    main.innerHTML = body + "</section>" + cycleBlock();
  }

  function renderBoard(r) {
    if (r.home === "network") renderNetwork();
    else if (r.home === "resource") renderResource();
    else if (r.view === "column") renderColumn(r);
    else if (r.view === "list") renderList(r);
    else renderGrid(r);
  }

  function render() {
    const r = route();
    const params = new URLSearchParams(location.search);
    const demo = params.get("state");
    renderChrome(r);

    if (state._loading) {
      empty("连接 Komari", "正在读取 RPC2 节点与实时状态…");
      renderFoot();
      hideWindow();
      return;
    }
    if (state._error) {
      empty("Komari 数据读取失败", state._error);
      renderFoot();
      hideWindow();
      return;
    }
    if (demo === "error" || state.enabled === false) {
      empty("探针未开启", "当前没有可展示的公开探针数据。");
      renderFoot();
      hideWindow();
      return;
    }
    if (demo === "empty" || !(state.servers && state.servers.length)) {
      empty("暂无节点", "Komari 没有返回可展示的服务器。");
      renderFoot();
      hideWindow();
      return;
    }

    renderBoard(r);
    renderFoot();

    if (r.node != null) renderWindow(r.node, r.page);
    else hideWindow();
    if (window.ProbeFX) ProbeFX.tickCounts(main);
  }

  function openNode(index, page) {
    lastFocus = String(index);
    const node = serverByKey(index);
    targetKey = node && node.ping && node.ping.length ? node.ping[0].key : "";
    latencyTargetKey = "all";
    range = "1h";
    go(viewHash(route().view || lastView, index, page || "overview"));
    loadSeries(index, targetKey || undefined);
    loadSeries(index, "all");
  }

  function onMainClick(ev) {
    const dayBtn = ev.target.closest("[data-day]");
    if (dayBtn) {
      pulseDay = Number(dayBtn.getAttribute("data-day"));
      render();
      return;
    }
    const netBtn = ev.target.closest("[data-net]");
    if (netBtn) {
      netKey = netBtn.getAttribute("data-net") || "";
      netTarget = "all";
      if (netKey) loadSeries(netKey, netTarget).then(render);
      else render();
      return;
    }
    const nett = ev.target.closest("[data-nett]");
    if (nett) {
      netTarget = nett.getAttribute("data-nett");
      if (netKey) loadSeries(netKey, netTarget).then(render);
      else render();
      return;
    }
    const rangeBtn = ev.target.closest("[data-range]");
    if (rangeBtn) {
      range = rangeBtn.getAttribute("data-range");
      if (route().home === "network") {
        if (netKey) loadSeries(netKey, netTarget).then(render);
        else render();
      } else {
        render();
      }
      return;
    }
    const financeBtn = ev.target.closest("[data-finance-detail]");
    if (financeBtn) {
      openFinanceDetail();
      return;
    }
    const sortBtn = ev.target.closest("[data-sort]");
    if (sortBtn) {
      const key = sortBtn.getAttribute("data-sort") || "";
      if (listSortKey !== key) { listSortKey = key; listSortDir = -1; }
      else if (listSortDir < 0) listSortDir = 1;
      else { listSortKey = ""; listSortDir = 0; }
      render();
      return;
    }
    const viewBtn = ev.target.closest("[data-view]");
    if (viewBtn) {
      go(viewHash(viewBtn.getAttribute("data-view"), null, null, "nodes"));
      return;
    }
    const globeBtn = ev.target.closest("[data-globe]");
    if (globeBtn) {
      showGlobe = !showGlobe;
      localStorage.setItem("mmwx-globe", showGlobe ? "1" : "0");
      render();
      return;
    }
    const regionBtn = ev.target.closest("[data-region-filter]");
    if (regionBtn) {
      const selected = regionBtn.getAttribute("data-region-filter") || "";
      regionFilter = selected && regionFilter === selected ? "" : selected;
      const aimCode = regionBtn.getAttribute("data-aim");
      if (regionFilter && aimCode) lookAtCountry(aimCode);
      render();
      return;
    }
    const aim = ev.target.closest("[data-aim]");
    if (aim) {
      lookAtCountry(aim.getAttribute("data-aim"));
      return;
    }
    if (globeSkipClick) {
      globeSkipClick = false;
      if (ev.target.closest(".atlas")) return;
    }
    const item = ev.target.closest("[data-index]");
    if (!item) return;
    openNode(item.getAttribute("data-index"));
  }

  function onWindowClick(ev) {
    const pageBtn = ev.target.closest("[data-page]");
    if (pageBtn) {
      const r = route();
      go(viewHash(r.view || lastView, r.node, pageBtn.getAttribute("data-page")));
      return;
    }
    const rangeBtn = ev.target.closest("[data-range]");
    if (rangeBtn) {
      range = rangeBtn.getAttribute("data-range");
      Promise.all([loadSeries(route().node), loadSeries(route().node, latencyTargetKey || "all"), loadSeries(route().node, "all")]).then(function () { renderWindow(route().node, route().page); });
      return;
    }
    const latencyTargetBtn = ev.target.closest("[data-latency-target]");
    if (latencyTargetBtn) {
      latencyTargetKey = latencyTargetBtn.getAttribute("data-latency-target") || "all";
      loadSeries(route().node, latencyTargetKey).then(function () { renderWindow(route().node, route().page); });
      return;
    }
    const targetBtn = ev.target.closest("[data-target]");
    if (targetBtn) {
      targetKey = targetBtn.getAttribute("data-target");
      loadSeries(route().node).then(function () { renderWindow(route().node, route().page); });
      return;
    }
    const routeSave = ev.target.closest("[data-route-save]");
    if (routeSave) {
      if (!accessState.is_admin) return;
      const uuid = currentRouteNode();
      const choices = currentRouteChoices();
      setRouteStatus("正在保存到 Komari 后台…");
      ProbeAPI.saveReturnRoutes(uuid, choices).then(function (saved) {
        const server = serverByKey(uuid);
        if (server) {
          server.tags = saved && saved.tags != null ? saved.tags : server.tags;
          server.return_routes = ["telecom", "unicom", "mobile"].map(function (carrier) {
            const value = String(choices[carrier] || "").trim();
            return value ? { carrier: carrier, region: "", route_type: value, source: "komari" } : null;
          }).filter(Boolean);
        }
        const all = readRouteOverrides();
        delete all[uuid];
        writeRouteOverrides(all);
        renderWindow(uuid, "routes");
        setRouteStatus("已保存到 Komari 后台，刷新或更换设备后仍会保留。");
      }).catch(function (err) {
        setRouteStatus("保存失败：" + (err && err.message ? err.message : String(err)));
      });
      return;
    }
    const routeReset = ev.target.closest("[data-route-reset]");
    if (routeReset) {
      const uuid = currentRouteNode();
      const all = readRouteOverrides();
      delete all[uuid];
      writeRouteOverrides(all);
      renderWindow(uuid, "routes");
      setRouteStatus("已清除当前浏览器的覆盖，恢复 metadata 配置。");
      return;
    }
    const routeExport = ev.target.closest("[data-route-export]");
    if (routeExport) {
      const text = routeMetadataJSON();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { setRouteStatus("metadata JSON 已复制到剪贴板。"); }).catch(function () { window.prompt("复制 metadata JSON", text); });
      } else {
        window.prompt("复制 metadata JSON", text);
      }
    }
  }

  function setRouteStatus(text) {
    const el = document.getElementById("route-save-status");
    if (el) el.textContent = text;
  }

  function currentRouteNode() {
    const host = winBody.querySelector("[data-route-node]");
    return host ? host.getAttribute("data-route-node") : "";
  }

  function currentRouteChoices() {
    const out = {};
    winBody.querySelectorAll("[data-route-carrier]").forEach(function (select) {
      out[select.getAttribute("data-route-carrier")] = select.value || "";
    });
    return out;
  }

  function saveRouteChoice(uuid, carrier, value) {
    const all = readRouteOverrides();
    const node = Object.assign({}, all[uuid] || {});
    node[carrier] = value || "";
    all[uuid] = node;
    writeRouteOverrides(all);
    const s = serverByKey(uuid);
    if (s) renderWindow(uuid, "routes");
    setRouteStatus("尚未写入后台；确认后点击“保存到 Komari 后台”。");
  }

  function routeMetadataJSON() {
    const all = readRouteOverrides();
    const nodes = {};
    Object.keys(all).forEach(function (uuid) {
      const routes = ["telecom", "unicom", "mobile"].map(function (carrier) {
        const value = String(all[uuid] && all[uuid][carrier] || "").trim();
        return value ? { carrier: carrier, region: "", route_type: value } : null;
      }).filter(Boolean);
      if (routes.length) nodes[uuid] = { return_routes: routes };
    });
    return JSON.stringify({ nodes: nodes }, null, 2);
  }

  function onWindowChange(ev) {
    const select = ev.target.closest && ev.target.closest("[data-route-carrier]");
    if (!select) return;
    const uuid = currentRouteNode();
    if (!uuid || !accessState.is_admin) return;
    saveRouteChoice(uuid, select.getAttribute("data-route-carrier"), select.value);
    setRouteStatus("尚未写入后台；确认三条线路后点击“保存到 Komari 后台”。");
  }

  function onKey(ev) {
    if (ev.key === "Escape" && financeOverlay && !financeOverlay.hidden) {
      closeFinanceDetail();
      return;
    }
    if ((ev.key === "Enter" || ev.key === " ") && ev.target && ev.target.closest && ev.target.closest("[data-finance-detail]")) {
      ev.preventDefault();
      openFinanceDetail();
      return;
    }
    if (ev.key === "Escape" && route().node != null) {
      closeWindow();
      return;
    }
    if (ev.target !== document.body && ev.target.tagName !== "BODY" && ev.target.tagName !== "BUTTON") return;
    if (ev.key === "g") go(viewHash("grid", route().node, route().page, "nodes"));
    if (ev.key === "c") go(viewHash("column", route().node, route().page, "nodes"));
    if (ev.key === "l") go(viewHash("list", route().node, route().page, "nodes"));
  }

  setTheme(currentTheme(), { instant: true });
  const themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      setTheme(currentTheme() === "light" ? "dark" : "light", { after: render });
    });
  }

  document.getElementById("site-nav").addEventListener("click", function (ev) {
    const btn = ev.target.closest("[data-home]");
    if (!btn) return;
    const sec = btn.getAttribute("data-home");
    if (sec === "nodes") go(viewHash(lastView || "list", null, null, "nodes"));
    else go(viewHash(lastView, null, null, sec));
  });
  document.getElementById("win-close").addEventListener("click", closeWindow);
  const financeClose = document.getElementById("finance-close");
  if (financeClose) financeClose.addEventListener("click", closeFinanceDetail);
  if (financeOverlay) financeOverlay.addEventListener("click", function (ev) {
    const sortBtn = ev.target.closest && ev.target.closest("[data-finance-sort]");
    if (sortBtn) {
      const key = sortBtn.getAttribute("data-finance-sort") || "";
      if (financeSortKey !== key) { financeSortKey = key; financeSortDir = -1; }
      else if (financeSortDir < 0) financeSortDir = 1;
      else { financeSortKey = ""; financeSortDir = 0; }
      openFinanceDetail(true);
      return;
    }
    if (ev.target === financeOverlay) closeFinanceDetail();
  });
  document.getElementById("win-back").addEventListener("click", closeWindow);
  overlay.addEventListener("click", onWindowClick);
  overlay.addEventListener("change", onWindowChange);
  main.addEventListener("click", onMainClick);
  main.addEventListener("pointerdown", onGlobeDown);
  main.addEventListener("pointermove", onGlobeMove);
  main.addEventListener("pointerup", onGlobeUp);
  main.addEventListener("pointercancel", onGlobeUp);
  main.addEventListener("dblclick", function (ev) {
    if (!ev.target.closest(".atlas")) return;
    globeLon = 80;
    globeLat = 30;
    paintGlobe();
  });
  window.addEventListener("hashchange", render);
  window.addEventListener("keydown", onKey);
  document.addEventListener("mmwx-fx", function () {
    if (main.querySelector(".atlas svg")) paintGlobe();
  });

  function rebuildPulse() {
    const servers = state.servers || [];
    const byDate = {};
    servers.forEach(function (s) {
      (s.daily_traffic || []).forEach(function (d) {
        if (!d || !d.date) return;
        if (!byDate[d.date]) byDate[d.date] = { date: d.date, total: 0, peak: s.name, peakV: 0, loss: 0, offline: 0, acc: 0 };
        byDate[d.date].total += d.total || 0;
        if ((d.total || 0) > byDate[d.date].peakV) {
          byDate[d.date].peakV = d.total || 0;
          byDate[d.date].peak = s.name;
        }
      });
    });
    const first = servers[0];
    const start = first && first.period_start ? new Date(first.period_start + "T00:00:00") : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const rows = [];
    let acc = 0;
    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = start.getFullYear() + "-" + pad(start.getMonth() + 1) + "-" + pad(d);
      const hit = byDate[date];
      acc += hit ? hit.total : 0;
      rows.push({
        day: d,
        date: date,
        total: hit ? hit.total : 0,
        peak: hit ? hit.peak : "—",
        loss: 0,
        offline: 0,
        acc: acc,
      });
    }
    pulse = rows.length ? rows : ProbeDemo.monthPulse(servers);
  }

  function patchLiveUI() {
    const r = route();
    renderFoot();
    if (r.home === "nodes") {
      const fleet = main.querySelector(".fleet");
      if (fleet) fleet.outerHTML = fleetStrip();
      const items = listedServers(r.view === "list", true);
      if (r.view === "column") {
        const stack = main.querySelector(".stack");
        if (stack) stack.innerHTML = items.map(function (item) { return slab(item.s, item.i); }).join("");
      } else if (r.view === "list") {
        const list = main.querySelector(".list");
        if (list) list.innerHTML = listHead() + items.map(function (item) { return row(item.s, item.i); }).join("");
      } else {
        const board = main.querySelector(".board");
        if (board) board.innerHTML = items.map(function (item) { return card(item.s, item.i); }).join("");
      }
    } else {
      subpageLiveTick += 1;
      if (subpageLiveTick % 3 === 0) renderBoard(r);
    }
    if (r.node != null) renderWindow(r.node, r.page);
  }

  function applyLive(payload, info) {
    if (!payload || payload.enabled === false) return;
    var theme = payload.appearance && payload.appearance.theme;
    var builtin = { follow: 1, flat: 1, pixel: 1, anime: 1, premium: 1 };
    if (theme && builtin[theme] && location.pathname.indexOf("/line-grid") === 0) {
      location.replace("/");
      return;
    }
    state = payload;
    state._loading = false;
    state._error = "";
    liveMode = true;
    if (state.title) {
      document.title = state.title;
    }
    if (state.show_globe === false && localStorage.getItem("mmwx-globe") == null) {
      showGlobe = false;
    }
    if (info && info.kind === "latest") {
      if (!globeDrag) patchLiveUI();
      return;
    }
    rebuildPulse();
    if (globeDrag) return;
    const y = window.scrollY;
    const r = route();
    render();
    window.scrollTo(0, y);
    if (r.node != null) renderWindow(r.node, r.page);
  }

  function loadSeries(index, tgt) {
    if (!liveMode || index == null) return Promise.resolve();
    const t = tgt !== undefined ? tgt : (targetKey || "all");
    const key = String(index) + ":" + range + ":" + (t || "all");
    return ProbeAPI.fetchSeries(index, range, t || "all").then(function (payload) {
      if (payload) seriesCache[key] = payload;
      return payload;
    }).catch(function () { return null; });
  }

  function tickDemo() {
    if (liveMode || globeDrag) return;
    (state.servers || []).forEach(function (s, i) {
      const src = ProbeDemo.payload.servers[i];
      if (!src || !s.online) return;
      const j = (Math.sin(Date.now() / 900 + i) + 1) / 2;
      s.download_speed = Math.round(src.download_speed * (0.92 + j * 0.12));
      s.upload_speed = Math.round(src.upload_speed * (0.9 + j * 0.14));
    });
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  (function bindChartTip() {
    const tip = document.getElementById("chart-tip");
    if (!tip) return;
    let lastSvg = null;
    document.addEventListener("pointermove", function (ev) {
      const svg = ev.target.closest && ev.target.closest("svg.spark");
      if (lastSvg && lastSvg !== svg) {
        const prev = lastSvg.querySelector(".scope-cur");
        if (prev) prev.setAttribute("hidden", "");
      }
      lastSvg = svg;
      if (svg) {
        const pack = (svg.getAttribute("data-pts") || "").split(";").map(function (row) {
          const p = row.split(",");
          return { x: Number(p[0]), y: Number(p[1]), v: Number(p[2]) };
        }).filter(function (p) { return Number.isFinite(p.x); });
        const box = svg.getBoundingClientRect();
        const vb = svg.viewBox.baseVal;
        const x = ((ev.clientX - box.left) / Math.max(1, box.width)) * vb.width;
        let best = pack[0];
        let bestD = 1e9;
        pack.forEach(function (p) {
          const d = Math.abs(p.x - x);
          if (d < bestD) { bestD = d; best = p; }
        });
        const cur = svg.querySelector(".scope-cur");
        if (cur && best) {
          cur.removeAttribute("hidden");
          const line = cur.querySelector(".scope-v");
          const dot = cur.querySelector(".scope-dot");
          if (line) {
            line.setAttribute("x1", best.x);
            line.setAttribute("x2", best.x);
          }
          if (dot) {
            dot.setAttribute("cx", best.x);
            dot.setAttribute("cy", best.y);
          }
        }
      }
      const el = ev.target.closest && ev.target.closest("[data-tip]");
      if (!el) {
        tip.hidden = true;
        return;
      }
      tip.hidden = false;
      tip.textContent = el.getAttribute("data-tip") || "";
      const tx = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
      const ty = Math.min(ev.clientY + 12, window.innerHeight - tip.offsetHeight - 8);
      tip.style.left = tx + "px";
      tip.style.top = ty + "px";
    });
  })();

  if (demoMode) setInterval(tickDemo, 5000);
  setInterval(renderFoot, 1000);

  (function startGlobeIdle() {
    let last = 0;
    function frame(t) {
      requestAnimationFrame(frame);
      if (t - last < 70) return;
      last = t;
      if (!showGlobe || globeDrag || document.hidden) return;
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (route().home !== "nodes") return;
      if (overlay && !overlay.hidden) return;
      if (!main.querySelector(".atlas svg")) return;
      globeLon = wrapLon(globeLon + 0.18);
      paintGlobe();
    }
    requestAnimationFrame(frame);
  })();

  render();
  if (demoMode) {
    rebuildPulse();
    render();
  } else {
    ProbeAPI.fetchServers().then(function (payload) {
      if (!payload || payload.enabled === false) return;
      applyLive(payload);
      const accessUuid = payload.servers && payload.servers[0] && payload.servers[0].uuid;
      ProbeAPI.fetchAccess(accessUuid).then(function (nextAccess) {
        accessState = nextAccess || accessState;
        const r = route();
        if (r.node != null) renderWindow(r.node, r.page);
      }).catch(function () {});
      ProbeAPI.connectWS(applyLive);
      if (ProbeAPI.enrich) ProbeAPI.enrich(payload).then(function (next) { if (next) applyLive(next, { kind: 'enrichment' }); }).catch(function () {});
      Promise.allSettled([
        ProbeAPI.fetchPingOverview().then(function (next) { if (next) applyLive(next); }),
        ProbeAPI.fetchTrafficHistory(168).then(function (next) { if (next) applyLive(next); }),
      ]);
    }).catch(function (err) {
      state = { enabled: true, title: "节点状态", servers: [], _loading: false, _error: err && err.message ? err.message : String(err), _source: "komari-rpc2" };
      liveMode = false;
      render();
    });
  }
})();
