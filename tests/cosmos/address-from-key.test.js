import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { addressFromKey } from '../../src/cosmos/address-from-key/address-from-key.js';

// Public key of the "abandon … about" test mnemonic at m/44'/118'/0'/0/0, whose
// well-known Cosmos Hub address is cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4.
const PUB_B64 = 'Ak9OKtmcNNYLm6YoPJQxqEGK+GcyEpYfl6d7Y3f80Fti';
const PUB_HEX = Buffer.from(PUB_B64, 'base64').toString('hex');
const ADDR = 'cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4';
const row = (r, label) => r.rows.find(x => x[0] === label);

test('empty input gives no result', () => {
  assert.equal(addressFromKey(' ', 'cosmos'), null);
});

test('Example: secp256k1 key on the Cosmos Hub', () => {
  const r = addressFromKey(PUB_B64, 'cosmos', 'auto');
  assert.equal(r.type, 'cosmos');
  assert.equal(row(r, 'Address')[1], ADDR);
  // Address bytes are RIPEMD-160(SHA-256(compressed key)), checked with node:crypto.
  const h = createHash('ripemd160').update(createHash('sha256').update(Buffer.from(PUB_B64, 'base64')).digest()).digest('hex');
  assert.equal(row(r, 'Address bytes')[1], h);
  assert.equal(row(r, 'Compressed key (hex)')[1], PUB_HEX);
  assert.equal(row(r, 'Compressed key (base64)')[1], PUB_B64);
  const unc = row(r, 'Uncompressed key (hex)')[1];
  assert.equal(unc.length, 130);
  assert.ok(unc.startsWith('04' + PUB_HEX.slice(2)));
  assert.equal(r.other[0], 'ethsecp256k1 form');
});

test('the key can be given as hex, uncompressed, or amino JSON', () => {
  const unc = row(addressFromKey(PUB_B64, 'cosmos'), 'Uncompressed key (hex)')[1];
  for (const input of [PUB_HEX, '0x' + PUB_HEX, unc, JSON.stringify({ type: 'tendermint/PubKeySecp256k1', value: PUB_B64 })]) {
    assert.equal(row(addressFromKey(input, 'cosmos'), 'Address')[1], ADDR);
  }
});

test('the prefix follows the chain', () => {
  assert.match(row(addressFromKey(PUB_B64, 'osmo'), 'Address')[1], /^osmo19rl4cm2hmr8afy4kldpxz3fka4jguq0a/);
});

test('ethsecp256k1: Injective picks Ethereum-style addresses automatically', () => {
  const r = addressFromKey(PUB_B64, 'inj', 'auto');
  assert.equal(r.type, 'eth');
  assert.equal(r.other[0], 'secp256k1 (Cosmos) form');
  assert.match(r.other[1], /^inj19rl4cm2hmr8afy4kldpxz3fka4jguq0a/);
  // The Ethereum address is the EIP-55 form of the address bytes.
  const eth = row(r, 'Ethereum address')[1];
  assert.equal(eth.toLowerCase(), '0x' + row(r, 'Address bytes')[1]);
  assert.match(eth, /[A-F]/);
  // An explicit type overrides the chain.
  assert.equal(addressFromKey(PUB_B64, 'inj', 'cosmos').type, 'cosmos');
  assert.equal(addressFromKey(PUB_B64, 'cosmos', 'eth').type, 'eth');
});

test('invalid keys throw', () => {
  assert.throws(() => addressFromKey('02' + '00'.repeat(31), 'cosmos'), /33 bytes \(compressed\)/);
  assert.throws(() => addressFromKey('05' + PUB_HEX.slice(2), 'cosmos'), /not a valid point/);
  assert.throws(() => addressFromKey('{"key":', 'cosmos'), /not valid JSON/);
  assert.throws(() => addressFromKey('{"foo":"bar"}', 'cosmos'), /no "key" or "value" field/);
});
