// Script: convert a Bitcoin script between hex and ASM, classify it and list its ops.
import { hexToBytes, bytesToHex, decompile, toAsm, fromAsm, classifyScript, scriptToAddress, NETWORKS, sha256, hash160, base58check, concat, encodeSegwit, OPCODES } from '../lib/btc.js';
import { $, renderRows, showError, esc } from '../lib/ui.js';

/** P2PKH script of Satoshi's genesis address. */
export const EXAMPLE_HEX = '76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac';

/** Opcode reference table: [code, name] sorted by code, with the direct pushes as one entry. */
export const opcodeReference = () =>
  [[0x01, 'PUSH 1–75 bytes (0x01–0x4b)'], ...Object.entries(OPCODES).map(([c, n]) => [Number(c), n])].sort((a, b) => a[0] - b[0]);

/**
 * Everything shown for a script: its template, address and alternative encodings as rows,
 * and its ops ({ range, name, data }).
 */
export function describeScript(script) {
  const ops = decompile(script);
  const c = classifyScript(script), net = NETWORKS.mainnet;
  let addr = null; try { addr = scriptToAddress(script, net); } catch {}
  return {
    rows: [
      { label: 'Template', value: c.name, copy: false },
      addr && { label: 'Address (mainnet)', value: addr },
      c.type === 'nulldata' && c.data && { label: 'OP_RETURN data', value: bytesToHex(c.data), note: (() => { try { return 'As text: ' + new TextDecoder('utf-8', { fatal: true }).decode(c.data); } catch { return ''; } })() },
      c.type === 'multisig' && { label: 'Keys', value: c.keys.map(bytesToHex).join('\n') },
      !addr && c.type !== 'nulldata' && script.length && { label: 'As P2SH redeem script', value: base58check.encode(concat(Uint8Array.of(0x05), hash160(script))) },
      !addr && c.type !== 'nulldata' && script.length && { label: 'As P2WSH witness script', value: encodeSegwit('bc', 0, sha256(script)) },
      { label: 'Size', value: `${script.length} bytes, ${ops.length} ops`, copy: false },
    ].filter(Boolean),
    ops: ops.map(o => ({ range: `${o.start}${o.end - o.start > 1 ? '–' + (o.end - 1) : ''}`, name: o.name, data: o.data ? bytesToHex(o.data) : null, size: o.data ? o.data.length : 0 })),
  };
}

/** Hex → script bytes and ASM; null for empty input; throws InputError. */
export function fromHexInput(hex) {
  if (!hex.trim()) return null;
  const script = hexToBytes(hex, 'Script');
  return { script, asm: toAsm(decompile(script)) };
}

/** ASM → script bytes and hex; null for empty input; throws InputError. */
export function fromAsmInput(asm) {
  if (!asm.trim()) return null;
  const script = fromAsm(asm);
  return { script, hex: bytesToHex(script) };
}

function mount() {
  $('ref').innerHTML = '<tr><th>Hex</th><th>Name</th></tr>' +
    opcodeReference().map(([c, n]) => `<tr><td class="range">0x${c.toString(16).padStart(2, '0')}</td><td class="hexcell">${esc(n)}</td></tr>`).join('');

  function show(script) {
    const d = describeScript(script);
    renderRows($('out'), d.rows);
    $('ops').innerHTML = '<tr><th>Bytes</th><th>Op</th><th>Data</th></tr>' + d.ops.map(o =>
      `<tr><td class="range">${o.range}</td><td>${esc(o.name)}</td><td class="hexcell">${o.data !== null ? esc(o.data) + ` <span class="muted">(${o.size} bytes)</span>` : ''}</td></tr>`).join('');
  }

  function clear(e) { $('out').innerHTML = ''; $('ops').innerHTML = ''; showError($('err'), e); }

  $('hex').addEventListener('input', () => {
    showError($('err'), null);
    try {
      const r = fromHexInput($('hex').value);
      if (!r) { $('asm').value = ''; return clear(null); }
      $('asm').value = r.asm;
      show(r.script);
    } catch (e) { clear(e); }
  });
  $('asm').addEventListener('input', () => {
    showError($('err'), null);
    try {
      const r = fromAsmInput($('asm').value);
      if (!r) { $('hex').value = ''; return clear(null); }
      $('hex').value = r.hex;
      show(r.script);
    } catch (e) { clear(e); }
  });
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  const exFire = id => document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
  // P2PKH script of Satoshi's genesis address.
  $('example').onclick = () => { exSet('hex', EXAMPLE_HEX); exFire('hex'); };
}

if (globalThis.document) mount();
