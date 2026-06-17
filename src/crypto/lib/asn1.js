// Minimal ASN.1 DER reader and writer, PEM handling and OID names.
import { hex, base64, concat } from './common.js';

// ---------- Reading ----------

const CLASSES = ['Universal', 'Application', 'Context', 'Private'];
export const UNIVERSAL = {
  1: 'BOOLEAN', 2: 'INTEGER', 3: 'BIT STRING', 4: 'OCTET STRING', 5: 'NULL', 6: 'OBJECT IDENTIFIER',
  7: 'ObjectDescriptor', 8: 'EXTERNAL', 9: 'REAL', 10: 'ENUMERATED', 12: 'UTF8String', 13: 'RELATIVE-OID',
  16: 'SEQUENCE', 17: 'SET', 18: 'NumericString', 19: 'PrintableString', 20: 'TeletexString',
  21: 'VideotexString', 22: 'IA5String', 23: 'UTCTime', 24: 'GeneralizedTime', 25: 'GraphicString',
  26: 'VisibleString', 27: 'GeneralString', 28: 'UniversalString', 30: 'BMPString',
};

// Parse one element at offset. Returns a node; throws on malformed input.
export function parseNode(bytes, offset = 0, depth = 0) {
  if (depth > 64) throw new Error('ASN.1 nesting is too deep.');
  const start = offset;
  if (offset >= bytes.length) throw new Error(`Unexpected end of data at byte ${offset}.`);
  const b0 = bytes[offset++];
  const cls = b0 >> 6;
  const constructed = !!(b0 & 0x20);
  let tag = b0 & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    let b;
    do {
      if (offset >= bytes.length) throw new Error('Truncated tag.');
      b = bytes[offset++];
      tag = tag * 128 + (b & 0x7f);
    } while (b & 0x80);
  }
  if (offset >= bytes.length) throw new Error(`Missing length at byte ${offset}.`);
  let len = bytes[offset++];
  let indefinite = false;
  if (len === 0x80) {
    if (!constructed) throw new Error(`Indefinite length on a primitive element at byte ${start}.`);
    indefinite = true;
    len = -1;
  } else if (len & 0x80) {
    const n = len & 0x7f;
    if (n > 4) throw new Error(`Length field too long at byte ${start}.`);
    len = 0;
    for (let i = 0; i < n; i++) {
      if (offset >= bytes.length) throw new Error('Truncated length.');
      len = len * 256 + bytes[offset++];
    }
  }
  const headerLen = offset - start;
  const node = { offset: start, headerLen, cls, clsName: CLASSES[cls], constructed, tag, indefinite, children: null };
  if (indefinite) {
    node.children = [];
    let p = offset;
    while (true) {
      if (p + 1 >= bytes.length) throw new Error('Missing end-of-contents for indefinite length.');
      if (bytes[p] === 0 && bytes[p + 1] === 0) { p += 2; break; }
      const c = parseNode(bytes, p, depth + 1);
      node.children.push(c);
      p = c.offset + c.headerLen + c.length + (c.indefinite ? 2 : 0);
    }
    node.length = p - offset - 2;
    node.value = bytes.subarray(offset, p - 2);
    node.end = p;
    return node;
  }
  if (offset + len > bytes.length) throw new Error(`Element at byte ${start} claims ${len} bytes but only ${bytes.length - offset} remain.`);
  node.length = len;
  node.value = bytes.subarray(offset, offset + len);
  node.end = offset + len;
  if (constructed) {
    node.children = [];
    let p = offset;
    while (p < offset + len) {
      const c = parseNode(bytes, p, depth + 1);
      node.children.push(c);
      p = c.end;
    }
    if (p !== offset + len) throw new Error(`Children overrun their parent at byte ${start}.`);
  }
  return node;
}

// Parse a whole DER buffer; trailing bytes are an error.
export function parseDer(bytes) {
  const root = parseNode(bytes, 0);
  if (root.end !== bytes.length) throw new Error(`${bytes.length - root.end} unexpected trailing bytes after the ASN.1 structure.`);
  return root;
}

export const typeName = n => n.cls === 0 ? (UNIVERSAL[n.tag] || `[UNIVERSAL ${n.tag}]`) : `[${n.cls === 2 ? '' : n.clsName.toUpperCase() + ' '}${n.tag}]`;
export const isSeq = n => n && n.cls === 0 && n.tag === 16;
export const isUniv = (n, tag) => n && n.cls === 0 && n.tag === tag;
export const raw = (bytes, n) => bytes.subarray(n.offset, n.end);

export function decodeOid(v) {
  if (!v.length) throw new Error('Empty OBJECT IDENTIFIER.');
  const parts = [];
  let n = 0n;
  for (let i = 0; i < v.length; i++) {
    n = (n << 7n) | BigInt(v[i] & 0x7f);
    if (!(v[i] & 0x80)) {
      if (!parts.length) {
        if (n < 40n) parts.push(0n, n);
        else if (n < 80n) parts.push(1n, n - 40n);
        else parts.push(2n, n - 80n);
      } else parts.push(n);
      n = 0n;
    }
  }
  return parts.join('.');
}

