// Op Code: compute a TL-B constructor's op code (CRC32 of its normalized scheme).
import { crc32, utf8 } from '../lib/ton.js';
import { $, row, esc, showError } from '../lib/ui.js';

export const COMMON = [
  ['0f8a7ea5', 'Jetton transfer', 'transfer query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress response_destination:MsgAddress custom_payload:(Maybe ^Cell) forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody'],
  ['178d4519', 'Jetton internal transfer', 'internal_transfer query_id:uint64 amount:(VarUInteger 16) from:MsgAddress response_address:MsgAddress forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody'],
  ['7362d09c', 'Jetton transfer notification', 'transfer_notification query_id:uint64 amount:(VarUInteger 16) sender:MsgAddress forward_payload:(Either Cell ^Cell) = InternalMsgBody'],
  ['595f07bc', 'Jetton burn', 'burn query_id:uint64 amount:(VarUInteger 16) response_destination:MsgAddress custom_payload:(Maybe ^Cell) = InternalMsgBody'],
  ['d53276db', 'Excesses', 'excesses query_id:uint64 = InternalMsgBody'],
  ['5fcc3d14', 'NFT transfer', 'transfer query_id:uint64 new_owner:MsgAddress response_destination:MsgAddress custom_payload:(Maybe ^Cell) forward_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody'],
  ['05138d91', 'NFT ownership assigned', 'ownership_assigned query_id:uint64 prev_owner:MsgAddress forward_payload:(Either Cell ^Cell) = InternalMsgBody'],
  ['2fcb26a2', 'NFT get static data', 'get_static_data query_id:uint64 = InternalMsgBody'],
];

export function normalize(s) {
  let t = s.replace(/\s+/g, ' ').trim().replace(/;\s*$/, '');
  t = t.replace(/^(\S+?)(#[0-9a-fA-F_]*|\$[01_]*)(?=\s|$)/, '$1');
  return t.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
}
export const hex8 = n => n.toString(16).padStart(8, '0');

/**
 * Op code of a TL-B constructor: CRC32 of the normalized scheme with the high bit cleared.
 * Returns null for empty input; otherwise the op, its high-bit form, the normalized
 * scheme and any explicit #tag in the input (as hex text and number).
 */
export function opCode(input) {
  const src = input.trim();
  if (!src) return null;
  if (!src.includes('=')) throw new Error('A TL-B constructor needs "= ResultType" at the end');
  const tag = src.match(/^\S+?#([0-9a-fA-F]+)\b/);
  const norm = normalize(src), raw = crc32(utf8(norm)), op = raw & 0x7fffffff, high = (op | 0x80000000) >>> 0;
  const t = tag ? parseInt(tag[1], 16) >>> 0 : null;
  return { op, high, norm, tag: tag ? tag[1] : null, tagValue: t };
}

/** Status of a known op code against its scheme: computed, computed with the high bit set, or not. */
export function opStatus(op, scheme) {
  const raw = crc32(utf8(normalize(scheme)));
  return hex8(raw & 0x7fffffff) === op ? '✓ computed' : hex8(((raw & 0x7fffffff) | 0x80000000) >>> 0) === op ? '✓ high bit set' : '✗';
}

function mount() {
  function compute() {
    showError($('err')); $('out').innerHTML = '';
    let r;
    try { r = opCode($('tlb').value); } catch (e) { showError($('err'), e); return; }
    if (!r) return;
    const { op, high, norm, tag, tagValue: t } = r;
    $('out').innerHTML = row('Op code (hex)', '0x' + hex8(op)) + row('Op code (decimal)', String(op)) +
      row('With the high bit set', '0x' + hex8(high), 'Used by some standard ops, often responses such as excesses (0xd53276db).') +
      row('Normalized scheme', norm) +
      (tag ? `<div class="kv-row"><div class="kv-label">Explicit tag in the input</div><div class="kv-value">#${esc(tag)} ${t === op ? '<span class="ok">matches</span>' : t === high ? '<span class="ok">matches the high-bit form</span>' : '<span class="muted">differs from the computed value; contracts use the explicit tag</span>'}</div></div>` : '');
  }
  $('tlb').addEventListener('input', compute);
  // Example: the TEP-74 jetton transfer scheme; its op code is 0x0f8a7ea5.
  $('example').onclick = () => { $('tlb').value = $('tlb').placeholder; compute(); };

  $('ops').innerHTML = COMMON.map(([op, name, scheme]) => {
    const ok = opStatus(op, scheme);
    return `<tr data-scheme="${esc(scheme)}"><td class="mono">0x${op}</td><td>${esc(name)}<div class="scheme mono">${esc(scheme)}</div></td><td class="muted" style="white-space:nowrap">${ok}</td></tr>`;
  }).join('');
  $('ops').onclick = e => { const tr = e.target.closest('tr[data-scheme]'); if (tr) { $('tlb').value = tr.dataset.scheme; compute(); $('tlb').scrollIntoView({ block: 'center' }); } };
}

if (globalThis.document) mount();
