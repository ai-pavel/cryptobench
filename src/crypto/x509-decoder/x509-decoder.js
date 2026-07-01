// X.509 / CSR Decoder: decode certificates and signing requests, and verify their signatures.
import { kvTable, wireCopy, showError, esc, hex, debounce, fmtHexColons } from '../lib/common.js';
import { parseDer, parsePem, readDerInput, decodeOid, decodeInteger, decodeTime, decodeString, isStringTag, oidName, oidLabel, raw, isSeq } from '../lib/asn1.js';
import { parseDerKey, describe as describeKey, TYPES } from '../lib/keys.js';
import { sha1 } from '../../assets/vendor/@noble/hashes@2.4.0/legacy.esm.js';
import { sha256, sha384, sha512 } from '../../assets/vendor/@noble/hashes@2.4.0/sha2.esm.js';

export const KU = ['Digital Signature', 'Non Repudiation', 'Key Encipherment', 'Data Encipherment', 'Key Agreement', 'Certificate Sign', 'CRL Sign', 'Encipher Only', 'Decipher Only'];

export function nameToString(bytes, n) {
  return n.children.map(set => set.children.map(atv => {
    const o = decodeOid(atv.children[0].value);
    const v = atv.children[1];
    const val = isStringTag(v.tag) ? decodeString(v) : hex.encode(v.value);
    return `${oidName(o) || o}=${val}`;
  }).join('+')).join(', ');
}

export function generalName(n) {
  const v = n.value;
  switch (n.tag) {
    case 1: return `email:${new TextDecoder().decode(v)}`;
    case 2: return `DNS:${new TextDecoder().decode(v)}`;
    case 6: return `URI:${new TextDecoder().decode(v)}`;
    case 7: return v.length === 4 ? `IP:${[...v].join('.')}` : v.length === 16 ? `IP:${[...Array(8)].map((_, i) => ((v[2 * i] << 8) | v[2 * i + 1]).toString(16)).join(':')}` : `IP:${hex.encode(v)}`;
    case 4: return `DirName:${nameToString(null, n.children[0])}`;
    case 8: return `RID:${decodeOid(v)}`;
    case 0: return `othername:${n.children ? decodeOid(n.children[0].value) : ''}`;
    default: return `[${n.tag}] ${hex.encode(v)}`;
  }
}
const collect = (n, pred, out = []) => { if (pred(n)) out.push(n); (n.children || []).forEach(c => collect(c, pred, out)); return out; };

export function decodeExt(o, value) {
  const n = parseDer(value);
  switch (o) {
    case '2.5.29.17': case '2.5.29.18': return n.children.map(generalName).join(', ');
    case '2.5.29.15': {
      const unused = n.value[0], bits = [];
      const data = n.value.subarray(1);
      for (let i = 0; i < data.length * 8 - unused; i++) if (data[i >> 3] & (0x80 >> (i & 7))) bits.push(KU[i] || `bit ${i}`);
      return bits.join(', ');
    }
    case '2.5.29.37': return n.children.map(c => oidLabel(decodeOid(c.value))).join(', ');
    case '2.5.29.19': {
      const ca = n.children.find(c => c.cls === 0 && c.tag === 1);
      const pl = n.children.find(c => c.cls === 0 && c.tag === 2);
      return `CA: ${ca && ca.value[0] ? 'TRUE' : 'FALSE'}${pl ? `, path length ${decodeInteger(pl.value)}` : ''}`;
    }
    case '2.5.29.14': return fmtHexColons(n.value);
    case '2.5.29.35': {
      const kid = n.children.find(c => c.cls === 2 && c.tag === 0);
      return kid ? `keyid:${fmtHexColons(kid.value)}` : 'present';
    }
    case '2.5.29.31': return collect(n, x => x.cls === 2 && x.tag === 6 && !x.constructed).map(x => new TextDecoder().decode(x.value)).join(', ') || 'present';
    case '1.3.6.1.5.5.7.1.1': return n.children.map(ad => `${oidName(decodeOid(ad.children[0].value)) || decodeOid(ad.children[0].value)} – ${generalName(ad.children[1])}`).join('; ');
    case '2.5.29.32': return n.children.map(pi => {
      const p = decodeOid(pi.children[0].value);
      const cps = collect(pi, x => x.cls === 0 && x.tag === 22).map(x => new TextDecoder().decode(x.value));
      return oidLabel(p) + (cps.length ? ` (CPS: ${cps.join(', ')})` : '');
    }).join('; ');
    default: return null;
  }
}

