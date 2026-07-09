// Shared Bitcoin helpers for the tool pages: bytes, hashes, scripts, transactions,
// addresses, compact targets. Crypto primitives come from audited libraries.
import { sha256, sha512 } from '../../assets/vendor/@noble/hashes@1.8.0/sha2.esm.js';
import { ripemd160 } from '../../assets/vendor/@noble/hashes@1.8.0/legacy.esm.js';
import { secp256k1, schnorr } from '../../assets/vendor/@noble/curves@1.9.7/secp256k1.esm.js';
import { base58, createBase58check, bech32, bech32m } from '../../assets/vendor/@scure/base@1.2.6/index.esm.js';

export { sha256, sha512, ripemd160, secp256k1, schnorr, base58, bech32, bech32m };

export class InputError extends Error {}

// ---------- Bytes ----------

const encoder = new TextEncoder();
export const utf8 = s => encoder.encode(s);
export const utf8Decode = b => new TextDecoder('utf-8', { fatal: false }).decode(b);

export function hexToBytes(input, what = 'Hex') {
  let s = String(input).replace(/\s+/g, '');
  if (/^0x/i.test(s)) s = s.slice(2);
  if (!/^[0-9a-fA-F]*$/.test(s)) {
    const bad = s.match(/[^0-9a-fA-F]/)[0];
    throw new InputError(`${what} contains a non-hex character "${bad}"`);
  }
  if (s.length % 2) throw new InputError(`${what} has an odd number of hex digits`);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export const bytesToHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
export const reverse = b => Uint8Array.from(b).reverse();

export function concat(...arrays) {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += a.length; }
  return out;
}

export const equalBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
export const bytesToBigInt = b => (b.length ? BigInt('0x' + bytesToHex(b)) : 0n);

export function bigIntToBytes(n, len) {
  let h = n.toString(16);
  if (h.length % 2) h = '0' + h;
  if (len !== undefined) {
    if (h.length > len * 2) throw new InputError(`Number does not fit in ${len} bytes`);
    h = h.padStart(len * 2, '0');
  }
  return hexToBytes(h);
}

export function u32le(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; }
export function i32le(n) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, n, true); return b; }
export function u64le(n) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; }

export function varint(n) {
  n = BigInt(n);
  if (n < 0xfdn) return Uint8Array.of(Number(n));
  if (n <= 0xffffn) return concat(Uint8Array.of(0xfd), u32le(Number(n)).slice(0, 2));
  if (n <= 0xffffffffn) return concat(Uint8Array.of(0xfe), u32le(Number(n)));
  return concat(Uint8Array.of(0xff), u64le(n));
}

/** Parse an unsigned integer written in decimal or 0x-hex. */
export function parseInteger(s, what = 'Number', { min = 0n, max } = {}) {
  const t = String(s).trim().replace(/_/g, '');
  if (!t) throw new InputError(`${what} is empty`);
  let n;
  if (/^0x[0-9a-f]+$/i.test(t)) n = BigInt(t);
  else if (/^-?\d+$/.test(t)) n = BigInt(t);
  else throw new InputError(`${what} must be a whole number (decimal or 0x-hex)`);
  if (n < min) throw new InputError(`${what} must be at least ${min}`);
  if (max !== undefined && n > max) throw new InputError(`${what} must be at most ${max}`);
  return n;
}

/** Sequential reader that remembers offsets, for byte-range breakdowns. */
export class Reader {
  constructor(bytes) { this.b = bytes; this.o = 0; }
  get left() { return this.b.length - this.o; }
  take(n, label = 'data') {
    if (n > this.left) throw new InputError(`Unexpected end of data while reading ${label}: need ${n} bytes at offset ${this.o}, only ${this.left} left`);
    const out = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return out;
  }
  u8(label) { return this.take(1, label)[0]; }
  u16(label) { const b = this.take(2, label); return b[0] | (b[1] << 8); }
  u32(label) { return new DataView(this.take(4, label).slice().buffer).getUint32(0, true); }
  i32(label) { return new DataView(this.take(4, label).slice().buffer).getInt32(0, true); }
  u64(label) { return new DataView(this.take(8, label).slice().buffer).getBigUint64(0, true); }
  varint(label = 'length') {
    const first = this.u8(label);
    if (first < 0xfd) return first;
    if (first === 0xfd) return this.u16(label);
    if (first === 0xfe) return this.u32(label);
    const v = this.u64(label);
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new InputError(`${label} is too large`);
    return Number(v);
  }
}

// ---------- Hashes ----------

