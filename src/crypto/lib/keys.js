// Key parsing, generation and conversion: PEM (PKCS#8, SPKI, SEC1, PKCS#1), DER, JWK, raw, OpenSSH.
import { ed25519, x25519 } from '../../assets/vendor/@noble/curves@2.4.0/ed25519.esm.js';
import { secp256k1 } from '../../assets/vendor/@noble/curves@2.4.0/secp256k1.esm.js';
import { p256, p384 } from '../../assets/vendor/@noble/curves@2.4.0/nist.esm.js';
import { sha256 } from '../../assets/vendor/@noble/hashes@2.4.0/sha2.esm.js';
import { hex, base64, base64url, base64nopad, concat, utf8, utf8d, bytesToBig, bigToBytes, fmtHexColons } from './common.js';
import { parseDer, parsePem, toPem, readOid, isSeq, isUniv, raw, decodeInteger, seq, int, octet, bitstr, nul, oid, ctx } from './asn1.js';

export { ed25519, x25519, secp256k1, p256, p384 };

export const TYPES = {
  'Ed25519': { kind: 'okp', oid: '1.3.101.112', lib: ed25519, len: 32, sign: true },
  'X25519': { kind: 'okp', oid: '1.3.101.110', lib: x25519, len: 32, ecdh: true },
  'P-256': { kind: 'ec', curveOid: '1.2.840.10045.3.1.7', lib: p256, len: 32, sign: true, ecdh: true, ssh: 'nistp256' },
  'P-384': { kind: 'ec', curveOid: '1.3.132.0.34', lib: p384, len: 48, sign: true, ecdh: true, ssh: 'nistp384' },
  'secp256k1': { kind: 'ec', curveOid: '1.3.132.0.10', lib: secp256k1, len: 32, sign: true, ecdh: true },
  'RSA': { kind: 'rsa', sign: true },
};
const EC_OID = '1.2.840.10045.2.1';
const RSA_OID = '1.2.840.113549.1.1.1';
const typeByCurveOid = o => Object.keys(TYPES).find(k => TYPES[k].curveOid === o);
const typeByOid = o => Object.keys(TYPES).find(k => TYPES[k].oid === o);
const b64u = b => base64url.encode(b).replace(/=+$/, '');
const unb64u = s => base64url.decode(s + '='.repeat((4 - s.length % 4) % 4));

// A key is { type, priv?: Uint8Array, pub: Uint8Array, rsa?: { n, e, pkcs1?: Uint8Array } }.
// EC public keys are kept uncompressed (04 || x || y).

function fromPriv(type, priv) {
  const t = TYPES[type];
  if (priv.length !== t.len) throw new Error(`${type} private key must be ${t.len} bytes, got ${priv.length}.`);
  if (t.kind === 'ec') {
    if (!t.lib.utils.isValidSecretKey(priv)) throw new Error(`Not a valid ${type} private key (must be between 1 and n − 1).`);
    return { type, priv, pub: t.lib.getPublicKey(priv, false) };
  }
  return { type, priv, pub: t.lib.getPublicKey(priv) };
}

function fromPub(type, pub) {
  const t = TYPES[type];
  if (t.kind === 'ec') {
    let P;
    try { P = t.lib.Point.fromBytes(pub); } catch { throw new Error(`Not a valid ${type} public key point.`); }
    return { type, pub: P.toBytes(false) };
  }
  if (pub.length !== 32) throw new Error(`${type} public key must be 32 bytes.`);
  if (type === 'Ed25519') { try { ed25519.Point.fromBytes(pub); } catch { throw new Error('Not a valid Ed25519 public key.'); } }
  return { type, pub };
}

export function generate(type) {
  const t = TYPES[type];
  return fromPriv(type, t.lib.utils.randomSecretKey());
}

// ---------- RSA (via ASN.1 and WebCrypto) ----------

function rsaFromPkcs1Private(der) {
  const n = parseDer(der);
  if (!isSeq(n) || n.children.length < 9) throw new Error('Not a PKCS#1 RSA private key.');
  const [, N, E] = n.children.map(c => decodeInteger(c.value));
  return { type: 'RSA', rsa: { n: N, e: E, pkcs1: der }, priv: der, pub: rsaPublicPkcs1(N, E) };
}
function rsaFromPkcs1Public(der) {
  const n = parseDer(der);
  if (!isSeq(n) || n.children.length !== 2) throw new Error('Not a PKCS#1 RSA public key.');
  const N = decodeInteger(n.children[0].value), E = decodeInteger(n.children[1].value);
  return { type: 'RSA', rsa: { n: N, e: E }, pub: der };
}
const rsaPublicPkcs1 = (n, e) => seq(int(n), int(e));
export const rsaBits = key => key.rsa.n.toString(2).length;

