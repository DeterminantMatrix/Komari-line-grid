#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { slimApp } = require('./slim-app');
const { slimDemo } = require('./slim-demo');
const { slimCss } = require('./slim-css');
const { fixApp, fixCharts, fixAdapter, fixLite } = require('./runtime-fixes');
const { fixAppTimeAxis, fixChartsTimeAxis } = require('./time-axis-fix');
const { refineAdapter, refineApp, refineCharts, refineApi, refineLite, refineCss } = require('./refine-v051');

const root = path.resolve(__dirname, '..');
const templatePath = path.join(root, 'src/index.html');
const outPath = path.join(root, 'dist/index.html');
const checkOnly = process.argv.includes('--check');

function escScript(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

function inlineImageUrls(css, cssPath) {
  return css.replace(/url\((['"]?)(\.\.\/img\/[^)'"\s]+)\1\)/g, function (_m, _q, rel) {
    const file = path.resolve(path.dirname(cssPath), rel);
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'application/octet-stream';
    const b64 = fs.readFileSync(file).toString('base64');
    return 'url("data:' + mime + ';base64,' + b64 + '")';
  });
}

function build() {
  let html = fs.readFileSync(templatePath, 'utf8');
  html = html.replace(/<link rel="stylesheet" data-inline-href="([^"]+)"[^>]*>/g, function (_m, rel) {
    const file = path.join(root, rel);
    const css = refineCss(slimCss(fs.readFileSync(file, 'utf8')));
    return '<style data-inline-source="' + rel + '">\n' + inlineImageUrls(css, file) + '\n</style>';
  });
  html = html.replace(/<script data-inline-metadata="([^"]+)"><\/script>/g, function (_m, rel) {
    const data = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
    return '<script data-inline-source="' + rel + '">window.LINE_GRID_METADATA=' + JSON.stringify(data).replace(/<\//g, '<\\/') + ';<\/script>';
  });
  html = html.replace(/<script data-inline-src="([^"]+)"><\/script>/g, function (_m, rel) {
    let source = fs.readFileSync(path.join(root, rel), 'utf8');
    if (rel === 'dist/js/app.js') {
      source = fixAppTimeAxis(fixApp(slimDemo(slimApp(source))))
        .replace(/Powered by Komari Monitor/g, 'Line Grid · Lite')
        .replace(/Line Grid · Komari \/ Lite/g, 'Line Grid · Lite')
        .replace(/Komari RPC2/g, 'Lite RPC2')
        .replace(/komari-rpc2/g, 'lite-rpc2')
        .replace(/Komari/g, 'Lite');
      source = refineApp(source);
    } else if (rel === 'dist/js/charts.js') {
      source = refineCharts(fixChartsTimeAxis(fixCharts(source)));
    } else if (rel === 'dist/js/lite-adapter.js') {
      source = refineAdapter(fixAdapter(source));
    } else if (rel === 'dist/js/api.js') {
      source = refineApi(source);
    } else if (rel === 'dist/js/lite.js') {
      source = refineLite(fixLite(source));
    }
    source = escScript(source);
    return '<script data-inline-source="' + rel + '">\n' + source + '\n<\/script>';
  });
  if (/data-inline-(?:src|href|metadata)=/.test(html)) throw new Error('unresolved inline marker');
  return html;
}

const html = build();
if (checkOnly) {
  const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
  if (current !== html) {
    console.error('dist/index.html is stale. Run: node scripts/build-release.js');
    process.exit(1);
  }
  console.log('release index is reproducible');
} else {
  fs.writeFileSync(outPath, html);
  console.log(outPath);
}
