'use strict';

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error('Time-axis fix marker missing: ' + label);
  return source.replace(before, after);
}

function replaceAllRequired(source, before, after, label, expectedCount) {
  const count = source.split(before).length - 1;
  if (!count) throw new Error('Time-axis fix marker missing: ' + label);
  if (expectedCount != null && count !== expectedCount) {
    throw new Error('Time-axis fix marker count mismatch: ' + label + ' expected=' + expectedCount + ' actual=' + count);
  }
  return source.split(before).join(after);
}

function fixAppTimeAxis(input) {
  let source = String(input || '');

  source = replaceRequired(
    source,
    '  function pingAxisLabels() {\n    const hours = range === "7D" ? 168 : range === "24h" ? 24 : range === "6h" ? 6 : 1;\n    const end = Date.now();\n    const start = end - hours * 3600000;\n',
    '  function pingWindowDomain() {\n    const hours = range === "7D" ? 168 : range === "24h" ? 24 : range === "6h" ? 6 : 1;\n    const end = Date.now();\n    return { start: end - hours * 3600000, end: end, hours: hours };\n  }\n\n  function pingAxisLabels() {\n    const domain = pingWindowDomain();\n    const end = domain.end;\n    const start = domain.start;\n',
    'shared latency window domain'
  );

  source = replaceRequired(
    source,
    '    opt.adaptiveY = true;\n    opt.yUnit = "ms";\n    if (opt.showXAxis) opt.xLabels = pingAxisLabels();\n',
    '    opt.adaptiveY = true;\n    opt.yUnit = "ms";\n    const domain = pingWindowDomain();\n    opt.domainStart = domain.start;\n    opt.domainEnd = domain.end;\n    opt.windowHours = domain.hours;\n    if (opt.showXAxis) opt.xLabels = pingAxisLabels();\n',
    'chart domain options'
  );

  source = replaceAllRequired(
    source,
    '      sparkVals = (cached.series || []).map(function (p) { return p && p.value != null && Number.isFinite(Number(p.value)) ? Number(p.value) : -1; });\n',
    '      sparkVals = (cached.series || []).map(function (p) { return { v: p && p.value != null && Number.isFinite(Number(p.value)) ? Number(p.value) : -1, t: p && p.t != null ? Number(p.t) : null }; });\n',
    'cached single-series timestamps',
    2
  );

  source = replaceAllRequired(
    source,
    '      sparkVals = ping.buckets.map(function (b) { return b.ms; });\n',
    '      sparkVals = ping.buckets.map(function (b) { return { v: b.ms, t: b.t }; });\n',
    'live bucket timestamps',
    2
  );

  source = replaceRequired(
    source,
    '      const vals = (series[0].points || []).map(function (p) { return p && p.value != null ? Number(p.value) : -1; });\n',
    '      const vals = (series[0].points || []).map(function (p) { return { v: p && p.value != null ? Number(p.value) : -1, t: p && p.t != null ? Number(p.t) : null }; });\n',
    'hero single-series timestamps'
  );

  const oldTips = [
    '  function pingTips(values, stepMin) {',
    '    const n = (values || []).length;',
    '    const step = stepMin || 5;',
    '    return (values || []).map(function (v, i) {',
    '      const t = new Date(Date.now() - (n - 1 - i) * step * 60000);',
    '      const clock = range === "7D" ? (pad(t.getMonth() + 1) + "-" + pad(t.getDate()) + " " + pad(t.getHours()) + ":" + pad(t.getMinutes())) : (pad(t.getHours()) + ":" + pad(t.getMinutes()));',
    '      return clock + "  " + (v < 0 ? "无数据" : v + " ms");',
    '    });',
    '  }'
  ].join('\n');
  const newTips = [
    '  function pingTips(values, stepMin) {',
    '    const n = (values || []).length;',
    '    const step = stepMin || 5;',
    '    return (values || []).map(function (item, i) {',
    '      const objectPoint = item && typeof item === "object";',
    '      const value = objectPoint ? Number(item.value != null ? item.value : item.v) : Number(item);',
    '      const rawTime = objectPoint && item.t != null ? Number(item.t) : NaN;',
    '      const t = new Date(Number.isFinite(rawTime) ? rawTime : (Date.now() - (n - 1 - i) * step * 60000));',
    '      const clock = range === "7D" ? (pad(t.getMonth() + 1) + "-" + pad(t.getDate()) + " " + pad(t.getHours()) + ":" + pad(t.getMinutes())) : (pad(t.getHours()) + ":" + pad(t.getMinutes()));',
    '      return clock + "  " + (!Number.isFinite(value) || value < 0 ? "无数据" : value + " ms");',
    '    });',
    '  }'
  ].join('\n');
  source = replaceRequired(source, oldTips, newTips, 'timestamp-aware latency tooltips');

  return source;
}