export async function generateRsa(bits) {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: bits, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  return parseDerKey(pkcs8);
}

// ---------- DER parsing ----------

// Recognize PKCS#8, SPKI, SEC1 EC private key, PKCS#1 private/public.
export function parseDerKey(der, hint) {
  let n;
  try { n = parseDer(der); } catch (e) { throw new Error('Not valid DER: ' + e.message); }
  if (!isSeq(n)) throw new Error('A key structure must start with a SEQUENCE.');
  const c = n.children;
  // SPKI: SEQ { SEQ { OID, params }, BIT STRING }
  if (c.length === 2 && isSeq(c[0]) && isUniv(c[1], 3)) {
    const alg = readOid(c[0].children[0]);
    const pub = c[1].value.subarray(1);
    if (alg === EC_OID) {
      const type = typeByCurveOid(readOid(c[0].children[1]));
      if (!type) throw new Error('Unsupported elliptic curve.');
      return { ...fromPub(type, pub), format: 'SPKI public key' };
    }
    if (alg === RSA_OID) return { ...rsaFromPkcs1Public(pub), format: 'SPKI public key' };
    const type = typeByOid(alg);
    if (!type) throw new Error(`Unsupported key algorithm ${alg}.`);
    return { ...fromPub(type, pub), format: 'SPKI public key' };
  }
  // PKCS#8: SEQ { INTEGER, SEQ { OID, params }, OCTET STRING, ... }
  if (c.length >= 3 && isUniv(c[0], 2) && isSeq(c[1]) && isUniv(c[2], 4)) {
    const alg = readOid(c[1].children[0]);
    const inner = c[2].value;
    if (alg === EC_OID) {
      const curve = c[1].children[1] ? typeByCurveOid(readOid(c[1].children[1])) : hint;
      const k = parseSec1(inner, curve);
      return { ...k, format: 'PKCS#8 private key' };
    }
    if (alg === RSA_OID) return { ...rsaFromPkcs1Private(inner), format: 'PKCS#8 private key' };
    const type = typeByOid(alg);
    if (!type) throw new Error(`Unsupported key algorithm ${alg}.`);
    const os = parseDer(inner);
    if (!isUniv(os, 4)) throw new Error('Malformed Ed25519/X25519 private key.');
    return { ...fromPriv(type, os.value), format: 'PKCS#8 private key' };
  }
  // SEC1 ECPrivateKey: SEQ { INTEGER 1, OCTET STRING, [0] OID?, [1] BIT STRING? }
  if (c.length >= 2 && isUniv(c[0], 2) && isUniv(c[1], 4) && decodeInteger(c[0].value) === 1n) {
    return { ...parseSec1(der, hint), format: 'SEC1 EC private key' };
  }
  // PKCS#1 RSA private key: 9 INTEGERs
  if (c.length >= 9 && c.every(x => isUniv(x, 2))) return { ...rsaFromPkcs1Private(der), format: 'PKCS#1 RSA private key' };
  // PKCS#1 RSA public key: 2 INTEGERs
  if (c.length === 2 && c.every(x => isUniv(x, 2))) return { ...rsaFromPkcs1Public(der), format: 'PKCS#1 RSA public key' };
  throw new Error('Unrecognized key structure.');
}

function parseSec1(der, hint) {
  const n = parseDer(der);
  const c = n.children;
  const priv = c[1].value;
  let type = hint;
  const params = c.find(x => x.cls === 2 && x.tag === 0);
  if (params) type = typeByCurveOid(readOid(params.children[0]));
  if (!type || TYPES[type].kind !== 'ec') throw new Error('The curve is not specified; choose it under “Raw key type”.');
  const key = fromPriv(type, priv.length < TYPES[type].len ? concat(new Uint8Array(TYPES[type].len - priv.length), priv) : priv);
  const pubNode = c.find(x => x.cls === 2 && x.tag === 1);
  if (pubNode) {
    const embedded = pubNode.children[0].value.subarray(1);
    const P = TYPES[type].lib.Point.fromBytes(embedded).toBytes(false);
    if (hex.encode(P) !== hex.encode(key.pub)) key.mismatch = 'The embedded public key does not match the private key.';
  }
  return key;
}

// ---------- JWK ----------

