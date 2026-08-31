#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { slimApp } = require('./slim-app');

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
    const css = inlineImageUrls(fs.readFileSync(file, 'utf8'), file);
    return '<style data-inline-source="' + rel + '">\n' + css + '\n</style>';
  });
  html = html.replace(/<script data-inline-metadata="([^"]+)"><\/script>/g, function (_m, rel) {
    const data = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
    return '<script data-inline-source="' + rel + '">window.LINE_GRID_METADATA=' + JSON.stringify(data).replace(/<\//g, '<\\/') + ';<\/script>';
  });
  html = html.replace(/<script data-inline-src="([^"]+)"><\/script>/g, function (_m, rel) {
    let source = fs.readFileSync(path.join(root, rel), 'utf8');
    if (rel === 'dist/js/app.js') {
      source = slimApp(source)
        .replace(/komari-rpc2/g, 'lite-rpc2')
        .replace(/Komari/g, 'Lite');
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
