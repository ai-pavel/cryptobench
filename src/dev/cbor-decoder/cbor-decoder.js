// CBOR Decoder: decode CBOR to diagnostic notation and JSON, or encode JSON as CBOR.
import { $, renderRows, segmented, showError, esc, InputError } from '../lib/ui.js';
import { parseBinary, toHex, toBase64 } from '../lib/bytes.js';
import { decodeCbor, diag, toJsonValue, tagNotes, encodeJson } from '../lib/cbor.js';

/** Decode CBOR bytes into what the page shows: summary rows, diagnostic notation, JSON text and tag notes. */
export function inspect(bytes, extraRows = []) {
  const items = decodeCbor(bytes);
  const json = items.length === 1 ? toJsonValue(items[0]) : items.map(toJsonValue);
  return {
    rows: [
      ...extraRows,
      { label: 'Size', value: `${bytes.length} bytes${items.length > 1 ? ` · ${items.length} top-level items (CBOR sequence)` : ''}`, copy: false },
    ],
    diag: items.map(n => diag(n)).join(',\n'),
    json: JSON.stringify(json, null, 2),
    notes: tagNotes(items),
  };
}

/** Decode mode: CBOR given as hex or base64 ('auto', 'hex', 'base64'); null for empty input. */
export function decodeInput(text, fmt) {
  if (!text.trim()) return null;
  return inspect(parseBinary(text, fmt));
}

/** Encode mode: JSON text → CBOR, shown with its hex and base64. */
export function encodeInput(text) {
  let v; try { v = JSON.parse(text); } catch (e) { throw new InputError('Invalid JSON: ' + e.message); }
  const bytes = encodeJson(v);
  return inspect(bytes, [{ label: 'CBOR (hex)', value: toHex(bytes) }, { label: 'CBOR (base64)', value: toBase64(bytes) }]);
}

function mount() {
  const mode = segmented($('mode'), m => { $('decPane').hidden = m !== 'decode'; $('encPane').hidden = m !== 'encode'; run(); });
  function show(r) {
    renderRows($('summary'), r.rows);
    $('diag').textContent = r.diag;
    $('asJson').textContent = r.json;
    $('tagsBox').hidden = !r.notes.length;
    $('tags').innerHTML = r.notes.map(n => `<li>${esc(n)}</li>`).join('');
    $('out').hidden = false;
  }
  function run() {
    showError($('err'), null);
    try {
      if (mode() === 'decode') {
        const r = decodeInput($('in').value, $('fmt').value);
        if (!r) { $('out').hidden = true; return; }
        show(r);
      } else {
        show(encodeInput($('json').value));
      }
    } catch (e) { $('out').hidden = true; showError($('err'), e); }
  }
  for (const id of ['in', 'fmt', 'json']) $(id).addEventListener('input', run);
  run();
}

if (globalThis.document) mount();
