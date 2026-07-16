// Transaction Splitter: split a raw transaction into its fields, byte by byte.
import { hexToBytes, bytesToHex, parseTx, decompile, toAsm, classifyScript, scriptToAddress, NETWORKS, networkOptions, formatSats, describeLocktime, hexU32 } from '../lib/btc.js';
import { $, renderRows, live, esc } from '../lib/ui.js';

/** A signed P2WPKH transaction from the BIP84 test wallet. */
export const EXAMPLE_TX = '0200000000010139e6eaa9f4f76c3227449869b6e98bd83241a58c810fa1c8582e30e7e0114fd70000000000fdffffff01b8820100000000001600149c90f934ea51fa0f6504177043e0908da692998302483045022100a67b86c175604af65871e8d7bd7433a2635f93fd3738a636162282a000107d4a02201950d3bb41b8b96d6f7add63e8f64c2ecd8d5166c91dde2801a9f6d0f64c922401210330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c00000000';

const GROUP_COLORS = { Header: 0, Inputs: 1, Outputs: 2, Footer: 3 };
/** Colour class index for a field group. */
export const color = g => (g in GROUP_COLORS ? GROUP_COLORS[g] : g.startsWith('Input') ? 1 : g.startsWith('Output') ? 2 : g.startsWith('Witness') ? 4 : 5);

/** The decoded value shown for a field. */
export function fieldValue(f, net) {
  const v = f.value;
  if (v instanceof Uint8Array) {
    if (f.name === 'scriptPubKey') {
      const c = classifyScript(v); let addr = null;
      try { addr = scriptToAddress(v, net); } catch {}
      let asm = ''; try { asm = toAsm(decompile(v)); } catch {}
      return `${c.name}${addr ? ' · ' + addr : ''}${asm ? '\n' + asm : ''}`;
    }
    if (f.name === 'scriptSig' && v.length) { try { return toAsm(decompile(v)); } catch { return ''; } }
    return '';
  }
  if (f.name === 'Amount (sats)') return formatSats(v);
  if (f.name === 'Sequence') return hexU32(v);
  if (f.name === 'Locktime') return describeLocktime(v);
  return String(v);
}

/**
 * Split a raw transaction: summary rows and every field ({ group, name, start, end, raw, value, color }).
 * Returns null for empty input; throws InputError for a bad transaction.
 */
export function splitTx(hex, netKey) {
  if (!hex.trim()) return null;
  const bytes = hexToBytes(hex, 'Transaction');
  const tx = parseTx(bytes), net = NETWORKS[netKey];
  return {
    rows: [
      { label: 'TXID', value: tx.txid },
      tx.segwit && { label: 'wTXID', value: tx.wtxid },
      { label: 'Summary', value: `Version ${tx.version}, ${tx.inputs.length} input(s), ${tx.outputs.length} output(s), ${tx.segwit ? 'segwit' : 'legacy'}`, copy: false },
      { label: 'Size', value: `${tx.size} bytes · ${tx.weight} weight units · ${tx.vsize} vbytes`, copy: false },
      { label: 'Total output', value: formatSats(tx.outputs.reduce((a, o) => a + o.value, 0n)), copy: false },
    ].filter(Boolean),
    fields: tx.fields.map(f => ({ group: f.group, name: f.name, start: f.start, end: f.end, raw: bytesToHex(bytes.slice(f.start, f.end)), value: fieldValue(f, net), color: color(f.group) })),
  };
}

function mount() {
  $('net').innerHTML = networkOptions('mainnet');

  live([$('tx'), $('net')], () => {
    $('fields').innerHTML = ''; $('hexview').innerHTML = '';
    const r = splitTx($('tx').value, $('net').value);
    if (!r) { $('out').innerHTML = ''; return; }
    renderRows($('out'), r.rows);
    $('hexview').innerHTML = '<div class="hexview">' + r.fields.map(f => `<span class="c${f.color}" title="${esc(f.group + ': ' + f.name)}">${f.raw}</span>`).join('') + '</div>';
    let last = '';
    $('fields').innerHTML = '<tr><th>Bytes</th><th>Field</th><th>Raw</th><th>Value</th></tr>' + r.fields.map(f => {
      const head = f.group !== last ? `<tr class="group"><td colspan="4">${esc(f.group)}</td></tr>` : '';
      last = f.group;
      return `${head}<tr><td class="range">${f.start}${f.end - f.start > 1 ? '–' + (f.end - 1) : ''}</td><td>${esc(f.name)}</td><td class="hexcell"><span class="c${f.color}">${f.raw || '(empty)'}</span></td><td class="hexcell" style="white-space:pre-wrap">${esc(f.value)}</td></tr>`;
    }).join('');
  }, { errEl: $('err'), outEl: $('out') });
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  const exFire = id => document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
  // A signed P2WPKH transaction from the BIP84 test wallet.
  $('example').onclick = () => { exSet('net', 'mainnet'); exSet('tx', EXAMPLE_TX); exFire('tx'); };
}

if (globalThis.document) mount();
