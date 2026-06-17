// Shows a parsed key in every supported format (shared by Key Generator and Key Converter).
import { kvTable, hex, esc } from './common.js';
import { TYPES, pkcs8, spki, sec1, toJwk, sshPublic, fingerprints, compressed, describe, rsaBits, toPem } from './keys.js';

export async function keyRows(key, { showPrivate = true } = {}) {
  const t = TYPES[key.type];
  const hasPriv = !!key.priv;
  const fp = fingerprints(key);
  const rows = [['Key type', describe(key) + (hasPriv ? ' private key' : ' public key')]];
  if (key.mismatch) rows.push(['Warning', key.mismatch]);
  if (hasPriv && showPrivate) {
    rows.push(['Private key (PKCS#8 PEM)', toPem('PRIVATE KEY', pkcs8(key))]);
    if (t.kind === 'ec') rows.push(['Private key (SEC1 PEM)', toPem('EC PRIVATE KEY', sec1(key)), 'OpenSSL “traditional” EC format']);
    if (t.kind === 'rsa') rows.push(['Private key (PKCS#1 PEM)', toPem('RSA PRIVATE KEY', key.rsa.pkcs1)]);
    rows.push(['Private key (JWK)', JSON.stringify(await toJwk(key, true))]);
    if (t.kind !== 'rsa') rows.push(['Private key (raw hex)', hex.encode(key.priv), t.kind === 'okp' ? '32-byte seed' : 'scalar']);
  }
  rows.push(['Public key (SPKI PEM)', toPem('PUBLIC KEY', spki(key))]);
  rows.push(['Public key (JWK)', JSON.stringify(await toJwk(key, false))]);
  if (t.kind === 'ec') {
    rows.push(['Public key (compressed hex)', hex.encode(compressed(key))]);
    rows.push(['Public key (uncompressed hex)', hex.encode(key.pub)]);
  } else if (t.kind === 'okp') rows.push(['Public key (raw hex)', hex.encode(key.pub)]);
  else rows.push(['Modulus size', `${rsaBits(key)} bits`], ['Public exponent', key.rsa.e.toString()]);
  const ssh = sshPublic(key);
  if (ssh) rows.push(['OpenSSH public key', ssh]);
  rows.push(['SPKI SHA-256 fingerprint', fp.spkiSha256]);
  if (fp.ssh) rows.push(['OpenSSH fingerprint', fp.ssh, 'as shown by ssh-keygen -lf']);
  return rows;
}

export async function renderKey(el, key, opts) {
  el.innerHTML = kvTable(await keyRows(key, opts)).replace(/<td class="mono">(-----BEGIN[\s\S]*?)<\/td>/g, (m, pem) => `<td class="mono" style="white-space:pre-wrap">${pem}</td>`);
}
export { esc };
