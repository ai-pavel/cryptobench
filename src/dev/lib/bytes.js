// Byte helpers: hex / base64 / base64url / UTF-8 conversions and binary input parsing.
import { InputError } from './ui.js';

export const toHex = (bytes, sep = '') => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(sep);

export function fromHex(text) {
  const s = String(text).trim().replace(/^0x/i, '').replace(/[\s:,_-]/g, '');
  if (!/^[0-9a-f]*$/i.test(s)) throw new InputError('Hex can only contain 0-9 and a-f.');
  if (s.length % 2) throw new InputError('Hex needs an even number of digits (two per byte).');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

export function toBase64(bytes, { url = false, pad = true } = {}) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  let s = btoa(bin);
  if (url) s = s.replace(/\+/g, '-').replace(/\//g, '_');
  if (!pad) s = s.replace(/=+$/, '');
  return s;
}

/** Decode standard or URL-safe base64, with or without padding; whitespace is ignored. */
export function fromBase64(text) {
  let s = String(text).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new InputError('Not valid base64: only A-Z, a-z, 0-9, + / (or - _) and trailing = are allowed.');
  s = s.replace(/=+$/, '');
  if (s.length % 4 === 1) throw new InputError('Not valid base64: the length is off by one character.');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const utf8 = s => new TextEncoder().encode(s);

/** UTF-8 decode, or null when the bytes aren't valid UTF-8. */
export function utf8OrNull(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
}

/** True when text looks like readable text (no control characters besides tab/newline). */
export const printable = s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f�]/.test(s);

/** Parse binary input as hex or base64; 'auto' picks hex when the text is all hex digits. */
export function parseBinary(text, mode = 'auto') {
  const t = String(text).trim();
  if (!t) throw new InputError('Paste some data.');
  if (mode === 'hex') return fromHex(t);
  if (mode === 'base64') return fromBase64(t);
  const compact = t.replace(/^0x/i, '').replace(/[\s:,_-]/g, '');
  if (/^[0-9a-f]+$/i.test(compact) && compact.length % 2 === 0) return fromHex(t);
  return fromBase64(t);
}
