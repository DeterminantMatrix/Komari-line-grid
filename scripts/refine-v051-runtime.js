'use strict';

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error('v0.5.1 runtime marker missing: ' + label);
  return source.replace(before, after);
}

function functionBounds(source, name) {
  const marker = '  function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('v0.5.1 runtime function missing: ' + name);
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
  if (depth !== 0) throw new Error('v0.5.1 runtime unclosed function: ' + name);
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
function removeFunction(source, name) {
  const b = functionBounds(source, name);
  return source.slice(0, b.start) + source.slice(b.end);
}

function refineCharts(input) {
  let source = String(input || '');
  const before = [
    '      const up = ups[i];',
    '      const bhD = Math.max(1, (d / max) * (h - 8));',
    '      const bhU = Math.max(1, (up / max) * (h - 8));',
    '      const x = gap + i * (bw + gap);',
    '      const tip = (opt.tips && opt.tips[i]) || "";'
  ].join('\n') + '\n';
  const after = [
    '      const up = ups[i];',
    '      const x = gap + i * (bw + gap);',
    '      const tip = (opt.tips && opt.tips[i]) || "";',
    `      if (list[i] && list[i]._missing) return '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="0" width="' + Math.max(2, bw).toFixed(2) + '" height="' + h + '" fill="transparent"/>';`,
    '      const bhD = Math.max(1, (d / max) * (h - 8));',
    '      const bhU = Math.max(1, (up / max) * (h - 8));'
  ].join('\n') + '\n';
  return replaceRequired(source, before, after, 'stacked missing calendar slots');
}

function refineApi(input) {
  let source = String(input || '');
  source = replaceFunction(source, 'loadMetadata', [
    '  function loadMetadata() {',
    "    return Promise.resolve(global.LINE_GRID_METADATA && typeof global.LINE_GRID_METADATA === 'object' ? global.LINE_GRID_METADATA : {});",
    '  }'
  ].join('\n'));
  source = removeFunction(source, 'sparkFromSeries');
  source = replaceRequired(source, '    sparkFromSeries: sparkFromSeries,\n', '', 'unused spark export');
  return source;
}

function refineLite(input) {
  let source = String(input || '');
  source = replaceRequired(source,
    '    uiRefreshQueued = true;\n    Promise.resolve().then(refreshUICompatibility);\n',
    '    uiRefreshQueued = true;\n    setTimeout(refreshUICompatibility, 0);\n', 'defer compatibility');
  source = replaceRequired(source,
    "  if (global.MutationObserver) {\n    new global.MutationObserver(scheduleUICompatibility).observe(global.document.documentElement, { childList: true, subtree: true });\n  }\n\n",
    '', 'remove global observer');
  return source;
}

function refineCss(input) {
  return String(input || '') + '\n' + [
    '/* v0.5.1 Lite-only polish */',
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

module.exports = { refineCharts, refineApi, refineLite, refineCss };
