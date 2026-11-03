// SCALE Codec: encode JSON values to SCALE bytes and decode them back, for a given type.
import { $, kv, esc, showError } from '../lib/ui.js';
import { fromHex, toHex } from '../lib/dot.js';
import { parseType, encode, decode, stringify } from '../lib/scale.js';

export const PRESETS = [
  ['Transfer', 'struct { dest: AccountId32, value: Compact<u128>, memo: Option<String> }', '{ "dest": "15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5", "value": "12345000000", "memo": "thanks" }'],
  ['AccountInfo', 'struct { nonce: u32, consumers: u32, providers: u32, sufficients: u32, data: struct { free: u128, reserved: u128, frozen: u128, flags: u128 } }',
    '{ "nonce": 7, "consumers": 0, "providers": 1, "sufficients": 0, "data": { "free": "10000000000", "reserved": "0", "frozen": "0", "flags": "170141183460469231731687303715884105728" } }'],
  ['MultiAddress', 'enum { Id(AccountId32), Index(Compact<u32>), Raw(Bytes), Address32(H256), Address20(H160) }', '{ "Id": "15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5" }'],
  ['Compact<u128>', 'Compact<u128>', '"1000000000000"'],
  ['Vec<(u32, bool)>', 'Vec<(u32, bool)>', '[[1, true], [70000, false]]'],
];

// Type source + JSON value text → SCALE bytes.
export function encodeJson(typeSrc, json) {
  const t = parseType(typeSrc);
  let v; try { v = JSON.parse(json); } catch (e) { throw new Error('Value is not valid JSON: ' + e.message); }
  return encode(t, v);
}

// Type source + hex text → { value, used, rest }.
export function decodeHex(typeSrc, hex) {
  const t = parseType(typeSrc);
  const bytes = fromHex(hex || '0x', 'SCALE bytes');
  return decode(t, bytes);
}

// Decode output: a left-over warning (if any) and the value as JSON.
export const decodedHtml = r => (r.rest ? `<p class="error">Decoded ${r.used} bytes; ${r.rest} bytes are left over — the type may be wrong.</p>` : '')
  + `<pre class="json">${esc(stringify(r.value))}</pre>`;

function mount() {
  $('presets').innerHTML = PRESETS.map(([n], i) => `<button type="button" data-i="${i}">Example: ${esc(n)}</button>`).join('');
  let mode = new URLSearchParams(location.search).get('mode') === 'decode' ? 'decode' : 'encode';
  function setMode(m) {
    mode = m;
    document.querySelectorAll('.mode-tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === m)));
    $('tab-encode').hidden = m !== 'encode'; $('tab-decode').hidden = m !== 'decode';
    const u = new URL(location.href); u.searchParams.set('mode', m); history.replaceState(null, '', u);
  }
  function render() {
    try {
      if (mode === 'encode') {
        const bytes = encodeJson($('type').value, $('json').value);
        showError($('err'), null);
        $('out').innerHTML = kv([['SCALE (hex)', toHex(bytes), { note: `${bytes.length} bytes` }]]) + '<p class="row"><button type="button" id="toDecode">Decode these bytes →</button></p>';
        $('toDecode').onclick = () => { $('hex').value = toHex(bytes); setMode('decode'); render(); };
      } else {
        const r = decodeHex($('type').value, $('hex').value);
        showError($('err'), null);
        $('out').innerHTML = decodedHtml(r);
      }
    } catch (e) { showError($('err'), e); $('out').innerHTML = ''; }
  }
  document.querySelector('.mode-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { setMode(b.dataset.tab); render(); } });
  $('presets').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const [, t, v] = PRESETS[+b.dataset.i]; $('type').value = t; $('json').value = v; setMode('encode'); render(); });
  ['type', 'json', 'hex'].forEach(id => $(id).addEventListener('input', render));
  setMode(mode); render();
  // Example button(s)
  $('example-decode').onclick = () => { const [, t, v] = PRESETS[0]; $('type').value = t; $('hex').value = toHex(encodeJson(t, v)); setMode('decode'); render(); };
}

if (globalThis.document) mount();
