import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLen, parseIter, pbkdf2, pbkdf2Rows, hkdf, hkdfRows, bip39Words, BIP39_DEFAULT } from '../../src/crypto/kdf/kdf.js';
import { parseBytes } from '../../src/crypto/lib/common.js';

const hexOf = b => Buffer.from(b).toString('hex');
const h = s => parseBytes(s, 'hex');
const t = s => parseBytes(s, 'utf8');

test('PBKDF2-HMAC-SHA1, RFC 6070 (the PBKDF2 Example is 4096 iterations)', async () => {
  assert.equal(hexOf(await pbkdf2(t('password'), t('salt'), 'SHA-1', 1, 20)), '0c60c80f961f0e71f3a9b524af6012062fe037a6');
  assert.equal(hexOf(await pbkdf2(t('password'), t('salt'), 'SHA-1', 4096, 20)), '4b007901b765489abead49d926f721d065a429c1');
  assert.equal(hexOf(await pbkdf2(t('passwordPASSWORDpassword'), t('saltSALTsaltSALTsaltSALTsaltSALTsalt'), 'SHA-1', 4096, 25)), '3d2eec4fe41c849b80c8d83662c0e44a8b291a964cf2f07038');
});

test('BIP39 seed of the "abandon … about" mnemonic (BIP39 test vectors, passphrase "TREZOR")', async () => {
  assert.equal(bip39Words('  '), BIP39_DEFAULT);
  const seed = await pbkdf2(t(BIP39_DEFAULT.normalize('NFKD')), t('mnemonicTREZOR'), 'SHA-512', 2048, 64);
  assert.equal(hexOf(seed), 'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04');
  const own = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
  assert.equal(bip39Words(own), own);
});

test('HKDF-SHA256, RFC 5869 test case 1 (the HKDF Example)', () => {
  const r = hkdf('SHA-256', h('0b'.repeat(22)), h('000102030405060708090a0b0c'), h('f0f1f2f3f4f5f6f7f8f9'), 42);
  assert.equal(hexOf(r.prk), '077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5');
  assert.equal(hexOf(r.okm), '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
  const rows = hkdfRows(r);
  assert.deepEqual(rows.map(x => x[0]), ['PRK (extract)', 'Output key (hex)', 'Output key (base64)']);
  assert.equal(rows[2][1], Buffer.from(r.okm).toString('base64'));
});

test('HKDF-SHA1, RFC 5869 test case 7 (no salt, no info)', () => {
  const r = hkdf('SHA-1', h('0c'.repeat(22)), new Uint8Array(), new Uint8Array(), 42);
  assert.equal(hexOf(r.okm), '2c91117204d745f3500d636a62f64f0ab3bae548aa53d423b0d1f27ebba6f5e5673a081d70cce7acfc48');
});

test('HKDF output length limit', () => {
  assert.equal(hkdf('SHA-256', t('k'), t('s'), t('i'), 1024).okm.length, 1024);
  assert.throws(() => hkdf('SHA-1', t('k'), t('s'), t('i'), 255 * 20 + 1), /HKDF-SHA-1 can output at most 5100 bytes\./);
});

test('field validation', () => {
  assert.equal(parseLen('64'), 64);
  for (const v of ['0', '1025', '1.5', '']) assert.throws(() => parseLen(v), /Output length must be 1–1024 bytes\./);
  assert.equal(parseIter('2048'), 2048);
  for (const v of ['0', '100000001', 'x']) assert.throws(() => parseIter(v), /Iterations must be a whole number from 1 to 100,000,000\./);
});

test('PBKDF2 output rows', () => {
  assert.deepEqual(pbkdf2Rows(h('0102ff')), [['Derived key (hex)', '0102ff'], ['Derived key (base64)', 'AQL/']]);
});
