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
  return css;
}

module.exports = { slimCss };
