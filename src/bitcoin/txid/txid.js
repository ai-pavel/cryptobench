// TXID: compute a transaction's TXID and wTXID in both byte orders.
import { hexToBytes, parseTx } from '../lib/btc.js';
import { $, renderRows, live } from '../lib/ui.js';

/** A real segwit transaction from mainnet block 840,000. */
export const EXAMPLE_TX = '020000000001017fb9cc941aa0ca3aaf339783564d2d29ec3254a9128f5d49ad3eeb002aeb40ec0000000000000000000242342a6b000000002251203b8b3ab1453eb47e2d4903b963776680e30863df3625d3e74292338ae7928da10000000000000000246a5d21020704b5e1d8e1c8eeb788a30705a02d039f3e01020680dc9afd2808c7e8430a640340924b2624416402a52ed7cf4eba6b2c535d2def8e649a74ed97aaca5ec54881ef3b34da68bb13d76d6b420e60297a9247cb081d1e59cb2c260b1509cff25d4b3158204c04e894d5357840e324b24c959ca6a5082035f6ffae12f331202bc84bf4612eac0063036f7264010b2047f22ed15d3082f5e9a005864528e4f991ade841a9c5846e2c118425878b6be1010d09b530368c74df10a3036821c04c04e894d5357840e324b24c959ca6a5082035f6ffae12f331202bc84bf4612e00000000';

export const flip = h => h.match(/../g).reverse().join('');

/** Rows for a raw transaction in hex; null for empty input; throws InputError for a bad transaction. */
export function txidRows(hex) {
  if (!hex.trim()) return null;
  const tx = parseTx(hexToBytes(hex, 'Transaction'));
  const coinbase = tx.inputs.length === 1 && /^0{64}$/.test(tx.inputs[0].txid);
  return [
    { label: 'TXID', value: tx.txid, note: `HASH256 of ${tx.baseSize} bytes (no witness), reversed` },
    { label: 'wTXID', value: tx.wtxid, note: tx.segwit ? `HASH256 of all ${tx.size} bytes, reversed` : 'Same as the TXID: no witness data' },
    { label: 'TXID, internal order', value: flip(tx.txid), note: 'As written in outpoints of spending transactions' },
    { label: 'wTXID, internal order', value: flip(tx.wtxid) },
    { label: 'Segwit', value: tx.segwit ? 'Yes: signatures live in the witness, so they cannot change the TXID' : 'No', copy: false },
    coinbase && { label: 'Coinbase', value: 'In the block’s witness commitment, a coinbase wTXID counts as 32 zero bytes', copy: false },
    { label: 'Size / weight', value: `${tx.size} bytes, ${tx.weight} WU, ${tx.vsize} vbytes`, copy: false },
  ].filter(Boolean);
}

function mount() {
  live([$('tx')], () => {
    const rows = txidRows($('tx').value);
    if (!rows) { $('out').innerHTML = ''; return; }
    renderRows($('out'), rows);
  }, { errEl: $('err'), outEl: $('out') });
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  const exFire = id => document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
  // A real segwit transaction from mainnet block 840,000.
  $('example').onclick = () => { exSet('tx', EXAMPLE_TX); exFire('tx'); };
}

if (globalThis.document) mount();
