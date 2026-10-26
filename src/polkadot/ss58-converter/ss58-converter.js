// SS58 Converter: show one account's address on every Substrate network prefix.
import { $, kv, esc, showError } from '../lib/ui.js';
import { NETWORKS, ss58Encode, ss58Decode, fromHex, toHex } from '../lib/dot.js';

export const nameOf = p => NETWORKS.filter(n => n.prefix === p).map(n => n.name).join(' / ') || 'Unknown network';

// Address or 0x public key / account id → { payload, prefix } (prefix is null for hex input).
export function decodeInput(s) {
  let payload, prefix = null;
  if (/^0x/i.test(s)) {
    payload = fromHex(s, 'public key');
    if (payload.length !== 32 && payload.length !== 33) throw new Error(`Expected a 32-byte account id or 33-byte ECDSA key (got ${payload.length} bytes).`);
  } else ({ payload, prefix } = ss58Decode(s));
  return { payload, prefix };
}

// Rows describing the decoded input.
export function decodedRows(payload, prefix) {
  return [
    prefix === null ? null : ['Network', `${nameOf(prefix)} (prefix ${prefix})`, { copy: false }],
    ['Account id', toHex(payload), { note: `${payload.length} bytes${payload.length === 33 ? ' — an ECDSA public key; its account id is the Blake2b-256 of it' : ''}` }],
  ];
}

// One row per distinct known prefix, with the custom prefix (if any) first.
export function addressRows(payload, custom = '') {
  const seen = new Set(), rows = [];
  for (const n of NETWORKS) {
    if (seen.has(n.prefix)) continue; seen.add(n.prefix);
    rows.push([`${nameOf(n.prefix)} (${n.prefix})`, ss58Encode(payload, n.prefix)]);
  }
  const c = custom.trim();
  if (c) {
    if (!/^\d+$/.test(c)) throw new Error('Custom prefix must be a number from 0 to 16383.');
    rows.unshift([`Custom (${c})`, ss58Encode(payload, +c)]);
  }
  return rows;
}

function mount() {
  function render() {
    const s = $('in').value.trim();
    try {
      const { payload, prefix } = decodeInput(s);
      showError($('err'), null);
      $('decoded').innerHTML = kv(decodedRows(payload, prefix));
      $('out').innerHTML = `<p class="section-title">Addresses</p>` + kv(addressRows(payload, $('custom').value));
    } catch (e) { showError($('err'), e); $('out').innerHTML = ''; if (!s) $('decoded').innerHTML = ''; }
  }
  const q = new URLSearchParams(location.search).get('a'); if (q) $('in').value = q;
  $('in').addEventListener('input', render); $('custom').addEventListener('input', render);
  render();
  // Example button(s)
  $('example').onclick = () => { $('in').value = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'; $('custom').value = ''; render(); };
}

if (globalThis.document) mount();
