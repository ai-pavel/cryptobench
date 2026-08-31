// Anchor Discriminator: compute the 8-byte discriminator Anchor prefixes to instructions, accounts and events.
import { sha256, hex, utf8, kvTable, wireCopy } from '../lib/sol.js';

export const words = s => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
export const snake = s => words(s).map(w => w.toLowerCase()).join('_');
export const pascal = s => words(s).map(w => w[0].toUpperCase() + w.slice(1)).join('');

/**
 * Discriminator for a name of a kind (global, account, event, ...).
 * With convert, global names become snake_case and others PascalCase, as Anchor does.
 * Returns null for empty input; otherwise the table rows shown.
 */
export function discriminator(rawName, kind, convert) {
  const raw = rawName.trim();
  if (!raw) return null;
  const name = !convert ? raw : kind === 'global' ? snake(raw) : pascal(raw);
  const pre = `${kind}:${name}`;
  const d = sha256(utf8.encode(pre)).slice(0, 8);
  return [
    ['Preimage', pre],
    ['Discriminator (hex)', hex.encode(d)],
    ['Byte array', `[${Array.from(d).join(', ')}]`],
    ['As u64 (LE)', new DataView(d.buffer).getBigUint64(0, true).toString()],
  ];
}

function mount() {
  const $ = id => document.getElementById(id);
  function render() {
    const rows = discriminator($('name').value, $('kind').value, $('convert').checked);
    if (!rows) { $('out').innerHTML = ''; return; }
    $('out').innerHTML = kvTable(rows);
  }
  $('name').oninput = render; $('kind').onchange = render; $('convert').onchange = render;
  // Example: Anchor's most common instruction; its discriminator is afaf6d1f0d989bed.
  $('example').onclick = () => { $('name').value = 'initialize'; $('kind').value = 'global'; $('convert').checked = true; render(); };
  wireCopy();
}

if (globalThis.document) mount();
