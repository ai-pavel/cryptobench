// Target & Bits: convert between compact "bits" and the full 256-bit proof-of-work target.
import { bitsToTarget, targetToBits, difficulty, hex32, hexU32, parseInteger, InputError } from '../lib/btc.js';
import { $, renderRows, live, segmented } from '../lib/ui.js';

/** Default input per mode; the bits of the genesis block (difficulty 1). */
export const DEFAULTS = { bits: '0x1d00ffff', target: '0x00000000ffff0000000000000000000000000000000000000000000000000000' };
export const EXAMPLES = { bits: '0x1d00ffff', target: '00000000ffff0000000000000000000000000000000000000000000000000000' };

/** Rows for compact bits in hex (0x optional); null for empty input; throws InputError. */
export function bitsRows(input) {
  const v = input.trim();
  if (!v) return null;
  const t = v.replace(/^0x/i, '');
  if (!/^[0-9a-f]{1,8}$/i.test(t)) throw new InputError('Bits are a 4-byte number written in hex, e.g. 0x1d00ffff or 170331e8');
  const bits = parseInt(t, 16) >>> 0;
  const d = bitsToTarget(bits);
  return [
    { label: 'Target', value: hex32(d.target) },
    { label: 'Exponent / mantissa', value: `0x${d.exponent.toString(16)} (${d.exponent} bytes) / 0x${d.mantissa.toString(16).padStart(6, '0')}`, copy: false, note: 'target = mantissa × 256^(exponent − 3)' },
    { label: 'Difficulty', value: difficulty(d.target), copy: false },
    { label: 'Leading zero bits', value: String(256 - d.target.toString(2).length), copy: false },
    d.negative && { label: 'Warning', value: 'The sign bit (0x00800000) is set: Bitcoin treats this target as negative and invalid', copy: false, cls: 'bad' },
    d.overflow && { label: 'Warning', value: 'This target overflows 256 bits', copy: false, cls: 'bad' },
    { label: 'Canonical bits', value: hexU32(targetToBits(d.target)), note: 'Re-encoding the target' },
  ].filter(Boolean);
}

/** Rows for a full target in hex (0x optional); null for empty input; throws InputError. */
export function targetRows(input) {
  const v = input.trim();
  if (!v) return null;
  const target = parseInteger(/^0x/i.test(v) ? v : '0x' + v, 'Target');
  if (target >= 2n ** 256n) throw new InputError('Target must fit in 256 bits');
  const bits = targetToBits(target), back = bitsToTarget(bits).target;
  return [
    { label: 'Bits', value: hexU32(bits) },
    { label: 'Target after rounding', value: hex32(back), note: back === target ? 'Exactly representable' : 'Compact encoding keeps only the top 3 bytes, so the target is rounded down' },
    { label: 'Difficulty', value: difficulty(back), copy: false },
  ];
}

function mount() {
  let run;
  const mode = segmented($('mode'), () => {
    $('input').value = DEFAULTS[mode()];
    run();
  });
  run = live([$('input')], () => {
    const rows = mode() === 'bits' ? bitsRows($('input').value) : targetRows($('input').value);
    if (!rows) { $('out').innerHTML = ''; return; }
    renderRows($('out'), rows);
  }, { errEl: $('err'), outEl: $('out') });
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // Bits of the genesis block (difficulty 1).
  $('example').onclick = () => {
    exSet('input', EXAMPLES[mode()]); run();
  };
}

if (globalThis.document) mount();
