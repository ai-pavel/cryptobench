// Small TON toolkit for the TON tools: bytes, cells, BOC, addresses,
// wallet contracts and the TON mnemonic scheme. Mirrors @ton/core and
// @ton/crypto behaviour; cross-checked against them in the test suite.
import { sha256 } from '../../assets/vendor/@noble/hashes@1.8.0/sha2.esm.js';
import { ed25519 } from '../../assets/vendor/@noble/curves@1.9.7/ed25519.esm.js';
import { wordlist } from '../../assets/vendor/@scure/bip39@1.6.0/wordlists/english.esm.js';
import { WALLET_CODE } from './wallet-code.js';

export { sha256, ed25519, wordlist };

// ---------- bytes ----------
export const utf8 = s => new TextEncoder().encode(s);
export const fromUtf8 = (b, fatal = false) => new TextDecoder('utf-8', { fatal }).decode(b);

export function hexToBytes(s) {
  const h = s.trim().replace(/^0x/i, '').replace(/[\s:]/g, '');
  if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error('Not valid hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
export const bytesToHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

export function base64ToBytes(s) {
  let t = s.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (/[^A-Za-z0-9+/=]/.test(t)) throw new Error('Not valid base64');
  t = t.replace(/=+$/, '');
  if (t.length % 4 === 1) throw new Error('Not valid base64');
  t += '='.repeat((4 - t.length % 4) % 4);
  const bin = atob(t);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
export function bytesToBase64(b, urlSafe = false) {
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  const s = btoa(bin);
  return urlSafe ? s.replace(/\+/g, '-').replace(/\//g, '_') : s;
}
// Accepts hex (optionally 0x) or base64/base64url.
export function parseBytes(s) {
  const t = s.trim();
  if (/^(0x)?[0-9a-f\s]+$/i.test(t) && t.replace(/^0x/i, '').replace(/\s/g, '').length % 2 === 0) return hexToBytes(t);
  return base64ToBytes(t);
}
export function concat(...arrs) {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
export const bytesEqual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------- checksums ----------
export function crc16(data) {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return new Uint8Array([crc >> 8, crc & 0xff]);
}
function makeCrc32(poly) {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? poly ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return data => {
    let c = 0xffffffff;
    for (const b of data) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
}
export const crc32 = makeCrc32(0xedb88320);
const crc32cNum = makeCrc32(0x82f63b78);
// TON stores CRC32C little-endian.
export function crc32c(data) {
  const v = crc32cNum(data);
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, v >>> 24]);
}

// ---------- bits ----------
function getBit(bytes, i) { return (bytes[i >> 3] >> (7 - (i & 7))) & 1; }

// Bits padded the TON way: a single 1 bit then zeros up to a byte boundary.
function paddedBytes(bits, len) {
  const n = Math.ceil(len / 8);
  const out = bits.slice(0, n);
  if (len % 8) {
    const used = len % 8;
    out[n - 1] = (out[n - 1] & (0xff << (8 - used)) & 0xff) | (1 << (7 - used));
  }
  return out;
}

export class Builder {
  constructor() { this.bytes = new Uint8Array(128); this.length = 0; this.refs = []; }
  get availableBits() { return 1023 - this.length; }
  get availableRefs() { return 4 - this.refs.length; }
  storeBit(v) {
    if (this.length >= 1023) throw new Error('Cell overflow: more than 1023 bits');
    if (v) this.bytes[this.length >> 3] |= 1 << (7 - (this.length & 7));
    this.length++;
    return this;
  }
  storeUint(value, bits) {
    let v = BigInt(value);
    if (v < 0n || (bits < 1024 && v >= 1n << BigInt(bits))) throw new Error(`Value ${v} does not fit in ${bits} bits`);
    for (let i = bits - 1; i >= 0; i--) this.storeBit((v >> BigInt(i)) & 1n);
    return this;
  }
  storeInt(value, bits) {
    let v = BigInt(value);
    const lim = 1n << BigInt(bits - 1);
    if (v < -lim || v >= lim) throw new Error(`Value ${v} does not fit in ${bits} signed bits`);
    if (v < 0n) v += 1n << BigInt(bits);
    return this.storeUint(v, bits);
  }
  storeBytes(b) { for (const x of b) this.storeUint(x, 8); return this; }
  storeBits(bytes, len) { for (let i = 0; i < len; i++) this.storeBit(getBit(bytes, i)); return this; }
  storeRef(cell) {
    if (this.refs.length >= 4) throw new Error('Cell overflow: more than 4 refs');
    this.refs.push(cell);
    return this;
  }
  storeCoins(v) {
    const n = BigInt(v);
    if (n === 0n) return this.storeUint(0, 4);
    const len = Math.ceil(n.toString(16).length / 2);
    return this.storeUint(len, 4).storeUint(n, len * 8);
  }
  endCell() { return new Cell(this.bytes.slice(0, Math.ceil(this.length / 8)), this.length, this.refs, false); }
}
export const beginCell = () => new Builder();

export class Slice {
  constructor(cell) { this.cell = cell; this.pos = 0; this.refPos = 0; }
  get remainingBits() { return this.cell.bitLength - this.pos; }
  get remainingRefs() { return this.cell.refs.length - this.refPos; }
  loadBit() {
    if (this.pos >= this.cell.bitLength) throw new Error('Not enough bits in cell');
    return getBit(this.cell.bits, this.pos++);
  }
  loadUint(bits) { let v = 0n; for (let i = 0; i < bits; i++) v = (v << 1n) | BigInt(this.loadBit()); return v; }
  loadInt(bits) { const v = this.loadUint(bits); return v >= 1n << BigInt(bits - 1) ? v - (1n << BigInt(bits)) : v; }
  loadBytes(n) { const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = Number(this.loadUint(8)); return out; }
  loadRef() {
    if (this.refPos >= this.cell.refs.length) throw new Error('No more refs in cell');
    return this.cell.refs[this.refPos++];
  }
}

// ---------- cells ----------
export const CELL_TYPES = { [-1]: 'Ordinary', 1: 'Pruned branch', 2: 'Library', 3: 'Merkle proof', 4: 'Merkle update' };

const popcount = n => { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };
const maskLevel = m => 32 - Math.clz32(m);
const maskApply = (m, level) => m & ((1 << level) - 1);
const maskSignificant = (m, level) => level === 0 || ((m >> (level - 1)) & 1) === 1;

export class Cell {
  constructor(bits, bitLength, refs = [], exotic = false) {
    this.bits = bits;
    this.bitLength = bitLength;
    this.refs = refs;
    this.exotic = exotic;
    this.type = exotic ? (bitLength >= 8 ? bits[0] : 0) : -1;
    if (exotic && !(this.type in CELL_TYPES)) throw new Error('Unknown exotic cell type ' + this.type);
    this._calc();
  }
  beginParse() { return new Slice(this); }
  hash(level = 3) { return this._hashes[Math.min(level, 3)]; }
  depth(level = 3) { return this._depths[Math.min(level, 3)]; }
  get levelMask() { return this._mask; }

  // Port of @ton/core wonderCalculator: hashes and depths for every level.
  _calc() {
    const t = this.type, refs = this.refs;
    let mask, pruned = null;
    if (t === -1) mask = refs.reduce((m, r) => m | r._mask, 0);
    else if (t === 1) {
      if (refs.length) throw new Error('Pruned branch cell cannot have refs');
      if (this.bitLength === 280) mask = 1;
      else {
        mask = this.bits[1];
        const lvl = maskLevel(mask);
        if (lvl < 1 || lvl > 3) throw new Error('Pruned branch level must be 1..3');
        const size = 16 + (popcount(maskApply(mask, lvl - 1)) + 1) * (256 + 16);
        if (this.bitLength !== size) throw new Error(`Pruned branch must have ${size} bits`);
      }
      const lvl = maskLevel(mask), s = this.beginParse();
      s.loadUint(8); if (this.bitLength !== 280) s.loadUint(8);
      const hashes = [], depths = [];
      for (let i = 0; i < lvl; i++) hashes.push(s.loadBytes(32));
      for (let i = 0; i < lvl; i++) depths.push(Number(s.loadUint(16)));
      pruned = hashes.map((h, i) => ({ hash: h, depth: depths[i] }));
    } else if (t === 2) {
      if (this.bitLength !== 8 + 256) throw new Error('Library cell must have 264 bits');
      mask = 0;
    } else if (t === 3) {
      if (refs.length !== 1 || this.bitLength !== 8 + 256 + 16) throw new Error('Malformed Merkle proof cell');
      mask = refs[0]._mask >> 1;
    } else if (t === 4) {
      if (refs.length !== 2 || this.bitLength !== 8 + 2 * (256 + 16)) throw new Error('Malformed Merkle update cell');
      mask = (refs[0]._mask | refs[1]._mask) >> 1;
    }
    const totalHashCount = popcount(mask) + 1;
    const hashCount = t === 1 ? 1 : totalHashCount;
    const offset = totalHashCount - hashCount;
    const merkle = t === 3 || t === 4;
    const hashes = [], depths = [];
    for (let levelI = 0, hashI = 0; levelI <= maskLevel(mask); levelI++) {
      if (!maskSignificant(mask, levelI)) continue;
      if (hashI < offset) { hashI++; continue; }
      let dataBits, dataLen;
      if (hashI === offset) { dataBits = this.bits; dataLen = this.bitLength; }
      else { dataBits = hashes[hashI - offset - 1]; dataLen = 256; }
      const childLevel = merkle ? levelI + 1 : levelI;
      let depth = 0;
      for (const r of refs) depth = Math.max(depth, r.depth(childLevel));
      if (refs.length) depth++;
      const d1 = refs.length + (this.exotic ? 8 : 0) + maskApply(mask, levelI) * 32;
      const d2 = Math.ceil(this.bitLength / 8) + Math.floor(this.bitLength / 8);
      const parts = [new Uint8Array([d1, d2]), paddedBytes(dataBits, dataLen)];
      for (const r of refs) { const d = r.depth(childLevel); parts.push(new Uint8Array([d >> 8, d & 0xff])); }
      for (const r of refs) parts.push(r.hash(childLevel));
      hashes[hashI - offset] = sha256(concat(...parts));
      depths[hashI - offset] = depth;
      hashI++;
    }
    this._mask = mask;
    this._hashes = []; this._depths = [];
    const ownIndex = popcount(mask);
    for (let i = 0; i < 4; i++) {
      const idx = popcount(maskApply(mask, i));
      if (pruned && idx !== ownIndex) { this._hashes.push(pruned[idx].hash); this._depths.push(pruned[idx].depth); }
      else { const j = pruned ? 0 : idx; this._hashes.push(hashes[j]); this._depths.push(depths[j]); }
    }
  }
}

// ---------- BOC ----------
function readUintBE(b, off, n) { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[off + i]; return v; }

export function parseBoc(src) {
  if (src.length < 8) throw new Error('Too short to be a BOC');
  let p = 0;
  const magic = readUintBE(src, 0, 4); p = 4;
  let hasIdx, hasCrc, hasCacheBits = false, size, offBytes, info = {};
  if (magic === 0xb5ee9c72) {
    const f = src[p++];
    hasIdx = !!(f & 0x80); hasCrc = !!(f & 0x40); hasCacheBits = !!(f & 0x20); size = f & 7;
    info.magic = 'b5ee9c72 (generic)';
  } else if (magic === 0x68ff65f3 || magic === 0xacc3a728) {
    size = src[p++]; hasIdx = true; hasCrc = magic === 0xacc3a728;
    info.magic = magic.toString(16) + ' (legacy indexed)';
  } else throw new Error('Not a BOC: unknown magic ' + magic.toString(16).padStart(8, '0'));
  if (size < 1 || size > 4) throw new Error('Invalid BOC reference size');
  offBytes = src[p++];
  if (offBytes < 1 || offBytes > 8) throw new Error('Invalid BOC offset size');
  const need = n => { if (p + n > src.length) throw new Error('BOC is truncated'); };
  need(size * 3 + offBytes);
  const cellsCount = readUintBE(src, p, size); p += size;
  const rootsCount = readUintBE(src, p, size); p += size;
  const absent = readUintBE(src, p, size); p += size;
  const totalSize = readUintBE(src, p, offBytes); p += offBytes;
  let roots = [];
  if (magic === 0xb5ee9c72) { need(rootsCount * size); for (let i = 0; i < rootsCount; i++) { roots.push(readUintBE(src, p, size)); p += size; } }
  else roots = [0];
  if (hasIdx) { need(cellsCount * offBytes); p += cellsCount * offBytes; }
  need(totalSize);
  const data = src.subarray(p, p + totalSize); p += totalSize;
  if (hasCrc) {
    need(4);
    if (!bytesEqual(crc32c(src.subarray(0, p)), src.subarray(p, p + 4))) throw new Error('CRC32C checksum mismatch');
    p += 4;
  }
  if (p !== src.length) throw new Error(`${src.length - p} unexpected trailing bytes after BOC`);
  // Raw cells
  const raw = [];
  let q = 0;
  for (let i = 0; i < cellsCount; i++) {
    if (q + 2 > data.length) throw new Error('BOC cell data is truncated');
    const d1 = data[q++], d2 = data[q++];
    const refsCount = d1 & 7, exotic = !!(d1 & 8), withHashes = !!(d1 & 16), mask = d1 >> 5;
    if (refsCount > 4) throw new Error('Cell has more than 4 refs');
    if (withHashes) q += (popcount(mask) + 1) * (32 + 2);
    const dataBytes = Math.ceil(d2 / 2);
    if (q + dataBytes + refsCount * size > data.length) throw new Error('BOC cell data is truncated');
    let bits = data.slice(q, q + dataBytes), bitLength = dataBytes * 8;
    if (d2 % 2) {
      // Strip the completion tag: trailing zeros and the 1 bit before them.
      const last = bits[dataBytes - 1];
      if (!last) throw new Error('Invalid cell padding');
      const tz = Math.log2(last & -last);
      bitLength = dataBytes * 8 - tz - 1;
    }
    q += dataBytes;
    const refs = [];
    for (let r = 0; r < refsCount; r++) { refs.push(readUintBE(data, q, size)); q += size; }
    raw.push({ bits, bitLength, refs, exotic });
  }
  // Build from the end: refs always point to later cells.
  const cells = new Array(cellsCount);
  for (let i = cellsCount - 1; i >= 0; i--) {
    const r = raw[i];
    const refs = r.refs.map(j => {
      if (j <= i || j >= cellsCount) throw new Error('Invalid cell reference order');
      return cells[j];
    });
    cells[i] = new Cell(r.bits, r.bitLength, refs, r.exotic);
  }
  return {
    roots: roots.map(i => { if (i >= cellsCount) throw new Error('Invalid root index'); return cells[i]; }),
    info: { ...info, cells: cellsCount, roots: rootsCount, absent, hasIdx, hasCrc32c: hasCrc, hasCacheBits, refSize: size, offsetSize: offBytes, totalSize },
  };
}

export function serializeBoc(root, { idx = false, crc32 = true } = {}) {
  // Topological order: every cell comes before the cells it references; identical cells are stored once.
  const order = [], seen = new Map();
  const visit = c => {
    const k = bytesToHex(c.hash());
    if (seen.has(k)) return;
    seen.set(k, -1);
    for (const r of c.refs) visit(r);
    order.push(c);
  };
  visit(root);
  order.reverse();
  order.forEach((c, i) => seen.set(bytesToHex(c.hash()), i));
  const n = order.length;
  const size = Math.max(1, Math.ceil(Math.log2(n + 1) / 8));
  const cellBytes = order.map(c => {
    const d1 = c.refs.length + (c.exotic ? 8 : 0) + c.levelMask * 32;
    const d2 = Math.ceil(c.bitLength / 8) + Math.floor(c.bitLength / 8);
    const refs = [];
    for (const r of c.refs) {
      const j = seen.get(bytesToHex(r.hash()));
      for (let b = size - 1; b >= 0; b--) refs.push((j >> (8 * b)) & 0xff);
    }
    return concat(new Uint8Array([d1, d2]), paddedBytes(c.bits, c.bitLength), new Uint8Array(refs));
  });
  const total = cellBytes.reduce((s, b) => s + b.length, 0);
  const offBytes = Math.max(1, Math.ceil(Math.log2(total + 1) / 8));
  const be = (v, len) => { const o = new Uint8Array(len); for (let i = len - 1; i >= 0; i--) { o[i] = v % 256; v = Math.floor(v / 256); } return o; };
  const parts = [new Uint8Array([0xb5, 0xee, 0x9c, 0x72, (idx ? 0x80 : 0) | (crc32 ? 0x40 : 0) | size, offBytes]),
    be(n, size), be(1, size), be(0, size), be(total, offBytes), be(0, size)];
  if (idx) { let acc = 0; for (const b of cellBytes) { acc += b.length; parts.push(be(acc, offBytes)); } }
  parts.push(...cellBytes);
  let out = concat(...parts);
  if (crc32) out = concat(out, crc32c(out));
  return out;
}

export const bocFromString = s => parseBoc(parseBytes(s));

// ---------- addresses ----------
export function parseAddress(input) {
  const s = input.trim();
  const raw = s.match(/^(-?\d+):([0-9a-fA-F]{64})$/);
  if (raw) {
    const wc = Number(raw[1]);
    if (wc < -128 || wc > 127) throw new Error('Workchain must be between -128 and 127');
    return { workchain: wc, hash: hexToBytes(raw[2]), format: 'raw' };
  }
  if (s.length !== 48) throw new Error('Expected a raw address (workchain:64 hex chars) or a 48-character user-friendly address');
  const urlSafe = /[-_]/.test(s), std = /[+/]/.test(s);
  if (urlSafe && std) throw new Error('Address mixes base64 and base64url characters');
  let b;
  try { b = base64ToBytes(s); } catch { throw new Error('Address is not valid base64'); }
  if (b.length !== 36) throw new Error('User-friendly address must decode to 36 bytes');
  if (!bytesEqual(crc16(b.subarray(0, 34)), b.subarray(34))) throw new Error('Checksum (CRC16) does not match: the address has a typo');
  let tag = b[0];
  const testnet = !!(tag & 0x80);
  tag &= 0x7f;
  if (tag !== 0x11 && tag !== 0x51) throw new Error('Unknown address tag 0x' + b[0].toString(16));
  const wc = b[1] > 127 ? b[1] - 256 : b[1];
  return { workchain: wc, hash: b.slice(2, 34), bounceable: tag === 0x11, testnet, urlSafe: urlSafe || !std, format: 'friendly' };
}

export function formatFriendly(wc, hash, { bounceable = true, testnet = false, urlSafe = true } = {}) {
  const tag = (bounceable ? 0x11 : 0x51) | (testnet ? 0x80 : 0);
  const body = concat(new Uint8Array([tag, wc & 0xff]), hash);
  return bytesToBase64(concat(body, crc16(body)), urlSafe);
}
export const formatRaw = (wc, hash) => `${wc}:${bytesToHex(hash)}`;

export function stateInit(code, data) {
  return beginCell().storeBit(0).storeBit(0).storeBit(1).storeBit(1).storeBit(0).storeRef(code).storeRef(data).endCell();
}

// Reads a StateInit cell (split_depth, special, code, data, library).
export function readStateInit(cell) {
  const s = cell.beginParse();
  if (s.loadBit()) s.loadUint(5);
  if (s.loadBit()) s.loadUint(2);
  const code = s.loadBit() ? s.loadRef() : null;
  const data = s.loadBit() ? s.loadRef() : null;
  return { code, data };
}

// ---------- wallets ----------
const codeCells = {};
export function walletCode(version) {
  if (!codeCells[version]) codeCells[version] = parseBoc(base64ToBytes(WALLET_CODE[version])).roots[0];
  return codeCells[version];
}
export const WALLET_VERSIONS = ['v3r1', 'v3r2', 'v4r2', 'v5r1'];
export const DEFAULT_WALLET_ID = 698983191;

// v5r1 wallet_id: client context (workchain, version 0, subwallet) XOR network global id.
export function v5WalletId({ workchain = 0, subwallet = 0, networkGlobalId = -239 } = {}) {
  const ctx = beginCell().storeUint(1, 1).storeInt(workchain, 8).storeUint(0, 8).storeUint(subwallet, 15).endCell().beginParse().loadInt(32);
  return BigInt.asIntN(32, BigInt(networkGlobalId) ^ ctx);
}

export function walletData(version, publicKey, { workchain = 0, walletId, subwallet = 0, networkGlobalId = -239 } = {}) {
  if (publicKey.length !== 32) throw new Error('Public key must be 32 bytes');
  if (version === 'v5r1') {
    return beginCell().storeUint(1, 1).storeUint(0, 32).storeInt(v5WalletId({ workchain, subwallet, networkGlobalId }), 32)
      .storeBytes(publicKey).storeBit(0).endCell();
  }
  const id = walletId ?? DEFAULT_WALLET_ID + workchain;
  const b = beginCell().storeUint(0, 32).storeUint(id, 32).storeBytes(publicKey);
  if (version === 'v4r2') b.storeBit(0);
  return b.endCell();
}

export function walletAddress(version, publicKey, opts = {}) {
  const init = stateInit(walletCode(version), walletData(version, publicKey, opts));
  return { workchain: opts.workchain ?? 0, hash: init.hash(), stateInit: init };
}

// Finds which known wallet a StateInit belongs to and returns its public key.
export function walletFromStateInit(cell) {
  const { code, data } = readStateInit(cell);
  if (!code || !data) throw new Error('StateInit has no code or data');
  const codeHash = bytesToHex(code.hash());
  const version = WALLET_VERSIONS.find(v => bytesToHex(walletCode(v).hash()) === codeHash);
  if (!version) throw new Error('StateInit is not a known wallet contract (v3r1, v3r2, v4r2, v5r1)');
  const s = data.beginParse();
  if (version === 'v5r1') { s.loadUint(1); s.loadUint(32); s.loadUint(32); } else { s.loadUint(32); s.loadUint(32); }
  return { version, publicKey: s.loadBytes(32) };
}

// ---------- TON mnemonic ----------
async function hmacSha512(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
async function pbkdf2Sha512(password, salt, iterations, bytes = 64) {
  const k = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-512', salt: utf8(salt), iterations }, k, bytes * 8));
}
const PBKDF_ITERATIONS = 100000;
export const normalizeMnemonic = words => (Array.isArray(words) ? words : words.trim().split(/\s+/)).map(w => w.toLowerCase().trim()).filter(Boolean);
export const mnemonicToEntropy = (words, password = '') => hmacSha512(utf8(words.join(' ')), utf8(password));
const isBasicSeed = async e => (await pbkdf2Sha512(e, 'TON seed version', Math.max(1, Math.floor(PBKDF_ITERATIONS / 256))))[0] === 0;
const isPasswordSeed = async e => (await pbkdf2Sha512(e, 'TON fast seed version', 1))[0] === 1;

export async function isPasswordNeeded(words) {
  const e = await mnemonicToEntropy(words);
  return (await isPasswordSeed(e)) && !(await isBasicSeed(e));
}

// Returns { valid, reason }.
export async function validateMnemonic(input, password = '') {
  const words = normalizeMnemonic(input);
  const unknown = words.filter(w => !wordlist.includes(w));
  if (unknown.length) return { valid: false, reason: `Not in the word list: ${unknown.join(', ')}` };
  if (password && !(await isPasswordNeeded(words))) return { valid: false, reason: 'This mnemonic was not created with a password' };
  if (!(await isBasicSeed(await mnemonicToEntropy(words, password)))) {
    if (!password && (await isPasswordNeeded(words))) return { valid: false, reason: 'This mnemonic needs a password' };
    return { valid: false, reason: 'Not a valid TON mnemonic (checksum rule fails). It may be a BIP-39 phrase from another wallet' };
  }
  return { valid: true, reason: '' };
}

export async function mnemonicToKeyPair(input, password = '') {
  const words = normalizeMnemonic(input);
  const seed = await pbkdf2Sha512(await mnemonicToEntropy(words, password), 'TON default seed', PBKDF_ITERATIONS);
  const secret = seed.slice(0, 32);
  return { seed: secret, publicKey: ed25519.getPublicKey(secret) };
}

function randomIndex(n) {
  const limit = Math.floor(0x100000000 / n) * n, buf = new Uint32Array(1);
  for (;;) { crypto.getRandomValues(buf); if (buf[0] < limit) return buf[0] % n; }
}

export async function generateMnemonic(count = 24, password = '') {
  for (;;) {
    const words = Array.from({ length: count }, () => wordlist[randomIndex(wordlist.length)]);
    if (password && !(await isPasswordNeeded(words))) continue;
    if (!(await isBasicSeed(await mnemonicToEntropy(words, password)))) continue;
    return words;
  }
}

// ---------- secret keys ----------
// Accepts a 32-byte seed or a 64-byte secret key (seed + public key), hex or base64.
export function seedFromSecret(input) {
  const b = parseBytes(input);
  if (b.length === 32) return b;
  if (b.length === 64) {
    if (!bytesEqual(ed25519.getPublicKey(b.slice(0, 32)), b.slice(32))) throw new Error('The last 32 bytes are not the public key of the first 32 bytes');
    return b.slice(0, 32);
  }
  throw new Error(`Secret key must be 32 or 64 bytes, got ${b.length}`);
}

// ---------- comments ----------
export const OP_TEXT_COMMENT = 0;
export const OP_ENCRYPTED_COMMENT = 0x2167da4b;

function storeSnake(b, bytes) {
  const fit = Math.floor(b.availableBits / 8);
  if (bytes.length <= fit) return b.storeBytes(bytes);
  b.storeBytes(bytes.subarray(0, fit));
  return b.storeRef(storeSnake(beginCell(), bytes.subarray(fit)).endCell());
}
export const commentCell = text => storeSnake(beginCell().storeUint(0, 32), utf8(text)).endCell();

export function readSnakeBytes(slice) {
  const parts = [];
  let s = slice;
  for (;;) {
    if (s.remainingBits % 8) throw new Error('Snake data is not byte-aligned');
    parts.push(s.loadBytes(s.remainingBits / 8));
    if (!s.remainingRefs) break;
    s = s.loadRef().beginParse();
  }
  return concat(...parts);
}

// Returns { kind: 'text' | 'encrypted' | 'other', op, text?, bytes? }.
export function decodeComment(cell) {
  const s = cell.beginParse();
  if (s.remainingBits < 32) {
    if (s.remainingBits === 0 && !s.remainingRefs) return { kind: 'empty' };
    throw new Error('Body is shorter than a 32-bit op code');
  }
  const op = Number(s.loadUint(32));
  if (op === OP_TEXT_COMMENT) {
    const bytes = readSnakeBytes(s);
    let text, valid = true;
    try { text = fromUtf8(bytes, true); } catch { text = fromUtf8(bytes); valid = false; }
    return { kind: 'text', op, text, validUtf8: valid, bytes };
  }
  if (op === OP_ENCRYPTED_COMMENT) return { kind: 'encrypted', op, bytes: readSnakeBytes(s) };
  return { kind: 'other', op };
}

// ---------- amounts ----------
// Exact decimal ↔ integer conversion with a given number of decimals.
export function toUnits(text, decimals) {
  const s = text.trim().replace(/[_\s,]/g, '');
  const m = s.match(/^(-)?(\d*)(?:\.(\d*))?$/);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) throw new Error('Not a valid number');
  const frac = m[3] ?? '';
  if (frac.length > decimals && /[1-9]/.test(frac.slice(decimals))) throw new Error(`Too many decimal places: at most ${decimals}`);
  const v = BigInt((m[2] || '0') + frac.slice(0, decimals).padEnd(decimals, '0'));
  return m[1] ? -v : v;
}
export const groupDigits = s => s.replace(/^(-?)(\d+)/, (m, sign, int) => sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
export function fromUnits(value, decimals) {
  const v = BigInt(value), neg = v < 0n, a = neg ? -v : v;
  const s = a.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals), frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return (neg ? '-' : '') + int + (frac ? '.' + frac : '');
}
