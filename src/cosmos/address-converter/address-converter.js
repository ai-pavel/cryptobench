// Address Converter: re-encode an address's bytes under other chain prefixes and validator forms.
import { decodeBech32, encodeBech32, splitPrefix, CHAINS, parseHex, toHex, kvTable, wireCopy, showError, esc } from '../lib/cosmos.js';

const FORMS = [['Account', ''], ['Validator operator', 'valoper'], ['Validator consensus', 'valcons']];

/**
 * Convert an address (bech32 with any prefix, or hex bytes) to its other forms.
 * Returns null for empty input; otherwise the bytes, prefix parts, an optional size
 * note, and the rows for the summary, the forms on the same chain and the other chains.
 * Throws on invalid input or an invalid custom prefix.
 */
export function convertAddress(input, customPrefix = '') {
  input = input.trim();
  if (!input) return null;
  let bytes, prefix = '', kind = '', base = 'cosmos';
  if (/^0x/i.test(input) || /^[0-9a-f]+$/i.test(input)) {
    bytes = parseHex(input, 'Address');
  } else {
    const d = decodeBech32(input);
    bytes = d.bytes; prefix = d.prefix; ({ base, kind } = splitPrefix(prefix));
  }
  const note = bytes.length !== 20 && bytes.length !== 32
    ? `Note: this address is ${bytes.length} bytes; account addresses are normally 20 bytes (32 for modules, interchain accounts and contracts).`
    : '';
  const custom = customPrefix.trim().toLowerCase();
  if (custom && !/^[a-z0-9]+$/.test(custom)) throw new Error('Custom prefix must use lowercase letters and digits only.');
  const summary = [
    ['Prefix', prefix || '(none — hex input)', kind ? `${base} + ${kind}` : ''],
    ['Bytes (hex)', toHex(bytes), `${bytes.length} bytes` + (bytes.length === 32 ? ' — a module, interchain account or contract address' : bytes.length === 20 ? ' — a key-derived account address' : '')],
  ];
  const forms = FORMS.map(([label, sfx]) => [label, encodeBech32(base + sfx, bytes), sfx === 'valcons' ? 'Format only: real consensus addresses come from the node key' : '']);
  const others = [];
  if (custom) others.push([`${custom} (custom)`, encodeBech32(custom + (kind === 'pub' ? '' : kind), bytes)]);
  for (const c of CHAINS) others.push([c.name, encodeBech32(c.prefix + (kind === 'pub' ? '' : kind), bytes), c.eth ? 'Ethereum-style keys: a different address for the same mnemonic' : c.coin !== 118 ? `Coin type ${c.coin}: a different address for the same mnemonic` : '']);
  const othersTitle = kind && kind !== 'pub' ? kind + ' form on other chains' : 'Same bytes on other chains';
  return { bytes, prefix, base, kind, note, summary, forms, others, othersTitle };
}

function mount() {
  const $ = id => document.getElementById(id);

  function render() {
    showError($('err'), ''); $('out').innerHTML = '';
    try {
      const r = convertAddress($('addr').value, $('custom').value);
      if (!r) return;
      if (r.note) showError($('err'), r.note);
      let html = kvTable(r.summary);
      html += `<p class="section-title">Forms on ${esc(r.base)}</p>` + kvTable(r.forms);
      html += `<p class="section-title">${esc(r.othersTitle)}</p>` + kvTable(r.others);
      $('out').innerHTML = html;
    } catch (e) { showError($('err'), e.message); }
  }
  $('addr').oninput = render; $('custom').oninput = render;
  const q = new URLSearchParams(location.search).get('a'); if (q) $('addr').value = q;
  wireCopy(); render();
  // Example button(s)
  $('example').onclick = () => { $('addr').value = "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4"; $('custom').value = ''; render(); };
}

if (globalThis.document) mount();
