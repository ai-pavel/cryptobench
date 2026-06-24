import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rsaBitsFor, makeKey, handoffPem } from '../../src/crypto/key-generator/key-generator.js';
import { parseAnyKey, rsaBits, TYPES, ed25519, x25519 } from '../../src/crypto/lib/keys.js';
import { keyRows } from '../../src/crypto/lib/keyview.js';

// RFC 8410 section 10.3: an Ed25519 private key in PKCS#8.
const RFC8410_PEM = '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEINTuctv5E1hK1bbY8fdp+K06/nwoy/HU++CXqI9EdVhC\n-----END PRIVATE KEY-----';

test('RSA sizes come from the option value', () => {
  assert.equal(rsaBitsFor('RSA-2048'), 2048);
  assert.equal(rsaBitsFor('RSA-3072'), 3072);
  assert.equal(rsaBitsFor('Ed25519'), null);
  assert.equal(rsaBitsFor('secp256k1'), null);
});

test('the hand-off PEM is standard PKCS#8 (RFC 8410 example)', async () => {
  const key = await parseAnyKey(RFC8410_PEM);
  assert.equal(Buffer.from(key.priv).toString('hex'), 'd4ee72dbf913584ad5b6d8f1f769f8ad3afe7c28cbf1d4fbe097a88f44755842');
  assert.equal(handoffPem(key).trim(), RFC8410_PEM);
});

test('every curve type generates a consistent key pair that round-trips through the hand-off PEM', async () => {
  for (const type of ['Ed25519', 'X25519', 'P-256', 'P-384', 'secp256k1']) {
    const key = await makeKey(type);
    const t = TYPES[type];
    assert.equal(key.type, type);
    assert.equal(key.priv.length, t.len, type);
    if (t.kind === 'ec') {
      assert.equal(key.pub.length, 1 + 2 * t.len, type);
      assert.equal(key.pub[0], 4, type);
      assert.deepEqual(key.pub, t.lib.getPublicKey(key.priv, false), type);
    } else assert.deepEqual(key.pub, t.lib.getPublicKey(key.priv), type);
    const back = await parseAnyKey(handoffPem(key), type);
    assert.equal(back.type, type);
    assert.deepEqual(back.priv, key.priv);
    assert.deepEqual(back.pub, key.pub);
  }
  const a = await makeKey('Ed25519'), b = await makeKey('Ed25519');
  assert.notDeepEqual(a.priv, b.priv);
});

test('generated keys work: Ed25519 signs, X25519 agrees', async () => {
  const s = await makeKey('Ed25519');
  const msg = new TextEncoder().encode('hello');
  assert.ok(ed25519.verify(ed25519.sign(msg, s.priv), msg, s.pub));
  const a = await makeKey('X25519'), b = await makeKey('X25519');
  assert.deepEqual(x25519.getSharedSecret(a.priv, b.pub), x25519.getSharedSecret(b.priv, a.pub));
});

test('RSA-2048 key generation and the shown rows', async () => {
  const key = await makeKey('RSA-2048');
  assert.equal(key.type, 'RSA');
  assert.equal(rsaBits(key), 2048);
  assert.equal(key.rsa.e, 65537n);
  const back = await parseAnyKey(handoffPem(key), 'RSA');
  assert.equal(back.rsa.n, key.rsa.n);
  const rows = await keyRows(key);
  assert.deepEqual(rows[0], ['Key type', 'RSA 2048-bit private key']);
  assert.ok(rows.some(r => r[0] === 'Private key (PKCS#1 PEM)' && r[1].startsWith('-----BEGIN RSA PRIVATE KEY-----')));
});

test('unknown types throw', async () => {
  await assert.rejects(makeKey('Nope'));
});
