// Shared EVM helpers: hex, RLP, ABI, EIP-55, EIP-191, EIP-712, transaction decoding.
// Primitives (Keccak-256, secp256k1) come from audited @noble libraries.
import { keccak_256 } from '../../assets/vendor/@noble/hashes@1.8.0/sha3.esm.js';
import { secp256k1 } from '../../assets/vendor/@noble/curves@1.9.7/secp256k1.esm.js';

export { keccak_256, secp256k1 };

/** An error caused by user input; its message is shown to the user as-is. */
export class InputError extends Error {}

const encoder = new TextEncoder();
export const utf8 = s => encoder.encode(s);
export const utf8Decode = b => new TextDecoder('utf-8', { fatal: false }).decode(b);

// ---------- Hex and bytes ----------

export const strip0x = s => (s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s);

export function hexToBytes(input, what = 'Hex') {
  const h = strip0x(String(input).trim().replace(/\s+/g, ''));
  if (!/^[0-9a-fA-F]*$/.test(h)) throw new InputError(`${what} contains non-hex characters`);
  if (h.length % 2) throw new InputError(`${what} has an odd number of hex digits`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

export const bytesToHex = b => '0x' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

export function concat(...arrays) {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

export const keccak = bytes => keccak_256(bytes);
export const keccakHex = bytes => bytesToHex(keccak_256(bytes));

export const bytesToBigInt = b => (b.length ? BigInt(bytesToHex(b)) : 0n);

/** Big-endian bytes of n: minimal (0 → empty) unless a fixed length is given. */
export function bigIntToBytes(n, len) {
  if (n < 0n) throw new InputError('Negative numbers are not allowed here');
  let h = n === 0n ? '' : n.toString(16);
  if (h.length % 2) h = '0' + h;
  if (len !== undefined) {
    if (h.length > len * 2) throw new InputError(`Value does not fit in ${len} bytes`);
    h = h.padStart(len * 2, '0');
  }
  return hexToBytes(h);
}

/** Parse a decimal or 0x-hex integer string (or a safe JS integer / bigint). */
export function parseBigInt(v, what = 'Number') {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) throw new InputError(`${what}: ${v} is not a safe integer; pass it as a string`);
    return BigInt(v);
  }
  const s = String(v).trim().replace(/_/g, '');
  if (/^-?0x[0-9a-f]+$/i.test(s)) return s.startsWith('-') ? -BigInt(s.slice(1)) : BigInt(s);
  if (/^-?\d+$/.test(s)) return BigInt(s);
  throw new InputError(`${what} must be a decimal or 0x-prefixed hex integer`);
}

// ---------- Units ----------

export const UNITS = [
  ['wei', 0], ['kwei', 3], ['mwei', 6], ['gwei', 9], ['szabo', 12], ['finney', 15], ['ether', 18],
];

/** Exact decimal string → integer in the smallest unit. */
export function parseUnits(s, decimals, what = 'Amount') {
  s = String(s).trim().replace(/[_,\s]/g, '');
  if (s === '') throw new InputError(`${what} is empty`);
  const m = s.match(/^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!m || (m[1] === '' && !m[2])) throw new InputError(`${what} must be a non-negative decimal number`);
  let int = m[1] || '0', frac = m[2] || '';
  let shift = decimals + (m[3] ? parseInt(m[3], 10) : 0);
  if (shift < 0) {
    // move the decimal point left
    const all = int.padStart(-shift + 1, '0');
    frac = all.slice(all.length + shift) + frac;
    int = all.slice(0, all.length + shift);
    shift = 0;
  }
  if (frac.length > shift) {
    if (/[^0]/.test(frac.slice(shift))) throw new InputError(`${what} has more decimal places than the unit allows`);
    frac = frac.slice(0, shift);
  }
  return BigInt(int + frac.padEnd(shift, '0'));
}

/** Integer in the smallest unit → exact decimal string without trailing zeros. */
export function formatUnits(n, decimals) {
  const neg = n < 0n;
  let s = (neg ? -n : n).toString().padStart(decimals + 1, '0');
  let int = s.slice(0, s.length - decimals), frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return (neg ? '-' : '') + int + (frac ? '.' + frac : '');
}

// ---------- Addresses and keys ----------

export function toChecksumAddress(addr) {
  const a = strip0x(String(addr).trim()).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(a)) throw new InputError('An address is 20 bytes (40 hex characters)');
  const h = keccak_256(utf8(a));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    const nibble = (h[i >> 1] >> (i % 2 ? 0 : 4)) & 0xf;
    out += nibble >= 8 ? a[i].toUpperCase() : a[i];
  }
  return out;
}