export const hash256 = b => sha256(sha256(b));
export const hash160 = b => ripemd160(sha256(b));
export const base58check = createBase58check(sha256);

export function taggedHash(tag, ...msgs) {
  const t = sha256(utf8(tag));
  return sha256(concat(t, t, ...msgs));
}

/** Input read as UTF-8 text or hex bytes. */
export const readInput = (value, mode, what = 'Input') => (mode === 'hex' ? hexToBytes(value, what) : utf8(value));

// ---------- Networks ----------

export const NETWORKS = {
  mainnet: { label: 'Bitcoin mainnet', pkh: 0x00, sh: 0x05, hrp: 'bc', wif: 0x80 },
  testnet: { label: 'Bitcoin testnet', pkh: 0x6f, sh: 0xc4, hrp: 'tb', wif: 0xef },
  signet: { label: 'Bitcoin signet', pkh: 0x6f, sh: 0xc4, hrp: 'tb', wif: 0xef },
  regtest: { label: 'Bitcoin regtest', pkh: 0x6f, sh: 0xc4, hrp: 'bcrt', wif: 0xef },
  litecoin: { label: 'Litecoin', pkh: 0x30, sh: 0x32, hrp: 'ltc', wif: 0xb0 },
  dogecoin: { label: 'Dogecoin', pkh: 0x1e, sh: 0x16, hrp: null, wif: 0x9e },
};

export const networkOptions = (selected = 'mainnet') =>
  Object.entries(NETWORKS).map(([k, n]) => `<option value="${k}"${k === selected ? ' selected' : ''}>${n.label}</option>`).join('');

// ---------- Segwit addresses (BIP173 / BIP350) ----------

export function encodeSegwit(hrp, version, program) {
  if (version < 0 || version > 16) throw new InputError('Witness version must be 0–16');
  if (program.length < 2 || program.length > 40) throw new InputError('Witness program must be 2–40 bytes');
  if (version === 0 && program.length !== 20 && program.length !== 32) throw new InputError('Version 0 programs must be 20 or 32 bytes');
  const enc = version === 0 ? bech32 : bech32m;
  return enc.encode(hrp, [version, ...enc.toWords(program)]);
}

/** Decode a segwit address, enforcing BIP350 rules. Returns { hrp, version, program, encoding }. */
export function decodeSegwit(addr) {
  const s = String(addr).trim();
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) throw new InputError('Mixed upper and lower case is not allowed in bech32');
  let dec, encoding;
  for (const [name, enc] of [['bech32', bech32], ['bech32m', bech32m]]) {
    try { dec = enc.decode(s.toLowerCase(), 90); encoding = name; break; } catch {}
  }
  if (!dec) throw new InputError('Not a valid bech32/bech32m string (bad checksum or characters)');
  if (!dec.words.length) throw new InputError('Missing witness version');
  const version = dec.words[0];
  if (version > 16) throw new InputError(`Invalid witness version ${version}`);
  let program;
  try { program = bech32.fromWords(dec.words.slice(1)); } catch { throw new InputError('Invalid padding in the witness program'); }
  if (program.length < 2 || program.length > 40) throw new InputError(`Witness program is ${program.length} bytes; it must be 2–40`);
  if (version === 0 && program.length !== 20 && program.length !== 32) throw new InputError('Version 0 program must be 20 or 32 bytes');
  if (version === 0 && encoding !== 'bech32') throw new InputError('Version 0 addresses must use bech32, not bech32m');
  if (version !== 0 && encoding !== 'bech32m') throw new InputError(`Version ${version} addresses must use bech32m, not bech32`);
  return { hrp: dec.prefix, version, program, encoding };
}

/** Try every single-character substitution to locate a one-character typo in a bech32 string. */
export function locateBech32Error(s) {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const lower = s.toLowerCase(), sep = lower.lastIndexOf('1');
  if (sep < 1) return null;
  for (let i = sep + 1; i < lower.length; i++) {
    for (const c of CHARSET) {
      if (c === lower[i]) continue;
      const cand = lower.slice(0, i) + c + lower.slice(i + 1);
      for (const enc of [bech32, bech32m]) {
        try { enc.decode(cand, 90); return { index: i, char: lower[i], fix: c, fixed: cand }; } catch {}
      }
    }
  }
  return null;
}

// ---------- Scripts ----------