export function decodeInteger(v) {
  if (!v.length) return 0n;
  let n = BigInt('0x' + hex.encode(v));
  if (v[0] & 0x80) n -= 1n << BigInt(v.length * 8);
  return n;
}

export function decodeTime(n) {
  const s = new TextDecoder().decode(n.value);
  let m;
  if (n.tag === 23 && (m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/))) {
    const y = +m[1] >= 50 ? 1900 + +m[1] : 2000 + +m[1];
    return new Date(Date.UTC(y, +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
  }
  if (n.tag === 24 && (m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/))) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], m[7] ? Math.round(+('0.' + m[7]) * 1000) : 0));
  }
  return null;
}

const STRING_TAGS = { 12: 'utf-8', 18: 'ascii', 19: 'ascii', 20: 'latin1', 22: 'ascii', 26: 'ascii', 27: 'ascii' };
export function decodeString(n) {
  if (n.tag === 30) { // BMPString, UTF-16BE
    let s = '';
    for (let i = 0; i + 1 < n.value.length; i += 2) s += String.fromCharCode((n.value[i] << 8) | n.value[i + 1]);
    return s;
  }
  if (n.tag === 28) { // UniversalString, UTF-32BE
    let s = '';
    for (let i = 0; i + 3 < n.value.length; i += 4) s += String.fromCodePoint(((n.value[i] << 24) | (n.value[i + 1] << 16) | (n.value[i + 2] << 8) | n.value[i + 3]) >>> 0);
    return s;
  }
  return new TextDecoder(STRING_TAGS[n.tag] || 'utf-8').decode(n.value);
}
export const isStringTag = tag => tag in STRING_TAGS || tag === 30 || tag === 28;

// ---------- Writing ----------

function encLen(n) {
  if (n < 0x80) return Uint8Array.of(n);
  const out = [];
  while (n > 0) { out.unshift(n & 0xff); n = Math.floor(n / 256); }
  return Uint8Array.of(0x80 | out.length, ...out);
}
export const tlv = (tagByte, value) => concat(Uint8Array.of(tagByte), encLen(value.length), value);
export const seq = (...items) => tlv(0x30, concat(...items));
export const set = (...items) => tlv(0x31, concat(...items));
export const octet = v => tlv(0x04, v);
export const bitstr = (v, unused = 0) => tlv(0x03, concat(Uint8Array.of(unused), v));
export const nul = () => Uint8Array.of(0x05, 0x00);
export const ctx = (n, value, constructed = true) => tlv((constructed ? 0xa0 : 0x80) | n, value);

// INTEGER from a non-negative bigint or unsigned big-endian bytes.
export function int(x) {
  let b;
  if (typeof x === 'bigint' || typeof x === 'number') {
    let h = BigInt(x).toString(16);
    if (h.length % 2) h = '0' + h;
    b = hex.decode(h);
  } else b = x;
  let i = 0;
  while (i < b.length - 1 && b[i] === 0 && !(b[i + 1] & 0x80)) i++;
  b = b.subarray(i);
  if (!b.length) b = Uint8Array.of(0);
  if (b[0] & 0x80) b = concat(Uint8Array.of(0), b);
  return tlv(0x02, b);
}

export function oid(str) {
  const parts = str.split('.').map(BigInt);
  const out = [];
  const first = parts[0] * 40n + parts[1];
  for (const p of [first, ...parts.slice(2)]) {
    const chunk = [];
    let v = p;
    do { chunk.unshift(Number(v & 0x7fn)); v >>= 7n; } while (v > 0n);
    for (let i = 0; i < chunk.length - 1; i++) chunk[i] |= 0x80;
    out.push(...chunk);
  }
  return tlv(0x06, Uint8Array.from(out));
}

// ---------- PEM ----------

export function parsePem(text) {
  const blocks = [];
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  let m;
  while ((m = re.exec(text))) {
    const body = m[2].replace(/^[A-Za-z-]+:.*$/gm, '').replace(/\s+/g, '');
    try { blocks.push({ label: m[1], der: base64.decode(body) }); }
    catch { throw new Error(`The ${m[1]} block is not valid base64.`); }
  }
  return blocks;
}

export function toPem(label, der) {
  const b = base64.encode(der);
  return `-----BEGIN ${label}-----\n${b.match(/.{1,64}/g).join('\n')}\n-----END ${label}-----`;
}

// Bytes from PEM, hex or base64 (first PEM block if there are several).
export function readDerInput(text) {
  const t = String(text).trim();
  if (!t) throw new Error('Paste PEM, hex or base64.');
  if (t.includes('-----BEGIN')) {
    const blocks = parsePem(t);
    if (!blocks.length) throw new Error('No complete PEM block found (check the BEGIN/END lines).');
    return blocks[0].der;
  }
  const compact = t.replace(/^0x/i, '').replace(/[\s:]+/g, '');
  if (/^[0-9a-fA-F]+$/.test(compact) && compact.length % 2 === 0) return hex.decode(compact.toLowerCase());
  if (/^[A-Za-z0-9+/_-]+=*$/.test(compact)) {
    try { return base64.decode(compact.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '').padEnd(Math.ceil(compact.replace(/=+$/, '').length / 4) * 4, '=')); } catch {}
  }
  throw new Error('Input is not PEM, hex or base64.');
}

