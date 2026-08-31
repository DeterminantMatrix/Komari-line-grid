'use strict';

function removeFunction(source, name) {
  const marker = '  function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) return source;
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
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
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

function requireReplace(source, before, after, label) {
  if (!source.includes(before)) throw new Error('Slim app marker missing: ' + label);
  return source.replace(before, after);
}

function removeBetween(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error('Slim app start marker missing: ' + label);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error('Slim app end marker missing: ' + label);
  return source.slice(0, start) + source.slice(end);
}

function slimApp(input) {
  let source = String(input || '');

  source = requireReplace(
    source,
    '  const PAGES = ["overview", "ping", "traffic", "routes", "system"];\n',
    '  const PAGES = ["overview", "ping", "traffic", "system"];\n',
    'detail pages'
  );
  source = requireReplace(
    source,
    '  const PAGE_LABEL = { overview: "Overview", ping: "Latency", traffic: "Traffic", routes: "Return", system: "System" };\n',
    '  const PAGE_LABEL = { overview: "Overview", ping: "Latency", traffic: "Traffic", system: "System" };\n',
    'detail page labels'
  );

  source = removeBetween(
    source,
    '  const CARRIER = { telecom: "电信", unicom: "联通", mobile: "移动" };\n',
    '  const CYCLE = ',
    'Return constants'
  );

  source = requireReplace(
    source,
    "    const routes = effectiveRoutes(server).map(function (rt) { return [rt.carrier, rt.route_type, rt.region].filter(Boolean).join(' '); }).join(' ');\n",
    '',
    'Return search data'
  );
  source = requireReplace(
    source,
    "    return [server && server.name, displayCountry(server), rd && rd.label, server && server.group, server && server.provider_name, server && server.asn, server && server.asn_org, routes].filter(Boolean).join(' ').toLowerCase();\n",
    "    return [server && server.name, displayCountry(server), rd && rd.label, server && server.group, server && server.provider_name, server && server.asn, server && server.asn_org].filter(Boolean).join(' ').toLowerCase();\n",
    'Return search field'
  );

  [
    'readRouteOverrides',
    'writeRouteOverrides',
    'effectiveRoutes',
    'routeValue',
    'routeSelect',
    'pageRoutes',
    'setRouteStatus',
    'currentRouteNode',
    'currentRouteChoices',
    'saveRouteChoice',
    'routeMetadataJSON',
    'onWindowChange',
  ].forEach(function (name) {
    const marker = '  function ' + name + '(';
    if (!source.includes(marker)) throw new Error('Slim app function marker missing: ' + name);
    source = removeFunction(source, name);
  });

  source = removeBetween(
    source,
    '    const routes = effectiveRoutes(server).map(function (rt) {\n',
    '    return (\n',
    'mobile Return summary'
  );
  source = requireReplace(
    source,
    '            \'<div class="slab-routes">\' + (routes || "暂无回程") + "</div>" +\n',
    '',
    'mobile Return row'
  );

  source = requireReplace(source, '    const routes = effectiveRoutes(s);\n', '', 'overview Return data');
  source = removeBetween(
    source,
    '          \'<div class="panel tight">\' +\n            \'<div class="panel-h"><h3>三网回程</h3></div>\' +\n',
    '          \'<div class="panel tight">\' +\n            \'<div class="panel-h"><h3>系统</h3></div>\' +\n',
    'overview Return panel'
  );

  source = requireReplace(
    source,
    '    else if (current === "routes") winBody.innerHTML = pageRoutes(ctx);\n',
    '',
    'Return detail renderer'
  );

  source = removeBetween(
    source,
    '    const routeSave = ev.target.closest("[data-route-save]");\n',
    '  }\n\n  function onKey',
    'Return click handlers'
  );
  source = source.replace(
    '    const routeSave = ev.target.closest("[data-route-save]");\n',
    ''
  );
  // removeBetween leaves the closing onWindowClick brace and onKey marker in place.
  source = source.replace('  overlay.addEventListener("change", onWindowChange);\n', '');

  const forbidden = [
    'linegrid:return:',
    'line-grid-return-routes-v1',
    'data-route-',
    'saveReturnRoutes',
    'effectiveRoutes(',
    'pageRoutes(',
    '三网回程',
    'routes: "Return"',
  ];
  forbidden.forEach(function (token) {
    if (source.includes(token)) throw new Error('Legacy Return code survived build slimming: ' + token);
  });

  return source;
}

module.exports = { slimApp };
