'use strict';

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error('v0.5.1 visual marker missing: ' + label);
  return source.replace(before, after);
}

function refineAppVisual(input) {
  let source = String(input || '');

  const systemHelper = [
    '  function systemAsnText(server) {',
    "    const asn = String(server && server.asn || '').trim();",
    "    const org = String(server && server.asn_org || '').trim();",
    "    if (!asn) return state.enable_ip_geo_asn ? '查询不可用' : '未启用';",
    "    const tail = org && org.toUpperCase().indexOf(asn.toUpperCase()) === 0 ? org.slice(asn.length).trim().replace(/^[-·:|]\\s*/, '') : org;",
    "    return asn + (tail ? ' · ' + tail : '');",
    '  }',
    ''
  ].join('\n');
  source = replaceRequired(source, '  function pageSystem(ctx) {\n', systemHelper + '  function pageSystem(ctx) {\n', 'system ASN helper');

  source = replaceRequired(
    source,
    '      ["处理器", s.cpu_model || "—"],\n',
    '      ["处理器", s.cpu_model || "—"],\n      ["内存 / Swap", fmtBytes(s.mem_total, 1) + " / " + fmtBytes(s.swap_total, 1)],\n      ["磁盘总量", fmtBytes(s.disk_total, 1)],\n',
    'system live hardware totals'
  );
  source = replaceRequired(
    source,
    '      ["ASN", s.asn ? (s.asn + (s.asn_org ? " · " + s.asn_org : "")) : (state.enable_ip_geo_asn ? "查询不可用" : "未启用")],\n',
    '      ["ASN", systemAsnText(s)],\n',
    'deduplicate ASN organization prefix'
  );

  source = replaceRequired(
    source,
    '    const current = visiblePages.indexOf(page) >= 0 ? page : "overview";\n',
    '    const current = visiblePages.indexOf(page) >= 0 ? page : "overview";\n    const stage = overlay.querySelector(".stage");\n    if (stage) stage.classList.toggle("is-compact-system", current === "system");\n',
    'compact System stage'
  );

  source = replaceRequired(
    source,
    '(week.observed ? ProbeCharts.stacked(last7, { w: 520, h: 140, tips: trafficTips(last7) }) : \'<div class="chart-empty">暂无近 7 日流量历史</div>\')',
    '(week.observed ? ProbeCharts.stacked(last7, { w: 760, h: 110, maxBarWidth: 46, tips: trafficTips(last7) }) : \'<div class="chart-empty">暂无近 7 日流量历史</div>\')',
    'shallower sparse traffic chart'
  );
  source = replaceRequired(
    source,
    '<div class="panel"><div class="panel-h"><h3>近 7 日上下行</h3><span class="hero-sub">\' + week.observed + \'/7 天有记录</span></div>',
    '<div class="panel resource-week-panel"><div class="panel-h"><h3>近 7 日上下行</h3><span class="hero-sub">\' + week.observed + \'/7 天有记录</span></div>',
    'resource week panel class'
  );
  return source;
}

function refineChartsVisual(input) {
  let source = String(input || '');
  source = replaceRequired(
    source,
    '    const gap = 7;\n    const bw = (w - gap * (downs.length + 1)) / Math.max(downs.length, 1);\n',
    '    const slotW = w / Math.max(downs.length, 1);\n    const bw = Math.max(4, Math.min(Number(opt.maxBarWidth) || 58, slotW * 0.62));\n',
    'stacked bounded bar width'
  );
  source = replaceRequired(
    source,
    '      const x = gap + i * (bw + gap);\n',
    '      const x = i * slotW + (slotW - bw) / 2;\n',
    'stacked slot position'
  );
  return source;
}

function refineCssVisual(input) {
  return String(input || '') + '\n' + [
    '/* v0.5.1 screenshot-driven density polish */',
    '.stage.is-compact-system { height: auto; max-height: min(86dvh, 820px); }',
    '.stage.is-compact-system .stage-body { overflow: visible; }',
    '.resource-week-panel .bars { height: clamp(118px, 10vw, 150px); }',
    '@media (max-width: 720px) {',
    '  .stage.is-compact-system { height: 100dvh; max-height: 100dvh; }',
    '  .stage.is-compact-system .stage-body { overflow: auto; }',
    '  .resource-week-panel .bars { height: 116px; }',
    '}',
    ''
  ].join('\n');
}

module.exports = { refineAppVisual, refineChartsVisual, refineCssVisual };
