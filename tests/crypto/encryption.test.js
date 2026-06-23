import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, ivLabel, inLabel, keyLenFor, parseKey, parseIterations, deriveKey, checkIv, encryptRows, decrypt } from '../../src/crypto/encryption/encryption.js';
import { parseBytes } from '../../src/crypto/lib/common.js';

const h = s => parseBytes(s, 'hex');
const t = s => parseBytes(s, 'utf8');
const row = (rows, label) => rows.find(r => r && r[0] === label)?.[1];
const ct = (rows, aead = true) => row(rows, `Ciphertext${aead ? ' + tag' : ''} (hex)`);

test('AES-GCM: test cases 1 and 2 from the GCM spec (McGrew & Viega)', () => {
  const k = h('00'.repeat(16)), iv = h('00'.repeat(12));
  assert.equal(row(encryptRows('aes-gcm', k, iv, new Uint8Array()), 'Tag (hex)'), '58e2fccefa7e3061367f1d57a4e7455a');
  const rows = encryptRows('aes-gcm', k, iv, h('00'.repeat(16)));
  assert.equal(row(rows, 'Ciphertext only (hex)'), '0388dace60b6a392f328c2b971b2fe78');
  assert.equal(row(rows, 'Tag (hex)'), 'ab6e47d42cec13bdf53a67b21257bddf');
  assert.equal(row(rows, 'IV ‖ ciphertext ‖ tag (base64)'), Buffer.from(h('00'.repeat(12) + '0388dace60b6a392f328c2b971b2fe78ab6e47d42cec13bdf53a67b21257bddf')).toString('base64'));
});

test('AES-CBC and AES-CTR: NIST SP 800-38A F.2.1 and F.5.1', () => {
  const k = h('2b7e151628aed2a6abf7158809cf4f3c'), pt = h('6bc1bee22e409f96e93d7e117393172a');
  const cbcRows = encryptRows('aes-cbc', k, h('000102030405060708090a0b0c0d0e0f'), pt);
  // PKCS#7 adds a full padding block after the NIST block.
  assert.equal(ct(cbcRows, false).slice(0, 32), '7649abac8119b246cee98e9b12e9197d');
  assert.equal(ct(cbcRows, false).length, 64);
  assert.equal(row(cbcRows, 'Tag (hex)'), undefined);
  assert.equal(ct(encryptRows('aes-ctr', k, h('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff'), pt), false), '874d6191b620e3261bef6864990db6ce');
});

