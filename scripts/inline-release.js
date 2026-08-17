#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const target = process.argv[2];
const root = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(__dirname, '..');
if (!target) throw new Error('usage: inline-release.js <target-index.html> [root]');

let html = fs.readFileSync(target, 'utf8');
const css = fs.readFileSync(path.join(root, 'dist/css/app.css'), 'utf8');
const scripts = [
  ['<script src="./js/charts.js"></script>', 'dist/js/charts.js'],
  ['<script src="./js/komari-api.js"></script>', 'dist/js/komari-api.js'],
  ['<script src="./js/app.js"></script>', 'dist/js/app.js']
];

if (!html.includes('<link rel="stylesheet" href="./css/app.css">')) {
  throw new Error('release index stylesheet marker missing');
}
html = html.replace('<link rel="stylesheet" href="./css/app.css">', function () { return '<style id="line-grid-inline-style">\n' + css + '\n</style>'; });

for (const [marker, rel] of scripts) {
  if (!html.includes(marker)) throw new Error('release index script marker missing: ' + marker);
  const source = fs.readFileSync(path.join(root, rel), 'utf8').replace(/<\/script/gi, '<\\/script');
  html = html.replace(marker, function () { return '<script data-inline-source="' + rel + '">\n' + source + '\n</script>'; });
}

fs.writeFileSync(target, html);
