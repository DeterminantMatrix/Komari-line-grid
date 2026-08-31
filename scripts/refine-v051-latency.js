'use strict';

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error('v0.5.1 latency marker missing: ' + label);
  return source.replace(before, after);
}

function refineLatency(input) {
  let source = String(input || '');

  source = replaceRequired(source,
    '  function hasLatencyValues(values) {\n    return (values || []).some(function (value) { return Number.isFinite(Number(value)) && Number(value) >= 0; });\n  }\n',
    '  function hasLatencyValues(values) {\n    return (values || []).some(function (point) {\n      const raw = point && typeof point === "object" ? (point.value != null ? point.value : point.v) : point;\n      const value = Number(raw);\n      return Number.isFinite(value) && value >= 0;\n    });\n  }\n',
    'timestamp-aware latency empty state');

  source = replaceRequired(source,
    '    } else if (range === "1h" && key === "all") {\n      multiSeries = (s.ping || []).map(function (p) { return { key: p.key, label: p.label, points: (p.buckets || []).map(function (b) { return { value: b.ms, t: b.t }; }) }; });\n    } else if (range === "1h" && ping && ping.buckets) {\n      sparkVals = ping.buckets.map(function (b) { return { v: b.ms, t: b.t }; });\n',
    '    } else if (range === "1h" && key === "all") {\n      multiSeries = (s.ping || []).map(function (p) { return { key: p.key, label: p.label, points: (p.buckets || []).map(function (b) { return { value: b.ms, t: b.t }; }) }; });\n      if (multiSeries.length === 1) {\n        sparkVals = (multiSeries[0].points || []).map(function (p) { return { v: p && p.value != null ? Number(p.value) : -1, t: p && p.t != null ? Number(p.t) : null }; });\n      }\n    } else if (range === "1h" && ping && ping.buckets) {\n      sparkVals = ping.buckets.map(function (b) { return { v: b.ms, t: b.t }; });\n',
    'single-task latency fallback');

  return source;
}

module.exports = { refineLatency };
