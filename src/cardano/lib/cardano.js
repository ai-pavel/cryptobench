// Cardano primitives for the toolbox: addresses (CIP-19, Byron), keys (CIP-1852 /
// BIP32-Ed25519), native scripts, asset fingerprints (CIP-14) and metadata.
import { blake2b } from '../../assets/vendor/@noble/hashes@1.8.0/blake2b.esm.js';
import { sha512 } from '../../assets/vendor/@noble/hashes@1.8.0/sha2.esm.js';
import { hmac } from '../../assets/vendor/@noble/hashes@1.8.0/hmac.esm.js';
import { pbkdf2 } from '../../assets/vendor/@noble/hashes@1.8.0/pbkdf2.esm.js';
import { ed25519 } from '../../assets/vendor/@noble/curves@1.9.7/ed25519.esm.js';
import { bech32, base58 } from '../../assets/vendor/@scure/base@2.4.0/index.esm.js';
import { decode, encode, readItem, toHex, fromHex, concat, Tag, CborMap } from './cbor.js';

export { toHex, fromHex, concat };
export const blake2b224 = b => blake2b(b, { dkLen: 28 });
export const blake2b256 = b => blake2b(b, { dkLen: 32 });
export const blake2b160 = b => blake2b(b, { dkLen: 20 });

const BECH32_LIMIT = 1023;
export function bech32Decode(s) {
  const { prefix, words } = bech32.decode(s.trim().toLowerCase(), BECH32_LIMIT);
  return { prefix, bytes: bech32.fromWords(words) };
}
export const bech32Encode = (prefix, bytes) => bech32.encode(prefix, bech32.toWords(bytes), BECH32_LIMIT);

// ---------------------------------------------------------------- addresses (CIP-19)

export const ADDRESS_TYPES = {
  0: 'Base address (key payment, key stake)',
  1: 'Base address (script payment, key stake)',
  2: 'Base address (key payment, script stake)',
  3: 'Base address (script payment, script stake)',
  4: 'Pointer address (key payment)',
  5: 'Pointer address (script payment)',
  6: 'Enterprise address (key payment, no stake)',
  7: 'Enterprise address (script payment, no stake)',
  8: 'Byron (bootstrap) address',
  14: 'Reward / stake address (key)',
  15: 'Reward / stake address (script)',
};

export const NETWORKS = { 0: 'Testnet (preprod, preview…)', 1: 'Mainnet' };

function cred(bytes, isScript) {
  return { type: isScript ? 'script' : 'key', hash: bytes, hex: toHex(bytes) };
}

export function credBech32(c, role) {
  if (c.type === 'script') return bech32Encode('script', c.hash);
  return bech32Encode(role === 'stake' ? 'stake_vkh' : 'addr_vkh', c.hash);
}

function readVarNat(bytes, pos) {
  let n = 0n;
  for (;;) {
    if (pos >= bytes.length) throw new Error('Pointer address is truncated.');
    const b = bytes[pos++];
    n = (n << 7n) | BigInt(b & 0x7f);
    if (!(b & 0x80)) return [n, pos];
  }
}
function writeVarNat(n) {
  n = BigInt(n);
  const out = [Number(n & 0x7fn)];
  n >>= 7n;
  while (n > 0n) { out.unshift(Number(n & 0x7fn) | 0x80); n >>= 7n; }
  return Uint8Array.from(out);
}

// Decode raw address bytes (as they appear in transactions).
export function parseAddressBytes(bytes) {
  if (!bytes.length) throw new Error('Empty address.');
  const header = bytes[0], type = header >> 4, network = header & 0x0f;
  if (type === 8) return { ...parseByron(bytes), bytes };
  if (!(type in ADDRESS_TYPES)) throw new Error(`Unknown address type ${type} (header byte 0x${header.toString(16).padStart(2, '0')}).`);
  const body = bytes.slice(1);
  const a = { type, typeName: ADDRESS_TYPES[type], network, header, bytes };
  if (type <= 3) {
    if (body.length !== 56) throw new Error(`A base address has 57 bytes; this one has ${bytes.length}.`);
    a.payment = cred(body.slice(0, 28), type & 1);
    a.stake = cred(body.slice(28), type & 2);
  } else if (type === 4 || type === 5) {
    if (body.length < 31) throw new Error('Pointer address is too short.');
    a.payment = cred(body.slice(0, 28), type === 5);
    let pos = 28, slot, txIndex, certIndex;
    [slot, pos] = readVarNat(body, pos); [txIndex, pos] = readVarNat(body, pos); [certIndex, pos] = readVarNat(body, pos);
    if (pos !== body.length) throw new Error('Pointer address has extra bytes.');
    a.pointer = { slot, txIndex, certIndex };
  } else if (type === 6 || type === 7) {
    if (body.length !== 28) throw new Error(`An enterprise address has 29 bytes; this one has ${bytes.length}.`);
    a.payment = cred(body, type === 7);
  } else {
    if (body.length !== 28) throw new Error(`A reward address has 29 bytes; this one has ${bytes.length}.`);
    a.stake = cred(body, type === 15);
  }
  a.bech32 = bech32Encode(addressPrefix(type, network), bytes);
  return a;
}

