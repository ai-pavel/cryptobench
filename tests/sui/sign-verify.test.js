import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signMessage, verifySignature, prefillFromHash } from '../../src/sui/sign-verify/sign-verify.js';
import { blake2b, ed25519, secp256k1, base64, hex } from '../../src/sui/lib/sui.js';

const KEY = 'suiprivkey1qrwsjvr6gwaxmsvxk4cfun99ra8uwxg3c9pl0nhle7xxpe4s80y05ctazer';
const ADDRESS = '0xa2d14fad60c56049ecf75246a481934691214ce413e6a8ae2fe6834c173a6133';
const EXAMPLE_SIG = 'AB25XGCSV3wyT/IUM8FlajNiTd31fKRYs6yhw2i+jHm9YZBVAvcCa7VqGmblJYUkKhuO8jdGhacRejZYckDtgw4iZH/u7zYwYL1CBaFnGhXxChI2dlkYsbX2ONgvM8/EaQ==';
const row = (r, k) => r.rows.find(x => x[0] === k)[1];

test('Example sign: personal message "hello sui" (Ed25519 is deterministic)', () => {
  const r = signMessage({ key: KEY, scheme: 0, tx: false, msg: 'hello sui', enc: 'utf8' });
  assert.equal(r.serialized, EXAMPLE_SIG); // the Example verify signature
  assert.equal(row(r, 'Signer address'), ADDRESS);
  assert.equal(row(r, 'Scheme'), 'Ed25519');
  // Intent [3, 0, 0] ‖ BCS vector<u8> (ULEB length 9 ‖ bytes).
  assert.equal(row(r, 'Intent message'), '030000' + '09' + hex.encode(new TextEncoder().encode('hello sui')));
  const digest = blake2b(hex.decode(row(r, 'Intent message')), { dkLen: 32 });
  assert.equal(row(r, 'Signed digest'), hex.encode(digest));
  // The raw signature verifies with plain Ed25519 over the digest.
  const pub = base64.decode(EXAMPLE_SIG).slice(65);
  assert.ok(ed25519.verify(hex.decode(row(r, 'Raw signature (hex)')), digest, pub));
  assert.equal(r.link, '?mode=verify#m=aGVsbG8gc3Vp&s=' + encodeURIComponent(EXAMPLE_SIG) + '&t=3');
});

test('Example verify: valid and signed by the expected address', () => {
  const r = verifySignature({ sig: EXAMPLE_SIG, tx: false, msg: 'hello sui', enc: 'utf8', expect: ADDRESS });
  assert.equal(r.ok, true);
  assert.equal(r.match, true);
  assert.equal(r.address, ADDRESS);
  assert.equal(verifySignature({ sig: EXAMPLE_SIG, tx: false, msg: 'hello sui', enc: 'utf8', expect: '' }).match, null);
  assert.equal(verifySignature({ sig: EXAMPLE_SIG, tx: false, msg: 'hello sui', enc: 'utf8', expect: '0x1' }).match, false);
});

test('tampered message or wrong intent fails', () => {
  assert.equal(verifySignature({ sig: EXAMPLE_SIG, tx: false, msg: 'hello Sui', enc: 'utf8', expect: '' }).ok, false);
  // Same bytes as transaction data (intent 0,0,0, no length prefix) is a different digest.
  assert.equal(verifySignature({ sig: EXAMPLE_SIG, tx: true, msg: base64.encode(new TextEncoder().encode('hello sui')), enc: 'utf8', expect: '' }).ok, false);
});

test('transaction bytes and other schemes round-trip', () => {
  const tx = '0x000102030405';
  for (const scheme of [0, 1, 2]) {
    const r = signMessage({ key: '11'.repeat(32), scheme, tx: true, msg: tx, enc: 'utf8' });
    assert.equal(row(r, 'Intent message'), '000000000102030405');
    const v = verifySignature({ sig: r.serialized, tx: true, msg: tx, enc: 'utf8', expect: row(r, 'Signer address') });
    assert.equal(v.ok, true);
    assert.equal(v.match, true);
  }
  // Secp256k1 signs SHA-256 of the digest (ECDSA), low-S, compact 64 bytes.
  const r = signMessage({ key: '11'.repeat(32), scheme: 1, tx: false, msg: '68656c6c6f', enc: 'hex' });
  const sig = hex.decode(row(r, 'Raw signature (hex)'));
  const pub = secp256k1.getPublicKey(hex.decode('11'.repeat(32)), true);
  assert.ok(secp256k1.verify(sig, hex.decode(row(r, 'Signed digest')), pub));
});

test('unsupported signature schemes are recognised, not verified', () => {
  const multisig = base64.encode(Uint8Array.of(3, 1, 2, 3));
  assert.deepEqual(verifySignature({ sig: multisig, tx: false, msg: '', enc: 'utf8', expect: '' }), { unsupported: true, scheme: 'MultiSig', length: 4 });
});

test('errors', () => {
  assert.throws(() => signMessage({ key: 'nope', scheme: 0, tx: false, msg: 'x', enc: 'utf8' }));
  assert.throws(() => signMessage({ key: KEY, scheme: 0, tx: true, msg: 'zz!', enc: 'utf8' }));
  assert.throws(() => verifySignature({ sig: base64.encode(Uint8Array.of(0, 1, 2)), tx: false, msg: '', enc: 'utf8', expect: '' }), /Ed25519 signatures are 97 bytes/);
  assert.throws(() => verifySignature({ sig: base64.encode(Uint8Array.of(0x7f)), tx: false, msg: '', enc: 'utf8', expect: '' }), /Unknown signature scheme flag 0x7f/);
  assert.throws(() => verifySignature({ sig: EXAMPLE_SIG, tx: false, msg: 'hello sui', enc: 'utf8', expect: '0xzz' }));
});

test('prefill from a "Verify this signature" link', () => {
  const link = signMessage({ key: KEY, scheme: 0, tx: false, msg: 'hello sui', enc: 'utf8' }).link;
  assert.deepEqual(prefillFromHash(link.slice(link.indexOf('#'))), { mode: '3', msg: 'hello sui', enc: 'utf8', sig: EXAMPLE_SIG });
  assert.equal(prefillFromHash(''), null);
  assert.equal(prefillFromHash('#m=AAE='), null);
  // Binary messages stay base64; transaction bytes keep the encoding untouched.
  assert.deepEqual(prefillFromHash('#m=AAE%3D&s=x&t=3'), { mode: '3', msg: 'AAE=', enc: 'base64', sig: 'x' });
  assert.deepEqual(prefillFromHash('#m=AAE%3D&s=x&t=0'), { mode: '0', msg: 'AAE=', enc: null, sig: 'x' });
});