const OPCODES = {
  0x00: 'OP_0', 0x4c: 'OP_PUSHDATA1', 0x4d: 'OP_PUSHDATA2', 0x4e: 'OP_PUSHDATA4', 0x4f: 'OP_1NEGATE', 0x50: 'OP_RESERVED',
  0x61: 'OP_NOP', 0x62: 'OP_VER', 0x63: 'OP_IF', 0x64: 'OP_NOTIF', 0x65: 'OP_VERIF', 0x66: 'OP_VERNOTIF', 0x67: 'OP_ELSE',
  0x68: 'OP_ENDIF', 0x69: 'OP_VERIFY', 0x6a: 'OP_RETURN', 0x6b: 'OP_TOALTSTACK', 0x6c: 'OP_FROMALTSTACK', 0x6d: 'OP_2DROP',
  0x6e: 'OP_2DUP', 0x6f: 'OP_3DUP', 0x70: 'OP_2OVER', 0x71: 'OP_2ROT', 0x72: 'OP_2SWAP', 0x73: 'OP_IFDUP', 0x74: 'OP_DEPTH',
  0x75: 'OP_DROP', 0x76: 'OP_DUP', 0x77: 'OP_NIP', 0x78: 'OP_OVER', 0x79: 'OP_PICK', 0x7a: 'OP_ROLL', 0x7b: 'OP_ROT',
  0x7c: 'OP_SWAP', 0x7d: 'OP_TUCK', 0x7e: 'OP_CAT', 0x7f: 'OP_SUBSTR', 0x80: 'OP_LEFT', 0x81: 'OP_RIGHT', 0x82: 'OP_SIZE',
  0x83: 'OP_INVERT', 0x84: 'OP_AND', 0x85: 'OP_OR', 0x86: 'OP_XOR', 0x87: 'OP_EQUAL', 0x88: 'OP_EQUALVERIFY',
  0x89: 'OP_RESERVED1', 0x8a: 'OP_RESERVED2', 0x8b: 'OP_1ADD', 0x8c: 'OP_1SUB', 0x8d: 'OP_2MUL', 0x8e: 'OP_2DIV',
  0x8f: 'OP_NEGATE', 0x90: 'OP_ABS', 0x91: 'OP_NOT', 0x92: 'OP_0NOTEQUAL', 0x93: 'OP_ADD', 0x94: 'OP_SUB', 0x95: 'OP_MUL',
  0x96: 'OP_DIV', 0x97: 'OP_MOD', 0x98: 'OP_LSHIFT', 0x99: 'OP_RSHIFT', 0x9a: 'OP_BOOLAND', 0x9b: 'OP_BOOLOR',
  0x9c: 'OP_NUMEQUAL', 0x9d: 'OP_NUMEQUALVERIFY', 0x9e: 'OP_NUMNOTEQUAL', 0x9f: 'OP_LESSTHAN', 0xa0: 'OP_GREATERTHAN',
  0xa1: 'OP_LESSTHANOREQUAL', 0xa2: 'OP_GREATERTHANOREQUAL', 0xa3: 'OP_MIN', 0xa4: 'OP_MAX', 0xa5: 'OP_WITHIN',
  0xa6: 'OP_RIPEMD160', 0xa7: 'OP_SHA1', 0xa8: 'OP_SHA256', 0xa9: 'OP_HASH160', 0xaa: 'OP_HASH256',
  0xab: 'OP_CODESEPARATOR', 0xac: 'OP_CHECKSIG', 0xad: 'OP_CHECKSIGVERIFY', 0xae: 'OP_CHECKMULTISIG',
  0xaf: 'OP_CHECKMULTISIGVERIFY', 0xb0: 'OP_NOP1', 0xb1: 'OP_CHECKLOCKTIMEVERIFY', 0xb2: 'OP_CHECKSEQUENCEVERIFY',
  0xb3: 'OP_NOP4', 0xb4: 'OP_NOP5', 0xb5: 'OP_NOP6', 0xb6: 'OP_NOP7', 0xb7: 'OP_NOP8', 0xb8: 'OP_NOP9', 0xb9: 'OP_NOP10',
  0xba: 'OP_CHECKSIGADD', 0xff: 'OP_INVALIDOPCODE',
};
for (let i = 1; i <= 16; i++) OPCODES[0x50 + i] = 'OP_' + i;
export { OPCODES };

const NAME_TO_OP = {};
for (const [code, name] of Object.entries(OPCODES)) NAME_TO_OP[name] = Number(code);
Object.assign(NAME_TO_OP, { OP_FALSE: 0x00, OP_TRUE: 0x51, OP_NOP2: 0xb1, OP_NOP3: 0xb2, OP_CLTV: 0xb1, OP_CSV: 0xb2 });

export const opName = code => OPCODES[code] || `OP_UNKNOWN<0x${code.toString(16).padStart(2, '0')}>`;

