'use strict';

function removeFunction(source, name) {
  const marker = '  function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const brace = source.indexOf('{', start);
  if (brace < 0) throw new Error('dead-code function body missing: ' + name);
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
  if (depth !== 0) throw new Error('dead-code function unclosed: ' + name);
  let end = i + 1;
  while (end < source.length && /[ \t]/.test(source[end])) end += 1;
  if (source[end] === '\n') end += 1;
  if (source[end] === '\n') end += 1;
  return source.slice(0, start) + source.slice(end);
}

function identifierCount(source, name) {
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = source.match(new RegExp('\\b' + safe + '\\b', 'g'));
  return matches ? matches.length : 0;
}

function removeSingletonFunction(source, name) {
  if (identifierCount(source, name) !== 1) return source;
  return removeFunction(source, name);
}

function removeSingletonConst(source, name) {
  if (identifierCount(source, name) !== 1) return source;
  const re = new RegExp('^  const ' + name + ' = [^\\n]+;\\n', 'm');
  return source.replace(re, '');
}

function refineDeadCodeApp(input) {
  let source = String(input || '');
  // Final built-artifact audit proved these are definition-only in the Lite-only runtime.
  source = removeSingletonFunction(source, 'hexToRgba');
  source = removeSingletonFunction(source, 'parseColor');
  source = removeSingletonConst(source, 'HOMES');
  source = removeSingletonConst(source, 'CYCLE');
  return source;
}

module.exports = { refineDeadCodeApp };