function fixChartsTimeAxis(input) {
  let source = String(input || '');

  source = replaceRequired(
    source,
    '    const raw = values || [];\n    const pts = raw.map(function (v) { return typeof v === "object" && v ? n(v.v) : n(v); });\n    if (!pts.length) return "";\n',
    '    const raw = values || [];\n    const pts = raw.map(function (item) {\n      if (item && typeof item === "object") {\n        const value = item.value != null ? Number(item.value) : Number(item.v);\n        return Number.isFinite(value) ? value : -1;\n      }\n      const value = Number(item);\n      return Number.isFinite(value) ? value : -1;\n    });\n    const times = raw.map(function (item) {\n      const value = item && typeof item === "object" && item.t != null ? Number(item.t) : NaN;\n      return Number.isFinite(value) ? value : null;\n    });\n    const domainStart = Number(opt.domainStart);\n    const domainEnd = Number(opt.domainEnd);\n    const hasDomain = Number.isFinite(domainStart) && Number.isFinite(domainEnd) && domainEnd > domainStart;\n    if (!pts.length) return "";\n',
    'spark timestamp input'
  );

  source = replaceRequired(
    source,
    '    const coords = pts.map(function (v, i) {\n      const x = padL + i * step;\n      const y = plotBottom - ((v < 0 ? min : v) - min) / span * plotH;\n      return [x, y];\n    });\n',
    '    const coords = pts.map(function (v, i) {\n      let x = padL + i * step;\n      if (hasDomain && Number.isFinite(times[i])) {\n        const ratio = Math.max(0, Math.min(1, (times[i] - domainStart) / (domainEnd - domainStart)));\n        x = padL + ratio * plotW;\n      }\n      const y = plotBottom - ((v < 0 ? min : v) - min) / span * plotH;\n      return [x, y];\n    });\n',
    'spark fixed-domain coordinates'
  );

  source = replaceRequired(
    source,
    '    const hitW = Math.max(6, step || plotW);\n',
    '    const hitW = hasDomain ? Math.max(6, Math.min(24, plotW / Math.max(pts.length, 12))) : Math.max(6, step || plotW);\n',
    'spark timestamp hit areas'
  );

  source = replaceRequired(
    source,
    '    const minT = times.length ? Math.min.apply(null, times) : null;\n    const maxT = times.length ? Math.max.apply(null, times) : null;\n',
    '    const dataMinT = times.length ? Math.min.apply(null, times) : null;\n    const dataMaxT = times.length ? Math.max.apply(null, times) : null;\n    const requestedStart = Number(opt.domainStart);\n    const requestedEnd = Number(opt.domainEnd);\n    const fixedDomain = Number.isFinite(requestedStart) && Number.isFinite(requestedEnd) && requestedEnd > requestedStart;\n    const minT = fixedDomain ? requestedStart : dataMinT;\n    const maxT = fixedDomain ? requestedEnd : dataMaxT;\n',
    'multi-series fixed time domain'
  );

  source = replaceRequired(
    source,
    '        const x = Number.isFinite(pt) && minT != null && maxT != null && maxT > minT\n          ? padL + ((pt - minT) / (maxT - minT)) * plotW\n          : padL + i * step;\n',
    '        const x = Number.isFinite(pt) && minT != null && maxT != null && maxT > minT\n          ? padL + Math.max(0, Math.min(1, (pt - minT) / (maxT - minT))) * plotW\n          : padL + i * step;\n',
    'multi-series fixed-domain coordinates'
  );

  source = replaceRequired(
    source,
    '        const tm = p && p.t ? axisTime(p.t) : String(i + 1);\n',
    '        const tm = p && p.t ? ((maxT != null && minT != null && maxT - minT >= 48 * 3600000) ? (String(new Date(Number(p.t)).getMonth() + 1).padStart(2, "0") + "-" + String(new Date(Number(p.t)).getDate()).padStart(2, "0") + " " + axisTime(p.t)) : axisTime(p.t)) : String(i + 1);\n',
    'multi-series long-range tooltip dates'
  );

  return source;
}

module.exports = { fixAppTimeAxis, fixChartsTimeAxis };