export const HASH = { sha1: ['SHA-1', sha1], sha256: ['SHA-256', sha256], sha384: ['SHA-384', sha384], sha512: ['SHA-512', sha512] };
export const SIGALG = {
  '1.2.840.113549.1.1.5': { kind: 'rsa', hash: 'sha1' }, '1.2.840.113549.1.1.11': { kind: 'rsa', hash: 'sha256' },
  '1.2.840.113549.1.1.12': { kind: 'rsa', hash: 'sha384' }, '1.2.840.113549.1.1.13': { kind: 'rsa', hash: 'sha512' },
  '1.2.840.10045.4.1': { kind: 'ecdsa', hash: 'sha1' }, '1.2.840.10045.4.3.2': { kind: 'ecdsa', hash: 'sha256' },
  '1.2.840.10045.4.3.3': { kind: 'ecdsa', hash: 'sha384' }, '1.2.840.10045.4.3.4': { kind: 'ecdsa', hash: 'sha512' },
  '1.3.101.112': { kind: 'ed25519' }, '1.2.840.113549.1.1.10': { kind: 'pss' },
};

// Verify `sig` over `data` (signature algorithm OID `alg`) with the SPKI DER `spkiDer`.
export async function verifySig(alg, data, sig, spkiDer) {
  const a = SIGALG[alg];
  if (!a) return { status: 'unsupported', text: `Signature algorithm ${oidLabel(alg)} is not supported.` };
  if (a.kind === 'pss') return { status: 'unsupported', text: 'RSA-PSS signatures are not verified here.' };
  const key = parseDerKey(spkiDer);
  if (a.kind === 'ed25519') return { status: TYPES.Ed25519.lib.verify(sig, data, key.pub) ? 'valid' : 'invalid' };
  if (a.kind === 'rsa') {
    if (key.type !== 'RSA') return { status: 'invalid', text: 'Key type does not match the RSA signature algorithm.' };
    const k = await crypto.subtle.importKey('spki', spkiDer, { name: 'RSASSA-PKCS1-v1_5', hash: HASH[a.hash][0] }, false, ['verify']);
    return { status: await crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, sig, data) ? 'valid' : 'invalid' };
  }
  const t = TYPES[key.type];
  if (!t || t.kind !== 'ec') return { status: 'invalid', text: 'Key type does not match the ECDSA signature algorithm.' };
  const digest = HASH[a.hash][1](data);
  try { return { status: t.lib.verify(sig, digest, key.pub, { prehash: false, lowS: false, format: 'der' }) ? 'valid' : 'invalid' }; }
  catch { return { status: 'invalid', text: 'Malformed signature.' }; }
}

export function parseCert(der) {
  const root = parseDer(der);
  if (!isSeq(root) || root.children.length !== 3) throw new Error('Not a certificate or CSR: expected SEQUENCE { info, algorithm, signature }.');
  const [info, algNode, sigNode] = root.children;
  const c = info.children;
  const sigAlg = decodeOid(algNode.children[0].value);
  const signature = sigNode.value.subarray(1);
  const tbs = raw(der, info);
  const isCsr = c[0].cls === 0 && c[0].tag === 2 && isSeq(c[1]) && c[1].children.every(x => x.cls === 0 && x.tag === 17);
  if (isCsr) {
    const attrs = c.find(x => x.cls === 2 && x.tag === 0);
    let exts = [];
    if (attrs) for (const a of attrs.children) {
      if (decodeOid(a.children[0].value) === '1.2.840.113549.1.9.14') exts = a.children[1].children[0].children;
    }
    return { kind: 'csr', version: Number(decodeInteger(c[0].value)) + 1, subject: nameToString(der, c[1]), spki: raw(der, c[2]), exts, sigAlg, signature, tbs, der };
  }
  let i = 0;
  let version = 1;
  if (c[0].cls === 2 && c[0].tag === 0) { version = Number(decodeInteger(c[0].children[0].value)) + 1; i = 1; }
  const serialNode = c[i];
  const issuer = nameToString(der, c[i + 2]);
  const validity = c[i + 3].children.map(decodeTime);
  const subject = nameToString(der, c[i + 4]);
  const spki = raw(der, c[i + 5]);
  const extWrap = c.find(x => x.cls === 2 && x.tag === 3);
  const exts = extWrap ? extWrap.children[0].children : [];
  return { kind: 'cert', version, serial: hex.encode(serialNode.value), issuer, subject, notBefore: validity[0], notAfter: validity[1], spki, exts, sigAlg, signature, tbs, der };
}

const badge = (cls, text) => `<span class="${cls}">${esc(text)}</span>`;
export function validityText(c, now = new Date()) {
  if (now < c.notBefore) return badge('bad', 'Not yet valid');
  if (now > c.notAfter) return badge('bad', `Expired ${Math.round((now - c.notAfter) / 864e5)} days ago`);
  return badge('ok', `Valid — ${Math.round((c.notAfter - now) / 864e5)} days left`);
}