/** Validate an address; mixed-case input must have a correct EIP-55 checksum. */
export function parseAddress(s, what = 'Address') {
  const a = String(s).trim();
  if (!/^(0x)?[0-9a-fA-F]{40}$/.test(a)) throw new InputError(`${what} must be 20 bytes (40 hex characters)`);
  const body = strip0x(a), cs = toChecksumAddress(a);
  const mixed = body !== body.toLowerCase() && body !== body.toUpperCase();
  if (mixed && '0x' + body !== cs) throw new InputError(`${what} has an invalid EIP-55 checksum (expected ${cs})`);
  return cs;
}

export function parsePrivateKey(s) {
  const b = hexToBytes(s, 'Private key');
  if (b.length !== 32) throw new InputError('Private key must be 32 bytes (64 hex characters)');
  if (!secp256k1.utils.isValidPrivateKey(b)) throw new InputError('Private key is out of range for secp256k1');
  return b;
}

/** Accepts 33-byte compressed, 65-byte uncompressed or 64-byte raw (x‖y) public keys. */
export function parsePublicKey(bytes) {
  if (bytes.length === 64) bytes = concat(Uint8Array.of(4), bytes);
  try {
    return secp256k1.ProjectivePoint.fromHex(bytes);
  } catch {
    throw new InputError('Not a valid secp256k1 public key');
  }
}

export function addressFromPoint(point) {
  const raw = point.toRawBytes(false);
  return toChecksumAddress(bytesToHex(keccak_256(raw.slice(1)).slice(12)));
}

export const addressFromPrivateKey = priv => addressFromPoint(secp256k1.ProjectivePoint.fromPrivateKey(priv));

// ---------- Signatures ----------

/** Sign a 32-byte hash; returns {r, s, v (27/28), yParity, bytes (65)}. */
export function signHash(hash, priv) {
  const sig = secp256k1.sign(hash, priv, { lowS: true });
  const r = bigIntToBytes(sig.r, 32), s = bigIntToBytes(sig.s, 32);
  const v = 27 + sig.recovery;
  return { r, s, v, yParity: sig.recovery, bytes: concat(r, s, Uint8Array.of(v)) };
}

/** Parse a 65-byte (r‖s‖v) or 64-byte EIP-2098 compact signature. */
export function parseEcdsaSignature(input) {
  const b = hexToBytes(input, 'Signature');
  let r, s, rec;
  if (b.length === 65) {
    r = b.slice(0, 32); s = b.slice(32, 64);
    const v = b[64];
    if (v === 27 || v === 28) rec = v - 27;
    else if (v === 0 || v === 1) rec = v;
    else throw new InputError(`Signature v must be 27, 28, 0 or 1 (got ${v})`);
  } else if (b.length === 64) {
    r = b.slice(0, 32);
    const vs = b.slice(32, 64).slice();
    rec = vs[0] >> 7;
    vs[0] &= 0x7f;
    s = vs;
  } else throw new InputError('Signature must be 65 bytes (r‖s‖v) or 64 bytes (EIP-2098)');
  return { r: bytesToBigInt(r), s: bytesToBigInt(s), recovery: rec };
}

export function recoverAddress(hash, { r, s, recovery }) {
  try {
    const sig = new secp256k1.Signature(r, s).addRecoveryBit(recovery);
    return addressFromPoint(sig.recoverPublicKey(hash));
  } catch {
    throw new InputError('Could not recover a public key from this signature');
  }
}

export function personalMessageHash(msgBytes) {
  return keccak_256(concat(utf8(`\x19Ethereum Signed Message:\n${msgBytes.length}`), msgBytes));
}

// ---------- RLP ----------