export function addressPrefix(type, network) {
  const base = type >= 14 ? 'stake' : 'addr';
  return network === 1 ? base : base + '_test';
}

// Accept a bech32 address, a Byron base58 address, or raw hex.
export function parseAddress(input) {
  const s = input.trim();
  if (!s) throw new Error('Enter an address.');
  if (/^(addr|stake)(_test)?1/i.test(s)) {
    let d;
    try { d = bech32Decode(s); } catch (e) { throw new Error('Invalid bech32 address: ' + e.message); }
    const a = parseAddressBytes(d.bytes);
    const expected = addressPrefix(a.type, a.network);
    if (d.prefix !== expected) a.warning = `The prefix "${d.prefix}" doesn't match the address type and network (expected "${expected}").`;
    a.format = 'bech32';
    return a;
  }
  if (/^[0-9a-f]+$/i.test(s.replace(/^0x/i, '')) && s.replace(/^0x/i, '').length % 2 === 0 && s.length >= 58) {
    const a = parseAddressBytes(fromHex(s)); a.format = 'hex'; return a;
  }
  let raw;
  try { raw = base58.decode(s); } catch { throw new Error('Not a Cardano address: expected addr1…, stake1…, a Byron address or hex.'); }
  const a = parseByron(raw); a.format = 'base58'; a.bytes = raw; return a;
}

