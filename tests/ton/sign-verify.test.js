import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageBytes, secretSeed, mnemonicSeed, signRows, verifySignature, verifyHtml } from '../../src/ton/sign-verify/sign-verify.js';

// RFC 8032 §7.1, TEST 1 (empty message) and TEST 2 (one byte 0x72).
const RFC1 = {
  seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
  pub: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  msg: '',
  sig: 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
};
const RFC2 = {
  seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
  pub: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  msg: '72',
  sig: '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00',
};
// The tool's Example: seed 0x09…09 signs "sign me ✍️".
const EXAMPLE = {
  seed: '09'.repeat(32),
  pub: 'fd1724385aa0c75b64fb78cd602fa1d991fdebf76b13c58ed702eac835e9f618',
  msg: 'sign me ✍️',
  sig: '40eda314158a4b728aee21d4db9fa4bca7b11dbe58b23bd21b3680b4afd082a3ba2bd0145a9ed54dd5025ed3769c0538cad6dd1c2f7789fb6fabaad71d73af0c',
};

test('message bytes: text as UTF-8, or hex', () => {
  assert.deepEqual([...messageBytes('hé', 'text')], [0x68, 0xc3, 0xa9]);
  assert.deepEqual([...messageBytes('0x72ff', 'hex')], [0x72, 0xff]);
  assert.throws(() => messageBytes('xyz', 'hex'));
});

test('RFC 8032 vectors: sign and verify', () => {
  for (const v of [RFC1, RFC2]) {
    const m = Object.fromEntries(signRows(messageBytes(v.msg, 'hex'), secretSeed(v.seed)));
    assert.equal(m['Signature (hex)'], v.sig);
    assert.equal(m['Signature (base64)'], Buffer.from(v.sig, 'hex').toString('base64'));
    assert.equal(m['Public key (hex)'], v.pub);
    assert.equal(m['Message bytes (hex)'], v.msg);
    assert.equal(verifySignature(v.pub, v.msg, v.sig, 'hex'), true);
  }
});

test('Example: Sign tab output is what the Verify tab example checks', () => {
  const m = Object.fromEntries(signRows(messageBytes(EXAMPLE.msg, 'text'), secretSeed(EXAMPLE.seed)));
  assert.equal(m['Signature (hex)'], EXAMPLE.sig);
  assert.equal(m['Public key (hex)'], EXAMPLE.pub);
  assert.equal(verifySignature(EXAMPLE.pub, EXAMPLE.msg, EXAMPLE.sig, 'text'), true);
  assert.equal(verifyHtml(true), '<p class="ok">✓ Valid signature</p>');
});

test('a 64-byte secret key (seed + public key) works like the seed', () => {
  assert.deepEqual(secretSeed(RFC1.seed + RFC1.pub), secretSeed(RFC1.seed));
  assert.throws(() => secretSeed(RFC1.seed + RFC2.pub), /The last 32 bytes are not the public key of the first 32 bytes/);
});

test('tampered message, key or signature fails verification', () => {
  assert.equal(verifySignature(EXAMPLE.pub, EXAMPLE.msg + '!', EXAMPLE.sig, 'text'), false);
  assert.equal(verifySignature(RFC1.pub, EXAMPLE.msg, EXAMPLE.sig, 'text'), false);
  assert.equal(verifySignature(EXAMPLE.pub, EXAMPLE.msg, '00'.repeat(64), 'text'), false);
  assert.match(verifyHtml(false), /Invalid signature: the message, key or signature does not match/);
});

test('input errors throw', () => {
  assert.throws(() => secretSeed('  '), /Enter a private key/);
  assert.throws(() => secretSeed('00'.repeat(16)), /Secret key must be 32 or 64 bytes, got 16/);
  assert.throws(() => verifySignature('00'.repeat(31), '', RFC1.sig, 'hex'), /Public key must be 32 bytes, got 31/);
  assert.throws(() => verifySignature(RFC1.pub, '', '00'.repeat(63), 'hex'), /Signature must be 64 bytes, got 63/);
});

test('mnemonic seed', async () => {
  const seed = await mnemonicSeed('voice fortune fox tiny force rookie give wear promote depth dawn whip life october supreme excite green unveil hunt unable struggle dream wool wrap', '');
  const m = Object.fromEntries(signRows(messageBytes('', 'text'), seed));
  assert.equal(m['Public key (hex)'], '4ccc0f23905323a49b2b64efe0ec35e8497a49f3532a4736b1f265f85280fb6d');
  await assert.rejects(() => mnemonicSeed('foo', ''), /Not in the word list: foo/);
});