export async function renderOne(c, issuerSpki, label) {
  let keyDesc;
  try { const k = parseDerKey(c.spki); keyDesc = describeKey(k); } catch (e) { keyDesc = 'Unsupported key: ' + e.message; }
  const rows = [];
  rows.push(['Type', c.kind === 'csr' ? 'Certificate signing request (PKCS#10)' : `X.509 v${c.version} certificate`]);
  if (c.kind === 'cert') {
    rows.push(['Subject', c.subject], ['Issuer', c.issuer]);
    rows.push(['Serial number', fmtHexColons(hex.decode(c.serial))]);
    rows.push(['Not before', c.notBefore?.toISOString() || '?'], ['Not after', c.notAfter?.toISOString() || '?']);
    rows.push(['Status', validityText(c), null, true]);
  } else rows.push(['Subject', c.subject]);
  rows.push(['Public key', keyDesc], ['Signature algorithm', oidLabel(c.sigAlg)]);
  for (const e of c.exts) {
    const o = decodeOid(e.children[0].value);
    const crit = e.children.length === 3 && e.children[1].tag === 1 && e.children[1].value[0];
    const valNode = e.children[e.children.length - 1];
    let text;
    try { text = decodeExt(o, valNode.value); } catch { text = null; }
    rows.push([(oidName(o) || o) + (crit ? ' (critical)' : ''), text ?? hex.encode(valNode.value)]);
  }
  rows.push(['SHA-256 fingerprint', fmtHexColons(sha256(c.der))], ['SHA-1 fingerprint', fmtHexColons(sha1(c.der))]);
  let check = null;
  const selfSigned = c.kind === 'csr' || c.issuer === c.subject;
  const key = c.kind === 'csr' ? c.spki : issuerSpki || (selfSigned ? c.spki : null);
  if (key) {
    try {
      const r = await verifySig(c.sigAlg, c.tbs, c.signature, key);
      const by = c.kind === 'csr' ? 'its own key (proof of possession)' : issuerSpki ? 'the issuer’s key' : 'its own key (self-signed)';
      check = r.status === 'valid' ? badge('ok', `✅ Signature valid — signed by ${by}`) : r.status === 'invalid' ? badge('bad', `❌ Signature does not verify with ${by}${r.text ? ': ' + r.text : ''}`) : esc(r.text);
    } catch (e) { check = esc('Could not verify: ' + e.message); }
  } else check = esc('Paste the issuer certificate to verify the signature.');
  rows.push(['Signature check', check, null, true]);
  return `${label ? `<p class="section-title">${esc(label)}</p>` : ''}${kvTable(rows)}`;
}