/** Decompile script bytes into ops: { code, name, data?, start, end }. */
export function decompile(bytes) {
  const r = new Reader(bytes), ops = [];
  while (r.left) {
    const start = r.o, code = r.u8('opcode');
    let data;
    if (code >= 0x01 && code <= 0x4b) data = r.take(code, `${code}-byte push`);
    else if (code === 0x4c) data = r.take(r.u8('PUSHDATA1 length'), 'PUSHDATA1 data');
    else if (code === 0x4d) data = r.take(r.u16('PUSHDATA2 length'), 'PUSHDATA2 data');
    else if (code === 0x4e) data = r.take(r.u32('PUSHDATA4 length'), 'PUSHDATA4 data');
    const name = data ? (code <= 0x4b ? `PUSH ${code}` : opName(code)) : opName(code);
    ops.push({ code, name, data, start, end: r.o });
  }
  return ops;
}

// Data is printed as bare hex; short all-digit hex is wrapped in <…> so it isn't read back as a number.
export const toAsm = ops => ops.map(op => {
  if (!op.data) return op.name;
  const h = bytesToHex(op.data);
  return /^\d{1,10}$/.test(h) || !h ? `<${h}>` : h;
}).join(' ');

/** Minimal push of data bytes. */
export function pushData(data) {
  const n = data.length;
  if (n === 0) return Uint8Array.of(0x00);
  if (n === 1 && data[0] >= 1 && data[0] <= 16) return Uint8Array.of(0x50 + data[0]);
  if (n === 1 && data[0] === 0x81) return Uint8Array.of(0x4f);
  if (n <= 0x4b) return concat(Uint8Array.of(n), data);
  if (n <= 0xff) return concat(Uint8Array.of(0x4c, n), data);
  if (n <= 0xffff) return concat(Uint8Array.of(0x4d, n & 0xff, n >> 8), data);
  return concat(Uint8Array.of(0x4e), u32le(n), data);
}

/** Minimal script number encoding (CScriptNum). */
export function scriptNum(n) {
  n = BigInt(n);
  if (n === 0n) return new Uint8Array(0);
  const neg = n < 0n;
  let abs = neg ? -n : n;
  const out = [];
  while (abs > 0n) { out.push(Number(abs & 0xffn)); abs >>= 8n; }
  if (out[out.length - 1] & 0x80) out.push(neg ? 0x80 : 0x00);
  else if (neg) out[out.length - 1] |= 0x80;
  return Uint8Array.from(out);
}

/** Assemble ASM: OP_ names (prefix optional), decimal numbers, hex data (0x… or <…> or bare even-length hex). */
export function fromAsm(asm) {
  const tokens = String(asm).trim().split(/\s+/).filter(Boolean);
  const parts = [];
  for (const raw of tokens) {
    const t = raw.toUpperCase();
    const name = t.startsWith('OP_') ? t : 'OP_' + t;
    // Up to 10 digits is a number (fits a 4-byte script number); longer digit runs are hex data.
    if (/^-?\d{1,10}$/.test(raw)) {
      const n = BigInt(raw);
      if (n === 0n) parts.push(Uint8Array.of(0x00));
      else if (n === -1n) parts.push(Uint8Array.of(0x4f));
      else if (n >= 1n && n <= 16n) parts.push(Uint8Array.of(0x50 + Number(n)));
      else parts.push(pushData(scriptNum(n)));
    } else if (/^<[0-9a-f]*>$/i.test(raw) || /^0x[0-9a-f]*$/i.test(raw) || (/^[0-9a-f]+$/i.test(raw) && raw.length % 2 === 0 && !(name in NAME_TO_OP))) {
      const h = raw.replace(/^<|>$/g, '').replace(/^0x/i, '');
      const data = hexToBytes(h, `Data "${raw}"`);
      // Hex data is pushed as-is, never collapsed to OP_N, so it round-trips with decompile.
      parts.push(data.length === 0 ? Uint8Array.of(0x00) : data.length <= 0x4b ? concat(Uint8Array.of(data.length), data) : pushData(data));
    } else if (name in NAME_TO_OP) {
      parts.push(Uint8Array.of(NAME_TO_OP[name]));
    } else {
      throw new InputError(`Unknown opcode or token "${raw}"`);
    }
  }
  return concat(...parts);
}

