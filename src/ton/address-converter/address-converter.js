// Address Converter: convert a TON address between raw and user-friendly forms.
import { parseAddress, formatFriendly, formatRaw } from '../lib/ton.js';
import { $, row, esc, showError } from '../lib/ui.js';

/**
 * Parse an address and list it in every form.
 * Returns null for empty input; otherwise the info line (HTML) describing the input
 * and [label, value] rows. Throws on an invalid address.
 */
export function convertAddress(input) {
  const v = input.trim();
  if (!v) return null;
  const a = parseAddress(v);
  const f = (bounceable, testnet, urlSafe = true) => formatFriendly(a.workchain, a.hash, { bounceable, testnet, urlSafe });
  const info = a.format === 'raw'
    ? `Input: raw address · workchain ${a.workchain}`
    : `Input: user-friendly · ${a.bounceable ? 'bounceable' : 'non-bounceable'} · ${a.testnet ? 'testnet' : 'mainnet'} · ${a.urlSafe ? 'base64url' : 'base64'} · workchain ${a.workchain} · <span class="ok">checksum OK</span>`;
  const rows = [
    ['Raw', formatRaw(a.workchain, a.hash)],
    ['Non-bounceable (wallets)', f(false, false)],
    ['Bounceable (contracts)', f(true, false)],
    ['Non-bounceable · testnet', f(false, true)],
    ['Bounceable · testnet', f(true, true)],
    ['Non-bounceable · standard base64', f(false, false, false)],
    ['Bounceable · standard base64', f(true, false, false)],
  ];
  return { info, rows };
}

function mount() {
  function render() {
    $('out').innerHTML = ''; $('info').textContent = '';
    let r;
    try { r = convertAddress($('addr').value); } catch (e) { showError($('err'), e); return; }
    showError($('err'));
    if (!r) return;
    $('info').innerHTML = r.info;
    $('out').innerHTML = r.rows.map(([label, value]) => row(label, value)).join('');
  }
  $('addr').addEventListener('input', render);
  $('example').onclick = () => { $('addr').value = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N'; render(); };
}

if (globalThis.document) mount();