// Decode pasted certificates/CSRs (PEM chain or one DER) into the output HTML; '' for empty input.
// Each certificate is checked against the next one in the chain, the last against the issuer.
export async function renderCerts(text, issuerText) {
  const t = text.trim();
  if (!t) return '';
  const ders = t.includes('-----BEGIN') ? parsePem(t).filter(b => /CERTIFICATE/.test(b.label)).map(b => b.der) : [readDerInput(t)];
  if (!ders.length) throw new Error('No CERTIFICATE or CERTIFICATE REQUEST block found.');
  const certs = ders.map(parseCert);
  let issuer = null;
  if (issuerText.trim()) issuer = parseCert(readDerInput(issuerText));
  let html = '';
  for (let i = 0; i < certs.length; i++) {
    const next = certs[i + 1] || issuer;
    html += await renderOne(certs[i], next ? next.spki : null, certs.length > 1 ? `Certificate ${i + 1} of ${certs.length}` : '');
  }
  return html;
}
// Example: an RSA server certificate issued by an ECDSA P-256 root (public certificates only).
export const EXAMPLE = "-----BEGIN CERTIFICATE-----\nMIID3jCCA4OgAwIBAgIUcmtbudnqyCUOPzCZ8laNUPLs94AwCgYIKoZIzj0EAwIw\nPjELMAkGA1UEBhMCVVMxFTATBgNVBAoMDEV4YW1wbGUgTGFiczEYMBYGA1UEAwwP\nRXhhbXBsZSBSb290IENBMB4XDTI2MTEwNTAwMTczN1oXDTI3MTIwNzAwMTczN1ow\nUzELMAkGA1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWExFTATBgNVBAoMDEV4\nYW1wbGUgTGFiczEYMBYGA1UEAwwPd3d3LmV4YW1wbGUuY29tMIIBIjANBgkqhkiG\n9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxT1CNKex4ymNGjiLF+4kRVYvyY1bD8GvzhvX\nVE5j/+hW6tWUxf26fQnOkpP4TNjaxtUJSqSNML9n3Jj6Pv08+bNKXDkXHvuxuECJ\nTuSvTfGHTHVLcOPF/c3EbEP2VvKtVo5iYuwDKYK4FwlZdeKjcODxV//DphmDihm7\n4rjYkG/7gEjA5Uq1GJRaYhVMIyFBXn7Mpgfo7ZLfCdp3tBshv5v6Pnvo0GlUpAra\nsSCqnuQAxqD030ebUZZZzpqex37e01DNRQbsh1yIk9NXgWRIg+6Cgeg54KC+JvnD\nxWoOHiwp3lesYtC0gIjpeaaJVyd3zydEOyod4BD0JYrG2cxJAQIDAQABo4IBfTCC\nAXkwUgYDVR0RBEswSYIPd3d3LmV4YW1wbGUuY29tggtleGFtcGxlLmNvbYcEwAAC\nCocQIAENuAAAAAAAAAAAAAAAAYERYWRtaW5AZXhhbXBsZS5jb20wDgYDVR0PAQH/\nBAQDAgWgMB0GA1UdJQQWMBQGCCsGAQUFBwMBBggrBgEFBQcDAjAMBgNVHRMBAf8E\nAjAAMB0GA1UdDgQWBBTwOQEdUTCIPCNy9Ft9Ya9/q/aJuTAfBgNVHSMEGDAWgBQy\nwmnkZvfXEfvc0T9CJsAKMhGAUzBfBggrBgEFBQcBAQRTMFEwIwYIKwYBBQUHMAGG\nF2h0dHA6Ly9vY3NwLmV4YW1wbGUuY29tMCoGCCsGAQUFBzAChh5odHRwOi8vY2Eu\nZXhhbXBsZS5jb20vcm9vdC5jcnQwMAYDVR0fBCkwJzAloCOgIYYfaHR0cDovL2Ny\nbC5leGFtcGxlLmNvbS9yb290LmNybDATBgNVHSAEDDAKMAgGBmeBDAECATAKBggq\nhkjOPQQDAgNJADBGAiEAxSAQ/uKR3TRFBbEU/VGCPGTAYi+y5kmUSSGAsXfhclcC\nIQDAAPJkYyvXLotKjJt2LI5Y3fcAlb89tDL0qqsc0P6AEA==\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\nMIIBwzCCAWmgAwIBAgIUFU5OiXSD7If2KqskmiLO1WLYV0QwCgYIKoZIzj0EAwIw\nPjELMAkGA1UEBhMCVVMxFTATBgNVBAoMDEV4YW1wbGUgTGFiczEYMBYGA1UEAwwP\nRXhhbXBsZSBSb290IENBMB4XDTI2MTEwNTAwMTczN1oXDTM2MTEwMjAwMTczN1ow\nPjELMAkGA1UEBhMCVVMxFTATBgNVBAoMDEV4YW1wbGUgTGFiczEYMBYGA1UEAwwP\nRXhhbXBsZSBSb290IENBMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEr4SNETtx\naQbJtjvTf8Hzb5ow8q3NRjDhgg6wH5M3t+vGWMm1U7KdyjKurdtRPYBZIBzNUxus\n6SVUHE9E+iLPQaNFMEMwHQYDVR0OBBYEFDLCaeRm99cR+9zRP0ImwAoyEYBTMBIG\nA1UdEwEB/wQIMAYBAf8CAQAwDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMCA0gA\nMEUCIDA6ivp0JJb9OuuLn790E0uX0pAlIwEF78tPKgjTBhm3AiEAxHPfTCHM7uwY\npURCxrrgKPokk42q5JHodySGSwQC6ig=\n-----END CERTIFICATE-----";

function mount() {
  const $ = id => document.getElementById(id);
  let run = 0;
  async function render() {
    const my = ++run;
    showError($('err'), '');
    if (!$('input').value.trim()) { $('out').innerHTML = ''; return; }
    try {
      const html = await renderCerts($('input').value, $('issuer').value);
      if (my === run) $('out').innerHTML = html;
    } catch (e) { if (my === run) { $('out').innerHTML = ''; showError($('err'), e.message); } }
  }
  $('example').onclick = () => { $('input').value = EXAMPLE; $('issuer').value = ''; render(); };
  const later = debounce(render, 150);
  $('input').addEventListener('input', later);
  $('issuer').addEventListener('input', later);
  wireCopy();
}

if (globalThis.document) mount();
