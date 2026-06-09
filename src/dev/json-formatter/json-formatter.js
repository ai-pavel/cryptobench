// JSON Formatter: validate, format, minify and browse JSON.
import { $, live, segmented } from '../lib/ui.js';
import { parseJson, sortKeys, treeHtml, unsafeNumbers } from '../lib/json.js';

/**
 * Parse and reformat JSON. indent is '2', '4', 'tab' or '0' (minified).
 * Returns the parsed value, the formatted text, the "valid" line and a precision warning (or null).
 */
export function formatJson(input, { indent = '2', sort = false } = {}) {
  let v = parseJson(input);
  if (sort) v = sortKeys(v);
  const text = JSON.stringify(v, null, indent === 'tab' ? '\t' : +indent);
  const bad = unsafeNumbers(input);
  return {
    value: v,
    text,
    warning: bad.length ? `Precision warning: ${bad.join(', ')} can't be represented exactly as a JavaScript number and changes when reformatted.` : null,
    valid: `Valid JSON · ${new Blob([text]).size} bytes formatted (${new Blob([input]).size} in input)`,
  };
}

function mount() {
  const view = segmented($('view'), () => run());
  const run = live([$('in'), $('indent'), $('sort')], () => {
    $('out').hidden = true; $('warn').hidden = true;
    const r = formatJson($('in').value, { indent: $('indent').value, sort: $('sort').checked });
    $('pretty').value = r.text;
    if (r.warning) { $('warn').hidden = false; $('warn').textContent = r.warning; }
    $('valid').textContent = r.valid;
    const tree = view() === 'tree';
    $('pretty').hidden = tree; $('tree').hidden = !tree;
    if (tree) $('tree').innerHTML = treeHtml(r.value);
    $('out').hidden = false;
  }, { errEl: $('err') });
  $('useIt').onclick = () => { $('in').value = $('pretty').value; run(); };
}

if (globalThis.document) mount();
