// RLP: encode JSON values to Recursive Length Prefix bytes, or decode RLP hex into a tree.
import { rlpEncode, rlpDecode, hexToBytes, bytesToHex, bigIntToBytes, bytesToBigInt, utf8, InputError } from '../lib/evm.js';
import { $, renderRows, showError, segmented } from '../lib/ui.js';

export const EXAMPLES = { encode: '["cat", "dog", 1024, "0xdeadbeef", [[], [[]]]]', decode: '0xc88363617483646f67' };
export const HINTS = {
  encode: 'Input is JSON. Strings starting with 0x are hex bytes, other strings are UTF-8 text, numbers are integers, arrays are lists.',
  decode: 'Input is RLP as hex.',
};

export function toItem(v, path = 'value') {
  if (Array.isArray(v)) return v.map((x, i) => toItem(x, `${path}[${i}]`));
  if (typeof v === 'string') return /^0x/i.test(v) ? hexToBytes(v, path) : utf8(v);
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v) || v < 0) throw new InputError(`${path}: only non-negative integers up to 2^53 (use 0x hex for bigger numbers)`);
    return bigIntToBytes(BigInt(v));
  }
  throw new InputError(`${path}: use strings, numbers or arrays (got ${v === null ? 'null' : typeof v})`);
}

export function toHexTree(item) {
  return Array.isArray(item) ? item.map(toHexTree) : bytesToHex(item);
}

export function readable(item) {
  if (Array.isArray(item)) return item.map(readable);
  if (item.length === 0) return '';
  const text = new TextDecoder('utf-8', { fatal: false }).decode(item);
  if (/^[\x20-\x7e]+$/.test(text)) return text;
  if (item.length <= 8 && item[0] !== 0) return Number(bytesToBigInt(item));
  return bytesToHex(item);
}

/** Encode JSON input; returns { hex, size } (null for empty input). */
export function encodeInput(raw) {
  raw = raw.trim();
  if (!raw) return null;
  let json;
  try { json = JSON.parse(raw); } catch { throw new InputError('Input is not valid JSON. Text must be in double quotes, e.g. "dog"'); }
  const enc = rlpEncode(toItem(json));
  return { hex: bytesToHex(enc), size: enc.length };
}

/** Decode RLP hex; returns { tree, readable } as pretty JSON (null for empty input). */
export function decodeInput(raw) {
  raw = raw.trim();
  if (!raw) return null;
  const item = rlpDecode(hexToBytes(raw, 'RLP'));
  return { tree: JSON.stringify(toHexTree(item), null, 2), readable: JSON.stringify(readable(item), null, 2) };
}

function mount() {
  const mode = segmented($('mode'), m => { $('input').value = EXAMPLES[m]; render(); });

  function render() {
    $('hint').textContent = HINTS[mode()];
    showError($('err'), null);
    $('out').innerHTML = '';
    $('tree-box').hidden = true;
    try {
      if (mode() === 'encode') {
        const r = encodeInput($('input').value);
        if (!r) return;
        renderRows($('out'), [{ label: 'RLP', value: r.hex, cls: 'ok' }, { label: 'Size', value: `${r.size} bytes`, copy: false }]);
      } else {
        const r = decodeInput($('input').value);
        if (!r) return;
        $('tree').textContent = r.tree;
        $('readable').textContent = r.readable;
        $('tree-box').hidden = false;
      }
    } catch (e) {
      showError($('err'), e);
    }
  }
  $('input').addEventListener('input', render);
  $('example').onclick = () => { $('input').value = EXAMPLES[mode()]; render(); };
  $('input').value = EXAMPLES.encode;
  render();
}

if (globalThis.document) mount();
