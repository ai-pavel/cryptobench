// Small CBOR codec (RFC 8949) for the Cardano tools.
// Decoding keeps map key order and records each item's byte span, because Cardano
// hashes exact bytes (transaction IDs, datum hashes). Encoding is canonical
// (shortest heads, definite lengths) unless a value asks for indefinite length.

export class Tag {
  constructor(tag, value) { this.tag = tag; this.value = value; }
}

// Ordered map; keys can be any decoded value, so lookups compare by encoded bytes.
export class CborMap {
  constructor(entries = []) { this.entries = entries; }
  get(key) {
    const k = keyId(key);
    for (const [ek, ev] of this.entries) if (keyId(ek) === k) return ev;
    return undefined;
  }
  has(key) { return this.get(key) !== undefined; }
  get size() { return this.entries.length; }
}

// Array or byte string that must be encoded with indefinite length (Plutus data).
export class Indefinite {
  constructor(items) { this.items = items; }
}

export class Simple {
  constructor(value) { this.value = value; }
}

function keyId(k) {
  return typeof k === 'bigint' || typeof k === 'number' ? 'n' + k : 'h' + toHex(encode(k));
}

export const toHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
export function fromHex(s) {
  s = s.trim().replace(/^0x/i, '').replace(/\s+/g, '');
  if (s.length % 2 || /[^0-9a-f]/i.test(s)) throw new Error('Not valid hex: use an even number of 0-9, a-f characters.');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const num = v => (v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v);

// Decode one item at `pos`. Returns [value, endPos]. `spans` (optional Map) receives
// value -> [start, end] for arrays, maps and byte strings so callers can hash raw bytes.
export function readItem(buf, pos = 0, spans) {
  const start = pos;
  if (pos >= buf.length) throw new Error('Unexpected end of CBOR data.');
  const ib = buf[pos++], major = ib >> 5, info = ib & 31;
  const readArg = () => {
    if (info < 24) return BigInt(info);
    const n = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
    if (!n) throw new Error(`Invalid CBOR additional info ${info} at byte ${start}.`);
    if (pos + n > buf.length) throw new Error('Unexpected end of CBOR data.');
    let v = 0n;
    for (let i = 0; i < n; i++) v = (v << 8n) | BigInt(buf[pos++]);
    return v;
  };
  let value;
  switch (major) {
    case 0: value = num(readArg()); break;
    case 1: value = num(-1n - readArg()); break;
    case 2: case 3: {
      let bytes;
      if (info === 31) {
        const chunks = [];
        while (buf[pos] !== 0xff) {
          if (pos >= buf.length) throw new Error('Unterminated indefinite-length string.');
          const [c, p] = readItem(buf, pos); chunks.push(major === 2 ? c : new TextEncoder().encode(c)); pos = p;
        }
        pos++;
        bytes = concat(chunks);
      } else {
        const len = Number(readArg());
        if (pos + len > buf.length) throw new Error('Unexpected end of CBOR data.');
        bytes = buf.slice(pos, pos + len); pos += len;
      }
      value = major === 2 ? bytes : new TextDecoder().decode(bytes);
      break;
    }
    case 4: {
      value = [];
      if (info === 31) {
        while (buf[pos] !== 0xff) { const [v, p] = readItem(buf, pos, spans); value.push(v); pos = p; if (pos >= buf.length) throw new Error('Unterminated indefinite-length array.'); }
        pos++; value.indefinite = true;
      } else {
        const len = Number(readArg());
        for (let i = 0; i < len; i++) { const [v, p] = readItem(buf, pos, spans); value.push(v); pos = p; }
      }
      break;
    }
    case 5: {
      const entries = [];
      const one = () => { const [k, p1] = readItem(buf, pos, spans); const [v, p2] = readItem(buf, p1, spans); entries.push([k, v]); pos = p2; };
      if (info === 31) { while (buf[pos] !== 0xff) { one(); if (pos >= buf.length) throw new Error('Unterminated indefinite-length map.'); } pos++; }
      else { const len = Number(readArg()); for (let i = 0; i < len; i++) one(); }
      value = new CborMap(entries);
      break;
    }
    case 6: {
      const tag = Number(readArg());
      const [v, p] = readItem(buf, pos, spans); pos = p;
      if (tag === 2 || tag === 3) {
        if (!(v instanceof Uint8Array)) throw new Error('Bignum tag must wrap a byte string.');
        let n = 0n; for (const b of v) n = (n << 8n) | BigInt(b);
        value = tag === 2 ? n : -1n - n;
      } else value = new Tag(tag, v);
      break;
    }
    case 7: {
      if (info === 20) value = false;
      else if (info === 21) value = true;
      else if (info === 22) value = null;
      else if (info === 23) value = undefined;
      else if (info === 25) { const dv = new DataView(buf.buffer, buf.byteOffset + pos, 2); pos += 2; value = halfToFloat(dv.getUint16(0)); }
      else if (info === 26) { value = new DataView(buf.buffer, buf.byteOffset + pos, 4).getFloat32(0); pos += 4; }
      else if (info === 27) { value = new DataView(buf.buffer, buf.byteOffset + pos, 8).getFloat64(0); pos += 8; }
      else if (info < 24) value = new Simple(info);
      else if (info === 24) value = new Simple(buf[pos++]);
      else throw new Error(`Unexpected CBOR break or simple value at byte ${start}.`);
      break;
    }
  }
  if (spans && value !== null && typeof value === 'object') spans.set(value, [start, pos]);
  return [value, pos];
}

export function decode(bytes, { allowTrailing = false } = {}) {
  const [v, end] = readItem(bytes, 0);
  if (!allowTrailing && end !== bytes.length) throw new Error(`Extra ${bytes.length - end} bytes after the CBOR item.`);
  return v;
}

function halfToFloat(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

export function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function head(major, n) {
  n = BigInt(n);
  const m = major << 5;
  if (n < 24n) return Uint8Array.of(m | Number(n));
  if (n < 0x100n) return Uint8Array.of(m | 24, Number(n));
  if (n < 0x10000n) return Uint8Array.of(m | 25, Number(n >> 8n), Number(n & 0xffn));
  if (n < 0x100000000n) return Uint8Array.of(m | 26, ...[24n, 16n, 8n, 0n].map(s => Number((n >> s) & 0xffn)));
  return Uint8Array.of(m | 27, ...[56n, 48n, 40n, 32n, 24n, 16n, 8n, 0n].map(s => Number((n >> s) & 0xffn)));
}

function bigToBytes(n) {
  let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex;
  return fromHex(hex);
}

export function encode(v) {
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error('Only integers can be encoded.');
    v = BigInt(v);
  }
  if (typeof v === 'bigint') {
    if (v >= 0n) return v < 2n ** 64n ? head(0, v) : concat([head(6, 2), encode(bigToBytes(v))]);
    const m = -1n - v;
    return m < 2n ** 64n ? head(1, m) : concat([head(6, 3), encode(bigToBytes(m))]);
  }
  if (v instanceof Uint8Array) return concat([head(2, v.length), v]);
  if (typeof v === 'string') { const b = new TextEncoder().encode(v); return concat([head(3, b.length), b]); }
  if (v instanceof Indefinite) {
    if (v.items instanceof Uint8Array) {
      const chunks = []; for (let i = 0; i < v.items.length; i += 64) chunks.push(encode(v.items.slice(i, i + 64)));
      return concat([Uint8Array.of(0x5f), ...chunks, Uint8Array.of(0xff)]);
    }
    return concat([Uint8Array.of(0x9f), ...v.items.map(encode), Uint8Array.of(0xff)]);
  }
  if (Array.isArray(v)) return concat([head(4, v.length), ...v.map(encode)]);
  if (v instanceof CborMap) return concat([head(5, v.entries.length), ...v.entries.flatMap(([k, x]) => [encode(k), encode(x)])]);
  if (v instanceof Map) return encode(new CborMap([...v.entries()]));
  if (v instanceof Tag) return concat([head(6, v.tag), encode(v.value)]);
  if (v === false) return Uint8Array.of(0xf4);
  if (v === true) return Uint8Array.of(0xf5);
  if (v === null) return Uint8Array.of(0xf6);
  if (v === undefined) return Uint8Array.of(0xf7);
  if (v instanceof Simple) return v.value < 24 ? Uint8Array.of(0xe0 | v.value) : Uint8Array.of(0xf8, v.value);
  throw new Error('Cannot encode this value as CBOR.');
}

// Readable diagnostic-style JSON for display. Bytes become "0x…" hex strings.
export function toJSONish(v) {
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return '0x' + toHex(v);
  if (Array.isArray(v)) return v.map(toJSONish);
  if (v instanceof CborMap) {
    const simpleKeys = v.entries.every(([k]) => typeof k === 'number' || typeof k === 'string' || typeof k === 'bigint');
    if (simpleKeys) return Object.fromEntries(v.entries.map(([k, x]) => [String(k), toJSONish(x)]));
    return v.entries.map(([k, x]) => ({ key: toJSONish(k), value: toJSONish(x) }));
  }
  if (v instanceof Tag) return { tag: v.tag, value: toJSONish(v.value) };
  if (v instanceof Simple) return `simple(${v.value})`;
  return v;
}

export const pretty = v => JSON.stringify(toJSONish(v), null, 2);
