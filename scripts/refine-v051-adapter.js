'use strict';

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error('v0.5.1 adapter marker missing: ' + label);
  return source.replace(before, after);
}

function refineAdapter(input) {
  let source = String(input || '');
  source = replaceRequired(source,
    "    const hasLive = !!(live && typeof live === 'object');\n    const trafficType =",
    "    const hasLive = !!(live && typeof live === 'object');\n    const onlineNow = hasLive && live.online === true;\n    const trafficType =",
    'initial online state');
  source = replaceRequired(source, '      online: hasLive && live.online === true,\n', '      online: onlineNow,\n', 'initial online flag');

  const initial = [
    ['      cpu_pct: hasLive ? numberOrNull(live.cpu) : null,\n', '      cpu_pct: onlineNow ? numberOrNull(live.cpu) : null,\n', 'cpu'],
    ['      mem_used: hasLive ? numberOrNull(live.ram) : null,\n', '      mem_used: onlineNow ? numberOrNull(live.ram) : null,\n', 'ram used'],
    ['      mem_total: numberOrNull(node.mem_total) != null ? numberOrNull(node.mem_total) : (hasLive ? numberOrNull(live.ram_total) : null),\n', "      mem_total: hasLive && numberOrNull(live.ram_total) != null && numberOrNull(live.ram_total) > 0 ? numberOrNull(live.ram_total) : numberOrNull(node.mem_total),\n", 'ram total'],
    ['      swap_used: hasLive ? numberOrNull(live.swap) : null,\n', '      swap_used: onlineNow ? numberOrNull(live.swap) : null,\n', 'swap used'],
    ['      swap_total: numberOrNull(node.swap_total) != null ? numberOrNull(node.swap_total) : (hasLive ? numberOrNull(live.swap_total) : null),\n', "      swap_total: hasLive && numberOrNull(live.swap_total) != null ? numberOrNull(live.swap_total) : numberOrNull(node.swap_total),\n", 'swap total'],
    ['      disk_used: hasLive ? numberOrNull(live.disk) : null,\n', '      disk_used: onlineNow ? numberOrNull(live.disk) : null,\n', 'disk used'],
    ['      disk_total: numberOrNull(node.disk_total) != null ? numberOrNull(node.disk_total) : (hasLive ? numberOrNull(live.disk_total) : null),\n', "      disk_total: hasLive && numberOrNull(live.disk_total) != null && numberOrNull(live.disk_total) > 0 ? numberOrNull(live.disk_total) : numberOrNull(node.disk_total),\n", 'disk total'],
    ['      download_speed: hasLive ? numberOrNull(live.net_in) : null,\n', '      download_speed: onlineNow ? numberOrNull(live.net_in) : null,\n', 'download'],
    ['      upload_speed: hasLive ? numberOrNull(live.net_out) : null,\n', '      upload_speed: onlineNow ? numberOrNull(live.net_out) : null,\n', 'upload'],
    ['      uptime: hasLive ? numberOrNull(live.uptime) : null,\n', '      uptime: onlineNow ? numberOrNull(live.uptime) : null,\n', 'uptime'],
    ["      loadavg: hasLive ? [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)].filter(function (v) { return v != null; }).join(' ') : '',\n", "      loadavg: onlineNow ? [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)].filter(function (v) { return v != null; }).join(' ') : '',\n", 'load'],
    ['      process_count: hasLive ? numberOrNull(live.process) : null,\n', '      process_count: onlineNow ? numberOrNull(live.process) : null,\n', 'process'],
    ['      connections_tcp: hasLive ? Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0)) : null,\n', '      connections_tcp: onlineNow ? Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0)) : null,\n', 'tcp'],
    ['      connections_udp: hasLive ? numberOrNull(live.connections_udp) : null,\n', '      connections_udp: onlineNow ? numberOrNull(live.connections_udp) : null,\n', 'udp'],
  ];
  initial.forEach(function (row) { source = replaceRequired(source, row[0], row[1], 'initial ' + row[2]); });

  source = replaceRequired(source,
    "    const hasLive = !!(live && typeof live === 'object');\n    server.has_live = hasLive;\n    server.online = hasLive && live.online === true;\n",
    "    const hasLive = !!(live && typeof live === 'object');\n    const onlineNow = hasLive && live.online === true;\n    server.has_live = hasLive;\n    server.online = onlineNow;\n",
    'merge online state');

  source = replaceRequired(source,
    '    server.cpu_pct = numberOrNull(live.cpu);\n    server.mem_used = numberOrNull(live.ram);\n    server.swap_used = numberOrNull(live.swap);\n    server.disk_used = numberOrNull(live.disk);\n    server.download_speed = numberOrNull(live.net_in);\n    server.upload_speed = numberOrNull(live.net_out);\n    server.uptime = numberOrNull(live.uptime);\n    server.loadavg = [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)].filter(function (v) { return v != null; }).join(\' \');\n    server.process_count = numberOrNull(live.process);\n    server.connections_tcp = Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0));\n    server.connections_udp = numberOrNull(live.connections_udp);\n',
    "    const liveRamTotal = numberOrNull(live.ram_total);\n    const liveSwapTotal = numberOrNull(live.swap_total);\n    const liveDiskTotal = numberOrNull(live.disk_total);\n    if (liveRamTotal != null && liveRamTotal > 0) server.mem_total = liveRamTotal;\n    if (liveSwapTotal != null) server.swap_total = liveSwapTotal;\n    if (liveDiskTotal != null && liveDiskTotal > 0) server.disk_total = liveDiskTotal;\n    server.cpu_pct = onlineNow ? numberOrNull(live.cpu) : null;\n    server.mem_used = onlineNow ? numberOrNull(live.ram) : null;\n    server.swap_used = onlineNow ? numberOrNull(live.swap) : null;\n    server.disk_used = onlineNow ? numberOrNull(live.disk) : null;\n    server.download_speed = onlineNow ? numberOrNull(live.net_in) : null;\n    server.upload_speed = onlineNow ? numberOrNull(live.net_out) : null;\n    server.uptime = onlineNow ? numberOrNull(live.uptime) : null;\n    server.loadavg = onlineNow ? [numberOrNull(live.load), numberOrNull(live.load5), numberOrNull(live.load15)].filter(function (v) { return v != null; }).join(' ') : '';\n    server.process_count = onlineNow ? numberOrNull(live.process) : null;\n    server.connections_tcp = onlineNow ? Math.max(0, numberOr(live.connections, 0) - numberOr(live.connections_udp, 0)) : null;\n    server.connections_udp = onlineNow ? numberOrNull(live.connections_udp) : null;\n",
    'merge live totals and offline gating');
  return source;
}

module.exports = { refineAdapter };
