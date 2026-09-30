// Shared helpers for the Sui tools: hashing, keys, addresses, BCS and Move type tags.
// Pinned, audited libraries only.
import { blake2b } from '../../assets/vendor/@noble/hashes@2.4.0/blake2.esm.js';
import { sha512 } from '../../assets/vendor/@noble/hashes@2.4.0/sha2.esm.js';
import { hmac } from '../../assets/vendor/@noble/hashes@2.4.0/hmac.esm.js';
import { ed25519 } from '../../assets/vendor/@noble/curves@2.4.0/ed25519.esm.js';
import { secp256k1 } from '../../assets/vendor/@noble/curves@2.4.0/secp256k1.esm.js';
import { p256 } from '../../assets/vendor/@noble/curves@2.4.0/nist.esm.js';
import { base58, base64, hex, bech32 } from '../../assets/vendor/@scure/base@2.4.0/index.esm.js';

export { blake2b, ed25519, secp256k1, p256, base58, base64, hex };

export const utf8 = new TextEncoder();
export const utf8d = new TextDecoder('utf-8', { fatal: true });

export const blake256 = data => blake2b(data, { dkLen: 32 });
export const toHex = b => hex.encode(b);
export const addr = b => '0x' + hex.encode(b);

export const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};
export const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Input parsing ----------

export function parseHex(s, label = 'Value') {
  const h = String(s).trim().replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase();
  if (!h) throw new Error(`${label} is empty.`);
  if (!/^[0-9a-f]*$/.test(h)) throw new Error(`${label} is not valid hex.`);
  if (h.length % 2) throw new Error(`${label} has an odd number of hex digits.`);
  return hex.decode(h);
}

export function parseBase64(s, label = 'Value') {
  const t = String(s).trim().replace(/\s+/g, '');
  if (!t) throw new Error(`${label} is empty.`);
  try { return base64.decode(t.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(t.length / 4) * 4, '=')); }
  catch { throw new Error(`${label} is not valid base64.`); }
}

// Bytes typed as hex (0x… or bare hex with even length) or base64.
export function parseHexOrBase64(s, label = 'Value') {
  const t = String(s).trim();
  if (!t) throw new Error(`${label} is empty.`);
  if (/^0x/i.test(t) || (/^[0-9a-fA-F\s]+$/.test(t) && t.replace(/\s+/g, '').length % 2 === 0 && !/[g-zG-Z+/=]/.test(t))) {
    try { return parseHex(t, label); } catch {}
  }
  return parseBase64(t, label);
}

// Message input as text (UTF-8), hex or base64.
export function parseMessage(input, encoding) {
  if (encoding === 'utf8') return utf8.encode(String(input));
  if (encoding === 'hex') return String(input).trim() === '' || /^0x$/i.test(String(input).trim()) ? new Uint8Array() : parseHex(input, 'Message');
  if (encoding === 'base64') return String(input).trim() === '' ? new Uint8Array() : parseBase64(input, 'Message');
  throw new Error('Unknown encoding.');
}

// Normalize a Sui address / object ID: 0x + 64 lowercase hex, left-padded.
export function normalizeAddress(s, label = 'Address') {
  const t = String(s).trim().toLowerCase();
  const h = t.replace(/^0x/, '');
  if (!h) throw new Error(`${label} is empty.`);
  if (!/^[0-9a-f]+$/.test(h)) throw new Error(`${label} must be hex (0x…).`);
  if (h.length > 64) throw new Error(`${label} is longer than 32 bytes.`);
  return '0x' + h.padStart(64, '0');
}
export const addressBytes = (s, label) => hex.decode(normalizeAddress(s, label).slice(2));

// ---------- Signature schemes and keys ----------

export const SCHEMES = {
  0: { name: 'Ed25519', pubLen: 32 },
  1: { name: 'Secp256k1', pubLen: 33 },
  2: { name: 'Secp256r1', pubLen: 33 },
  3: { name: 'MultiSig' },
  5: { name: 'zkLogin' },
  6: { name: 'Passkey' },
  7: { name: 'ML-DSA-65' },
};
export const FLAG = { ed25519: 0, secp256k1: 1, secp256r1: 2 };
export const schemeName = flag => (SCHEMES[flag] || { name: `unknown (0x${flag.toString(16).padStart(2, '0')})` }).name;

const curveOf = flag => flag === 1 ? secp256k1 : flag === 2 ? p256 : null;

export function publicKeyFromSecret(flag, secret) {
  if (secret.length !== 32) throw new Error(`Private key must be 32 bytes (got ${secret.length}).`);
  if (flag === 0) return ed25519.getPublicKey(secret);
  const c = curveOf(flag);
  if (!c) throw new Error('Unsupported key scheme.');
  try { return c.getPublicKey(secret, true); } catch { throw new Error(`Not a valid ${schemeName(flag)} private key (out of range).`); }
}

