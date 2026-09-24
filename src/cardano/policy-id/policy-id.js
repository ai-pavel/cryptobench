// Policy ID: compute the policy ID (script hash) of a native script given as cardano-cli JSON or CBOR hex.
import { nativeScriptToCbor, nativeScriptFromCbor, scriptHash, encode, decode, fromHex, toHex, bech32Encode } from '../lib/cardano.js';
import { $, row, esc, showError } from '../lib/ui.js';

const KEY1 = '9493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e', KEY2 = '337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251', KEY3 = 'c37b1b5dc0669f1d3c61a6fddb2e8fde96be87b881c60bce8e8d542f';
export const TEMPLATES = {
  sig: { type: 'sig', keyHash: KEY1 },
  lock: { type: 'all', scripts: [{ type: 'sig', keyHash: KEY1 }, { type: 'before', slot: 150000000 }] },
  multi: { type: 'atLeast', required: 2, scripts: [{ type: 'sig', keyHash: KEY1 }, { type: 'sig', keyHash: KEY2 }, { type: 'sig', keyHash: KEY3 }] },
};

/**
 * Compute the policy ID of a native script given as JSON (starts with "{") or CBOR hex.
 * Returns null for empty input, otherwise { policyId, bech32, cbor, json }. Throws on invalid input.
 */
export function policyId(input) {
  const v = input.trim();
  if (!v) return null;
  let cbor, json;
  if (v.startsWith('{')) {
    let obj;
    try { obj = JSON.parse(v); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    cbor = encode(nativeScriptToCbor(obj)); json = obj;
  } else {
    const bytes = fromHex(v);
    const d = decode(bytes);
    json = nativeScriptFromCbor(d);
    cbor = encode(d);
    if (toHex(cbor) !== toHex(bytes)) throw new Error('This CBOR isn\'t in canonical form; the policy ID is computed over the exact bytes, so re-encode it first.');
  }
  const h = scriptHash(0, cbor);
  return { policyId: toHex(h), bech32: bech32Encode('script', h), cbor: toHex(cbor), json };
}

function mount() {
  function render() {
    $('out').innerHTML = '';
    try {
      const r = policyId($('script').value);
      showError($('err'));
      if (!r) return;
      $('out').innerHTML = [
        row('Policy ID', r.policyId),
        row('Script hash (bech32)', r.bech32),
        row('Script CBOR', r.cbor),
      ].join('') + `<div class="kv-row"><div class="kv-label">Script JSON</div><pre class="json" style="grid-column:1/-1;margin:0">${esc(JSON.stringify(r.json, null, 2))}</pre></div>`;
    } catch (e) { showError($('err'), e); }
  }
  $('script').addEventListener('input', render);
  document.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => { $('script').value = JSON.stringify(TEMPLATES[b.dataset.tpl], null, 2); render(); });
}

if (globalThis.document) mount();
