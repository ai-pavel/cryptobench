// Shared Polkadot / Substrate helpers: hashing (Blake2, xxHash/Twox), SS58,
// SCALE compact encoding, substrate-bip39 keys, derivation paths and signatures.
import { blake2b } from '../../assets/vendor/@noble/hashes@2.4.0/blake2.esm.js';
import { sha256, sha512 } from '../../assets/vendor/@noble/hashes@2.4.0/sha2.esm.js';
import { keccak_256 } from '../../assets/vendor/@noble/hashes@2.4.0/sha3.esm.js';
import { pbkdf2 } from '../../assets/vendor/@noble/hashes@2.4.0/pbkdf2.esm.js';
import { ed25519 } from '../../assets/vendor/@noble/curves@2.4.0/ed25519.esm.js';
import { secp256k1 } from '../../assets/vendor/@noble/curves@2.4.0/secp256k1.esm.js';
import { base58 } from '../../assets/vendor/@scure/base@2.4.0/index.esm.js';
import { mnemonicToEntropy, validateMnemonic, generateMnemonic } from '../../assets/vendor/@scure/bip39@2.4.0/index.esm.js';
import { wordlist } from '../../assets/vendor/@scure/bip39@2.4.0/wordlists/english.esm.js';
import * as sr25519 from '../../assets/vendor/@scure/sr25519@2.4.0/index.esm.js';

export { blake2b, sha256, keccak_256, ed25519, secp256k1, sr25519, wordlist, validateMnemonic, generateMnemonic };