function rlpLength(len, offset) {
  if (len < 56) return Uint8Array.of(offset + len);
  const lb = bigIntToBytes(BigInt(len));
  return concat(Uint8Array.of(offset + 55 + lb.length), lb);
}

/** item: Uint8Array or (nested) array of items. */
export function rlpEncode(item) {
  if (item instanceof Uint8Array) {
    if (item.length === 1 && item[0] < 0x80) return item;
    return concat(rlpLength(item.length, 0x80), item);
  }
  if (Array.isArray(item)) {
    const body = concat(...item.map(rlpEncode));
    return concat(rlpLength(body.length, 0xc0), body);
  }
  throw new InputError('RLP items must be byte strings or lists');
}

function need(b, pos, len) {
  if (pos + len > b.length) throw new InputError('RLP data ended unexpectedly');
}

function readLength(b, pos, n) {
  need(b, pos, n);
  if (b[pos] === 0) throw new InputError('Non-canonical RLP: length has leading zeros');
  let len = 0;
  for (let i = 0; i < n; i++) len = len * 256 + b[pos + i];
  if (len < 56) throw new InputError('Non-canonical RLP: long form used for a short length');
  return len;
}

function rlpItem(b, pos) {
  need(b, pos, 1);
  const p = b[pos];
  if (p < 0x80) return [b.slice(pos, pos + 1), pos + 1];
  if (p <= 0xb7) {
    const len = p - 0x80;
    need(b, pos + 1, len);
    const v = b.slice(pos + 1, pos + 1 + len);
    if (len === 1 && v[0] < 0x80) throw new InputError('Non-canonical RLP: a single byte below 0x80 must not have a prefix');
    return [v, pos + 1 + len];
  }
  if (p <= 0xbf) {
    const n = p - 0xb7, len = readLength(b, pos + 1, n), start = pos + 1 + n;
    need(b, start, len);
    return [b.slice(start, start + len), start + len];
  }
  if (p <= 0xf7) return rlpList(b, pos + 1, p - 0xc0);
  const n = p - 0xf7;
  return rlpList(b, pos + 1 + n, readLength(b, pos + 1, n));
}

function rlpList(b, start, len) {
  need(b, start, len);
  const end = start + len, view = b.subarray(0, end), out = [];
  let pos = start;
  while (pos < end) {
    const [item, next] = rlpItem(view, pos);
    out.push(item);
    pos = next;
  }
  return [out, end];
}

export function rlpDecode(bytes) {
  if (!bytes.length) throw new InputError('RLP data is empty');
  const [item, end] = rlpItem(bytes, 0);
  if (end !== bytes.length) throw new InputError(`RLP has ${bytes.length - end} trailing bytes`);
  return item;
}

// ---------- ABI types ----------

/** Split on commas that are not inside parentheses or brackets. */
export function splitTop(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth < 0) throw new InputError('Unbalanced parentheses');
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (depth !== 0) throw new InputError('Unbalanced parentheses');
  if (cur.trim() || out.length) out.push(cur);
  return out.map(x => x.trim()).map(x => {
    if (!x) throw new InputError('Empty parameter in list');
    return x;
  });
}

function matchingParen(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return i;
  }
  throw new InputError('Missing closing parenthesis');
}

const ALIASES = { uint: 'uint256', int: 'int256', byte: 'bytes1' };

export function parseType(t) {
  t = t.trim();
  const arr = t.match(/^(.*)\[(\d*)\]$/s);
  if (arr) {
    const length = arr[2] === '' ? null : Number(arr[2]);
    if (length === 0) throw new InputError('Fixed-size arrays must have at least one element');
    return { kind: 'array', base: parseType(arr[1]), length };
  }
  if (t.startsWith('tuple(')) t = t.slice(5);
  if (t.startsWith('(')) {
    if (matchingParen(t, 0) !== t.length - 1) throw new InputError(`Unexpected text after tuple in "${t}"`);
    return { kind: 'tuple', components: splitTop(t.slice(1, -1)).map(parseParam) };
  }
  t = ALIASES[t] || t;
  let m;
  if ((m = t.match(/^(u?)int(\d+)$/))) {
    const bits = Number(m[2]);
    if (bits < 8 || bits > 256 || bits % 8) throw new InputError(`Invalid integer size in "${t}"`);
    return { kind: m[1] ? 'uint' : 'int', bits };
  }
  if ((m = t.match(/^bytes(\d+)$/))) {
    const size = Number(m[1]);
    if (size < 1 || size > 32) throw new InputError(`Invalid fixed bytes size in "${t}"`);
    return { kind: 'fixedbytes', size };
  }
  if (['address', 'bool', 'string', 'bytes'].includes(t)) return { kind: t };
  if (t === 'function') return { kind: 'fixedbytes', size: 24 };
  throw new InputError(`Unsupported or unknown type "${t}"`);
}

