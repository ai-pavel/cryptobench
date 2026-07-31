// HASH256: hash bytes twice with SHA-256 and show both byte orders and the checksum.
import { sha256, hash256, bytesToHex, reverse, readInput } from '../lib/btc.js';
import { $, renderRows, live, segmented } from '../lib/ui.js';

/** The genesis block header: HASH256 gives the genesis block hash. */
export const EXAMPLE_HEX = '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c';
export const EXAMPLE_TEXT = 'hello';

/**
 * Rows for the input in the given mode ('hex' or 'text').
 * Returns null for empty hex input; throws InputError for bad hex.
 */
export function hash256Rows(input, mode) {
  if (!input.trim() && mode === 'hex') return null;
  const bytes = readInput(input, mode);
  const h = hash256(bytes);
  return [
    { label: 'HASH256', value: bytesToHex(h), note: 'Internal byte order, as computed' },
    { label: 'Reversed', value: bytesToHex(reverse(h)), note: 'Byte order shown by explorers for TXIDs and block hashes' },
    { label: 'First SHA-256', value: bytesToHex(sha256(bytes)) },
    { label: 'Checksum (first 4 bytes)', value: bytesToHex(h.slice(0, 4)), note: 'What Base58Check appends' },
    { label: 'Input size', value: `${bytes.length} bytes`, copy: false },
  ];
}

function mount() {
  let run;
  const mode = segmented($('mode'), () => run());
  run = live([$('input')], () => {
    const rows = hash256Rows($('input').value, mode());
    if (!rows) { $('out').innerHTML = ''; return; }
    renderRows($('out'), rows);
  }, { errEl: $('err'), outEl: $('out') });
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // The genesis block header: HASH256 gives the genesis block hash.
  $('example').onclick = () => {
    exSet('input', mode() === 'hex' ? EXAMPLE_HEX : EXAMPLE_TEXT); run();
  };
}

if (globalThis.document) mount();
