// YAML ↔ JSON: convert between YAML and JSON.
import { $, live, segmented, InputError } from '../lib/ui.js';
import { parseJson } from '../lib/json.js';
import { load, loadAll, dump } from '../../assets/vendor/js-yaml@4.1.0/index.esm.js';

/** YAML → JSON: the JSON text (several documents become an array) and a note about them (or ''). */
export function yamlToJson(text, indent = 2) {
  if (!text.trim()) throw new InputError('Paste some YAML.');
  let docs;
  try { docs = loadAll(text); } catch (e) { throw new InputError('Invalid YAML: ' + e.message); }
  return {
    json: JSON.stringify(docs.length === 1 ? docs[0] : docs, null, indent),
    note: docs.length > 1 ? `${docs.length} YAML documents, shown as a JSON array.` : '',
  };
}

/** JSON → YAML. */
export function jsonToYaml(text, indent = 2) {
  const v = parseJson(text);
  return dump(v, { indent, lineWidth: -1, noRefs: true });
}

function mount() {
  const mode = segmented($('mode'), () => {
    const y2j = mode() === 'y2j';
    $('inLabel').textContent = y2j ? 'YAML' : 'JSON'; $('outLabel').textContent = y2j ? 'JSON' : 'YAML';
    run();
  });
  const run = live([$('in'), $('indent')], () => {
    $('out').value = ''; $('note').textContent = '';
    const ind = +$('indent').value;
    if (mode() === 'y2j') {
      const r = yamlToJson($('in').value, ind);
      $('out').value = r.json;
      if (r.note) $('note').textContent = r.note;
    } else {
      $('out').value = jsonToYaml($('in').value, ind);
    }
  }, { errEl: $('err') });
  $('swap').onclick = () => { $('in').value = $('out').value; const b = document.querySelector(`#mode [data-mode="${mode() === 'y2j' ? 'j2y' : 'y2j'}"]`); b.click(); };
}

if (globalThis.document) mount();