export async function parseJwk(j) {
  if (j.kty === 'EC') {
    const type = { 'P-256': 'P-256', 'P-384': 'P-384', 'secp256k1': 'secp256k1' }[j.crv];
    if (!type) throw new Error(`Unsupported JWK curve ${j.crv}.`);
    if (j.d) {
      const k = fromPriv(type, unb64u(j.d));
      if (j.x && b64u(k.pub.subarray(1, 1 + TYPES[type].len)) !== j.x) k.mismatch = 'JWK "x" does not match "d".';
      return k;
    }
    return fromPub(type, concat(Uint8Array.of(4), unb64u(j.x), unb64u(j.y)));
  }
  if (j.kty === 'OKP') {
    const type = { Ed25519: 'Ed25519', X25519: 'X25519' }[j.crv];
    if (!type) throw new Error(`Unsupported OKP curve ${j.crv}.`);
    if (j.d) {
      const k = fromPriv(type, unb64u(j.d));
      if (j.x && b64u(k.pub) !== j.x) k.mismatch = 'JWK "x" does not match "d".';
      return k;
    }
    return fromPub(type, unb64u(j.x));
  }
  if (j.kty === 'RSA') {
    const { alg, key_ops, use, ...clean } = j;
    const algo = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    if (j.d) {
      const k = await crypto.subtle.importKey('jwk', clean, algo, true, ['sign']);
      return parseDerKey(new Uint8Array(await crypto.subtle.exportKey('pkcs8', k)));
    }
    const k = await crypto.subtle.importKey('jwk', clean, algo, true, ['verify']);
    return parseDerKey(new Uint8Array(await crypto.subtle.exportKey('spki', k)));
  }
  throw new Error(`Unsupported JWK key type ${j.kty}.`);
}

export async function toJwk(key, includePrivate = true) {
  const t = TYPES[key.type];
  if (t.kind === 'ec') {
    const L = t.len;
    const j = { kty: 'EC', crv: key.type, x: b64u(key.pub.subarray(1, 1 + L)), y: b64u(key.pub.subarray(1 + L)) };
    if (includePrivate && key.priv) j.d = b64u(key.priv);
    return j;
  }
  if (t.kind === 'okp') {
    const j = { kty: 'OKP', crv: key.type, x: b64u(key.pub) };
    if (includePrivate && key.priv) j.d = b64u(key.priv);
    return j;
  }
  const algo = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  if (includePrivate && key.priv) {
    const k = await crypto.subtle.importKey('pkcs8', pkcs8(key), algo, true, ['sign']);
    const { alg, key_ops, ext, ...j } = await crypto.subtle.exportKey('jwk', k);
    return j;
  }
  return { kty: 'RSA', n: b64u(bigToBytes(key.rsa.n)), e: b64u(bigToBytes(key.rsa.e)) };
}

// ---------- DER output ----------

export function spki(key) {
  const t = TYPES[key.type];
  if (t.kind === 'ec') return seq(seq(oid(EC_OID), oid(t.curveOid)), bitstr(key.pub));
  if (t.kind === 'okp') return seq(seq(oid(t.oid)), bitstr(key.pub));
  return seq(seq(oid(RSA_OID), nul()), bitstr(rsaPublicPkcs1(key.rsa.n, key.rsa.e)));
}

export function pkcs8(key) {
  if (!key.priv) throw new Error('This is a public key.');
  const t = TYPES[key.type];
  if (t.kind === 'ec') return seq(int(0), seq(oid(EC_OID), oid(t.curveOid)), octet(seq(int(1), octet(key.priv), ctx(1, bitstr(key.pub)))));
  if (t.kind === 'okp') return seq(int(0), seq(oid(t.oid)), octet(octet(key.priv)));
  return seq(int(0), seq(oid(RSA_OID), nul()), octet(key.rsa.pkcs1));
}

export function sec1(key) {
  const t = TYPES[key.type];
  return seq(int(1), octet(key.priv), ctx(0, oid(t.curveOid)), ctx(1, bitstr(key.pub)));
}

export const compressed = key => TYPES[key.type].lib.Point.fromBytes(key.pub).toBytes(true);

// ---------- OpenSSH public keys ----------

const sshStr = b => concat(bigToBytes(BigInt(b.length), 4), b);
const sshMpint = n => { let b = bigToBytes(n); if (b[0] & 0x80) b = concat(Uint8Array.of(0), b); return sshStr(b); };

