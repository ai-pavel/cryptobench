// Little Endian: convert a number between big-endian and little-endian bytes.
import { $, renderRows, live, segmented, InputError } from '../lib/ui.js';
import { parseInteger, twos, signedOf, rangeCheck, toBytesBE, fromBytesBE, hexBytes, parseHexBytes } from '../lib/num.js';

/** Number → bytes: the rows shown for an integer stored in `bits` bits. */
export function numberToBytes(text, bits, signed) {
  const v = parseInteger(text);
  rangeCheck(v, bits, signed || v < 0n);
  const be = toBytesBE(twos(v, bits), bits);
  const le = [...be].reverse();
  return [
    { label: 'Big-endian', value: hexBytes(be, ' '), note: 'Most significant byte first (network order)' },
    { label: 'Little-endian', value: hexBytes(le, ' '), note: 'Least significant byte first (x86, Bitcoin, most CPUs)' },
    { label: 'Big-endian hex', value: '0x' + hexBytes(be) },
    { label: 'Little-endian hex', value: '0x' + hexBytes(le) },
    { label: 'Little-endian array', value: '[' + le.join(', ') + ']' },
  ];
}

/** Bytes → number: the rows shown for hex bytes in the given order ('le' or 'be'). */
export function bytesToNumber(text, bits, signed, order) {
  let bytes = parseHexBytes(text);
  if (bytes.length > bits / 8) throw new InputError(`${bytes.length} bytes don't fit in ${bits} bits. Choose a wider type.`);
  const be = order === 'le' ? [...bytes].reverse() : bytes;
  const u = fromBytesBE(be);
  const shown = signed ? signedOf(u, bits) : u;
  return [
    { label: signed ? 'Signed value' : 'Unsigned value', value: shown.toString() },
    { label: 'Hex (big-endian)', value: '0x' + u.toString(16).padStart(bits / 4, '0') },
    { label: 'Reversed bytes', value: hexBytes([...bytes].reverse(), ' '), note: 'The same bytes in the other byte order' },
    bytes.length < bits / 8 && { label: 'Note', value: `Padded ${bytes.length} byte(s) to ${bits / 8} with zero high bytes.`, copy: false },
  ];
}

function mount() {
  const mode = segmented($('mode'), () => { setMode(); run(); });
  function setMode() {
    const bytes = mode() === 'bytes';
    $('inLabel').textContent = bytes ? 'Bytes in hex (e.g. 78 56 34 12)' : 'Number (decimal, or 0x / 0b / 0o prefix)';
    $('orderWrap').hidden = !bytes;
    if (bytes && !/^[0-9a-f\s:x]+$/i.test($('in').value)) $('in').value = '78 56 34 12';
  }
  const run = live([$('in'), $('bits'), $('signed'), $('order')], () => {
    const bits = +$('bits').value, signed = $('signed').checked;
    if (mode() === 'num') renderRows($('out'), numberToBytes($('in').value, bits, signed));
    else renderRows($('out'), bytesToNumber($('in').value, bits, signed, $('order').value));
  }, { errEl: $('err'), outEl: $('out') });
}

if (globalThis.document) mount();
