import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signMessage, verifyMessage, parseSig, verdictHtml, exampleSeed, MISMATCH_WARNING } from '../../src/solana/sign-verify/sign-verify.js';
import { base58, base64, keypairFromSeed } from '../../src/solana/lib/sol.js';

const rows = r => Object.fromEntries(r.rows.map(([k, v]) => [k, v]));
const b58 = h => base58.encode(Buffer.from(h, 'hex'));

// RFC 8032 section 7.1, TEST 1 (empty message) and TEST 2 (one byte 0x72).
const T1 = {
  seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
  pub: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  msg: '',
  sig: 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
};
const T2 = {
  seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
  pub: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  msg: '72',
  sig: '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00',
};

test('signing reproduces the RFC 8032 vectors', () => {
  for (const t of [T1, T2]) {
    const r = signMessage(t.seed, t.msg, 'hex');
    assert.equal(r.warning, '');
    const o = rows(r);
    assert.equal(o['Public key'], b58(t.pub));
    assert.equal(o['Signature (hex)'], t.sig);
    assert.equal(o['Signature (base58)'], b58(t.sig));
    assert.equal(o['Signature (base64)'], Buffer.from(t.sig, 'hex').toString('base64'));
    assert.equal(o['Message bytes'], `${t.msg.length / 2} bytes`);
  }
});

test('the same message in every encoding gives the same signature', () => {
  const sigs = [['r', 'utf8'], ['72', 'hex'], ['0x72', 'hex'], [base58.encode(Uint8Array.of(0x72)), 'base58'], ['cg==', 'base64']]
    .map(([m, enc]) => rows(signMessage(T2.seed, m, enc))['Signature (hex)']);
  assert.deepEqual(new Set(sigs), new Set([T2.sig]));
});

test('verification accepts the RFC 8032 vectors in hex, base58 and base64', () => {
  for (const t of [T1, T2]) {
    for (const sig of [t.sig, '0x' + t.sig, b58(t.sig), Buffer.from(t.sig, 'hex').toString('base64')]) {
      assert.equal(verifyMessage(b58(t.pub), t.msg, 'hex', sig), true);
    }
  }
});

test('verification rejects a wrong message, key or signature', () => {
  assert.equal(verifyMessage(b58(T2.pub), '73', 'hex', T2.sig), false);
  assert.equal(verifyMessage(b58(T1.pub), T2.msg, 'hex', T2.sig), false);
  const flipped = T2.sig.slice(0, -2) + '01';
  assert.equal(verifyMessage(b58(T2.pub), T2.msg, 'hex', flipped), false);
});

test('Example: sign and verify round-trip with the seed 1…32 test key', () => {
  const secret = base58.encode(keypairFromSeed(exampleSeed()).secretKey);
  const o = rows(signMessage(secret, 'Hello, Solana!', 'utf8'));
  assert.equal(o['Message bytes'], '14 bytes');
  assert.equal(verifyMessage(o['Public key'], 'Hello, Solana!', 'utf8', o['Signature (base58)']), true);
  assert.equal(verifyMessage(o['Public key'], 'Hello, Solana! ', 'utf8', o['Signature (base58)']), false);
});

test('a 64-byte key with a wrong public half warns', () => {
  const r = signMessage(T1.seed + '00'.repeat(32), '', 'hex');
  assert.equal(r.warning, MISMATCH_WARNING);
  assert.equal(rows(r)['Signature (hex)'], T1.sig);
});

test('verdict text', () => {
  assert.match(verdictHtml(true), /^<p class="verdict ok">✅ Valid/);
  assert.match(verdictHtml(false), /^<p class="verdict bad">❌ Invalid/);
});

test('malformed input throws readable errors', () => {
  assert.throws(() => signMessage('', 'x', 'utf8'), /Secret key is empty/);
  assert.throws(() => signMessage(T1.seed, 'abc', 'hex'), /Input is not valid hex/);
  assert.throws(() => signMessage(T1.seed, '!!', 'base58'), /Input is not valid base58/);
  assert.throws(() => verifyMessage('abc', '', 'hex', T1.sig), /Public key must decode to 32 bytes/);
  assert.throws(() => parseSig('abcd'), /Signature must be 64 bytes/);
  assert.throws(() => verifyMessage(b58(T1.pub), '', 'hex', base64.encode(new Uint8Array(63))), /Signature must be 64 bytes/);
  assert.equal(parseSig(' ' + T1.sig.slice(0, 64) + '\n' + T1.sig.slice(64)).length, 64);
});
