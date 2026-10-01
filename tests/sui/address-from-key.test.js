import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, deriveAddresses } from '../../src/sui/address-from-key/address-from-key.js';
import { blake2b, secp256k1, p256, hex } from '../../src/sui/lib/sui.js';

// Ed25519 test vectors from the Sui TypeScript SDK (ed25519-keypair.test.ts): raw public key → address.
const ED25519 = [
  ['ImR/7u82MGC9QgWhZxoV8QoSNnZZGLG19jjYLzPPxGk=', '0xa2d14fad60c56049ecf75246a481934691214ce413e6a8ae2fe6834c173a6133'],
  ['vG6hEnkYNIpdmWa/WaLivd1FWBkxG+HfhXkyWgs9uP4=', '0x1ada6e6f3f3e4055096f606c746690f1108fcc2ca479055cc434a3e1d3f758aa'],
  ['arEzeF7Uu90jP4Sd+Or17c+A9kYviJpCEQAbEt0FHbU=', '0xe69e896ca10f5a77732769803cc2b5707f0ab9d4407afb5e4b4464b89769af14'],
];

test('Example: Sui public key (flag + Ed25519 key)', () => {
  const [c, ...rest] = deriveAddresses('ACJkf+7vNjBgvUIFoWcaFfEKEjZ2WRixtfY42C8zz8Rp', 'auto');
  assert.equal(rest.length, 0);
  assert.equal(c.name, 'Ed25519');
  assert.equal(c.how, 'Sui public key (flag 0x00 + key)');
  assert.deepEqual(c.rows, [
    ['Address', ED25519[0][1]],
    ['Sui public key', 'ACJkf+7vNjBgvUIFoWcaFfEKEjZ2WRixtfY42C8zz8Rp', 'base64 of flag ‖ key'],
    ['Public key (hex)', '22647feeef363060bd4205a1671a15f10a1236765918b1b5f638d82f33cfc469'],
    ['Flag', '0x00'],
  ]);
});

test('SDK Ed25519 vectors: raw 32-byte keys', () => {
  for (const [pk, address] of ED25519) {
    const [c] = deriveAddresses(pk, 'auto');
    assert.equal(c.how, 'raw 32-byte key → Ed25519');
    assert.equal(c.rows[0][1], address);
    // Same result with the scheme chosen explicitly.
    assert.equal(deriveAddresses(pk, '0')[0].rows[0][1], address);
  }
});

test('bare compressed secp256k1 key: both curves when valid on both, explicit scheme picks one', () => {
  const pub = secp256k1.getPublicKey(Uint8Array.from({ length: 32 }, (_, i) => i + 1), true);
  const list = candidates(pub, 'auto');
  assert.ok(list.some(c => c.flag === 1));
  for (const c of list) assert.equal(c.how, 'raw compressed key');
  const [k1] = deriveAddresses(hex.encode(pub), '1');
  assert.equal(k1.how, 'raw key');
  // Address = BLAKE2b-256(flag ‖ compressed key).
  assert.equal(k1.rows[0][1], '0x' + hex.encode(blake2b(Uint8Array.of(1, ...pub), { dkLen: 32 })));
  // Flag-prefixed form is recognised with an explicit scheme too.
  assert.equal(deriveAddresses(hex.encode(Uint8Array.of(1, ...pub)), '1')[0].how, 'Sui public key (flag + key)');
});

test('flag-prefixed secp256r1 key and uncompressed keys', () => {
  const sk = Uint8Array.from({ length: 32 }, (_, i) => 32 - i);
  const pub = p256.getPublicKey(sk, true);
  const [c] = candidates(Uint8Array.of(2, ...pub), 'auto');
  assert.equal(c.flag, 2);
  assert.equal(c.how, 'Sui public key (flag 0x02 + key)');
  const unc = p256.getPublicKey(sk, false);
  const list = candidates(unc, 'auto');
  const r1 = list.find(x => x.flag === 2);
  assert.equal(r1.how, 'uncompressed key, compressed for the address');
  assert.deepEqual(r1.pub, pub);
});

test('errors', () => {
  assert.throws(() => candidates(new Uint8Array(20), 'auto'), /Unrecognised key length 20 bytes/);
  assert.throws(() => candidates(new Uint8Array(33).fill(0xff).fill(5, 0, 1), 'auto'), /not a valid point on either/);
  assert.throws(() => deriveAddresses('zz!', 'auto'));
});
