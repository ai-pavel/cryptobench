import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HASHES, computeHmac, checkMac } from '../../src/crypto/hmac/hmac.js';
import { parseBytes, encodeBytes } from '../../src/crypto/lib/common.js';

const hexOf = b => Buffer.from(b).toString('hex');
const h = s => parseBytes(s, 'hex');
const t = s => parseBytes(s, 'utf8');

// RFC 4231 test cases 1 and 2 (the Example uses case 1).
test('RFC 4231 test case 1', () => {
  const key = h('0b'.repeat(20)), msg = t('Hi There');
  assert.equal(hexOf(computeHmac('SHA-224', key, msg)), '896fb1128abbdf196832107cd49df33f47b4b1169912ba4f53684b22');
  assert.equal(hexOf(computeHmac('SHA-256', key, msg)), 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
  assert.equal(hexOf(computeHmac('SHA-384', key, msg)), 'afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6');
  assert.equal(hexOf(computeHmac('SHA-512', key, msg)), '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854');
});

test('RFC 4231 test case 2 (short key)', () => {
  assert.equal(hexOf(computeHmac('SHA-256', t('Jefe'), t('what do ya want for nothing?'))), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
});

test('RFC 2202 HMAC-SHA-1 test case 2', () => {
  assert.equal(hexOf(computeHmac('SHA-1', t('Jefe'), t('what do ya want for nothing?'))), 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79');
});

test('page default: HMAC-SHA256("key", quick brown fox) (Wikipedia)', () => {
  const mac = computeHmac('SHA-256', t('key'), t('The quick brown fox jumps over the lazy dog'));
  assert.equal(hexOf(mac), 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
});

test('every hash is available with the right output size', () => {
  const bits = { 'SHA-256': 256, 'SHA-384': 384, 'SHA-512': 512, 'SHA-224': 224, 'SHA-512/256': 256, 'SHA-1': 160,
    'SHA3-256': 256, 'SHA3-384': 384, 'SHA3-512': 512, 'BLAKE2b-512': 512, 'BLAKE2s-256': 256 };
  assert.deepEqual(Object.keys(HASHES), Object.keys(bits));
  for (const [k, n] of Object.entries(bits)) assert.equal(computeHmac(k, t('k'), t('m')).length * 8, n, k);
});

test('checking an expected MAC', () => {
  const mac = computeHmac('SHA-256', h('0b'.repeat(20)), t('Hi There'));
  const full = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';
  assert.equal(checkMac(mac, '  '), null);
  assert.deepEqual(checkMac(mac, full), { ok: true, text: '✅ Valid: the MAC matches.' });
  assert.deepEqual(checkMac(mac, '0x' + full.toUpperCase()), { ok: true, text: '✅ Valid: the MAC matches.' });
  assert.deepEqual(checkMac(mac, encodeBytes(mac, 'base64')), { ok: true, text: '✅ Valid: the MAC matches.' });
  // RFC 4231 test case 5 truncates to 128 bits.
  assert.deepEqual(checkMac(mac, full.slice(0, 32)), { ok: true, text: '✅ Matches the first 16 bytes (truncated MAC).' });
  assert.deepEqual(checkMac(mac, '00' + full.slice(2)), { ok: false, text: '❌ Invalid: the MAC does not match.' });
  assert.deepEqual(checkMac(mac, 'not a mac!'), { ok: false, text: 'The expected MAC is not hex or base64.' });
});

test('bad key encoding throws', () => {
  assert.throws(() => parseBytes('0g', 'hex', 'Key'), /Key is not valid hex/);
});