// ---------- bytes ----------
const te = new TextEncoder();
export const utf8 = s => te.encode(s);
export const utf8Decode = b => new TextDecoder('utf-8', { fatal: true }).decode(b);
export function concat(...arrs) {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
export const toHex = b => '0x' + [...b].map(x => x.toString(16).padStart(2, '0')).join('');
export function fromHex(s, what = 'hex') {
  let h = String(s).trim();
  if (h.startsWith('0x') || h.startsWith('0X')) h = h.slice(2);
  h = h.replace(/\s+/g, '');
  if (h.length % 2 || /[^0-9a-fA-F]/.test(h)) throw new Error(`Invalid ${what}: expected an even number of hex digits.`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
export const isHexLike = s => /^(0x)?[0-9a-fA-F]*$/.test(String(s).trim()) && String(s).trim().replace(/^0x/, '').length % 2 === 0;
export const equal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function uintLE(value, bytes) {
  let v = BigInt(value);
  if (v < 0n) throw new Error('Value must not be negative.');
  if (v >= 1n << BigInt(bytes * 8)) throw new Error(`Value does not fit in ${bytes * 8} bits.`);
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
}
export function readUintLE(b) {
  let v = 0n;
  for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
  return v;
}

// ---------- hashes ----------
export const blake2 = (data, bits = 256) => blake2b(data, { dkLen: bits / 8 });

const M64 = (1n << 64n) - 1n;
const P1 = 0x9E3779B185EBCA87n, P2 = 0xC2B2AE3D27D4EB4Fn, P3 = 0x165667B19E3779F9n, P4 = 0x85EBCA77C2B2AE63n, P5 = 0x27D4EB2F165667C5n;
const rotl = (x, r) => ((x << BigInt(r)) | (x >> BigInt(64 - r))) & M64;
const u64At = (b, i) => readUintLE(b.subarray(i, i + 8));
const u32At = (b, i) => BigInt(b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + (BigInt(b[i + 3]) << 24n);
const round = (acc, input) => (rotl((acc + input * P2) & M64, 31) * P1) & M64;
const merge = (acc, val) => (((acc ^ round(0n, val)) * P1) + P4) & M64;

// xxHash64 with a 64-bit seed, returning the hash as a BigInt.
export function xxhash64(data, seed = 0n) {
  seed = BigInt(seed);
  const len = data.length;
  let i = 0, h;
  if (len >= 32) {
    let v1 = (seed + P1 + P2) & M64, v2 = (seed + P2) & M64, v3 = seed, v4 = (seed - P1) & M64;
    for (; i + 32 <= len; i += 32) {
      v1 = round(v1, u64At(data, i)); v2 = round(v2, u64At(data, i + 8));
      v3 = round(v3, u64At(data, i + 16)); v4 = round(v4, u64At(data, i + 24));
    }
    h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) & M64;
    h = merge(h, v1); h = merge(h, v2); h = merge(h, v3); h = merge(h, v4);
  } else {
    h = (seed + P5) & M64;
  }
  h = (h + BigInt(len)) & M64;
  for (; i + 8 <= len; i += 8) h = ((rotl(h ^ round(0n, u64At(data, i)), 27) * P1) + P4) & M64;
  if (i + 4 <= len) { h = ((rotl(h ^ ((u32At(data, i) * P1) & M64), 23) * P2) + P3) & M64; i += 4; }
  for (; i < len; i++) h = (rotl(h ^ ((BigInt(data[i]) * P5) & M64), 11) * P1) & M64;
  h ^= h >> 33n; h = (h * P2) & M64; h ^= h >> 29n; h = (h * P3) & M64; h ^= h >> 32n;
  return h;
}
// Substrate's Twox: xxHash64 with seeds 0, 1, … concatenated little-endian.
export function twox(data, bits = 128) {
  const parts = [];
  for (let s = 0; s < bits / 64; s++) parts.push(uintLE(xxhash64(data, BigInt(s)), 8));
  return concat(...parts);
}

// ---------- SCALE compact ----------
export function compact(value) {
  const v = BigInt(value);
  if (v < 0n) throw new Error('Compact values must not be negative.');
  if (v < 1n << 6n) return new Uint8Array([Number(v << 2n)]);
  if (v < 1n << 14n) return uintLE((v << 2n) | 1n, 2);
  if (v < 1n << 30n) return uintLE((v << 2n) | 2n, 4);
  let n = 0, t = v; while (t > 0n) { n++; t >>= 8n; }
  if (n > 67) throw new Error('Value too large for compact encoding.');
  return concat(new Uint8Array([((n - 4) << 2) | 3]), uintLE(v, n));
}
export function readCompact(b, off = 0) {
  if (off >= b.length) throw new Error(`Unexpected end of data at byte ${off}.`);
  const mode = b[off] & 3;
  if (mode === 0) return { value: BigInt(b[off] >> 2), size: 1 };
  if (mode === 1) { need(b, off, 2); return { value: readUintLE(b.subarray(off, off + 2)) >> 2n, size: 2 }; }
  if (mode === 2) { need(b, off, 4); return { value: readUintLE(b.subarray(off, off + 4)) >> 2n, size: 4 }; }
  const n = (b[off] >> 2) + 4; need(b, off + 1, n);
  return { value: readUintLE(b.subarray(off + 1, off + 1 + n)), size: 1 + n };
}
function need(b, off, n) { if (off + n > b.length) throw new Error(`Unexpected end of data at byte ${off} (need ${n} bytes, ${b.length - off} left).`); }
export const withLength = bytes => concat(compact(bytes.length), bytes);

// ---------- SS58 ----------
export const NETWORKS = [
  { name: 'Polkadot', prefix: 0, symbol: 'DOT', decimals: 10 },
  { name: 'Kusama', prefix: 2, symbol: 'KSM', decimals: 12 },
  { name: 'Generic Substrate', prefix: 42 },
  { name: 'Westend', prefix: 42, symbol: 'WND', decimals: 12 },
  { name: 'Paseo', prefix: 0, symbol: 'PAS', decimals: 10 },
  { name: 'Bittensor', prefix: 42, symbol: 'TAO', decimals: 9 },
  { name: 'Astar', prefix: 5, symbol: 'ASTR', decimals: 18 },
  { name: 'Bifrost', prefix: 6, symbol: 'BNC', decimals: 12 },
  { name: 'Acala', prefix: 10, symbol: 'ACA', decimals: 12 },
  { name: 'Phala', prefix: 30, symbol: 'PHA', decimals: 12 },
  { name: 'Hydration', prefix: 63, symbol: 'HDX', decimals: 12 },
  { name: 'Unique', prefix: 7391, symbol: 'UNQ', decimals: 18 },
];

function ss58Prefix(prefix) {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 16383 || prefix === 46 || prefix === 47) {
    throw new Error('SS58 prefix must be an integer from 0 to 16383 (46 and 47 are reserved).');
  }
  if (prefix < 64) return new Uint8Array([prefix]);
  return new Uint8Array([((prefix & 0b1111_1100) >> 2) | 0b0100_0000, (prefix >> 8) | ((prefix & 0b11) << 6)]);
}
const checksumLen = n => (n === 32 || n === 33 ? 2 : 1);
const ss58Hash = data => blake2b(concat(utf8('SS58PRE'), data), { dkLen: 64 });

export function ss58Encode(payload, prefix = 42) {
  if (![1, 2, 4, 8, 32, 33].includes(payload.length)) throw new Error(`SS58 payloads must be 1, 2, 4, 8, 32 or 33 bytes (got ${payload.length}).`);
  const body = concat(ss58Prefix(prefix), payload);
  return base58.encode(concat(body, ss58Hash(body).subarray(0, checksumLen(payload.length))));
}

export function ss58Decode(address) {
  const s = String(address).trim();
  if (!s) throw new Error('Enter an address.');
  let raw;
  try { raw = base58.decode(s); } catch { throw new Error('Not valid Base58: SS58 addresses never contain 0, O, I or l.'); }
  if (raw.length < 3) throw new Error('Too short to be an SS58 address.');
  let prefix, pLen;
  if (raw[0] < 64) { prefix = raw[0]; pLen = 1; }
  else if (raw[0] < 128) {
    prefix = ((raw[0] & 0b0011_1111) << 2) | (raw[1] >> 6) | ((raw[1] & 0b0011_1111) << 8);
    pLen = 2;
  } else throw new Error('Invalid SS58 prefix byte.');
  const rest = raw.length - pLen;
  const options = [[1, 1], [2, 1], [4, 1], [8, 1], [32, 2], [33, 2]].filter(([n, c]) => n + c === rest);
  if (!options.length) throw new Error(`Unexpected length: ${raw.length} bytes after Base58 decoding.`);
  const [n, c] = options[0];
  const body = raw.subarray(0, pLen + n);
  const sum = raw.subarray(pLen + n);
  if (!equal(ss58Hash(body).subarray(0, c), sum)) throw new Error('Checksum mismatch: the address has a typo or was altered.');
  return { prefix, payload: raw.slice(pLen, pLen + n) };
}

// Address, or 0x-hex public key / AccountId → 32-byte account id.
export function accountIdFrom(input, what = 'account') {
  const s = String(input).trim();
  if (!s) throw new Error(`Enter an ${what}.`);
  if (/^0x/i.test(s)) {
    const b = fromHex(s, what);
    if (b.length !== 32) throw new Error(`A hex ${what} must be 32 bytes (got ${b.length}).`);
    return b;
  }
  const { payload } = ss58Decode(s);
  if (payload.length !== 32) throw new Error(`Expected a 32-byte account, got ${payload.length} bytes.`);
  return payload;
}

// ---------- keys ----------
export const CRYPTO = { sr25519: 'sr25519', ed25519: 'ed25519', ecdsa: 'ecdsa' };

export function miniSecretFromMnemonic(phrase, password = '') {
  const words = phrase.trim().split(/\s+/).join(' ');
  if (!validateMnemonic(words, wordlist)) throw new Error('Invalid mnemonic: unknown words or a bad checksum.');
  const entropy = mnemonicToEntropy(words, wordlist);
  return pbkdf2(sha512, entropy, utf8('mnemonic' + password), { c: 2048, dkLen: 64 }).slice(0, 32);
}

// Parse a secret URI: "<phrase or 0xseed>//hard/soft///password".
export function parseSuri(suri) {
  const s = String(suri).trim();
  const m = s.match(/^([^/]*?)((\/\/?[^/]+)*)(\/\/\/(.*))?$/s);
  if (!m) throw new Error('Could not parse the secret URI.');
  const phrase = m[1].trim();
  const path = m[2] || '';
  const password = m[5] || '';
  const junctions = [...path.matchAll(/(\/\/?)([^/]+)/g)].map(([, sep, code]) => junction(code, sep === '//'));
  return { phrase, path, password, junctions };
}

export function junction(code, hard) {
  let bytes;
  if (/^\d+$/.test(code)) bytes = uintLE(BigInt(code), 8);
  else bytes = withLength(utf8(code));
  let chainCode = new Uint8Array(32);
  if (bytes.length > 32) chainCode = blake2(bytes, 256);
  else chainCode.set(bytes);
  return { code, hard, chainCode };
}

function hardSeed(label, seed, chainCode) {
  return blake2(concat(withLength(utf8(label)), seed, chainCode), 256);
}

// Derive a keypair from a mini-secret (32 bytes) and junctions.
export function keypairFromSeed(type, seed, junctions = []) {
  if (type === 'sr25519') {
    let secret = sr25519.secretFromSeed(seed);
    for (const j of junctions) secret = j.hard ? sr25519.HDKD.secretHard(secret, j.chainCode) : sr25519.HDKD.secretSoft(secret, j.chainCode);
    return { type, secret, publicKey: sr25519.getPublicKey(secret) };
  }
  for (const j of junctions) {
    if (!j.hard) throw new Error(`${type === 'ed25519' ? 'Ed25519' : 'ECDSA'} supports only hard derivation (//): "/${j.code}" is soft.`);
    seed = hardSeed(type === 'ed25519' ? 'Ed25519HDKD' : 'Secp256k1HDKD', seed, j.chainCode);
  }
  if (type === 'ed25519') return { type, secret: seed, publicKey: ed25519.getPublicKey(seed) };
  return { type, secret: seed, publicKey: secp256k1.getPublicKey(seed, true) };
}

export function keypairFromSuri(type, suri) {
  const { phrase, password, junctions, path } = parseSuri(suri);
  if (!phrase) throw new Error('Enter a mnemonic or a 0x-prefixed 32-byte seed.');
  let seed;
  if (/^0x/i.test(phrase)) {
    seed = fromHex(phrase, 'seed');
    if (seed.length !== 32) throw new Error(`A hex seed must be 32 bytes (got ${seed.length}).`);
  } else seed = miniSecretFromMnemonic(phrase, password);
  return { ...keypairFromSeed(type, seed, junctions), path, seed };
}

// AccountId32 for a public key of the given type.
export function accountIdOf(type, publicKey) {
  if (type === 'ecdsa') {
    const compressed = publicKey.length === 33 ? publicKey : secp256k1.Point.fromBytes(publicKey).toBytes(true);
    return blake2(compressed, 256);
  }
  if (publicKey.length !== 32) throw new Error(`${type} public keys are 32 bytes (got ${publicKey.length}).`);
  return publicKey;
}

export function ethAddressOf(publicKey) {
  const uncompressed = secp256k1.Point.fromBytes(publicKey).toBytes(false);
  const h = keccak_256(uncompressed.subarray(1)).subarray(12);
  const hex = [...h].map(x => x.toString(16).padStart(2, '0')).join('');
  const sum = keccak_256(utf8(hex)); // EIP-55 checksum casing
  return '0x' + [...hex].map((c, i) => /[a-f]/.test(c) && ((sum[i >> 1] >> (i % 2 ? 0 : 4)) & 15) >= 8 ? c.toUpperCase() : c).join('');
}

// ---------- signatures ----------
export const BYTES_PREFIX = utf8('<Bytes>');
export const BYTES_SUFFIX = utf8('</Bytes>');
export const wrapBytes = m => concat(BYTES_PREFIX, m, BYTES_SUFFIX);
export function isWrapped(m) {
  return m.length >= BYTES_PREFIX.length + BYTES_SUFFIX.length &&
    equal(m.subarray(0, BYTES_PREFIX.length), BYTES_PREFIX) && equal(m.subarray(m.length - BYTES_SUFFIX.length), BYTES_SUFFIX);
}

export function sign(kp, message) {
  if (kp.type === 'sr25519') return sr25519.sign(kp.secret, message);
  if (kp.type === 'ed25519') return ed25519.sign(message, kp.secret);
  // ECDSA signs blake2b-256(message); Substrate's layout is r || s || recovery id.
  const rec = secp256k1.sign(blake2(message, 256), kp.secret, { prehash: false, format: 'recovered' });
  return concat(rec.subarray(1), rec.subarray(0, 1));
}

// Try to verify a signature like polkadot.js signatureVerify: returns the
// crypto type and whether the message was <Bytes>-wrapped, or null.
export function verifyAny(message, signature, accountId) {
  const candidates = [];
  const msgs = [{ wrapped: false, data: message }];
  if (isWrapped(message)) msgs.push({ wrapped: 'unwrapped', data: message.subarray(BYTES_PREFIX.length, message.length - BYTES_SUFFIX.length) });
  else msgs.push({ wrapped: true, data: wrapBytes(message) });
  let sig = signature, forced = null;
  if (signature.length === 65 && (signature[0] === 0 || signature[0] === 1)) candidates.push({ sig: signature.subarray(1), forced: signature[0] === 0 ? 'ed25519' : 'sr25519', multi: true });
  if (signature.length === 66 && signature[0] === 2) candidates.push({ sig: signature.subarray(1), forced: 'ecdsa', multi: true });
  candidates.push({ sig, forced, multi: false });
  for (const c of candidates) {
    for (const m of msgs) {
      for (const type of c.forced ? [c.forced] : ['sr25519', 'ed25519', 'ecdsa']) {
        if (verifyOne(type, m.data, c.sig, accountId)) return { type, wrapped: m.wrapped, multi: c.multi };
      }
    }
  }
  return null;
}

function verifyOne(type, message, sig, accountId) {
  try {
    if (type === 'sr25519') return sig.length === 64 && accountId.length === 32 && sr25519.verify(message, sig, accountId);
    if (type === 'ed25519') return sig.length === 64 && accountId.length === 32 && ed25519.verify(sig, message, accountId);
    if (sig.length !== 65) return false;
    const rec = concat(sig.subarray(64, 65), sig.subarray(0, 64));
    const pub = secp256k1.recoverPublicKey(rec, blake2(message, 256), { prehash: false });
    const id = accountId.length === 33 ? pub : blake2(pub, 256);
    return equal(id, accountId);
  } catch { return false; }
}
