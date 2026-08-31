'use strict';

function removeFunction(source, name) {
  const marker = '  function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Demo slim function marker missing: ' + name);
  const brace = source.indexOf('{', start);
  if (brace < 0) throw new Error('Cannot find function body: ' + name);

  let depth = 1;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let i = brace + 1;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1] || '';
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i += 1; }
      continue;
    }
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
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error('Unclosed function body: ' + name);
  let end = i + 1;
  while (end < source.length && (source[end] === ' ' || source[end] === '\t')) end += 1;
  if (source[end] === '\n') end += 1;
  if (source[end] === '\n') end += 1;
  return source.slice(0, start) + source.slice(end);
}

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error('Demo slim marker missing: ' + label);
  return source.replace(before, after);
}

function slimDemo(input) {
  let source = String(input || '');
  source = replaceRequired(
    source,
    '  const U = ProbeDemo.units;\n',
    '  const U = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };\n',
    'unit constants'
  );
  source = replaceRequired(source, '  const demoMode = new URLSearchParams(location.search).get("demo") === "1";\n', '', 'demo query');
  source = replaceRequired(
    source,
    '  let state = demoMode ? ProbeDemo.snapshot() : { enabled: true, title: "节点状态", servers: [], _loading: true, _source: "komari-rpc2" };\n',
    '  let state = { enabled: true, title: "节点状态", servers: [], _loading: true, _source: "komari-rpc2" };\n',
    'initial state'
  );
  source = replaceRequired(source, '  let pulse = ProbeDemo.monthPulse();\n', '  let pulse = [];\n', 'month pulse');
  source = replaceRequired(
    source,
    '    const source = liveMode ? "Komari RPC2" : (demoMode ? "演示数据" : "连接中");\n',
    '    const source = liveMode ? "Komari RPC2" : "连接中";\n',
    'footer source'
  );
  source = replaceRequired(
    source,
    '    } else if (!liveMode && ping) {\n      const hist = ProbeDemo.pingSeries(s, range, ping.key);\n      sparkVals = (hist.series || []).map(function (p) { return p.value; });\n',
    '',
    'demo ping history'
  );
  source = replaceRequired(source, '    pulse = rows.length ? rows : ProbeDemo.monthPulse(servers);\n', '    pulse = rows;\n', 'demo pulse fallback');
  source = removeFunction(source, 'tickDemo');
  source = replaceRequired(source, '  if (demoMode) setInterval(tickDemo, 5000);\n', '', 'demo timer');
  source = replaceRequired(
    source,
    '  render();\n  if (demoMode) {\n    rebuildPulse();\n    render();\n  } else {\n    ProbeAPI.fetchServers()',
    '  render();\n  ProbeAPI.fetchServers()',
    'demo startup branch'
  );
  const end = '    });\n  }\n})();\n';
  if (!source.endsWith(end)) throw new Error('Demo slim final branch marker missing');
  source = source.slice(0, -end.length) + '    });\n})();\n';

  ['ProbeDemo', 'demoMode', 'tickDemo', '演示数据'].forEach(function (token) {
    if (source.includes(token)) throw new Error('Demo code survived production slimming: ' + token);
  });
  return source;
}

module.exports = { slimDemo };