// Byron: base58(cbor([tag24(bytes payload), crc32(payload)])), payload = [root, attributes, type].
export function parseByron(raw) {
  let outer;
  try { outer = decode(raw); } catch (e) { throw new Error('Not a valid Byron address: ' + e.message); }
  if (!Array.isArray(outer) || outer.length !== 2 || !(outer[0] instanceof Tag) || outer[0].tag !== 24 || !(outer[0].value instanceof Uint8Array))
    throw new Error('Not a valid Byron address structure.');
  const payload = outer[0].value, crc = Number(outer[1]);
  const actual = crc32(payload);
  const inner = decode(payload);
  const [root, attrs, addrType] = inner;
  const attributes = {};
  if (attrs instanceof CborMap) for (const [k, v] of attrs.entries) {
    if (k === 1) attributes.derivationPath = toHex(v instanceof Uint8Array ? v : new Uint8Array());
    else if (k === 2) { try { attributes.protocolMagic = Number(decode(v)); } catch { attributes.protocolMagic = toHex(v); } }
    else attributes['attr' + k] = v instanceof Uint8Array ? toHex(v) : String(v);
  }
  return {
    type: 8, typeName: ADDRESS_TYPES[8], byron: true,
    network: attributes.protocolMagic === undefined ? 1 : 0,
    root: toHex(root), byronType: Number(addrType), attributes,
    crc, crcOk: crc === actual, crcActual: actual,
    bech32: null, base58: base58.encode(raw),
  };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Credential input: 28-byte hex, or bech32 addr_vkh / stake_vkh / script / a full address part.
export function parseCredential(input, role) {
  const s = input.trim();
  if (!s) return null;
  if (/^[0-9a-f]{56}$/i.test(s.replace(/^0x/i, ''))) return { hash: fromHex(s), type: null };
  let d;
  try { d = bech32Decode(s); } catch { throw new Error(`The ${role} credential must be a 28-byte hash in hex (56 characters) or bech32 (addr_vkh…, stake_vkh…, script…).`); }
  if (d.bytes.length !== 28) throw new Error(`The ${role} credential must be 28 bytes; this one has ${d.bytes.length}.`);
  const type = d.prefix === 'script' ? 'script' : /vkh$/.test(d.prefix) ? 'key' : null;
  if (!type) throw new Error(`Unexpected bech32 prefix "${d.prefix}" for a credential.`);
  return { hash: d.bytes, type };
}

export function buildAddress({ kind, network, payment, stake, pointer }) {
  let type, body;
  const ps = payment?.type === 'script' ? 1 : 0, ss = stake?.type === 'script' ? 1 : 0;
  if (kind === 'base') { type = ps | (ss << 1); body = concat([payment.hash, stake.hash]); }
  else if (kind === 'enterprise') { type = 6 + ps; body = payment.hash; }
  else if (kind === 'pointer') { type = 4 + ps; body = concat([payment.hash, writeVarNat(pointer.slot), writeVarNat(pointer.txIndex), writeVarNat(pointer.certIndex)]); }
  else if (kind === 'reward') { type = 14 + ss; body = stake.hash; }
  else throw new Error('Unknown address kind.');
  const bytes = concat([Uint8Array.of((type << 4) | network), body]);
  return parseAddressBytes(bytes);
}

export function stakeAddressOf(a) {
  if (!a.stake) return null;
  return buildAddress({ kind: 'reward', network: a.network, stake: a.stake });
}

// ---------------------------------------------------------------- keys (CIP-1852, BIP32-Ed25519)

const N = ed25519.CURVE.n;
const Point = ed25519.ExtendedPoint;
const leToBig = b => { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; };
const bigToLe = (n, len) => { const out = new Uint8Array(len); for (let i = 0; i < len; i++) { out[i] = Number(n & 0xffn); n >>= 8n; } return out; };
const u32le = i => Uint8Array.of(i & 0xff, (i >>> 8) & 0xff, (i >>> 16) & 0xff, (i >>> 24) & 0xff);

export const HARDENED = 0x80000000;

// Public key A = kL·B for an extended private key (kL is used as-is, not hashed).
export function publicFromKL(kL) {
  const s = leToBig(kL) % N;
  return Point.BASE.multiply(s).toRawBytes();
}

// Icarus master key (used by Yoroi, Eternl, Lace, Daedalus Shelley wallets).
export function icarusRoot(entropy, passphrase = '') {
  const k = pbkdf2(sha512, new TextEncoder().encode(passphrase), entropy, { c: 4096, dkLen: 96 });
  k[0] &= 0b11111000; k[31] &= 0b00011111; k[31] |= 0b01000000;
  const kL = k.slice(0, 32), kR = k.slice(32, 64), cc = k.slice(64, 96);
  return { kL, kR, cc, pub: publicFromKL(kL) };
}

export function derivePrivate(node, index) {
  const ib = u32le(index);
  let z, i;
  if (index >= HARDENED) {
    const data = concat([node.kL, node.kR, ib]);
    z = hmac(sha512, node.cc, concat([Uint8Array.of(0x00), data]));
    i = hmac(sha512, node.cc, concat([Uint8Array.of(0x01), data]));
  } else {
    const data = concat([node.pub, ib]);
    z = hmac(sha512, node.cc, concat([Uint8Array.of(0x02), data]));
    i = hmac(sha512, node.cc, concat([Uint8Array.of(0x03), data]));
  }
  const zL = z.slice(0, 28), zR = z.slice(32, 64);
  const kL = bigToLe((leToBig(zL) * 8n + leToBig(node.kL)) % (1n << 256n), 32);
  const kR = bigToLe((leToBig(zR) + leToBig(node.kR)) % (1n << 256n), 32);
  return { kL, kR, cc: i.slice(32, 64), pub: publicFromKL(kL) };
}

export function derivePublic(node, index) {
  if (index >= HARDENED) throw new Error('Hardened keys cannot be derived from a public key.');
  const data = concat([node.pub, u32le(index)]);
  const z = hmac(sha512, node.cc, concat([Uint8Array.of(0x02), data]));
  const i = hmac(sha512, node.cc, concat([Uint8Array.of(0x03), data]));
  const zL8 = (leToBig(z.slice(0, 28)) * 8n) % N;
  const A = Point.fromHex(node.pub);
  const pub = (zL8 === 0n ? A : A.add(Point.BASE.multiply(zL8))).toRawBytes();
  return { pub, cc: i.slice(32, 64) };
}

export function derivePath(node, path) {
  return path.reduce((n, idx) => derivePrivate(n, idx), node);
}

export function parsePath(s) {
  const parts = s.trim().replace(/^m\/?/, '').split('/').filter(Boolean);
  return parts.map(p => {
    const hard = /['hH]$/.test(p);
    const n = Number(p.replace(/['hH]$/, ''));
    if (!Number.isInteger(n) || n < 0 || n >= HARDENED) throw new Error(`Invalid path segment "${p}".`);
    return hard ? n + HARDENED : n;
  });
}

export const xprvBytes = n => concat([n.kL, n.kR, n.cc]);
export const xpubBytes = n => concat([n.pub, n.cc]);

// ---------------------------------------------------------------- native scripts and policies

// cardano-cli JSON: {type: sig|all|any|atLeast|after|before, ...}
export function nativeScriptToCbor(s, path = 'script') {
  if (!s || typeof s !== 'object') throw new Error(`${path}: expected an object with a "type".`);
  const sub = list => {
    if (!Array.isArray(list)) throw new Error(`${path}: "scripts" must be an array.`);
    return list.map((x, i) => nativeScriptToCbor(x, `${path}.scripts[${i}]`));
  };
  const slot = () => {
    const v = s.slot;
    if (!(Number.isInteger(v) || (typeof v === 'string' && /^\d+$/.test(v))) || BigInt(v) < 0n) throw new Error(`${path}: "slot" must be a non-negative integer.`);
    return BigInt(v);
  };
  switch (s.type) {
    case 'sig': {
      const h = String(s.keyHash || '').replace(/^0x/i, '');
      if (!/^[0-9a-f]{56}$/i.test(h)) throw new Error(`${path}: "keyHash" must be a 28-byte hex key hash (56 characters).`);
      return [0, fromHex(h)];
    }
    case 'all': return [1, sub(s.scripts)];
    case 'any': return [2, sub(s.scripts)];
    case 'atLeast': {
      if (!Number.isInteger(s.required) || s.required < 0) throw new Error(`${path}: "required" must be a non-negative integer.`);
      return [3, s.required, sub(s.scripts)];
    }
    case 'after': return [4, slot()];
    case 'before': return [5, slot()];
    default: throw new Error(`${path}: unknown type "${s.type}". Use sig, all, any, atLeast, after or before.`);
  }
}

export function nativeScriptFromCbor(v) {
  if (!Array.isArray(v)) throw new Error('A native script is a CBOR array.');
  const kind = Number(v[0]);
  switch (kind) {
    case 0: return { type: 'sig', keyHash: toHex(v[1]) };
    case 1: return { type: 'all', scripts: v[1].map(nativeScriptFromCbor) };
    case 2: return { type: 'any', scripts: v[1].map(nativeScriptFromCbor) };
    case 3: return { type: 'atLeast', required: Number(v[1]), scripts: v[2].map(nativeScriptFromCbor) };
    case 4: return { type: 'after', slot: Number(v[1]) };
    case 5: return { type: 'before', slot: Number(v[1]) };
    default: throw new Error(`Unknown native script kind ${kind}.`);
  }
}

// Script hash = blake2b-224(language tag ++ script bytes); 0x00 = native script.
export const scriptHash = (tag, scriptBytes) => blake2b224(concat([Uint8Array.of(tag), scriptBytes]));

// ---------------------------------------------------------------- assets (CIP-14)

export function assetFingerprint(policyId, assetName) {
  return bech32Encode('asset', blake2b160(concat([policyId, assetName])));
}

export function assetNameText(bytes) {
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return /^[\x20-\x7e -￿]*$/.test(s) ? s : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- metadata

// Transaction metadata to cardano-cli "no schema" JSON: bytes become "0x…".
export function metadataToJSON(v) {
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (v instanceof Uint8Array) return '0x' + toHex(v);
  if (Array.isArray(v)) return v.map(metadataToJSON);
  if (v instanceof CborMap) {
    const keysOk = v.entries.every(([k]) => typeof k === 'string' || typeof k === 'number' || typeof k === 'bigint');
    if (keysOk) return Object.fromEntries(v.entries.map(([k, x]) => [String(k), metadataToJSON(x)]));
    return v.entries.map(([k, x]) => ({ k: metadataToJSON(k), v: metadataToJSON(x) }));
  }
  if (v instanceof Tag) return { tag: v.tag, value: metadataToJSON(v.value) };
  return v;
}

export function formatAda(lovelace) {
  const n = BigInt(lovelace), neg = n < 0n, a = neg ? -n : n;
  const whole = a / 1000000n, frac = (a % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toLocaleString('en-US') + (frac ? '.' + frac : '') + ' ADA';
}

export { decode, encode, readItem, Tag, CborMap, ed25519 };
