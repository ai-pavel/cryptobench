import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashInput } from '../../src/evm/keccak256/keccak256.js';

test('empty input gives no result', () => {
  assert.equal(hashInput('', 'text'), null);
  assert.equal(hashInput('', 'hex'), null);
});

test('well-known Keccak-256 values', () => {
  // Keccak-256 of "abc" (original Keccak padding, not NIST SHA3-256).
  assert.deepEqual(hashInput('abc', 'text'), { hash: '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45', size: 3 });
  // Hex mode hashes the bytes: 0x616263 is "abc", and "0x" is the empty string.
  assert.equal(hashInput('0x616263', 'hex').hash, hashInput('abc', 'text').hash);
  assert.deepEqual(hashInput('0x', 'hex'), { hash: '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470', size: 0 });
});

test('example: ERC-20 transfer signature hashes to the a9059cbb selector', () => {
  const r = hashInput('transfer(address,uint256)', 'text');
  assert.equal(r.hash, '0xa9059cbb2ab09eb219583f4a59a5d0623ade346d962bcd4e46b11da047c9049b');
  assert.equal(r.size, 25);
});

test('text is hashed as UTF-8', () => {
  assert.equal(hashInput('é', 'text').size, 2);
});

test('invalid hex throws', () => {
  assert.throws(() => hashInput('0xzz', 'hex'));
  assert.throws(() => hashInput('0xabc', 'hex'));
});