// Sui address = blake2b-256(flag || public key).
export function addressFromPublicKey(flag, pub) {
  return addr(blake256(concat(Uint8Array.of(flag), pub)));
}

// Validate a public key for a scheme; returns the 32/33-byte key (compressing 65-byte keys).
export function checkPublicKey(flag, pub) {
  if (flag === 0) {
    if (pub.length !== 32) throw new Error(`Ed25519 public keys are 32 bytes (got ${pub.length}).`);
    try { ed25519.Point.fromBytes(pub); } catch { throw new Error('Not a valid Ed25519 public key (not a curve point).'); }
    return pub;
  }
  const c = curveOf(flag);
  if (!c) throw new Error(`${schemeName(flag)} keys are not supported here.`);
  if (pub.length !== 33 && pub.length !== 65) throw new Error(`${schemeName(flag)} public keys are 33 bytes compressed (got ${pub.length}).`);
  try { return c.Point.fromBytes(pub).toBytes(true); } catch { throw new Error(`Not a valid ${schemeName(flag)} public key (not a curve point).`); }
}

export const SUI_PRIVKEY_PREFIX = 'suiprivkey';
export function encodeSuiPrivateKey(flag, secret) {
  return bech32.encode(SUI_PRIVKEY_PREFIX, bech32.toWords(concat(Uint8Array.of(flag), secret)));
}
export function decodeSuiPrivateKey(s) {
  let dec;
  try { dec = bech32.decode(String(s).trim().toLowerCase()); } catch { throw new Error('Not a valid suiprivkey string (bad Bech32 or checksum).'); }
  if (dec.prefix !== SUI_PRIVKEY_PREFIX) throw new Error(`Expected the "suiprivkey" prefix (got "${dec.prefix}").`);
  const b = Uint8Array.from(bech32.fromWords(dec.words));
  if (b.length !== 33) throw new Error(`suiprivkey must hold 33 bytes (flag + key), got ${b.length}.`);
  if (![0, 1, 2].includes(b[0])) throw new Error(`Unsupported key scheme flag 0x${b[0].toString(16)}.`);
  return { flag: b[0], secret: b.slice(1) };
}

// A private key typed as suiprivkey…, or as hex / base64 with a scheme chosen in the UI.
// Base64 of 33 bytes is the legacy keystore format: flag || key.
export function parsePrivateKey(input, schemeFlag) {
  const t = String(input).trim();
  if (!t) throw new Error('Private key is empty.');
  if (/^suiprivkey1/i.test(t)) return { ...decodeSuiPrivateKey(t), format: 'suiprivkey' };
  const bytes = parseHexOrBase64(t, 'Private key');
  if (bytes.length === 33 && [0, 1, 2].includes(bytes[0])) return { flag: bytes[0], secret: bytes.slice(1), format: 'flag + key (legacy keystore)' };
  if (bytes.length === 64 && schemeFlag === 0) return { flag: 0, secret: bytes.slice(0, 32), format: '64-byte Ed25519 secret (key + public key)', pubPart: bytes.slice(32) };
  if (bytes.length !== 32) throw new Error(`Private key must be 32 bytes (got ${bytes.length}), or a suiprivkey string.`);
  return { flag: schemeFlag, secret: bytes, format: 'raw 32 bytes' };
}

export function keyInfo(flag, secret) {
  const pub = publicKeyFromSecret(flag, secret);
  return {
    flag, secret, publicKey: pub,
    suiPublicKey: base64.encode(concat(Uint8Array.of(flag), pub)),
    address: addressFromPublicKey(flag, pub),
    suiprivkey: encodeSuiPrivateKey(flag, secret),
  };
}

export function randomSecret(flag) {
  if (flag === 0) return ed25519.utils.randomSecretKey();
  return curveOf(flag).utils.randomSecretKey();
}

// ---------- Intent messages and signatures ----------

export const INTENT = { TransactionData: 0, TransactionEffects: 1, CheckpointSummary: 2, PersonalMessage: 3 };

export function uleb128(n) {
  let v = BigInt(n);
  const out = [];
  do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v);
  return Uint8Array.from(out);
}

// Personal messages are signed as BCS vector<u8>; transactions as raw TransactionData bytes.
export function intentMessage(scope, bytes) {
  const value = scope === INTENT.PersonalMessage ? concat(uleb128(bytes.length), bytes) : bytes;
  return concat(Uint8Array.of(scope, 0, 0), value);
}

export function signDigest(flag, secret, digest) {
  if (flag === 0) return ed25519.sign(digest, secret);
  return curveOf(flag).sign(digest, secret, { lowS: true });
}
export function verifyDigest(flag, pub, digest, sig) {
  try {
    if (flag === 0) return ed25519.verify(sig, digest, pub);
    return curveOf(flag).verify(sig, digest, pub);
  } catch { return false; }
}

