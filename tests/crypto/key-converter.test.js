import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readKey, EXAMPLE_KEY } from '../../src/crypto/key-converter/key-converter.js';
import { keyRows } from '../../src/crypto/lib/keyview.js';

// RFC 8032 section 7.1, test 1.
const SECRET = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const PUBLIC = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const row = (rows, label) => rows.find(r => r[0] === label)?.[1];

test('empty input gives no result', async () => {
  assert.equal(await readKey('  \n', 'Ed25519', 'private'), null);
});

test('the Example PKCS#8 PEM is the RFC 8032 test 1 key', async () => {
  const { key, detected } = await readKey(EXAMPLE_KEY, '', 'private');
  assert.equal(detected, 'Read as: PEM “PRIVATE KEY” (PKCS#8 private key)');
  assert.equal(key.type, 'Ed25519');
  const rows = await keyRows(key);
  assert.equal(row(rows, 'Key type'), 'Ed25519 private key');
  assert.equal(row(rows, 'Private key (raw hex)'), SECRET);
  assert.equal(row(rows, 'Public key (raw hex)'), PUBLIC);
  assert.equal(row(rows, 'Private key (PKCS#8 PEM)'), EXAMPLE_KEY);
  assert.deepEqual(JSON.parse(row(rows, 'Public key (JWK)')), { kty: 'OKP', crv: 'Ed25519', x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo' });
  assert.match(row(rows, 'OpenSSH public key'), /^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI/);
});

test('public-only output hides private formats', async () => {
  const { key } = await readKey(EXAMPLE_KEY, '', 'private');
  const rows = await keyRows(key, { showPrivate: false });
  assert.equal(row(rows, 'Private key (raw hex)'), undefined);
  assert.equal(row(rows, 'Public key (raw hex)'), PUBLIC);
});

test('raw hex bytes use the type hint and kind', async () => {
  const pub = await readKey(PUBLIC, 'Ed25519', 'public');
  assert.equal(pub.detected, 'Read as: raw Ed25519 public key');
  assert.equal(pub.key.priv, undefined);
  const priv = await readKey(SECRET, 'Ed25519', 'private');
  assert.equal(Buffer.from(priv.key.pub).toString('hex'), PUBLIC);
  // secp256k1 private key 1 → the generator point G.
  const one = await readKey('00'.repeat(31) + '01', 'secp256k1', 'private');
  const rows = await keyRows(one.key);
  assert.equal(row(rows, 'Public key (compressed hex)'), '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
});

test('bad keys throw', async () => {
  await assert.rejects(readKey('-----BEGIN ENCRYPTED PRIVATE KEY-----\nAAAA\n-----END ENCRYPTED PRIVATE KEY-----', '', 'private'), /Encrypted private keys are not supported/);
  await assert.rejects(readKey('{not json', '', 'private'), /Looks like JSON but does not parse/);
  await assert.rejects(readKey('abcd', 'Ed25519', 'private'), /must be 32 bytes, got 2/);
  await assert.rejects(readKey('00'.repeat(32), 'secp256k1', 'private'), /Not a valid secp256k1 private key/);
  await assert.rejects(readKey('aa', 'RSA', 'private'), /Raw RSA keys are not supported/);
});