/** Recognise standard output script templates. */
export function classifyScript(bytes) {
  const b = bytes, n = b.length;
  if (n === 25 && b[0] === 0x76 && b[1] === 0xa9 && b[2] === 0x14 && b[23] === 0x88 && b[24] === 0xac)
    return { type: 'p2pkh', name: 'P2PKH (pay to public key hash)', hash: b.slice(3, 23) };
  if (n === 23 && b[0] === 0xa9 && b[1] === 0x14 && b[22] === 0x87)
    return { type: 'p2sh', name: 'P2SH (pay to script hash)', hash: b.slice(2, 22) };
  if (n >= 4 && n <= 42 && (b[0] === 0x00 || (b[0] >= 0x51 && b[0] <= 0x60)) && b[1] === n - 2 && b[1] >= 2 && b[1] <= 40) {
    const version = b[0] === 0 ? 0 : b[0] - 0x50, program = b.slice(2);
    if (version === 0 && program.length === 20) return { type: 'p2wpkh', name: 'P2WPKH (native segwit v0, key hash)', version, program };
    if (version === 0 && program.length === 32) return { type: 'p2wsh', name: 'P2WSH (native segwit v0, script hash)', version, program };
    if (version === 1 && program.length === 32) return { type: 'p2tr', name: 'P2TR (taproot, segwit v1)', version, program };
    if (version !== 0) return { type: 'witness_unknown', name: `Segwit v${version} (not yet defined)`, version, program };
  }
  if ((n === 35 && b[0] === 33 && (b[1] === 2 || b[1] === 3) && b[34] === 0xac) || (n === 67 && b[0] === 65 && b[1] === 4 && b[66] === 0xac))
    return { type: 'p2pk', name: 'P2PK (pay to public key)', pubkey: b.slice(1, n - 1) };
  if (n >= 1 && b[0] === 0x6a) {
    let data = null;
    try { const ops = decompile(b.slice(1)); data = concat(...ops.filter(o => o.data).map(o => o.data)); } catch {}
    return { type: 'nulldata', name: 'OP_RETURN (data carrier, unspendable)', data };
  }
  try {
    const ops = decompile(b);
    const small = op => (op.code === 0 ? 0 : op.code >= 0x51 && op.code <= 0x60 ? op.code - 0x50 : null);
    if (ops.length >= 4 && ops[ops.length - 1].code === 0xae) {
      const m = small(ops[0]), nn = small(ops[ops.length - 2]), keys = ops.slice(1, -2);
      if (m !== null && nn !== null && keys.length === nn && m <= nn && keys.every(k => k.data && (k.data.length === 33 || k.data.length === 65)))
        return { type: 'multisig', name: `Bare multisig (${m}-of-${nn})`, m, n: nn, keys: keys.map(k => k.data) };
    }
  } catch {}
  return { type: 'nonstandard', name: 'Non-standard script' };
}

// ---------- Addresses ----------

export function scriptToAddress(script, net) {
  const c = classifyScript(script);
  if (c.type === 'p2pkh') return base58check.encode(concat(Uint8Array.of(net.pkh), c.hash));
  if (c.type === 'p2sh') return base58check.encode(concat(Uint8Array.of(net.sh), c.hash));
  if (c.program !== undefined) {
    if (!net.hrp) throw new InputError(`${net.label} has no segwit addresses`);
    return encodeSegwit(net.hrp, c.version, c.program);
  }
  return null;
}

export function witnessScript(version, program) {
  return concat(Uint8Array.of(version === 0 ? 0 : 0x50 + version, program.length), program);
}
export const p2pkhScript = h => concat(Uint8Array.of(0x76, 0xa9, 0x14), h, Uint8Array.of(0x88, 0xac));
export const p2shScript = h => concat(Uint8Array.of(0xa9, 0x14), h, Uint8Array.of(0x87));

/** Decode any address into its scriptPubKey. Returns { script, type, network(s), details }. */
export function addressToScript(addr) {
  const s = String(addr).trim();
  if (!s) throw new InputError('Address is empty');
  const lower = s.toLowerCase();
  const hrps = [...new Set(Object.values(NETWORKS).map(n => n.hrp).filter(Boolean))].sort((a, b) => b.length - a.length);
  const hrp = hrps.find(h => lower.startsWith(h + '1'));
  if (hrp) {
    const d = decodeSegwit(s);
    const nets = Object.entries(NETWORKS).filter(([, n]) => n.hrp === d.hrp).map(([, n]) => n.label);
    return { script: witnessScript(d.version, d.program), networks: nets, ...d };
  }
  let payload;
  try { payload = base58check.decode(s); } catch (e) {
    throw new InputError(/checksum/i.test(String(e.message)) ? 'Base58Check checksum does not match: the address has a typo' : 'Not a valid Base58Check or bech32 address');
  }
  if (payload.length !== 21) throw new InputError(`Base58 address payload is ${payload.length} bytes, expected 21`);
  const ver = payload[0], hash = payload.slice(1);
  const pk = Object.values(NETWORKS).filter(n => n.pkh === ver), sh = Object.values(NETWORKS).filter(n => n.sh === ver);
  if (pk.length) return { script: p2pkhScript(hash), networks: pk.map(n => n.label), version: ver, hash, kind: 'p2pkh' };
  if (sh.length) return { script: p2shScript(hash), networks: sh.map(n => n.label), version: ver, hash, kind: 'p2sh' };
  throw new InputError(`Unknown address version byte 0x${ver.toString(16).padStart(2, '0')}`);
}

