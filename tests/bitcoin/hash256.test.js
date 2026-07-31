import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash256Rows, EXAMPLE_HEX, EXAMPLE_TEXT } from '../../src/bitcoin/hash256/hash256.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;

test('empty hex input gives no result', () => {
  assert.equal(hash256Rows('  ', 'hex'), null);
});

test('Example: genesis block header hashes to the genesis block hash', () => {
  const rows = hash256Rows(EXAMPLE_HEX, 'hex');
  assert.equal(value(rows, 'Reversed'), '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f');
  assert.equal(value(rows, 'HASH256'), '6fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d6190000000000');
  assert.equal(value(rows, 'Checksum (first 4 bytes)'), '6fe28c0a');
  assert.equal(value(rows, 'Input size'), '80 bytes');
});

test('text mode hashes UTF-8 bytes', () => {
  const rows = hash256Rows(EXAMPLE_TEXT, 'text');
  // SHA-256("hello") and SHA-256(SHA-256("hello")), well-known values.
  assert.equal(value(rows, 'First SHA-256'), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  assert.equal(value(rows, 'HASH256'), '9595c9df90075148eb06860365df33584b75bff782a510c6cd4883a419833d50');
  assert.equal(value(rows, 'Input size'), '5 bytes');
});

test('empty text is hashed (empty hex is not)', () => {
  const rows = hash256Rows('', 'text');
  assert.equal(value(rows, 'First SHA-256'), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(value(rows, 'HASH256'), '5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456');
  assert.equal(value(rows, 'Input size'), '0 bytes');
});

test('invalid hex throws', () => {
  assert.throws(() => hash256Rows('xyz', 'hex'));
  assert.throws(() => hash256Rows('abc', 'hex'));
});