// ---------- OID names ----------

export const OIDS = {
  // Algorithms
  '1.2.840.113549.1.1.1': 'rsaEncryption', '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.10': 'RSASSA-PSS', '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption', '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.113549.1.1.8': 'mgf1', '1.2.840.113549.1.1.7': 'RSAES-OAEP',
  '1.2.840.10045.2.1': 'ecPublicKey', '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384', '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512', '1.2.840.10045.4.1': 'ecdsa-with-SHA1',
  '1.3.101.110': 'X25519', '1.3.101.111': 'X448', '1.3.101.112': 'Ed25519', '1.3.101.113': 'Ed448',
  '1.2.840.10045.3.1.7': 'prime256v1 (P-256)', '1.3.132.0.34': 'secp384r1 (P-384)', '1.3.132.0.35': 'secp521r1 (P-521)',
  '1.3.132.0.10': 'secp256k1',
  '2.16.840.1.101.3.4.2.1': 'sha256', '2.16.840.1.101.3.4.2.2': 'sha384', '2.16.840.1.101.3.4.2.3': 'sha512', '1.3.14.3.2.26': 'sha1',
  '1.2.840.113549.1.5.13': 'PBES2', '1.2.840.113549.1.5.12': 'PBKDF2', '2.16.840.1.101.3.4.1.42': 'aes256-CBC',
  // Name attributes
  '2.5.4.3': 'CN', '2.5.4.4': 'SN', '2.5.4.5': 'serialNumber', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST',
  '2.5.4.9': 'street', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.12': 'title', '2.5.4.15': 'businessCategory',
  '2.5.4.17': 'postalCode', '2.5.4.42': 'GN', '2.5.4.97': 'organizationIdentifier',
  '1.2.840.113549.1.9.1': 'emailAddress', '0.9.2342.19200300.100.1.25': 'DC', '0.9.2342.19200300.100.1.1': 'UID',
  '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC',
  // Extensions
  '2.5.29.14': 'Subject Key Identifier', '2.5.29.15': 'Key Usage', '2.5.29.17': 'Subject Alternative Name',
  '2.5.29.18': 'Issuer Alternative Name', '2.5.29.19': 'Basic Constraints', '2.5.29.31': 'CRL Distribution Points',
  '2.5.29.32': 'Certificate Policies', '2.5.29.35': 'Authority Key Identifier', '2.5.29.37': 'Extended Key Usage',
  '2.5.29.30': 'Name Constraints', '2.5.29.36': 'Policy Constraints', '1.3.6.1.5.5.7.1.1': 'Authority Information Access',
  '1.3.6.1.4.1.11129.2.4.2': 'Signed Certificate Timestamps', '1.3.6.1.5.5.7.1.24': 'TLS Feature',
  '1.2.840.113549.1.9.14': 'extensionRequest', '1.2.840.113549.1.9.7': 'challengePassword',
  // EKU
  '1.3.6.1.5.5.7.3.1': 'TLS Web Server Authentication', '1.3.6.1.5.5.7.3.2': 'TLS Web Client Authentication',
  '1.3.6.1.5.5.7.3.3': 'Code Signing', '1.3.6.1.5.5.7.3.4': 'E-mail Protection', '1.3.6.1.5.5.7.3.8': 'Time Stamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP Signing', '2.5.29.37.0': 'Any Extended Key Usage',
  // AIA
  '1.3.6.1.5.5.7.48.1': 'OCSP', '1.3.6.1.5.5.7.48.2': 'CA Issuers',
  // Policies
  '2.5.29.32.0': 'anyPolicy', '2.23.140.1.2.1': 'Domain Validated', '2.23.140.1.2.2': 'Organization Validated',
  '2.23.140.1.1': 'Extended Validation', '1.3.6.1.5.5.7.2.1': 'CPS', '1.3.6.1.5.5.7.2.2': 'User Notice',
  // PKCS
  '1.2.840.113549.1.7.1': 'data', '1.2.840.113549.1.7.2': 'signedData', '1.2.840.113549.1.9.3': 'contentType',
  '1.2.840.113549.1.9.4': 'messageDigest', '1.2.840.113549.1.9.5': 'signingTime',
};
export const oidName = o => OIDS[o] || null;
export const oidLabel = o => OIDS[o] ? `${OIDS[o]} (${o})` : o;

// Find the OID string of a node (throws if not an OID).
export function readOid(n) {
  if (!isUniv(n, 6)) throw new Error('Expected an OBJECT IDENTIFIER.');
  return decodeOid(n.value);
}
