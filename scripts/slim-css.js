'use strict';

const RETURN_RULE = /(^|\n)[^\n{}]*(?:\.routes\b|\.route\b|\.route-|\.slab-routes\b|\.page-routes\b|\[data-route-)[^\n{}]*\{[^{}]*\}\n?/gm;

function slimCss(input) {
  let css = String(input || '');
  let previous = '';
  while (previous !== css) {
    previous = css;
    css = css.replace(RETURN_RULE, function (match, prefix) { return prefix; });
  }
  ['data-route-', '.route-editor', '.route-cards', '.slab-routes', '.page-routes'].forEach(function (token) {
    if (css.includes(token)) throw new Error('Legacy Return CSS survived slimming: ' + token);
  });
  css += '\n.row .node-name { line-height: 1.15; }\n' +
    '.row .node-ip { display: block; margin-top: 3px; color: var(--ink-dim); font-family: var(--mono); font-size: 9px; font-weight: 400; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n';
  return css;
}

module.exports = { slimCss };