/** "address indexed from", "(uint a, bool b)[] memory list" → {type, name, indexed} */
export function parseParam(s) {
  s = s.trim();
  let typeStr, rest;
  const tupleStart = s.startsWith('tuple(') ? 5 : s.startsWith('(') ? 0 : -1;
  if (tupleStart >= 0) {
    let end = matchingParen(s, tupleStart) + 1;
    while (s[end] === '[') {
      const close = s.indexOf(']', end);
      if (close < 0) throw new InputError('Missing ]');
      end = close + 1;
    }
    typeStr = s.slice(0, end);
    rest = s.slice(end).trim().split(/\s+/).filter(Boolean);
  } else {
    const words = s.split(/\s+/);
    typeStr = words[0];
    rest = words.slice(1);
  }
  const mods = ['memory', 'calldata', 'storage', 'indexed', 'payable'];
  const indexed = rest.includes('indexed');
  const names = rest.filter(w => !mods.includes(w));
  if (names.length > 1) throw new InputError(`Can't parse parameter "${s}"`);
  if (names[0] && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(names[0])) throw new InputError(`Invalid parameter name "${names[0]}"`);
  return { type: parseType(typeStr), name: names[0] || '', indexed };
}

export function typeToString(t) {
  switch (t.kind) {
    case 'uint': case 'int': return t.kind + t.bits;
    case 'fixedbytes': return 'bytes' + t.size;
    case 'array': return typeToString(t.base) + '[' + (t.length ?? '') + ']';
    case 'tuple': return '(' + t.components.map(c => typeToString(c.type)).join(',') + ')';
    default: return t.kind;
  }
}

/**
 * Parse "transfer(address to, uint256 amount)", a Solidity declaration
 * ("function transfer(address to, uint amount) external returns (bool);"),
 * an event/error declaration, or a bare parameter list "(address,uint256)".
 */
