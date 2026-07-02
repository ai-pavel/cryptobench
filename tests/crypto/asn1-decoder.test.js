import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeTree, valueText, tryInner, EXAMPLE } from '../../src/crypto/asn1-decoder/asn1-decoder.js';
import { parseDer } from '../../src/crypto/lib/asn1.js';

const hexBytes = h => Uint8Array.from(Buffer.from(h.replace(/\s+/g, ''), 'hex'));
const val = h => valueText(parseDer(hexBytes(h)));

test('empty input gives no result', () => {
  assert.equal(decodeTree('   '), null);
});

test('primitive values (X.690 encodings)', () => {
  assert.equal(val('0101ff'), 'TRUE');
  assert.equal(val('010100'), 'FALSE');
  assert.equal(val('020105'), '5');
  assert.equal(val('020180'), '-128'); // two's complement
  assert.equal(val('02020080'), '128');
  assert.equal(val('0201ff'), '-1');
  assert.equal(val('0500'), '');
  assert.equal(val('0603550403'), '2.5.4.3 (CN)');
  assert.equal(val('06092a864886f70d010101'), '1.2.840.113549.1.1.1 (rsaEncryption)');
  assert.equal(val('170d3236313130353030313733375a'), '2026-11-05T00:17:37.000Z');
  assert.equal(val('13025553'), '"US"');
  assert.equal(val('0c03e282ac'), '"€"');
  assert.equal(val('03020780'), '7 unused bits · 1 bytes: 80');
  assert.equal(val('0403010203'), '3 bytes: 010203');
  // Big integers show their bit length and hex; a leading 00 pad byte is not counted.
  assert.equal(val('0209 00ff00000000000000'), '64-bit: 00ff00000000000000');
});

test('constructed elements have no inline value', () => {
  assert.equal(val('3003020105'), '');
  assert.equal(val('a003020102'), '');
});

test('OCTET/BIT STRINGs holding DER are shown as encapsulated', () => {
  assert.equal(tryInner(hexBytes('05')), null);
  assert.equal(tryInner(hexBytes('0102')), null); // not DER
  assert.equal(tryInner(hexBytes('0101ff')), null); // a BOOLEAN isn't treated as encapsulated
  assert.equal(tryInner(hexBytes('020105')).tag, 2);
  const r = decodeTree('0403020105');
  assert.match(r.html, /encapsulated:<\/div><div class="leaf"><span class="k">@2 h2 l1<\/span> <b>INTEGER<\/b> <span class="mono">5<\/span>/);
  assert.equal(r.summary, '5 bytes, 2 elements');
});

test('offsets, header and length; indefinite length', () => {
  assert.equal(decodeTree('3003020105').html,
    '<details open><summary><span class="k">@0 h2 l3</span> <b>SEQUENCE</b> <span class="muted">(1)</span></summary><div class="kids"><div class="leaf"><span class="k">@2 h2 l1</span> <b>INTEGER</b> <span class="mono">5</span></div></div></details>');
  assert.match(decodeTree('3080 020101 0000').html, /@0 h2 l∞/);
  assert.match(decodeTree('a003020102').html, /<b>\[0\]<\/b>/);
});

test('trailing bytes are reported', () => {
  assert.equal(decodeTree('3003020105ff').summary, '6 bytes, 2 elements · 1 trailing bytes not decoded');
});

test('Example: a self-signed P-256 CA certificate', () => {
  const r = decodeTree(EXAMPLE);
  assert.equal(r.summary, '455 bytes, 63 elements');
  assert.match(r.html, /1\.2\.840\.10045\.4\.3\.2 \(ecdsa-with-SHA256\)/);
  assert.match(r.html, /&quot;Example Root CA&quot;/);
  assert.match(r.html, /2036-11-02T00:17:37\.000Z/);
  // PEM-wrapped input decodes the same.
  const pem = `-----BEGIN CERTIFICATE-----\n${EXAMPLE.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
  assert.equal(decodeTree(pem).summary, r.summary);
});

test('bad input throws', () => {
  assert.throws(() => decodeTree('zz'), /not PEM, hex or base64/);
  assert.throws(() => decodeTree('300302'), /claims 3 bytes but only 1 remain/);
});