// ---------- Keys ----------

export function parsePrivateKeyHex(s) {
  const b = hexToBytes(s, 'Private key');
  if (b.length !== 32) throw new InputError('Private key must be 32 bytes (64 hex characters)');
  if (!secp256k1.utils.isValidPrivateKey(b)) throw new InputError('Private key is out of range for secp256k1 (must be 1 … n−1)');
  return b;
}

export function encodeWif(priv, net, compressed = true) {
  return base58check.encode(concat(Uint8Array.of(net.wif), priv, compressed ? Uint8Array.of(1) : new Uint8Array(0)));
}

export function decodeWif(wif) {
  let p;
  try { p = base58check.decode(String(wif).trim()); } catch (e) {
    throw new InputError(/checksum/i.test(String(e.message)) ? 'WIF checksum does not match: the key has a typo' : 'Not a valid Base58Check string');
  }
  if (p.length !== 33 && !(p.length === 34 && p[33] === 1)) throw new InputError(`WIF payload is ${p.length} bytes; expected 33 (uncompressed) or 34 ending in 0x01 (compressed)`);
  const priv = p.slice(1, 33);
  if (!secp256k1.utils.isValidPrivateKey(priv)) throw new InputError('Private key is out of range for secp256k1');
  const nets = Object.entries(NETWORKS).filter(([, n]) => n.wif === p[0]);
  return { version: p[0], priv, compressed: p.length === 34, networks: nets.map(([k]) => k) };
}

/** Private key as hex or WIF. */
export function parseAnyPrivateKey(s) {
  const t = String(s).trim();
  if (/^(0x)?[0-9a-f]{64}$/i.test(t)) return { priv: parsePrivateKeyHex(t), compressed: true };
  return decodeWif(t);
}

export function parsePublicKey(s, what = 'Public key') {
  const b = hexToBytes(s, what);
  if (![33, 65].includes(b.length)) throw new InputError(`${what} must be 33 bytes (compressed) or 65 bytes (uncompressed)`);
  try { secp256k1.ProjectivePoint.fromHex(b); } catch { throw new InputError(`${what} is not a point on secp256k1`); }
  return b;
}

export const xOnly = pub => (pub.length === 32 ? pub : pub.slice(1, 33));

/** BIP341 key-path output key for an internal key with no script tree (BIP86). */
export function taprootTweak(internalX, merkleRoot = new Uint8Array(0)) {
  const P = schnorr.utils.lift_x(bytesToBigInt(internalX));
  const t = bytesToBigInt(taggedHash('TapTweak', internalX, merkleRoot));
  if (t >= secp256k1.CURVE.n) throw new InputError('Taproot tweak is out of range');
  const Q = P.add(secp256k1.ProjectivePoint.BASE.multiply(t));
  return Q.toRawBytes(true).slice(1);
}

/** All standard single-key addresses for a compressed (or uncompressed) public key. */
export function addressesForPubkey(pub, net) {
  const rows = [];
  const h = hash160(pub);
  rows.push({ type: 'P2PKH (legacy)', address: base58check.encode(concat(Uint8Array.of(net.pkh), h)) });
  if (pub.length === 33) {
    const redeem = witnessScript(0, h);
    rows.push({ type: 'P2SH-P2WPKH (nested segwit)', address: base58check.encode(concat(Uint8Array.of(net.sh), hash160(redeem))) });
    if (net.hrp) {
      rows.push({ type: 'P2WPKH (native segwit)', address: encodeSegwit(net.hrp, 0, h) });
      rows.push({ type: 'P2TR (taproot, BIP86 key path)', address: encodeSegwit(net.hrp, 1, taprootTweak(xOnly(pub))) });
    }
  }
  return rows;
}

// ---------- Transactions ----------

/**
 * Parse a raw transaction. Returns the decoded fields plus a flat list of
 * { name, start, end, value, group } entries covering every byte.
 */