export function sshBlob(key) {
  if (key.type === 'Ed25519') return concat(sshStr(utf8.encode('ssh-ed25519')), sshStr(key.pub));
  if (key.type === 'RSA') return concat(sshStr(utf8.encode('ssh-rsa')), sshMpint(key.rsa.e), sshMpint(key.rsa.n));
  const t = TYPES[key.type];
  if (t.ssh) { const name = 'ecdsa-sha2-' + t.ssh; return concat(sshStr(utf8.encode(name)), sshStr(utf8.encode(t.ssh)), sshStr(key.pub)); }
  return null;
}
export function sshPublic(key, comment = '') {
  const blob = sshBlob(key);
  if (!blob) return null;
  const name = utf8d.decode(blob.subarray(4, 4 + Number(bytesToBig(blob.subarray(0, 4)))));
  return `${name} ${base64.encode(blob)}${comment ? ' ' + comment : ''}`;
}
export function parseSshPublic(line) {
  const [name, b64] = line.trim().split(/\s+/);
  const blob = base64.decode(b64);
  let p = 0;
  const read = () => { const len = Number(bytesToBig(blob.subarray(p, p + 4))); const v = blob.subarray(p + 4, p + 4 + len); p += 4 + len; return v; };
  const kind = utf8d.decode(read());
  if (kind !== name) throw new Error('OpenSSH key type does not match its blob.');
  if (kind === 'ssh-ed25519') return { ...fromPub('Ed25519', read()), format: 'OpenSSH public key' };
  if (kind === 'ssh-rsa') { const e = bytesToBig(read()), n = bytesToBig(read()); return { type: 'RSA', rsa: { n, e }, pub: rsaPublicPkcs1(n, e), format: 'OpenSSH public key' }; }
  const m = kind.match(/^ecdsa-sha2-(nistp256|nistp384)$/);
  if (m) { read(); return { ...fromPub(m[1] === 'nistp256' ? 'P-256' : 'P-384', read()), format: 'OpenSSH public key' }; }
  throw new Error(`Unsupported OpenSSH key type ${kind}.`);
}

export function fingerprints(key) {
  const sp = spki(key);
  const blob = sshBlob(key);
  return {
    spkiSha256: fmtHexColons(sha256(sp)),
    ssh: blob ? 'SHA256:' + base64nopad.encode(sha256(blob)) : null,
  };
}

// ---------- Any input ----------

// Parse PEM, JWK JSON, OpenSSH public, DER hex/base64, or raw key bytes (with a type hint).
export async function parseAnyKey(text, hint = 'Ed25519', rawKind = 'private') {
  const t = String(text).trim();
  if (!t) throw new Error('Paste a key.');
  if (t.includes('-----BEGIN')) {
    const blocks = parsePem(t);
    if (!blocks.length) throw new Error('No complete PEM block found.');
    const { label, der } = blocks[0];
    if (label === 'ENCRYPTED PRIVATE KEY') throw new Error('Encrypted private keys are not supported. Decrypt it first (openssl pkcs8 -in key.pem).');
    if (label === 'OPENSSH PRIVATE KEY') throw new Error('OpenSSH private keys are not supported. Convert with: ssh-keygen -p -m PKCS8 -f key');
    const k = parseDerKey(der, TYPES[hint]?.kind === 'ec' ? hint : undefined);
    return { ...k, format: `PEM “${label}” (${k.format})` };
  }
  if (t.startsWith('{')) {
    let j;
    try { j = JSON.parse(t); } catch { throw new Error('Looks like JSON but does not parse.'); }
    if (j.keys && Array.isArray(j.keys)) j = j.keys[0];
    return { ...(await parseJwk(j)), format: 'JWK' };
  }
  if (/^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp\d+) /.test(t)) return parseSshPublic(t);
  const compact = t.replace(/^0x/i, '').replace(/[\s:]+/g, '');
  let bytes;
  if (/^[0-9a-fA-F]+$/.test(compact) && compact.length % 2 === 0) bytes = hex.decode(compact.toLowerCase());
  else {
    try { bytes = base64.decode(compact.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '').padEnd(Math.ceil(compact.replace(/=+$/, '').length / 4) * 4, '=')); }
    catch { throw new Error('Input is not PEM, JWK, OpenSSH, hex or base64.'); }
  }
  if (bytes[0] === 0x30 && bytes.length > 40) {
    try { return parseDerKey(bytes, hint); } catch {}
  }
  if (hint === 'RSA') throw new Error('Raw RSA keys are not supported; paste PEM, DER or JWK.');
  if (rawKind === 'public') return { ...fromPub(hint, bytes), format: `raw ${hint} public key` };
  return { ...fromPriv(hint, bytes), format: `raw ${hint} private key` };
}

export function describe(key) {
  if (key.type === 'RSA') return `RSA ${rsaBits(key)}-bit`;
  return key.type;
}

export { toPem, fmtHexColons };
