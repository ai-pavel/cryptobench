// Number Converter: convert an integer between bases and show its fixed-width bit pattern.
import { $, renderRows, live } from '../lib/ui.js';
import { parseInteger, toBase, twos, signedOf, rangeCheck, group } from '../lib/num.js';

/** The rows shown for an integer in the given input base, plus its two's complement pattern when bits is set. */
export function convertNumber(text, base, bits) {
  const v = parseInteger(text, base);
  const rows = [
    { label: 'Decimal', value: group(v.toString(), 3, ',') },
    { label: 'Hex', value: (v < 0n ? '-0x' : '0x') + toBase(v < 0n ? -v : v, 16) },
    { label: 'Binary', value: (v < 0n ? '-' : '') + group(toBase(v < 0n ? -v : v, 2), 4) },
    { label: 'Octal', value: (v < 0n ? '-0o' : '0o') + toBase(v < 0n ? -v : v, 8) },
    { label: 'Base 36', value: toBase(v, 36) },
    { label: 'Bit length', value: String((v < 0n ? -v : v).toString(2).length), copy: false },
  ];
  if (bits) {
    if (v < 0n) rangeCheck(v, bits, true); else rangeCheck(v, bits, false);
    const u = twos(v, bits);
    rows.push(
      { label: `${bits}-bit pattern (hex)`, value: '0x' + u.toString(16).padStart(bits / 4, '0') },
      { label: `${bits}-bit pattern (binary)`, value: group(u.toString(2).padStart(bits, '0'), 4) },
      { label: 'As unsigned', value: u.toString() },
      { label: 'As signed', value: signedOf(u, bits).toString() },
    );
  }
  return rows;
}

function mount() {
  live([$('in'), $('base'), $('bits')], () => {
    const bits = +$('bits').value || 0;
    renderRows($('out'), convertNumber($('in').value, $('base').value, bits));
  }, { errEl: $('err'), outEl: $('out') });
}

if (globalThis.document) mount();