export function parseTx(bytes) {
  if (!bytes.length) throw new InputError('Transaction is empty');
  const r = new Reader(bytes), fields = [];
  const field = (name, group, fn) => { const start = r.o; const value = fn(); fields.push({ name, group, start, end: r.o, value }); return value; };
  const version = field('Version', 'Header', () => r.i32('version'));
  let segwit = false;
  if (bytes.length > 6 && bytes[4] === 0x00 && bytes[5] !== 0x00) {
    segwit = true;
    field('Marker', 'Header', () => r.u8('marker'));
    field('Flag', 'Header', () => r.u8('flag'));
  }
  const bodyStart = r.o;
  const nIn = field('Input count', 'Inputs', () => r.varint('input count'));
  if (nIn > 100000) throw new InputError('Implausible input count; this is probably not a transaction');
  const inputs = [];
  for (let i = 0; i < nIn; i++) {
    const g = `Input ${i}`;
    const txid = field('Previous TXID', g, () => bytesToHex(reverse(r.take(32, 'previous txid'))));
    const vout = field('Previous output index', g, () => r.u32('output index'));
    const len = field('Script length', g, () => r.varint('scriptSig length'));
    const scriptSig = field('scriptSig', g, () => r.take(len, 'scriptSig'));
    const sequence = field('Sequence', g, () => r.u32('sequence'));
    inputs.push({ txid, vout, scriptSig, sequence, witness: [] });
  }
  const nOut = field('Output count', 'Outputs', () => r.varint('output count'));
  if (nOut > 100000) throw new InputError('Implausible output count; this is probably not a transaction');
  const outputs = [];
  for (let i = 0; i < nOut; i++) {
    const g = `Output ${i}`;
    const value = field('Amount (sats)', g, () => r.u64('amount'));
    const len = field('Script length', g, () => r.varint('scriptPubKey length'));
    const script = field('scriptPubKey', g, () => r.take(len, 'scriptPubKey'));
    outputs.push({ value, script });
  }
  const bodyEnd = r.o;
  if (segwit) {
    for (let i = 0; i < nIn; i++) {
      const g = `Witness ${i}`;
      const n = field('Item count', g, () => r.varint('witness item count'));
      for (let j = 0; j < n; j++) {
        const len = field(`Item ${j} length`, g, () => r.varint('witness item length'));
        inputs[i].witness.push(field(`Item ${j}`, g, () => r.take(len, 'witness item')));
      }
    }
  }
  const lockStart = r.o;
  const locktime = field('Locktime', 'Footer', () => r.u32('locktime'));
  if (r.left) throw new InputError(`${r.left} unexpected bytes after the locktime`);
  const stripped = concat(bytes.slice(0, 4), bytes.slice(bodyStart, bodyEnd), bytes.slice(lockStart));
  const txid = bytesToHex(reverse(hash256(stripped)));
  const wtxid = bytesToHex(reverse(hash256(bytes)));
  const weight = stripped.length * 3 + bytes.length;
  return { version, segwit, inputs, outputs, locktime, fields, txid, wtxid, size: bytes.length, baseSize: stripped.length, weight, vsize: Math.ceil(weight / 4) };
}

export function formatSats(v) {
  v = BigInt(v);
  const btc = v / 100000000n, frac = (v % 100000000n).toString().padStart(8, '0');
  return `${v.toLocaleString('en-US')} sats (${btc}.${frac} BTC)`;
}

/** BTC or sats amount → sats. "0.001 BTC", "1000 sats", "1000" (sats). */
export function parseAmount(s, what = 'Amount') {
  const t = String(s).trim().toLowerCase().replace(/[,_\s]/g, '');
  let m = t.match(/^(\d+)(?:\.(\d+))?btc$/);
  if (m) {
    if ((m[2] || '').length > 8) throw new InputError(`${what} has more than 8 decimal places`);
    return BigInt(m[1]) * 100000000n + BigInt((m[2] || '').padEnd(8, '0'));
  }
  m = t.match(/^(\d+)(?:sats?)?$/);
  if (m) return BigInt(m[1]);
  throw new InputError(`${what} must be whole satoshis (e.g. 15000) or BTC with a unit (e.g. 0.00015 BTC)`);
}

// ---------- Sequence / locktime ----------