export function parseSignature(input) {
  let s = String(input).trim().replace(/;\s*$/, '');
  const kindMatch = s.match(/^(function|event|error|constructor)\b\s*/);
  const kind = kindMatch ? kindMatch[1] : null;
  if (kindMatch) s = s.slice(kindMatch[0].length);
  const open = s.indexOf('(');
  if (open < 0) throw new InputError('Expected a signature like transfer(address,uint256)');
  const name = s.slice(0, open).trim();
  if (name && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) throw new InputError(`Invalid name "${name}"`);
  const close = matchingParen(s, open);
  const inputs = splitTop(s.slice(open + 1, close)).map(parseParam);
  const tail = s.slice(close + 1);
  let outputs = [];
  const ret = tail.match(/\breturns\s*\(/);
  if (ret) {
    const o = tail.indexOf('(', ret.index);
    outputs = splitTop(tail.slice(o + 1, matchingParen(tail, o))).map(parseParam);
  }
  const canonical = `${name}(${inputs.map(p => typeToString(p.type)).join(',')})`;
  return { kind, name, inputs, outputs, canonical };
}

export function selectorOf(canonical) {
  return bytesToHex(keccak_256(utf8(canonical)).slice(0, 4));
}

/** Convert a JSON ABI parameter ({type, name, components}) into a parsed param. */
export function abiJsonParam(p) {
  if (!p || typeof p.type !== 'string') throw new InputError('ABI parameter is missing "type"');
  let type;
  if (p.type.startsWith('tuple')) {
    const suffix = p.type.slice(5);
    type = { kind: 'tuple', components: (p.components || []).map(abiJsonParam) };
    for (const m of suffix.matchAll(/\[(\d*)\]/g)) type = { kind: 'array', base: type, length: m[1] === '' ? null : Number(m[1]) };
  } else type = parseType(p.type);
  return { type, name: p.name || '', indexed: !!p.indexed };
}

// ---------- ABI encoding ----------

const WORD = 32;

function isDynamic(t) {
  if (t.kind === 'string' || t.kind === 'bytes') return true;
  if (t.kind === 'array') return t.length === null || isDynamic(t.base);
  if (t.kind === 'tuple') return t.components.some(c => isDynamic(c.type));
  return false;
}

function headSize(t) {
  if (isDynamic(t)) return WORD;
  if (t.kind === 'array') return t.length * headSize(t.base);
  if (t.kind === 'tuple') return t.components.reduce((n, c) => n + headSize(c.type), 0);
  return WORD;
}

const padRight = b => concat(b, new Uint8Array((WORD - (b.length % WORD)) % WORD));
const uintWord = n => bigIntToBytes(n, WORD);

function parseBool(v, path) {
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  if (v === false || v === 'false' || v === 0 || v === '0') return false;
  throw new InputError(`${path}: expected true or false`);
}

function encodeValue(t, v, path) {
  switch (t.kind) {
    case 'uint': {
      const n = parseBigInt(v, path);
      if (n < 0n || n >= 1n << BigInt(t.bits)) throw new InputError(`${path}: out of range for uint${t.bits}`);
      return uintWord(n);
    }
    case 'int': {
      const n = parseBigInt(v, path), lim = 1n << BigInt(t.bits - 1);
      if (n < -lim || n >= lim) throw new InputError(`${path}: out of range for int${t.bits}`);
      return uintWord(n < 0n ? (1n << 256n) + n : n);
    }
    case 'address': return concat(new Uint8Array(12), hexToBytes(parseAddress(String(v), path)));
    case 'bool': return uintWord(parseBool(v, path) ? 1n : 0n);
    case 'fixedbytes': {
      const b = hexToBytes(v, path);
      if (b.length !== t.size) throw new InputError(`${path}: bytes${t.size} needs exactly ${t.size} bytes, got ${b.length}`);
      return padRight(b);
    }
    case 'bytes': case 'string': {
      const b = t.kind === 'bytes' ? hexToBytes(v, path) : utf8(String(v));
      return concat(uintWord(BigInt(b.length)), padRight(b));
    }
    case 'array': {
      if (!Array.isArray(v)) throw new InputError(`${path}: expected an array`);
      if (t.length !== null && v.length !== t.length) throw new InputError(`${path}: expected ${t.length} items, got ${v.length}`);
      const body = encodeTuple(v.map(() => t.base), v, path);
      return t.length === null ? concat(uintWord(BigInt(v.length)), body) : body;
    }
    case 'tuple': {
      let vals = v;
      if (vals && !Array.isArray(vals) && typeof vals === 'object') vals = t.components.map(c => vals[c.name]);
      if (!Array.isArray(vals)) throw new InputError(`${path}: expected a tuple as an array`);
      if (vals.length !== t.components.length) throw new InputError(`${path}: expected ${t.components.length} values, got ${vals.length}`);
      return encodeTuple(t.components.map(c => c.type), vals, path, t.components.map(c => c.name));
    }
  }
  throw new InputError(`${path}: unsupported type`);
}

function encodeTuple(types, values, path = 'value', names = []) {
  const heads = [], tails = [];
  let offset = types.reduce((n, t) => n + headSize(t), 0);
  types.forEach((t, i) => {
    const p = `${path}${path ? '.' : ''}${names[i] || i}`;
    const enc = encodeValue(t, values[i], p);
    if (isDynamic(t)) {
      heads.push(uintWord(BigInt(offset)));
      tails.push(enc);
      offset += enc.length;
    } else heads.push(enc);
  });
  return concat(...heads, ...tails);
}

/** params: parsed params; values: one per param. */
export function abiEncode(params, values) {
  if (values.length !== params.length) throw new InputError(`Expected ${params.length} values, got ${values.length}`);
  return encodeTuple(params.map(p => p.type), values, '', params.map(p => p.name));
}

// ---------- ABI decoding ----------

function word(data, pos) {
  if (pos < 0 || pos + WORD > data.length) throw new InputError('Data is too short for the given types');
  return data.subarray(pos, pos + WORD);
}

function readOffset(data, pos) {
  const n = bytesToBigInt(word(data, pos));
  if (n > BigInt(data.length)) throw new InputError('An offset or length points outside the data');
  return Number(n);
}

function decodeValue(t, data, pos) {
  switch (t.kind) {
    case 'uint': {
      const n = bytesToBigInt(word(data, pos));
      if (n >= 1n << BigInt(t.bits)) throw new InputError(`Value out of range for uint${t.bits}`);
      return n;
    }
    case 'int': {
      let n = bytesToBigInt(word(data, pos));
      if (n >= 1n << 255n) n -= 1n << 256n;
      const lim = 1n << BigInt(t.bits - 1);
      if (n < -lim || n >= lim) throw new InputError(`Value out of range for int${t.bits}`);
      return n;
    }
    case 'address': {
      const w = word(data, pos);
      if (w.subarray(0, 12).some(x => x)) throw new InputError('Address has non-zero padding');
      return toChecksumAddress(bytesToHex(w.subarray(12)));
    }
    case 'bool': {
      const n = bytesToBigInt(word(data, pos));
      if (n > 1n) throw new InputError('Bool must be 0 or 1');
      return n === 1n;
    }
    case 'fixedbytes': return bytesToHex(word(data, pos).subarray(0, t.size));
    case 'bytes': case 'string': {
      const len = readOffset(data, pos);
      if (pos + WORD + len > data.length) throw new InputError('Data is too short for the given types');
      const b = data.subarray(pos + WORD, pos + WORD + len);
      return t.kind === 'bytes' ? bytesToHex(b) : utf8Decode(b);
    }
    case 'array': {
      let n = t.length, start = pos;
      if (n === null) { n = readOffset(data, pos); start = pos + WORD; }
      if (n * headSize(t.base) > data.length - start) throw new InputError('Array length is larger than the data');
      return decodeTuple(Array(n).fill(t.base), data, start);
    }
    case 'tuple': return decodeTuple(t.components.map(c => c.type), data, pos);
  }
}

function decodeTuple(types, data, base) {
  const out = [];
  let pos = base;
  for (const t of types) {
    out.push(isDynamic(t) ? decodeValue(t, data, base + readOffset(data, pos)) : decodeValue(t, data, pos));
    pos += headSize(t);
  }
  return out;
}

export function abiDecode(params, data) {
  return decodeTuple(params.map(p => p.type), data, 0);
}

/** Decoded values → JSON-friendly (bigint → decimal string). */
export function toPlain(v) {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(toPlain);
  return v;
}

// ---------- Common function signatures ----------

export const COMMON_SIGNATURES = [
  'transfer(address,uint256)', 'transferFrom(address,address,uint256)', 'approve(address,uint256)',
  'balanceOf(address)', 'allowance(address,address)', 'totalSupply()', 'decimals()', 'symbol()', 'name()',
  'safeTransferFrom(address,address,uint256)', 'safeTransferFrom(address,address,uint256,bytes)',
  'setApprovalForAll(address,bool)', 'ownerOf(uint256)', 'deposit()', 'withdraw(uint256)',
  'multicall(bytes[])', 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
];

// ---------- EIP-712 ----------

const baseType = t => t.replace(/\[\d*\]$/, '');

function findDependencies(types, primary, found = new Set()) {
  const name = baseType(primary);
  if (found.has(name) || !types[name]) return found;
  found.add(name);
  for (const f of types[name]) findDependencies(types, baseType(f.type), found);
  return found;
}

export function encodeType(types, primary) {
  const deps = [...findDependencies(types, primary)].filter(d => d !== primary).sort();
  return [primary, ...deps].map(n => {
    if (!Array.isArray(types[n])) throw new InputError(`Type "${n}" is not defined`);
    return `${n}(${types[n].map(f => `${f.type} ${f.name}`).join(',')})`;
  }).join('');
}

export const typeHash = (types, primary) => keccak_256(utf8(encodeType(types, primary)));

function encodeField(types, type, value, path) {
  if (value === undefined || value === null) throw new InputError(`Missing value for ${path}`);
  if (types[type]) return hashStruct(types, type, value, path);
  const arr = type.match(/^(.*)\[(\d*)\]$/);
  if (arr) {
    if (!Array.isArray(value)) throw new InputError(`${path}: expected an array`);
    if (arr[2] !== '' && value.length !== Number(arr[2])) throw new InputError(`${path}: expected ${arr[2]} items`);
    return keccak_256(concat(...value.map((v, i) => encodeField(types, arr[1], v, `${path}[${i}]`))));
  }
  if (type === 'string') return keccak_256(utf8(String(value)));
  if (type === 'bytes') return keccak_256(hexToBytes(value, path));
  return encodeValue(parseType(type), value, path);
}

export function hashStruct(types, primary, data, path = primary) {
  if (!types[primary]) throw new InputError(`Type "${primary}" is not defined`);
  if (typeof data !== 'object' || Array.isArray(data)) throw new InputError(`${path}: expected an object`);
  return keccak_256(concat(typeHash(types, primary),
    ...types[primary].map(f => encodeField(types, f.type, data[f.name], `${path}.${f.name}`))));
}

const DOMAIN_FIELDS = [
  ['name', 'string'], ['version', 'string'], ['chainId', 'uint256'], ['verifyingContract', 'address'], ['salt', 'bytes32'],
];

/** Hash eth_signTypedData_v4 JSON: returns domain separator, struct hash, digest. */
export function hashTypedData(td) {
  if (!td || typeof td !== 'object') throw new InputError('Typed data must be a JSON object');
  const { domain = {}, primaryType, message } = td;
  const types = { ...(td.types || {}) };
  if (!types.EIP712Domain) types.EIP712Domain = DOMAIN_FIELDS.filter(([n]) => domain[n] !== undefined).map(([name, type]) => ({ name, type }));
  if (!primaryType) throw new InputError('"primaryType" is missing');
  const domainSeparator = hashStruct(types, 'EIP712Domain', domain, 'domain');
  const structHash = primaryType === 'EIP712Domain' ? null : hashStruct(types, primaryType, message, 'message');
  const digest = keccak_256(concat(Uint8Array.of(0x19, 0x01), domainSeparator, structHash || new Uint8Array()));
  return { domainSeparator, structHash, digest, encodedType: primaryType === 'EIP712Domain' ? null : encodeType(types, primaryType) };
}

// ---------- Transactions ----------

const TX_TYPES = {
  0: { name: 'Legacy' },
  1: { name: 'EIP-2930 (access list)', fields: ['chainId', 'nonce', 'gasPrice', 'gasLimit', 'to', 'value', 'data', 'accessList'] },
  2: { name: 'EIP-1559 (dynamic fee)', fields: ['chainId', 'nonce', 'maxPriorityFeePerGas', 'maxFeePerGas', 'gasLimit', 'to', 'value', 'data', 'accessList'] },
  3: { name: 'EIP-4844 (blob)', fields: ['chainId', 'nonce', 'maxPriorityFeePerGas', 'maxFeePerGas', 'gasLimit', 'to', 'value', 'data', 'accessList', 'maxFeePerBlobGas', 'blobVersionedHashes'] },
  4: { name: 'EIP-7702 (set code)', fields: ['chainId', 'nonce', 'maxPriorityFeePerGas', 'maxFeePerGas', 'gasLimit', 'to', 'value', 'data', 'accessList', 'authorizationList'] },
};

const expectBytes = (v, name) => {
  if (!(v instanceof Uint8Array)) throw new InputError(`Field "${name}" should be a byte string, not a list`);
  return v;
};
const expectList = (v, name) => {
  if (!Array.isArray(v)) throw new InputError(`Field "${name}" should be a list`);
  return v;
};

function convertField(name, v) {
  switch (name) {
    case 'to': {
      const b = expectBytes(v, name);
      if (b.length === 0) return null;
      if (b.length !== 20) throw new InputError('"to" must be empty or 20 bytes');
      return toChecksumAddress(bytesToHex(b));
    }
    case 'data': return bytesToHex(expectBytes(v, name));
    case 'accessList':
      return expectList(v, name).map(e => {
        const [addr, keys] = expectList(e, 'accessList entry');
        return { address: toChecksumAddress(bytesToHex(expectBytes(addr, 'address'))), storageKeys: expectList(keys, 'storageKeys').map(k => bytesToHex(k)) };
      });
    case 'blobVersionedHashes': return expectList(v, name).map(h => bytesToHex(expectBytes(h, name)));
    case 'authorizationList':
      return expectList(v, name).map(a => {
        const [chainId, address, nonce, yParity, r, s] = expectList(a, 'authorization');
        return { chainId: bytesToBigInt(chainId), address: toChecksumAddress(bytesToHex(address)), nonce: bytesToBigInt(nonce), yParity: bytesToBigInt(yParity), r: bytesToHex(r), s: bytesToHex(s) };
      });
    default: return bytesToBigInt(expectBytes(v, name));
  }
}

/** Decode a raw signed transaction; returns {type, typeName, fields, hash, signingHash, sender, yParity/v, r, s}. */
export function decodeTransaction(raw) {
  if (!raw.length) throw new InputError('Transaction is empty');
  const hash = keccak_256(raw);
  let type, list, signingPayload;
  if (raw[0] >= 0xc0) {
    type = 0;
    list = expectList(rlpDecode(raw), 'transaction');
    if (list.length !== 9) throw new InputError(`A legacy transaction has 9 fields, this one has ${list.length}`);
    const names = ['nonce', 'gasPrice', 'gasLimit', 'to', 'value', 'data', 'v', 'r', 's'];
    const fields = Object.fromEntries(names.slice(0, 6).map((n, i) => [n, convertField(n, list[i])]));
    const v = bytesToBigInt(expectBytes(list[6], 'v')), r = bytesToBigInt(list[7]), s = bytesToBigInt(list[8]);
    let chainId = null, recovery;
    if (v === 27n || v === 28n) { recovery = Number(v - 27n); signingPayload = rlpEncode(list.slice(0, 6)); }
    else if (v >= 35n) {
      chainId = (v - 35n) / 2n;
      recovery = Number(v - 35n - chainId * 2n);
      signingPayload = rlpEncode([...list.slice(0, 6), bigIntToBytes(chainId), new Uint8Array(), new Uint8Array()]);
    } else throw new InputError(`Invalid legacy v value ${v}`);
    const signingHash = keccak_256(signingPayload);
    return { type, typeName: TX_TYPES[0].name + (chainId === null ? ' (pre-EIP-155)' : ' (EIP-155)'), fields: { chainId, ...fields },
      v, r, s, hash, signingHash, sender: recoverAddress(signingHash, { r, s, recovery }) };
  }
  type = raw[0];
  const spec = TX_TYPES[type];
  if (!spec || type === 0) throw new InputError(`Unknown transaction type 0x${type.toString(16).padStart(2, '0')}`);
  list = expectList(rlpDecode(raw.subarray(1)), 'transaction');
  let networkWrapper = false;
  if (type === 3 && Array.isArray(list[0])) {
    // Network form: [tx_payload_body, blobs, commitments, proofs]
    networkWrapper = true;
    list = list[0];
  }
  const n = spec.fields.length;
  if (list.length !== n + 3) throw new InputError(`A type ${type} transaction has ${n + 3} fields, this one has ${list.length}`);
  const fields = Object.fromEntries(spec.fields.map((f, i) => [f, convertField(f, list[i])]));
  const yParity = bytesToBigInt(expectBytes(list[n], 'yParity'));
  if (yParity > 1n) throw new InputError('yParity must be 0 or 1');
  const r = bytesToBigInt(list[n + 1]), s = bytesToBigInt(list[n + 2]);
  const signingHash = keccak_256(concat(Uint8Array.of(type), rlpEncode(list.slice(0, n))));
  const txHash = networkWrapper ? keccak_256(concat(Uint8Array.of(type), rlpEncode(list))) : hash;
  return { type, typeName: spec.name, networkWrapper, fields, yParity, r, s, hash: txHash, signingHash,
    sender: recoverAddress(signingHash, { r, s, recovery: Number(yParity) }) };
}
