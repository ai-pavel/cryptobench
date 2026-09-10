// BOC Decoder: decode a bag of cells into a cell tree.
import { bocFromString, bytesToHex, bytesToBase64, serializeBoc, CELL_TYPES, commentCell } from '../lib/ton.js';
import { $, row, esc, showError } from '../lib/ui.js';

// Fift-style hex: completion tag in the last nibble and a trailing "_" when not nibble-aligned.
export function bitsHex(cell) {
  const len = cell.bitLength;
  if (!len) return '';
  let bits = '';
  for (let i = 0; i < len; i++) bits += (cell.bits[i >> 3] >> (7 - (i & 7))) & 1;
  let tail = '';
  if (len % 4) { bits += '1'; bits = bits.padEnd(Math.ceil(bits.length / 4) * 4, '0'); tail = '_'; }
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex.toUpperCase() + tail;
}

export function cellHtml(cell, path, seen) {
  const h = bytesToHex(cell.hash());
  const type = CELL_TYPES[cell.type];
  const label = `${esc(path)} · ${cell.bitLength} bits · ${cell.refs.length} ref${cell.refs.length === 1 ? '' : 's'}${cell.exotic ? ' · ' + esc(type) : ''}`;
  const dup = seen.has(h); seen.add(h);
  return `<details class="cell" ${path.split('.').length <= 2 ? 'open' : ''}>
    <summary><span class="mono">${label}</span>${dup ? ' <span class="muted">(same cell as above)</span>' : ''}</summary>
    <div class="cell-body">
      <div class="kv-label">Data</div><div class="kv-value">x{${esc(bitsHex(cell))}}</div>
      <div class="kv-label">Hash</div><div class="kv-value">${h}</div>
      <div class="kv-label">Depth</div><div class="kv-value">${cell.depth()}${cell.levelMask ? ` · level mask ${cell.levelMask}` : ''}</div>
      ${cell.refs.map((r, i) => cellHtml(r, `${path}.${i}`, seen)).join('')}
    </div></details>`;
}

/** One-line description of a parsed BOC's header. */
export const bocInfoText = info =>
  `${info.magic} · ${info.cells} cell${info.cells === 1 ? '' : 's'} · ${info.roots} root${info.roots === 1 ? '' : 's'} · index ${info.hasIdx ? 'yes' : 'no'} · CRC32C ${info.hasCrc32c ? 'yes, valid' : 'no'}`;

/**
 * Decode a BOC (hex or base64): its roots, root hash, header description and
 * re-encoding (base64, with CRC32C). Throws on a bad BOC.
 */
export function decodeBoc(text) {
  const { roots, info } = bocFromString(text);
  return {
    roots,
    info,
    rootHash: bytesToHex(roots[0].hash()),
    infoText: bocInfoText(info),
    reencoded: bytesToBase64(serializeBoc(roots[0])),
  };
}

/** The cell tree of all roots as nested <details>; repeated cells are marked. */
export function treeHtml(roots) {
  const seen = new Set();
  return roots.map((r, i) => cellHtml(r, roots.length > 1 ? `root${i}` : 'root', seen)).join('');
}

/** Example: a long text comment, which spans several cells. */
export const exampleBoc = () => bytesToBase64(serializeBoc(commentCell('Hello from the BOC decoder! '.repeat(6).trim())));

function mount() {
  function decode() {
    showError($('err')); $('summary').innerHTML = ''; $('tree').innerHTML = '';
    $('expand').hidden = $('collapse').hidden = true;
    if (!$('in').value.trim()) return;
    try {
      const r = decodeBoc($('in').value);
      let html = row('Root hash', r.rootHash) +
        `<div class="kv-row"><div class="kv-label">BOC</div><div class="kv-value">${esc(r.infoText)}</div></div>`;
      html += row('Re-encoded (base64, with CRC32C)', r.reencoded);
      $('summary').innerHTML = html;
      $('tree').innerHTML = treeHtml(r.roots);
      $('expand').hidden = $('collapse').hidden = false;
    } catch (e) { showError($('err'), e); }
  }
  $('go').onclick = decode;
  $('example').onclick = () => { $('in').value = exampleBoc(); decode(); };
  $('expand').onclick = () => document.querySelectorAll('#tree details').forEach(d => d.open = true);
  $('collapse').onclick = () => document.querySelectorAll('#tree details').forEach(d => d.open = false);
}

if (globalThis.document) mount();
