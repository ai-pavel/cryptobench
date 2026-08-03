// HASH160: hash bytes with SHA-256 then RIPEMD-160 and show the addresses it makes.
import { sha256, hash160, bytesToHex, readInput, base58check, concat, encodeSegwit, NETWORKS, secp256k1 } from '../lib/btc.js';
import { $, renderRows, live, segmented } from '../lib/ui.js';

/** The public key behind bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu (BIP84 test vector). */
export const EXAMPLE_HEX = '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c';
export const EXAMPLE_TEXT = 'hello';

/**
 * Rows for the input in the given mode ('hex' or 'text'): both hash steps and,
 * for hex input, the mainnet addresses it would make as a public key or redeem script.
 * Returns null for empty hex input; throws InputError for bad hex.
 */
export function hash160Rows(input, mode) {
  if (!input.trim() && mode === 'hex') return null;
  const bytes = readInput(input, mode);
  const h = hash160(bytes), net = NETWORKS.mainnet;
  let isKey = false;
  if (mode === 'hex' && (bytes.length === 33 || bytes.length === 65)) {
    try { secp256k1.ProjectivePoint.fromHex(bytes); isKey = true; } catch {}
  }
  return [
    { label: 'Step 1: SHA-256', value: bytesToHex(sha256(bytes)) },
    { label: 'Step 2: RIPEMD-160 = HASH160', value: bytesToHex(h), note: 'RIPEMD-160 of the step 1 digest' },
    isKey && { label: 'As P2PKH address', value: base58check.encode(concat(Uint8Array.of(net.pkh), h)), note: 'The input is a public key' },
    isKey && bytes.length === 33 && { label: 'As P2WPKH address', value: encodeSegwit(net.hrp, 0, h) },
    !isKey && mode === 'hex' && bytes.length && { label: 'As P2SH address', value: base58check.encode(concat(Uint8Array.of(net.sh), h)), note: 'If the input is a redeem script' },
    { label: 'Input size', value: `${bytes.length} bytes`, copy: false },
  ].filter(Boolean);
}

function mount() {
  let run;
  const mode = segmented($('mode'), () => run());
  run = live([$('input')], () => {
    const rows = hash160Rows($('input').value, mode());
    if (!rows) { $('out').innerHTML = ''; return; }
    renderRows($('out'), rows);
  }, { errEl: $('err'), outEl: $('out') });
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // The public key behind bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu (BIP84 test vector).
  $('example').onclick = () => {
    exSet('input', mode() === 'hex' ? EXAMPLE_HEX : EXAMPLE_TEXT); run();
  };
}

if (globalThis.document) mount();
