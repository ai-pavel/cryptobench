// Storage Key: build a Substrate storage key from pallet, item and map keys, or split one back.
import { $, kv, esc, showError } from '../lib/ui.js';
import { utf8, fromHex, toHex, blake2, twox, concat, uintLE, readUintLE, accountIdFrom, ss58Encode, equal } from '../lib/dot.js';

export const HASHERS = {
  Blake2_128Concat: { hash: b => concat(blake2(b, 128), b), prefix: 16, readable: true },
  Twox64Concat: { hash: b => concat(twox(b, 64), b), prefix: 8, readable: true },
  Identity: { hash: b => b, prefix: 0, readable: true },
  Blake2_128: { hash: b => blake2(b, 128), size: 16 },
  Blake2_256: { hash: b => blake2(b, 256), size: 32 },
  Twox128: { hash: b => twox(b, 128), size: 16 },
  Twox256: { hash: b => twox(b, 256), size: 32 },
};
export const TYPES = {
  AccountId32: { size: 32, enc: v => accountIdFrom(v), show: b => ss58Encode(b, 42) + '  (' + toHex(b) + ')', placeholder: 'SS58 address or 0x…' },
  u32: { size: 4, enc: v => intLE(v, 4), show: b => readUintLE(b).toString(), placeholder: '1000' },
  u64: { size: 8, enc: v => intLE(v, 8), show: b => readUintLE(b).toString(), placeholder: '42' },
  u128: { size: 16, enc: v => intLE(v, 16), show: b => readUintLE(b).toString(), placeholder: '0' },
  H256: { size: 32, enc: v => { const b = fromHex(v, 'H256'); if (b.length !== 32) throw new Error('H256 must be 32 bytes.'); return b; }, show: toHex, placeholder: '0x…' },
  'Raw SCALE hex': { size: null, enc: v => fromHex(v, 'key'), show: toHex, placeholder: '0x…' },
};
export function intLE(v, n) { const s = String(v).trim(); if (!/^\d+$/.test(s)) throw new Error(`Expected a whole number, got "${s}".`); return uintLE(BigInt(s), n); }
export const PRESETS = [
  ['System.Account', 'System', 'Account', [['Blake2_128Concat', 'AccountId32', '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5']]],
  ['Balances.TotalIssuance', 'Balances', 'TotalIssuance', []],
  ['Staking.Ledger', 'Staking', 'Ledger', [['Blake2_128Concat', 'AccountId32', '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5']]],
  ['Timestamp.Now', 'Timestamp', 'Now', []],
  ['Paras.Heads', 'Paras', 'Heads', [['Twox64Concat', 'u32', '1000']]],
  ['Assets.Account', 'Assets', 'Account', [['Blake2_128Concat', 'u32', '1984'], ['Blake2_128Concat', 'AccountId32', '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5']]],
];

export const storagePrefix = (pallet, item) => concat(twox(utf8(pallet.trim()), 128), twox(utf8(item.trim()), 128));

// Pallet, item and map keys ([hasher, type, value] each) → { full, parts }.
export function buildKey(pallet, item, keys) {
  if (!pallet.trim() || !item.trim()) throw new Error('Enter the pallet and storage item names, e.g. System and Account.');
  const parts = [['Twox128(pallet)', toHex(twox(utf8(pallet.trim()), 128))], ['Twox128(item)', toHex(twox(utf8(item.trim()), 128))]];
  const hashed = keys.map(([h, t, v], i) => { let enc; try { enc = TYPES[t].enc(v); } catch (e) { throw new Error(`Key ${i + 1}: ${e.message}`); } const out = HASHERS[h].hash(enc); parts.push([`${h}(key ${i + 1})`, toHex(out)]); return out; });
  const full = concat(storagePrefix(pallet, item), ...hashed);
  return { full, parts };
}

