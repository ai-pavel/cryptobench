import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute, derive, shared, EXAMPLE } from '../../src/crypto/ecdh/ecdh.js';
import { generate } from '../../src/crypto/lib/keys.js';

const NO_HKDF = { useHkdf: false };
const hexOf = b => Buffer.from(b).toString('hex');

test('empty inputs give no result', async () => {
  assert.equal(await compute('X25519', '', EXAMPLE.pub, NO_HKDF), null);
  assert.equal(await compute('X25519', EXAMPLE.priv, ' ', NO_HKDF), null);
});

test('RFC 7748 section 6.1 (the Example)', async () => {
  const rows = await compute('X25519', EXAMPLE.priv, EXAMPLE.pub, NO_HKDF);
  assert.deepEqual(rows, [
    ['Your public key', '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a'],
    ['Shared secret', '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742'],
  ]);
  // Bob's side gives the same secret.
  const bob = await compute('X25519', '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb', '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a', NO_HKDF);
  assert.equal(bob[1][1], rows[1][1]);
});

test('RFC 5903 section 8.1 P-256 ECDH', async () => {
  const i = 'c88f01f510d9ac3f70a292daa2316de544e9aab8afe84049c62a9c57862d1433';
  const gr = '04d12dfb5289c8d4f81208b70270398c342296970a0bccb74c736fc7554494bf6356fbf3ca366cc23e8157854c13c58d6aac23f046ada30f8353e74f33039872ab';
  const rows = await compute('P-256', i, gr, NO_HKDF);
  assert.equal(rows[0][1], '03dad0b65394221cf9b051e1feca5787d098dfe637fc90b9ef945d0c3772581180');
  assert.equal(rows[1][1], 'd6840f6b42f6edafd13116e0e12565202fef8e9ece7dce03812464d04b9442de');
});

test('both sides agree on every curve', () => {
  for (const type of ['X25519', 'P-256', 'P-384', 'secp256k1']) {
    const a = generate(type), b = generate(type);
    const s = shared(type, a.priv, b.pub);
    assert.equal(hexOf(s), hexOf(shared(type, b.priv, a.pub)), type);
    assert.equal(s.length, type === 'P-384' ? 48 : 32);
  }
});

test('HKDF-SHA256 matches RFC 5869 test case 3 (empty salt and info)', () => {
  const ikm = new Uint8Array(22).fill(0x0b);
  assert.deepEqual(derive(ikm, { useHkdf: true, salt: '', info: '', len: '42' }), [
    ['Derived key (HKDF-SHA256)', '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8'],
  ]);
  assert.deepEqual(derive(ikm, NO_HKDF), []);
  assert.throws(() => derive(ikm, { useHkdf: true, salt: '', info: '', len: '0' }), /Length must be 1–8160 bytes/);
  assert.throws(() => derive(ikm, { useHkdf: true, salt: 'zz', info: '', len: '32' }), /Salt is not valid hex/);
});

test('the Example with HKDF adds a derived key', async () => {
  const rows = await compute('X25519', EXAMPLE.priv, EXAMPLE.pub, { useHkdf: true, salt: '', info: 'example key v1', len: 32 });
  assert.equal(rows.length, 3);
  assert.match(rows[2][1], /^[0-9a-f]{64}$/);
});

test('errors', async () => {
  // A low-order X25519 point (all zeros) gives an all-zero secret; noble rejects it before the tool's own check.
  await assert.rejects(compute('X25519', EXAMPLE.priv, '00'.repeat(32), NO_HKDF), /invalid private or public key/);
  await assert.rejects(compute('P-256', EXAMPLE.priv, '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VuAyEA3p7bfXt9wbTTW2HC7OQ1Nz+DQ8hbeGdNrfx+FG+IK08=\n-----END PUBLIC KEY-----', NO_HKDF), /That is a X25519 key, but the curve is P-256/);
  await assert.rejects(compute('X25519', '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VuAyEA3p7bfXt9wbTTW2HC7OQ1Nz+DQ8hbeGdNrfx+FG+IK08=\n-----END PUBLIC KEY-----', EXAMPLE.pub, NO_HKDF), /“Your private key” contains only a public key/);
  await assert.rejects(compute('X25519', '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIJ1hsZ3v/VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g\n-----END PRIVATE KEY-----', EXAMPLE.pub, NO_HKDF), /That is a Ed25519 key, but the curve is X25519/);
});
