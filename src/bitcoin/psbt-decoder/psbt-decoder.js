// PSBT Decoder: decode a PSBT (base64 or hex) into its global, input and output maps.
import { bytesToHex, formatSats } from '../lib/btc.js';
import { decodePsbtInput, decodePsbt, describe, inputAmount, outputAmount } from '../lib/psbt.js';
import { $, renderRows, live, esc } from '../lib/ui.js';

/** Unsigned PSBT spending 100,000 sats from the BIP84 test wallet's first address, with its UTXO and BIP32 path. */
export const EXAMPLE_PSBT = 'cHNidP8BAFICAAAAATnm6qn092wyJ0SYabbpi9gyQaWMgQ+hyFguMOfgEU/XAAAAAAD9////AbiCAQAAAAAAFgAUnJD5NOpR+g9lBBdwQ+CQjaaSmYMAAAAAAAEBH6CGAQAAAAAAFgAUwM681sPTyox13F7GLr5VMw75EOIiBgMw1U/Q3UIKbl+NNiT180gsrjUPedXwdTv1vu+cLZGvPBhzxdoKVAAAgAAAAIAAAACAAAAAAAAAAAAAAA==';

/** Text shown for a map entry: the decoded value, or the raw key data and value in hex. */
export function entryText(scope, e, ctx) {
  const d = describe(scope, e, ctx);
  return d !== null ? d : `${e.keyData.length ? 'Key data ' + bytesToHex(e.keyData) + '\n' : ''}${bytesToHex(e.value)}`;
}

/**
 * Decode a PSBT: summary rows and the maps ({ title, entries: [{ name, type, text }] }).
 * Returns null for empty input; throws InputError for an invalid PSBT.
 */
export function decodePsbtText(text) {
  const bytes = decodePsbtInput(text);
  if (!bytes) return null;
  const p = decodePsbt(bytes);
  const nIn = p.inputs.length, nOut = p.outputs.length;
  const ins = p.inputs.map((_, i) => inputAmount(p, i)), outs = p.outputs.map((_, i) => outputAmount(p, i));
  const known = ins.every(a => a !== null) && outs.every(a => a !== null);
  const fee = known ? ins.reduce((a, b) => a + b, 0n) - outs.reduce((a, b) => a + b, 0n) : null;
  const signed = p.inputs.filter(m => m.some(e => [0x02, 0x07, 0x08, 0x13, 0x14].includes(e.type))).length;
  const rows = [
    { label: 'PSBT version', value: String(p.version), copy: false },
    p.tx && { label: 'Unsigned TXID', value: p.tx.txid },
    { label: 'Inputs / outputs', value: `${nIn} / ${nOut}`, copy: false },
    { label: 'Inputs with signatures', value: `${signed} of ${nIn}`, copy: false },
    { label: 'Fee', value: fee === null ? 'Unknown: not every input carries its UTXO' : formatSats(fee), copy: false,
      note: fee !== null && p.tx ? `≈ ${(Number(fee) / p.tx.vsize).toFixed(2)} sat/vB on the unsigned size (the final size is larger)` : '' },
  ].filter(Boolean);
  const map = (title, scope, entries, ctx) => ({ title, entries: entries.map(e => ({ name: e.name, type: e.type, text: entryText(scope, e, ctx) })) });
  const maps = [map('Global', 'global', p.global, { tx: p.tx })];
  p.inputs.forEach((m, i) => maps.push(map(`Input ${i}${p.tx ? ` · ${p.tx.inputs[i].txid}:${p.tx.inputs[i].vout}` : ''}`, 'input', m, { vout: p.tx ? p.tx.inputs[i].vout : undefined })));
  p.outputs.forEach((m, i) => maps.push(map(`Output ${i}${outs[i] !== null ? ' · ' + formatSats(outs[i]) : ''}`, 'output', m, {})));
  return { rows, maps };
}

function mount() {
  function table({ title, entries }) {
    const rows = entries.map(e =>
      `<tr><td>${esc(e.name)}<div class="small muted">0x${e.type.toString(16).padStart(2, '0')}</div></td>` +
      `<td class="hexcell" style="white-space:pre-wrap">${esc(e.text)}</td></tr>`).join('');
    return `<h2>${esc(title)}</h2><div class="table-wrap"><table class="fields">${rows || '<tr><td>(empty)</td></tr>'}</table></div>`;
  }

  live([$('psbt')], () => {
    $('maps').innerHTML = '';
    const r = decodePsbtText($('psbt').value);
    if (!r) { $('out').innerHTML = ''; return; }
    renderRows($('out'), r.rows);
    $('maps').innerHTML = r.maps.map(table).join('');
  }, { errEl: $('err'), outEl: $('out') });
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  const exFire = id => document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
  // Unsigned PSBT spending 100,000 sats from the BIP84 test wallet's first address, with its UTXO and BIP32 path.
  $('example').onclick = () => { exSet('psbt', EXAMPLE_PSBT); exFire('psbt'); };
}

if (globalThis.document) mount();