// Serialized signature: flag || signature || public key, base64.
export function serializeSignature(flag, sig, pub) {
  return base64.encode(concat(Uint8Array.of(flag), sig, pub));
}
export function parseSerializedSignature(s) {
  const bytes = parseBase64(s, 'Signature');
  if (!bytes.length) throw new Error('Signature is empty.');
  const flag = bytes[0];
  const sch = SCHEMES[flag];
  if (!sch) throw new Error(`Unknown signature scheme flag 0x${flag.toString(16).padStart(2, '0')}.`);
  if (!sch.pubLen) return { flag, unsupported: true, bytes };
  const want = 1 + 64 + sch.pubLen;
  if (bytes.length !== want) throw new Error(`${sch.name} signatures are ${want} bytes (flag + 64-byte signature + ${sch.pubLen}-byte public key); got ${bytes.length}.`);
  return { flag, signature: bytes.slice(1, 65), publicKey: bytes.slice(65), bytes };
}

// ---------- SLIP-0010 (Ed25519, hardened only) ----------

const HARDENED = 0x80000000;
export function slip10Ed25519(seed, path) {
  const parts = String(path).trim().split('/');
  if (parts.shift() !== 'm') throw new Error(`Invalid derivation path "${path}".`);
  let I = hmac(sha512, utf8.encode('ed25519 seed'), seed);
  let key = I.slice(0, 32), chain = I.slice(32);
  for (const p of parts) {
    if (!/^\d+'$/.test(p)) throw new Error('Ed25519 (SLIP-0010) supports hardened indexes only; every index needs \'.');
    const n = Number(p.slice(0, -1));
    if (n >= HARDENED) throw new Error(`Index ${n} is too large.`);
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, n + HARDENED);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32); chain = I.slice(32);
  }
  return key;
}

// ---------- BCS ----------

export class Reader {
  constructor(bytes) { this.b = bytes; this.pos = 0; }
  need(n, what) {
    if (this.pos + n > this.b.length) throw new Error(`Unexpected end of data at byte ${this.pos} while reading ${what} (need ${n} more byte${n === 1 ? '' : 's'}).`);
  }
  bytes(n, what = 'bytes') { this.need(n, what); const out = this.b.slice(this.pos, this.pos + n); this.pos += n; return out; }
  u8(what = 'u8') { this.need(1, what); return this.b[this.pos++]; }
  uint(bits, what) {
    const n = bits / 8; const raw = this.bytes(n, what || 'u' + bits);
    let v = 0n; for (let i = n - 1; i >= 0; i--) v = (v << 8n) | BigInt(raw[i]);
    return v;
  }
  uleb(what = 'length') {
    const start = this.pos; let v = 0n, shift = 0n;
    for (;;) {
      const b = this.u8(what);
      v |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7n;
      if (shift > 63n) throw new Error(`ULEB128 ${what} at byte ${start} is too long.`);
    }
    if (v > 0xffffffffn) throw new Error(`${what} at byte ${start} is too large (${v}).`);
    return Number(v);
  }
  bool(what = 'bool') { const at = this.pos, b = this.u8(what); if (b > 1) throw new Error(`Invalid bool value ${b} at byte ${at}.`); return b === 1; }
  string(what = 'string') { const at = this.pos, n = this.uleb(what + ' length'), raw = this.bytes(n, what); try { return utf8d.decode(raw); } catch { throw new Error(`${what} at byte ${at} is not valid UTF-8.`); } }
  address(what = 'address') { return addr(this.bytes(32, what)); }
  vec(fn, what = 'vector') { const n = this.uleb(what + ' length'); const out = []; for (let i = 0; i < n; i++) out.push(fn(i)); return out; }
  option(fn, what = 'option') { const at = this.pos, t = this.u8(what); if (t === 0) return null; if (t === 1) return fn(); throw new Error(`Invalid option tag ${t} at byte ${at}.`); }
  done(what = 'data') { if (this.pos !== this.b.length) throw new Error(`${this.b.length - this.pos} trailing byte(s) after ${what} (at byte ${this.pos}).`); }
}

export class Writer {
  constructor() { this.parts = []; }
  push(b) { this.parts.push(b instanceof Uint8Array ? b : Uint8Array.from(b)); return this; }
  u8(v) { return this.push([v]); }
  uint(bits, v) { let x = BigInt(v); const out = new Uint8Array(bits / 8); for (let i = 0; i < out.length; i++) { out[i] = Number(x & 0xffn); x >>= 8n; } return this.push(out); }
  uleb(n) { return this.push(uleb128(n)); }
  toBytes() { return concat(...this.parts); }
}

