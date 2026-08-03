import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash160Rows, EXAMPLE_HEX, EXAMPLE_TEXT } from '../../src/bitcoin/hash160/hash160.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;
const labels = rows => rows.map(r => r.label);

test('empty hex input gives no result', () => {
  assert.equal(hash160Rows('', 'hex'), null);
});

test('Example: BIP84 public key gives the BIP84 P2WPKH address', () => {
  const rows = hash160Rows(EXAMPLE_HEX, 'hex');
  assert.equal(value(rows, 'Step 2: RIPEMD-160 = HASH160'), 'c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2');
  assert.equal(value(rows, 'As P2WPKH address'), 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
  assert.ok(value(rows, 'As P2PKH address').startsWith('1'));
  assert.ok(!labels(rows).includes('As P2SH address'));
  assert.equal(value(rows, 'Input size'), '33 bytes');
});

test('uncompressed key: P2PKH only (Satoshi genesis key)', () => {
  const rows = hash160Rows('04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f', 'hex');
  assert.equal(value(rows, 'Step 2: RIPEMD-160 = HASH160'), '62e907b15cbf27d5425399ebf6f0fb50ebb88f18');
  assert.equal(value(rows, 'As P2PKH address'), '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  assert.ok(!labels(rows).includes('As P2WPKH address'));
});

test('non-key hex is treated as a redeem script (P2SH of OP_TRUE)', () => {
  const rows = hash160Rows('51', 'hex');
  assert.equal(value(rows, 'Step 2: RIPEMD-160 = HASH160'), 'da1745e9b549bd0bfa1a569971c77eba30cd5a4b');
  assert.equal(value(rows, 'As P2SH address'), '3MaB7QVq3k4pQx3BhsvEADgzQonLSBwMdj');
  assert.ok(!labels(rows).includes('As P2PKH address'));
});

test('33 bytes that are not a curve point are not a key', () => {
  const rows = hash160Rows('02' + 'ff'.repeat(32), 'hex');
  assert.ok(!labels(rows).includes('As P2PKH address'));
  assert.ok(labels(rows).includes('As P2SH address'));
});

test('text mode: hashes UTF-8, no addresses', () => {
  const rows = hash160Rows(EXAMPLE_TEXT, 'text');
  assert.equal(value(rows, 'Step 1: SHA-256'), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  assert.deepEqual(labels(rows), ['Step 1: SHA-256', 'Step 2: RIPEMD-160 = HASH160', 'Input size']);
  // HASH160 of the empty string is a well-known value.
  assert.equal(value(hash160Rows('', 'text'), 'Step 2: RIPEMD-160 = HASH160'), 'b472a266d0bd89c13706a4132ccfb16f7c3b9fcb');
});

test('invalid hex throws', () => {
  assert.throws(() => hash160Rows('0g', 'hex'));
});
