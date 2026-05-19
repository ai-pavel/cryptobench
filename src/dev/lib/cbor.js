// CBOR (RFC 8949) decoder to an annotated tree, diagnostic notation, JSON view, and an encoder from JSON.
import { InputError } from './ui.js';
import { toHex, toBase64 } from './bytes.js';

export const TAG_NAMES = {
  0: 'date/time string', 1: 'epoch date/time', 2: 'unsigned bignum', 3: 'negative bignum', 4: 'decimal fraction', 5: 'bigfloat',
  16: 'COSE_Encrypt0', 17: 'COSE_Mac0', 18: 'COSE_Sign1', 19: 'COSE_Countersignature', 21: 'expected base64url', 22: 'expected base64',
  23: 'expected base16', 24: 'encoded CBOR data item', 32: 'URI', 33: 'base64url text', 34: 'base64 text', 35: 'regular expression',
  36: 'MIME message', 37: 'UUID', 61: 'CBOR Web Token (CWT)', 96: 'COSE_Encrypt', 97: 'COSE_Mac', 98: 'COSE_Sign',
  258: 'set', 259: 'map with object keys', 1001: 'extended time', 1004: 'full-date', 55799: 'self-described CBOR', 121: 'Plutus constructor 0',
};

class Reader {
  constructor(bytes) { this.b = bytes; this.i = 0; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  need(n) { if (this.i + n > this.b.length) throw new InputError(`Data ends early: needed ${n} more byte(s) at offset ${this.i}.`); }
  u8() { this.need(1); return this.b[this.i++]; }
  bytes(n) { this.need(n); const out = this.b.subarray(this.i, this.i + n); this.i += n; return out; }
}

function readArg(r, info) {
  if (info < 24) return BigInt(info);
  if (info === 24) return BigInt(r.u8());
  if (info === 25) { r.need(2); const v = r.view.getUint16(r.i); r.i += 2; return BigInt(v); }
  if (info === 26) { r.need(4); const v = r.view.getUint32(r.i); r.i += 4; return BigInt(v); }
  if (info === 27) { r.need(8); const v = r.view.getBigUint64(r.i); r.i += 8; return v; }
  throw new InputError(`Reserved additional info ${info} at offset ${r.i - 1}.`);
}
const num = (v, at) => { if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new InputError(`Length too large at offset ${at}.`); return Number(v); };

function half(bits) {
  const s = bits & 0x8000 ? -1 : 1, e = (bits >> 10) & 0x1f, f = bits & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

/** Decode one item. Node: { type, value, ... , start, end }. */
function item(r, depth = 0) {
  if (depth > 256) throw new InputError('Nesting is too deep.');
  const start = r.i;
  const ib = r.u8(), major = ib >> 5, info = ib & 31;
  if (info === 31) {
    if (major === 2 || major === 3) {
      const chunks = [];
      for (;;) {
        if (r.b[r.i] === 0xff) { r.i++; break; }
        const c = item(r, depth + 1);
        if (c.type !== (major === 2 ? 'bytes' : 'text')) throw new InputError(`Indefinite-length ${major === 2 ? 'byte' : 'text'} string contains a ${c.type} chunk at offset ${c.start}.`);
        chunks.push(c);
      }
      if (major === 2) { const all = new Uint8Array(chunks.reduce((n, c) => n + c.value.length, 0)); let o = 0; for (const c of chunks) { all.set(c.value, o); o += c.value.length; } return { type: 'bytes', value: all, indefinite: true, chunks, start, end: r.i }; }
      return { type: 'text', value: chunks.map(c => c.value).join(''), indefinite: true, chunks, start, end: r.i };
    }
    if (major === 4) { const items = []; while (r.b[r.i] !== 0xff) { r.need(1); items.push(item(r, depth + 1)); } r.i++; return { type: 'array', items, indefinite: true, start, end: r.i }; }
    if (major === 5) { const entries = []; while (r.b[r.i] !== 0xff) { r.need(1); entries.push([item(r, depth + 1), item(r, depth + 1)]); } r.i++; return { type: 'map', entries, indefinite: true, start, end: r.i }; }
    if (major === 7) throw new InputError(`Unexpected "break" (0xff) at offset ${start}.`);
    throw new InputError(`Indefinite length isn't allowed for major type ${major} (offset ${start}).`);
  }
  if (major === 7) {
    if (info < 20) return { type: 'simple', value: info, start, end: r.i };
    if (info === 20) return { type: 'bool', value: false, start, end: r.i };
    if (info === 21) return { type: 'bool', value: true, start, end: r.i };
    if (info === 22) return { type: 'null', value: null, start, end: r.i };
    if (info === 23) return { type: 'undefined', value: undefined, start, end: r.i };
    if (info === 24) { const v = r.u8(); return { type: 'simple', value: v, start, end: r.i }; }
    if (info === 25) { r.need(2); const v = half(r.view.getUint16(r.i)); r.i += 2; return { type: 'float', value: v, size: 16, start, end: r.i }; }
    if (info === 26) { r.need(4); const v = r.view.getFloat32(r.i); r.i += 4; return { type: 'float', value: v, size: 32, start, end: r.i }; }
    if (info === 27) { r.need(8); const v = r.view.getFloat64(r.i); r.i += 8; return { type: 'float', value: v, size: 64, start, end: r.i }; }
    throw new InputError(`Reserved simple value encoding at offset ${start}.`);
  }
  const arg = readArg(r, info);
  switch (major) {
    case 0: return { type: 'uint', value: arg, start, end: r.i };
    case 1: return { type: 'nint', value: -1n - arg, start, end: r.i };
    case 2: return { type: 'bytes', value: r.bytes(num(arg, start)), start, end: r.i };
    case 3: {
      const raw = r.bytes(num(arg, start));
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { throw new InputError(`Text string at offset ${start} isn't valid UTF-8.`); }
      return { type: 'text', value: text, start, end: r.i };
    }
    case 4: { const n = num(arg, start), items = []; for (let k = 0; k < n; k++) items.push(item(r, depth + 1)); return { type: 'array', items, start, end: r.i }; }
    case 5: { const n = num(arg, start), entries = []; for (let k = 0; k < n; k++) entries.push([item(r, depth + 1), item(r, depth + 1)]); return { type: 'map', entries, start, end: r.i }; }
    case 6: { const content = item(r, depth + 1); return { type: 'tag', tag: arg, content, start, end: r.i }; }
  }
}

/** Decode all top-level items (a CBOR sequence). */
export function decodeCbor(bytes) {
  const r = new Reader(bytes);
  const items = [];
  while (r.i < bytes.length) items.push(item(r));
  if (!items.length) throw new InputError('No data.');
  return items;
}

const jsonStr = s => JSON.stringify(s);
function floatDiag(v) {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'Infinity';
  if (v === -Infinity) return '-Infinity';
  if (Object.is(v, -0)) return '-0.0';
  const s = String(v);
  return /[.e]/.test(s) ? s : s + '.0';
}

/** RFC 8949 diagnostic notation. */
export function diag(n, indent = '') {
  const next = indent + '  ';
  switch (n.type) {
    case 'uint': case 'nint': return n.value.toString();
    case 'bytes': return n.indefinite ? `(_ ${n.chunks.map(c => diag(c)).join(', ')})` : `h'${toHex(n.value)}'`;
    case 'text': return n.indefinite ? `(_ ${n.chunks.map(c => diag(c)).join(', ')})` : jsonStr(n.value);
    case 'array': {
      if (!n.items.length) return n.indefinite ? '[_ ]' : '[]';
      const inner = n.items.map(i => diag(i, next));
      const simple = !inner.some(x => x.includes('\n')) && inner.join(', ').length <= 72;
      return simple ? `[${n.indefinite ? '_ ' : ''}${inner.join(', ')}]` : `[${n.indefinite ? '_' : ''}\n${inner.map(s => next + s).join(',\n')}\n${indent}]`;
    }
    case 'map': {
      if (!n.entries.length) return n.indefinite ? '{_ }' : '{}';
      return `{${n.indefinite ? '_' : ''}\n${n.entries.map(([k, v]) => `${next}${diag(k, next)}: ${diag(v, next)}`).join(',\n')}\n${indent}}`;
    }
    case 'tag': return `${n.tag}(${diag(n.content, indent)})`;
    case 'float': return floatDiag(n.value) + (n.size === 16 ? '_1' : n.size === 32 ? '_2' : '_3');
    case 'bool': return String(n.value);
    case 'null': return 'null';
    case 'undefined': return 'undefined';
    case 'simple': return `simple(${n.value})`;
  }
}

function bigFromBytes(bytes) { let v = 0n; for (const b of bytes) v = (v << 8n) | BigInt(b); return v; }

/** Lossy JSON view: bigints/bignums as strings when unsafe, bytes as hex strings, tags unwrapped (with notes). */
export function toJsonValue(n) {
  switch (n.type) {
    case 'uint': case 'nint': return n.value >= BigInt(Number.MIN_SAFE_INTEGER) && n.value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n.value) : n.value.toString();
    case 'bytes': return '0x' + toHex(n.value);
    case 'text': return n.value;
    case 'array': return n.items.map(toJsonValue);
    case 'map': {
      const o = {};
      for (const [k, v] of n.entries) {
        const key = k.type === 'text' ? k.value : k.type === 'bytes' ? '0x' + toHex(k.value) : JSON.stringify(toJsonValue(k));
        o[key] = toJsonValue(v);
      }
      return o;
    }
    case 'tag': {
      const t = Number(n.tag);
      if ((t === 2 || t === 3) && n.content.type === 'bytes') { const v = bigFromBytes(n.content.value); return (t === 2 ? v : -1n - v).toString(); }
      if (t === 1 && (n.content.type === 'uint' || n.content.type === 'nint' || n.content.type === 'float')) {
        const sec = Number(n.content.value); const d = new Date(sec * 1000); return isNaN(d) ? sec : d.toISOString();
      }
      return toJsonValue(n.content);
    }
    case 'float': return Number.isFinite(n.value) ? n.value : String(n.value);
    case 'bool': return n.value;
    case 'null': case 'undefined': return null;
    case 'simple': return `simple(${n.value})`;
  }
}

/** Notes about tags and embedded CBOR found anywhere in the tree. */
export function tagNotes(nodes) {
  const notes = [];
  const walk = n => {
    if (n.type === 'tag') {
      const t = Number(n.tag), name = TAG_NAMES[t] || (t >= 121 && t <= 127 ? `Plutus constructor ${t - 121}` : t >= 1280 && t <= 1400 ? `Plutus constructor ${t - 1280 + 7}` : 'unregistered tag');
      let extra = '';
      if ((t === 2 || t === 3) && n.content.type === 'bytes') { const v = bigFromBytes(n.content.value); extra = ` = ${(t === 2 ? v : -1n - v).toString()}`; }
      if (t === 1 && ['uint', 'nint', 'float'].includes(n.content.type)) { const d = new Date(Number(n.content.value) * 1000); if (!isNaN(d)) extra = ` = ${d.toISOString()}`; }
      if (t === 24 && n.content.type === 'bytes') { try { extra = ` = ${decodeCbor(n.content.value).map(x => diag(x)).join(', ')}`; } catch { extra = ' (content is not valid CBOR)'; } }
      notes.push(`Tag ${t} at offset ${n.start}: ${name}${extra}`);
      walk(n.content);
    }
    if (n.type === 'array') n.items.forEach(walk);
    if (n.type === 'map') n.entries.forEach(([k, v]) => { walk(k); walk(v); });
  };
  nodes.forEach(walk);
  return notes;
}

// ---------- Encoder (from JSON) ----------
function head(major, v, out) {
  v = BigInt(v);
  if (v < 24n) out.push((major << 5) | Number(v));
  else if (v < 0x100n) out.push((major << 5) | 24, Number(v));
  else if (v < 0x10000n) out.push((major << 5) | 25, Number(v >> 8n), Number(v & 0xffn));
  else if (v < 0x100000000n) { out.push((major << 5) | 26); for (let i = 3; i >= 0; i--) out.push(Number((v >> BigInt(i * 8)) & 0xffn)); }
  else { out.push((major << 5) | 27); for (let i = 7; i >= 0; i--) out.push(Number((v >> BigInt(i * 8)) & 0xffn)); }
}
function encodeFloat(v, out) {
  const f32 = new Float32Array([v]);
  if (f32[0] === v || Number.isNaN(v)) { const dv = new DataView(f32.buffer); out.push(0xfa, ...[3, 2, 1, 0].map(i => dv.getUint8(i))); }
  else { const dv = new DataView(new Float64Array([v]).buffer); out.push(0xfb, ...[7, 6, 5, 4, 3, 2, 1, 0].map(i => dv.getUint8(i))); }
}
function enc(v, out) {
  if (v === null) out.push(0xf6);
  else if (v === true) out.push(0xf5);
  else if (v === false) out.push(0xf4);
  else if (typeof v === 'number') {
    if (Number.isInteger(v) && Number.isSafeInteger(v)) { if (v >= 0) head(0, v, out); else head(1, -1 - v, out); }
    else encodeFloat(v, out);
  } else if (typeof v === 'string') { const b = new TextEncoder().encode(v); head(3, b.length, out); out.push(...b); }
  else if (Array.isArray(v)) { head(4, v.length, out); v.forEach(x => enc(x, out)); }
  else { const keys = Object.keys(v); head(5, keys.length, out); for (const k of keys) { enc(k, out); enc(v[k], out); } }
}
export function encodeJson(value) { const out = []; enc(value, out); return new Uint8Array(out); }
export { toBase64 };