export function describeSequence(seq) {
  const out = [];
  const final = seq === 0xffffffff;
  out.push({ label: 'Final (0xffffffff)', value: final ? 'Yes: disables locktime and relative locktime for this input' : 'No', copy: false });
  out.push({ label: 'Signals RBF (BIP125)', value: seq < 0xfffffffe ? 'Yes (sequence below 0xfffffffe)' : 'No', copy: false });
  out.push({ label: 'Enables nLockTime', value: final ? 'No (all inputs final ignores locktime)' : 'Yes (not 0xffffffff)', copy: false });
  const disabled = (seq & 0x80000000) !== 0;
  if (disabled) {
    out.push({ label: 'Relative locktime (BIP68)', value: 'Disabled (bit 31 set)', copy: false });
  } else {
    const time = (seq & 0x00400000) !== 0, value = seq & 0xffff;
    if (time) {
      const secs = value * 512;
      out.push({ label: 'Relative locktime (BIP68)', value: `${value} × 512 s = ${secs.toLocaleString('en-US')} seconds (${humanDuration(secs)})`, copy: false, note: 'Time-based (bit 22 set). Needs transaction version ≥ 2.' });
    } else {
      out.push({ label: 'Relative locktime (BIP68)', value: `${value} block${value === 1 ? '' : 's'} (about ${humanDuration(value * 600)})`, copy: false, note: 'Block-based (bit 22 clear). Needs transaction version ≥ 2.' });
    }
    if (seq & 0x7fbf0000) out.push({ label: 'Unused bits', value: 'Some bits outside 0–15 and 22 are set; BIP68 ignores them', copy: false });
  }
  return out;
}

export function humanDuration(secs) {
  if (secs < 60) return `${secs} s`;
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  return [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ') || `${secs} s`;
}

export function describeLocktime(lt) {
  if (lt === 0) return 'No locktime (0)';
  if (lt < 500000000) return `Block height ${lt.toLocaleString('en-US')}`;
  return `Unix time ${lt} (${new Date(lt * 1000).toISOString().replace('.000Z', 'Z')})`;
}

// ---------- Compact targets ----------

export const POW_LIMIT_BITS = 0x1d00ffff;

export function bitsToTarget(bits) {
  const exp = bits >>> 24, mant = bits & 0x007fffff;
  const negative = (bits & 0x00800000) !== 0 && mant !== 0;
  const overflow = mant !== 0 && (exp > 34 || (mant > 0xff && exp > 33) || (mant > 0xffff && exp > 32));
  const target = exp <= 3 ? BigInt(mant) >> BigInt(8 * (3 - exp)) : BigInt(mant) << BigInt(8 * (exp - 3));
  return { target, negative, overflow, exponent: exp, mantissa: mant };
}

export function targetToBits(target) {
  if (target < 0n) throw new InputError('Target must not be negative');
  let size = target === 0n ? 0 : Math.ceil(target.toString(16).length / 2);
  let compact = size <= 3 ? Number(target << BigInt(8 * (3 - size))) : Number(target >> BigInt(8 * (size - 3)));
  if (compact & 0x00800000) { compact >>>= 8; size++; }
  return ((size << 24) | compact) >>> 0;
}

export const MAX_TARGET = bitsToTarget(POW_LIMIT_BITS).target;

/** Difficulty = max target / target, as a decimal string with 8 places. */
export function difficulty(target) {
  if (target === 0n) return '∞';
  const scaled = (MAX_TARGET * 100000000n) / target;
  const int = scaled / 100000000n, frac = (scaled % 100000000n).toString().padStart(8, '0').replace(/0+$/, '');
  return int.toLocaleString('en-US') + (frac ? '.' + frac : '');
}

export const hex32 = n => n.toString(16).padStart(64, '0');
export const hexU32 = n => '0x' + (n >>> 0).toString(16).padStart(8, '0');

// ---------- Block headers ----------

export function parseHeader(bytes) {
  if (bytes.length !== 80) throw new InputError(`A block header is exactly 80 bytes; this is ${bytes.length}`);
  const r = new Reader(bytes);
  const version = r.i32(), prev = bytesToHex(reverse(r.take(32))), merkle = bytesToHex(reverse(r.take(32)));
  const time = r.u32(), bits = r.u32(), nonce = r.u32();
  const hash = bytesToHex(reverse(hash256(bytes)));
  return { version, prev, merkle, time, bits, nonce, hash };
}

export function serializeHeader({ version, prev, merkle, time, bits, nonce }) {
  const p = hexToBytes(prev, 'Previous block hash'), m = hexToBytes(merkle, 'Merkle root');
  if (p.length !== 32) throw new InputError('Previous block hash must be 32 bytes');
  if (m.length !== 32) throw new InputError('Merkle root must be 32 bytes');
  return concat(i32le(version), reverse(p), reverse(m), u32le(time), u32le(bits), u32le(nonce));
}
