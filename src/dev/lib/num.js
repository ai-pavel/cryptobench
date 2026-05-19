// Integer parsing and formatting helpers (BigInt-based) for the Bits & Bytes tools.
import { InputError } from './ui.js';

const PREFIX = { '0x': 16, '0b': 2, '0o': 8 };
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Parse an integer in the given base, or detect the base from a 0x/0b/0o prefix when base is 'auto'. */
export function parseInteger(text, base = 'auto') {
  let s = String(text).trim().replace(/[_\s,]/g, '').toLowerCase();
  if (!s) throw new InputError('Enter a number.');
  let neg = false;
  if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
  let b = base === 'auto' ? 10 : Number(base);
  const p = s.slice(0, 2);
  if (PREFIX[p] && (base === 'auto' || PREFIX[p] === b)) { b = PREFIX[p]; s = s.slice(2); }
  if (!s) throw new InputError('Enter digits after the prefix.');
  let v = 0n;
  const B = BigInt(b);
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= b) throw new InputError(`"${ch}" is not a valid base-${b} digit.`);
    v = v * B + BigInt(d);
  }
  return neg ? -v : v;
}

export function toBase(v, base) {
  if (v < 0n) return '-' + toBase(-v, base);
  return v.toString(base);
}

/** Two's complement bit pattern of v in `bits` bits (as a non-negative BigInt). */
export function twos(v, bits) {
  const mod = 1n << BigInt(bits);
  return ((v % mod) + mod) % mod;
}

/** Signed value of an unsigned `bits`-bit pattern. */
export function signedOf(u, bits) {
  const half = 1n << BigInt(bits - 1);
  return u >= half ? u - (1n << BigInt(bits)) : u;
}

export function rangeCheck(v, bits, signed) {
  const B = BigInt(bits);
  const min = signed ? -(1n << (B - 1n)) : 0n;
  const max = signed ? (1n << (B - 1n)) - 1n : (1n << B) - 1n;
  if (v < min || v > max) throw new InputError(`${v} doesn't fit in ${signed ? 'a signed' : 'an unsigned'} ${bits}-bit integer (${min} … ${max}).`);
}

/** Big-endian bytes of an unsigned value in `bits` bits. */
export function toBytesBE(u, bits) {
  const out = [];
  for (let i = bits / 8 - 1; i >= 0; i--) out.push(Number((u >> BigInt(i * 8)) & 0xffn));
  return out;
}

export function fromBytesBE(bytes) {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

export const hexBytes = (bytes, sep = '') => bytes.map(b => b.toString(16).padStart(2, '0')).join(sep);

/** Parse hex bytes: "0x0102", "01 02", "01:02". */
export function parseHexBytes(text) {
  const s = String(text).trim().replace(/^0x/i, '').replace(/[\s:,_-]/g, '');
  if (!s) throw new InputError('Enter hex bytes.');
  if (!/^[0-9a-f]*$/i.test(s)) throw new InputError('Hex can only contain 0-9 and a-f.');
  if (s.length % 2) throw new InputError('Hex needs an even number of digits (two per byte).');
  return s.match(/../g).map(h => parseInt(h, 16));
}

/** Group a digit string from the right, e.g. bits in nibbles. */
export function group(s, n, sep = ' ') {
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const parts = [];
  for (let i = s.length; i > 0; i -= n) parts.unshift(s.slice(Math.max(0, i - n), i));
  return (neg ? '-' : '') + parts.join(sep);
}

/** Parse a single byte given as decimal, 0x hex, 0b binary, 0o octal, or a single character. */
export function parseByte(text) {
  const t = String(text);
  if (!t.trim()) throw new InputError('Enter a byte.');
  const v = parseInteger(t);
  if (v < -128n || v > 255n) throw new InputError('A byte is 0 … 255 (or -128 … 127 signed).');
  return Number(v < 0n ? v + 256n : v);
}

export const CONTROL = ['NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI',
  'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US'];
export const CONTROL_NAMES = ['Null', 'Start of heading', 'Start of text', 'End of text', 'End of transmission', 'Enquiry',
  'Acknowledge', 'Bell', 'Backspace', 'Horizontal tab', 'Line feed', 'Vertical tab', 'Form feed', 'Carriage return',
  'Shift out', 'Shift in', 'Data link escape', 'Device control 1 (XON)', 'Device control 2', 'Device control 3 (XOFF)',
  'Device control 4', 'Negative acknowledge', 'Synchronous idle', 'End of transmission block', 'Cancel', 'End of medium',
  'Substitute', 'Escape', 'File separator', 'Group separator', 'Record separator', 'Unit separator'];

/** Short display name of a byte as an ASCII / Latin-1 character. */
export function charName(b) {
  if (b < 32) return CONTROL[b];
  if (b === 32) return 'SP';
  if (b === 127) return 'DEL';
  if (b < 127) return String.fromCharCode(b);
  if (b === 0xa0) return 'NBSP';
  if (b === 0xad) return 'SHY';
  if (b < 0xa0) return '—';
  return String.fromCharCode(b);
}

export function charDescription(b) {
  if (b < 32) return `${CONTROL[b]} (${CONTROL_NAMES[b]})`;
  if (b === 32) return 'Space';
  if (b === 127) return 'DEL (Delete)';
  if (b < 127) return `"${String.fromCharCode(b)}"`;
  if (b < 0xa0) return 'C1 control (no printable character in Latin-1)';
  return `"${String.fromCharCode(b)}" in Latin-1 (not ASCII)`;
}