const SUNSCREEN = "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
const K80 = h('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
const AAD = h('50515253c0c1c2c3c4c5c6c7');

test('ChaCha20-Poly1305: RFC 8439 section 2.8.2', () => {
  const rows = encryptRows('chacha', K80, h('070000004041424344454647'), t(SUNSCREEN), AAD);
  assert.match(row(rows, 'Ciphertext only (hex)'), /^d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d6/);
  assert.equal(row(rows, 'Tag (hex)'), '1ae10b594f09e26a7e902ecbd0600691');
});

test('XChaCha20-Poly1305: draft-irtf-cfrg-xchacha A.3.1', () => {
  const rows = encryptRows('xchacha', K80, h('404142434445464748494a4b4c4d4e4f5051525354555657'), t(SUNSCREEN), AAD);
  assert.match(row(rows, 'Ciphertext only (hex)'), /^bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb/);
  assert.equal(row(rows, 'Tag (hex)'), 'c0875924c1c7987947deafd8780acf49');
});

const EX_KEY = h('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'), EX_IV = h('000102030405060708090a0b');
const EX_CT = '0f67ba77aac9e26ce233fbef906d905edce0598cef6674301f417d7a90';

test('the Example: AES-256-GCM of "Hello, world!" and back', () => {
  assert.equal(ct(encryptRows('aes-gcm', EX_KEY, EX_IV, t('Hello, world!'))), EX_CT);
  const r = decrypt('aes-gcm', EX_KEY, EX_IV, h(EX_CT));
  assert.equal(r.verdict, '✅ Authenticated and decrypted.');
  assert.deepEqual(r.rows, [['Plaintext (text)', 'Hello, world!'], ['Plaintext (hex)', '48656c6c6f2c20776f726c6421']]);
});

test('decryption failures', () => {
  const bad = h(EX_CT); bad[0] ^= 1;
  assert.deepEqual(decrypt('aes-gcm', EX_KEY, EX_IV, bad), { error: '❌ Authentication failed: wrong key, IV, associated data, or the data was modified.' });
  assert.match(decrypt('chacha', EX_KEY, EX_IV, h(EX_CT), t('aad')).error, /Authentication failed/);
  assert.throws(() => decrypt('aes-gcm', EX_KEY, EX_IV, h('00'.repeat(15))), /Ciphertext is shorter than the 16-byte tag\./);
  // A CBC ciphertext decrypted with the wrong key almost always has bad padding.
  const k = h('2b7e151628aed2a6abf7158809cf4f3c'), iv = h('00'.repeat(16));
  const cbcCt = h(ct(encryptRows('aes-cbc', k, iv, t('Attack at dawn')), false));
  const wrong = decrypt('aes-cbc', h('00'.repeat(16)), iv, cbcCt);
  assert.match(wrong.error, /^❌ Decryption failed: /);
  const ok = decrypt('aes-cbc', k, iv, cbcCt);
  assert.equal(ok.verdict, null);
  assert.equal(ok.rows[0][1], 'Attack at dawn');
});

test('binary plaintext has no text row', () => {
  const k = h('00'.repeat(16)), iv = h('00'.repeat(16));
  const r = decrypt('aes-ctr', k, iv, h(ct(encryptRows('aes-ctr', k, iv, h('ff')), false)));
  assert.deepEqual(r.rows, [false, ['Plaintext (hex)', 'ff']]);
});

test('keys, IVs and labels', () => {
  assert.equal(keyLenFor('aes-gcm', '16'), 16);
  assert.equal(keyLenFor('chacha', '16'), 32);
  assert.equal(parseKey('0x' + '00'.repeat(16), 16).length, 16);
  assert.equal(parseKey(Buffer.alloc(32, 7).toString('base64'), 32)[0], 7);
  assert.throws(() => parseKey('00'.repeat(16), 32), /^Error: Key must be 32 bytes \(256-bit\); got 16\.$/);
  assert.throws(() => checkIv('xchacha', h('00'.repeat(12))), /IV\/nonce must be 24 bytes; got 12\./);
  checkIv('aes-cbc', h('00'.repeat(16)));
  assert.equal(ivLabel('aes-gcm'), 'IV (hex, 12 bytes)');
  assert.equal(ivLabel('chacha'), 'Nonce (hex, 12 bytes)');
  assert.equal(ivLabel('aes-cbc'), 'IV (hex, 16 bytes)');
  assert.equal(inLabel('enc', 'aes-gcm'), 'Plaintext');
  assert.equal(inLabel('dec', 'aes-gcm'), 'Ciphertext with tag');
  assert.equal(inLabel('dec', 'aes-ctr'), 'Ciphertext');
  assert.deepEqual(Object.keys(C), ['aes-gcm', 'aes-cbc', 'aes-ctr', 'chacha', 'xchacha']);
});

test('password keys: PBKDF2-HMAC-SHA256 (RFC 7914 section 11 vector)', async () => {
  assert.throws(() => parseIterations('0'), /Iterations must be a positive whole number\./);
  const { key, derived } = await deriveKey('passwd', t('salt'), parseIterations('1'), 32);
  assert.equal(Buffer.from(key).toString('hex'), '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc');
  assert.equal(derived[0][0], 'Derived key (PBKDF2-SHA256)');
  assert.equal(derived[0][2], 'salt 73616c74, 1 iterations');
});