// ---------- Move type tags ----------
// TypeTag enum: bool, u8, u64, u128, address, signer, vector<T>, struct, u16, u32, u256.

const TAG_PRIMS = ['bool', 'u8', 'u64', 'u128', 'address', 'signer', null, null, 'u16', 'u32', 'u256'];

export function parseTypeTag(str) {
  const s = String(str).trim();
  let i = 0;
  const skip = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const ident = () => { skip(); const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i)); if (!m) throw new Error(`Expected a name at position ${i} in "${s}".`); i += m[0].length; return m[0]; };
  const expect = c => { skip(); if (!s.startsWith(c, i)) throw new Error(`Expected "${c}" at position ${i} in "${s}".`); i += c.length; };
  function tag() {
    skip();
    const m = /^0x[0-9a-fA-F]+|^[0-9a-fA-F]+(?=::)/.exec(s.slice(i));
    if (m) {
      i += m[0].length;
      const address = normalizeAddress(m[0].startsWith('0x') ? m[0] : '0x' + m[0], 'Type address');
      expect('::'); const module = ident(); expect('::'); const name = ident();
      const typeParams = [];
      skip();
      if (s[i] === '<') { i++; do { typeParams.push(tag()); skip(); } while (s[i] === ',' && ++i); expect('>'); }
      return { struct: { address, module, name, typeParams } };
    }
    const word = ident();
    if (word === 'vector') { expect('<'); const t = tag(); expect('>'); return { vector: t }; }
    if (TAG_PRIMS.includes(word)) return { [word]: true };
    throw new Error(`Unknown type "${word}". Use bool, u8–u256, address, vector<T> or 0x…::module::Type.`);
  }
  const t = tag(); skip();
  if (i !== s.length) throw new Error(`Unexpected "${s.slice(i)}" in type "${s}".`);
  return t;
}

export function writeTypeTag(w, t) {
  const k = Object.keys(t)[0];
  const idx = k === 'vector' ? 6 : k === 'struct' ? 7 : TAG_PRIMS.indexOf(k);
  w.uleb(idx);
  if (k === 'vector') writeTypeTag(w, t.vector);
  if (k === 'struct') {
    const st = t.struct;
    w.push(addressBytes(st.address));
    for (const x of [st.module, st.name]) { const b = utf8.encode(x); w.uleb(b.length).push(b); }
    w.uleb(st.typeParams.length);
    st.typeParams.forEach(p => writeTypeTag(w, p));
  }
}

export function readTypeTag(r, depth = 0) {
  if (depth > 32) throw new Error('Type tag is nested too deeply.');
  const at = r.pos, idx = r.uleb('type tag');
  if (idx === 6) return { vector: readTypeTag(r, depth + 1) };
  if (idx === 7) {
    const address = r.address('struct address'), module = r.string('module name'), name = r.string('struct name');
    return { struct: { address, module, name, typeParams: r.vec(() => readTypeTag(r, depth + 1), 'type parameters') } };
  }
  if (!TAG_PRIMS[idx]) throw new Error(`Unknown type tag variant ${idx} at byte ${at}.`);
  return { [TAG_PRIMS[idx]]: true };
}

// Short form for well-known framework addresses (0x1, 0x2, 0x3).
export function shortAddress(a) {
  const h = a.replace(/^0x/, '').replace(/^0+/, '');
  return h.length <= 4 ? '0x' + (h || '0') : a;
}
export function typeTagToString(t) {
  const k = Object.keys(t)[0];
  if (k === 'vector') return `vector<${typeTagToString(t.vector)}>`;
  if (k === 'struct') {
    const st = t.struct;
    return `${shortAddress(st.address)}::${st.module}::${st.name}` + (st.typeParams.length ? `<${st.typeParams.map(typeTagToString).join(', ')}>` : '');
  }
  return k;
}

// ---------- UI ----------

export function kvTable(rows) {
  return `<table class="kv"><tbody>${rows.map(([k, v, note]) => `
    <tr><th>${esc(k)}</th><td class="mono">${esc(v)}${note ? `<div class="muted">${esc(note)}</div>` : ''}</td>
    <td><button class="icon-btn copy" data-copy="${esc(v)}" title="Copy">Copy</button></td></tr>`).join('')}</tbody></table>`;
}

export function wireCopy(root = document) {
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const label = b.dataset.label || (b.dataset.label = b.textContent);
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; }
    catch { b.textContent = 'Press ⌘C'; }
    setTimeout(() => { b.textContent = label; }, 1200);
  });
}

export function showError(el, msg) {
  el.textContent = msg || '';
  el.hidden = !msg;
}

export const KEY_NOTE = 'Runs locally in your browser. Don’t paste keys that hold real funds.';