// Split a storage key (hex) using the pallet, item and key types → kv rows.
export function splitKey(s, pallet, item, keys) {
  const b = fromHex(s, 'storage key');
  if (b.length < 32) throw new Error('A storage key is at least 32 bytes (the pallet and item prefixes).');
  const rows = [['Pallet prefix', toHex(b.subarray(0, 16)), { note: equal(b.subarray(0, 16), twox(utf8(pallet.trim()), 128)) ? `matches Twox128("${pallet.trim()}")` : 'does not match the pallet name above' }],
    ['Item prefix', toHex(b.subarray(16, 32)), { note: equal(b.subarray(16, 32), twox(utf8(item.trim()), 128)) ? `matches Twox128("${item.trim()}")` : 'does not match the item name above' }]];
  let off = 32;
  keys.forEach(([h, t], i) => {
    const H = HASHERS[h], T = TYPES[t];
    if (!H.readable) { rows.push([`Key ${i + 1}`, toHex(b.subarray(off, off + H.size)), { note: `${h} hides the key; it can't be recovered` }]); off += H.size; return; }
    const hashPart = b.subarray(off, off + H.prefix); off += H.prefix;
    const size = T.size ?? (i === keys.length - 1 ? b.length - off : null);
    if (size === null) throw new Error(`Key ${i + 1}: raw keys can only be split when they are the last key.`);
    if (off + size > b.length) throw new Error(`Key ${i + 1}: the storage key is too short.`);
    const key = b.subarray(off, off + size); off += size;
    const ok = equal(H.hash(key).subarray(0, H.prefix), hashPart);
    rows.push([`Key ${i + 1} (${t})`, T.show(key), { note: H.prefix ? (ok ? `${h} hash checks out` : `${h} hash does not match — wrong hasher or type?`) : 'Identity' }]);
  });
  if (off < b.length) rows.push(['Left over', toHex(b.subarray(off)), { note: 'more bytes than the keys above describe' }]);
  return rows;
}

function mount() {
  $('presets').innerHTML = PRESETS.map(([n], i) => `<button type="button" data-i="${i}">Example: ${esc(n)}</button>`).join('');
  let keys = PRESETS[0][3].map(k => [...k]);
  function drawKeys() {
    $('keys').innerHTML = keys.map(([h, t, v], i) => `
    <div class="grid2" data-k="${i}" style="margin-top:4px">
      <label class="field">Key ${i + 1} hasher<select data-f="h">${Object.keys(HASHERS).map(x => `<option${x === h ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field">Key ${i + 1} type<select data-f="t">${Object.keys(TYPES).map(x => `<option${x === t ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="field">Key ${i + 1} value<input data-f="v" class="mono" spellcheck="false" value="${esc(v)}" placeholder="${esc(TYPES[t].placeholder)}"></label>
      <div class="row" style="align-items:flex-end"><button type="button" class="icon-btn" data-del="${i}">Remove</button></div>
    </div>`).join('');
  }
  const prefix = () => storagePrefix($('pallet').value, $('item').value);
  function render() {
    try {
      const { full, parts } = buildKey($('pallet').value, $('item').value, keys);
      showError($('err'), null);
      $('out').innerHTML = kv([['Storage key', toHex(full), { note: `${full.length} bytes` }]]) + `<p class="section-title">Parts</p>` + kv(parts);
    } catch (e) { showError($('err'), e); $('out').innerHTML = ''; }
    split();
  }
  function split() {
    const s = $('raw').value.trim();
    if (!s) { showError($('err2'), null); $('out2').innerHTML = ''; return; }
    try {
      const rows = splitKey(s, $('pallet').value, $('item').value, keys);
      showError($('err2'), null); $('out2').innerHTML = kv(rows);
    } catch (e) { showError($('err2'), e); $('out2').innerHTML = ''; }
  }
  $('keys').addEventListener('input', e => {
    const row = e.target.closest('[data-k]'); if (!row) return;
    const k = keys[+row.dataset.k], f = e.target.dataset.f;
    if (f === 'h') k[0] = e.target.value; if (f === 't') { k[1] = e.target.value; drawKeys(); } if (f === 'v') k[2] = e.target.value;
    render();
  });
  $('keys').addEventListener('click', e => { const d = e.target.closest('[data-del]'); if (d) { keys.splice(+d.dataset.del, 1); drawKeys(); render(); } });
  $('add').onclick = () => { keys.push(['Blake2_128Concat', 'AccountId32', '']); drawKeys(); render(); };
  $('presets').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const [, p, it, ks] = PRESETS[+b.dataset.i]; $('pallet').value = p; $('item').value = it; keys = ks.map(k => [...k]); drawKeys(); render(); });
  ['pallet', 'item', 'raw'].forEach(id => $(id).addEventListener('input', render));
  drawKeys(); render();
  // Example button(s)
  $('example-split').onclick = () => { document.querySelector('#presets [data-i="0"]').click(); $('raw').value = toHex(concat(prefix(), ...keys.map(([h, t, v]) => HASHERS[h].hash(TYPES[t].enc(v))))); render(); };
}

if (globalThis.document) mount();
