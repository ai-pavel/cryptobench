import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveFromKey } from '../../src/evm/address-from-key/address-from-key.js';

// Hardhat/Anvil test account #0.
const HARDHAT0_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const HARDHAT0_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const HARDHAT0_PUB = '0x048318535b54105d4a7aae60c08fc45f9687181b4fdfc625bd1a753fa7397fed753547f11ca8696646f2f3acb08e31016afac23e630c5d11f59f61fef57b0d2aa5';

test('empty input gives no result', () => {
  assert.equal(deriveFromKey('   '), null);
});

test('example: Hardhat account #0 private key', () => {
  const r = deriveFromKey(HARDHAT0_KEY);
  assert.equal(r.address, HARDHAT0_ADDR);
  assert.equal(r.keyType, 'Private key');
  assert.equal(r.uncompressed, HARDHAT0_PUB);
  assert.equal(r.compressed, '0x038318535b54105d4a7aae60c08fc45f9687181b4fdfc625bd1a753fa7397fed75');
});

test('private key 1 gives the generator point', () => {
  const r = deriveFromKey('0x' + '1'.padStart(64, '0'));
  assert.equal(r.address, '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
  assert.equal(r.compressed, '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
});

test('public keys in 33, 64 and 65 byte forms give the same address', () => {
  const forms = [HARDHAT0_PUB, '0x' + HARDHAT0_PUB.slice(4), '0x038318535b54105d4a7aae60c08fc45f9687181b4fdfc625bd1a753fa7397fed75'];
  for (const k of forms) {
    const r = deriveFromKey(k);
    assert.equal(r.address, HARDHAT0_ADDR);
    assert.equal(r.keyType, 'Public key');
  }
});

test('bad keys throw', () => {
  assert.throws(() => deriveFromKey('0x1234'), /Expected 32 bytes \(private key\) or 33\/64\/65 bytes \(public key\), got 2/);
  assert.throws(() => deriveFromKey('0x' + '0'.repeat(64)), /out of range/);
  assert.throws(() => deriveFromKey('0x' + 'ff'.repeat(32)), /out of range/);
  assert.throws(() => deriveFromKey('0x02' + '00'.repeat(32)), /Not a valid secp256k1 public key/);
  assert.throws(() => deriveFromKey('xyz'));
});
