import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCerts, parseCert, verifySig, validityText, decodeExt, EXAMPLE } from '../../src/crypto/x509-decoder/x509-decoder.js';
import { parsePem, readDerInput } from '../../src/crypto/lib/asn1.js';

const [leafDer, rootDer] = parsePem(EXAMPLE).map(b => b.der);
// An Ed25519 CSR made with `openssl req -new -subj "/CN=csr.example/O=Example Labs" -addext subjectAltName=DNS:csr.example`.
const CSR = `-----BEGIN CERTIFICATE REQUEST-----
MIHWMIGJAgEAMC0xFDASBgNVBAMMC2Nzci5leGFtcGxlMRUwEwYDVQQKDAxFeGFt
cGxlIExhYnMwKjAFBgMrZXADIQD79wkN6+61/+7PtxmYehgcqau77LBN6ZQ9JjFo
vctpuqApMCcGCSqGSIb3DQEJDjEaMBgwFgYDVR0RBA8wDYILY3NyLmV4YW1wbGUw
BQYDK2VwA0EA1h0mqwQvBVx2trktcmsc2B0QNrIV/bR61mQSrJh1eEW5bXquGLcu
AwqsTCzLIqmMjJvBqeqDc79LGPHkMHtcCA==
-----END CERTIFICATE REQUEST-----`;

test('empty input gives no output', async () => {
  assert.equal(await renderCerts('  ', ''), '');
});

test('the Example leaf certificate fields match OpenSSL', () => {
  const c = parseCert(leafDer);
  assert.equal(c.kind, 'cert');
  assert.equal(c.version, 3);
  assert.equal(c.serial, '726b5bb9d9eac8250e3f3099f2568d50f2ecf780');
  assert.equal(c.subject, 'C=US, ST=California, O=Example Labs, CN=www.example.com');
  assert.equal(c.issuer, 'C=US, O=Example Labs, CN=Example Root CA');
  assert.equal(c.notBefore.toISOString(), '2026-11-05T00:17:37.000Z');
  assert.equal(c.notAfter.toISOString(), '2027-12-07T00:17:37.000Z');
});

test('the Example chain renders with verified signatures', async () => {
  const html = await renderCerts(EXAMPLE, '');
  assert.match(html, /Certificate 1 of 2/);
  assert.match(html, /Certificate 2 of 2/);
  // Values from `openssl x509 -noout -fingerprint -sha1 -ext …` and `shasum -a 256` of the DER.
  assert.match(html, /SHA-256 fingerprint<\/th><td class="mono">98:64:1E:A8:9F:58:3A:49:95:23:10:F6:34:C4:EB:22:12:58:BE:4A:22:65:FC:0B:E2:C3:EA:37:6F:CC:EA:5E/);
  assert.match(html, /SHA-1 fingerprint<\/th><td class="mono">2B:D9:EC:24:9C:D3:6E:FD:55:59:C7:73:48:D0:56:4E:2A:2E:87:F1/);
  assert.match(html, /DNS:www\.example\.com, DNS:example\.com, IP:192\.0\.2\.10, IP:2001:db8:0:0:0:0:0:1, email:admin@example\.com/);
  assert.match(html, /Key Usage \(critical\)<\/th><td class="mono">Digital Signature, Key Encipherment/);
  assert.match(html, /RSA 2048-bit/);
  assert.match(html, /✅ Signature valid — signed by the issuer’s key/);
  assert.match(html, /✅ Signature valid — signed by its own key \(self-signed\)/);
  assert.match(html, /CA: TRUE, path length 0/);
});

test('a lone leaf asks for the issuer; the issuer field verifies it', async () => {
  const leafPem = EXAMPLE.split(/(?<=-----END CERTIFICATE-----)\n/)[0];
  assert.match(await renderCerts(leafPem, ''), /Paste the issuer certificate to verify the signature/);
  const rootPem = EXAMPLE.split(/(?<=-----END CERTIFICATE-----)\n/)[1];
  assert.match(await renderCerts(leafPem, rootPem), /✅ Signature valid — signed by the issuer’s key/);
  // The leaf's own key did not sign it.
  assert.match(await renderCerts(leafPem, leafPem), /❌ Signature does not verify with the issuer’s key/);
});

test('a tampered certificate fails verification', async () => {
  const c = parseCert(rootDer);
  const tbs = Uint8Array.from(c.tbs);
  tbs[tbs.length - 40] ^= 1;
  assert.equal((await verifySig(c.sigAlg, c.tbs, c.signature, c.spki)).status, 'valid');
  assert.equal((await verifySig(c.sigAlg, tbs, c.signature, c.spki)).status, 'invalid');
  assert.deepEqual(await verifySig('1.2.840.113549.1.1.10', tbs, c.signature, c.spki), { status: 'unsupported', text: 'RSA-PSS signatures are not verified here.' });
});

test('an Ed25519 CSR', async () => {
  const c = parseCert(readDerInput(CSR));
  assert.equal(c.kind, 'csr');
  assert.equal(c.subject, 'CN=csr.example, O=Example Labs');
  const html = await renderCerts(CSR, '');
  assert.match(html, /Certificate signing request \(PKCS#10\)/);
  assert.match(html, /DNS:csr\.example/);
  assert.match(html, /✅ Signature valid — signed by its own key \(proof of possession\)/);
});

test('validity status', () => {
  const c = { notBefore: new Date('2026-01-01T00:00:00Z'), notAfter: new Date('2026-12-31T00:00:00Z') };
  assert.equal(validityText(c, new Date('2025-06-01T00:00:00Z')), '<span class="bad">Not yet valid</span>');
  assert.equal(validityText(c, new Date('2026-12-21T00:00:00Z')), '<span class="ok">Valid — 10 days left</span>');
  assert.equal(validityText(c, new Date('2027-01-02T00:00:00Z')), '<span class="bad">Expired 2 days ago</span>');
});

test('extension decoding', () => {
  // keyUsage BIT STRING 03 02 01 06 → Certificate Sign, CRL Sign (RFC 5280 bit order).
  assert.equal(decodeExt('2.5.29.15', Uint8Array.of(0x03, 0x02, 0x01, 0x06)), 'Certificate Sign, CRL Sign');
  // basicConstraints SEQUENCE {} → CA: FALSE.
  assert.equal(decodeExt('2.5.29.19', Uint8Array.of(0x30, 0x00)), 'CA: FALSE');
  assert.equal(decodeExt('1.2.3.4', Uint8Array.of(0x05, 0x00)), null);
});

test('bad input throws', async () => {
  await assert.rejects(renderCerts('-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAPUAXw+hDiVqStwqnTRt+vJyYLM8uxJaMwM1V8Sr0Zgw=\n-----END PUBLIC KEY-----', ''), /No CERTIFICATE or CERTIFICATE REQUEST block found/);
  await assert.rejects(renderCerts('3006020101020101', ''), /Not a certificate or CSR/);
});
