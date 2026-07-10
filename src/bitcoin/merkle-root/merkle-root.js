// Merkle Root: compute a block's merkle root from its TXIDs, level by level.
import { hexToBytes, bytesToHex, reverse, hash256, concat, InputError } from '../lib/btc.js';
import { $, renderRows, live, esc } from '../lib/ui.js';

export const SAMPLE = ['8c14f0db3df150123e6f3dbbf30f8b955a8249b62ac1d1ff16284aefa3d06d87', 'fff2525b8931402dd09222c50775608f75787bd2b87e56995a7bdd30f79702c4',
  '6359f0868171b1d194cbee1af2f16ea598ae8fad666d9b012c8ed2b79a236ec4', 'e9a66845e05d5abc0ad04ec80f774a7e585c6e8db975962d069a522137b80c1d'];

/**
 * Build the merkle tree from TXIDs separated by whitespace or commas (display order,
 * or internal order when `internal`). Returns null for no TXIDs; otherwise every level
 * (internal-order bytes, level 0 = TXIDs) and the result rows. Throws InputError for bad TXIDs.
 */
export function merkleTree(text, internal) {
  const lines = text.split(/[\s,]+/).filter(Boolean);
  if (!lines.length) return null;
  let level = lines.map((l, i) => {
    const b = hexToBytes(l, `TXID ${i + 1}`);
    if (b.length !== 32) throw new InputError(`TXID ${i + 1} is ${b.length} bytes; TXIDs are 32 bytes`);
    return internal ? b : reverse(b);
  });
  const levels = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(hash256(concat(level[i], level[i + 1] || level[i])));
    level = next;
    levels.push(level);
  }
  const root = level[0];
  return {
    levels,
    rows: [
      { label: 'Merkle root', value: bytesToHex(reverse(root)), note: 'Display byte order' },
      { label: 'As stored in the header', value: bytesToHex(root), note: 'Internal byte order' },
      { label: 'Levels', value: String(levels.length), copy: false },
    ],
  };
}

function mount() {
  const run = live([$('ids'), $('internal')], () => {
    $('levels').innerHTML = '';
    const r = merkleTree($('ids').value, $('internal').checked);
    if (!r) { $('out').innerHTML = ''; return; }
    const { levels } = r;
    renderRows($('out'), r.rows);
    $('levels').innerHTML = levels.map((lv, d) => `<h2 class="small">Level ${d}${d === 0 ? ' (TXIDs)' : d === levels.length - 1 ? ' (root)' : ''}</h2>` +
      `<div class="hexview">${lv.map((h, i) => `${i}: ${esc(bytesToHex(reverse(h)))}${i === lv.length - 1 && lv.length % 2 && lv.length > 1 ? ' (paired with itself)' : ''}`).join('<br>')}</div>`).join('');
  }, { errEl: $('err'), outEl: $('out') });
  $('sample').onclick = () => { $('ids').value = SAMPLE.join('\n'); $('internal').checked = false; run(); };
}

if (globalThis.document) mount();
