import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertKeypair, toIdJson, MISMATCH_WARNING } from '../../src/solana/keypair-converter/keypair-converter.js';
import { base58 } from '../../src/solana/lib/sol.js';

const rows = r => Object.fromEntries(r.rows.map(([k, v]) => [k, v]));
const hexToArr = h => Array.from(Buffer.from(h, 'hex'));

// RFC 8032 section 7.1, TEST 1.
const RFC_SEED = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const RFC_PUB = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';

test('RFC 8032 seed gives the RFC public key, in every input form', () => {
  const pub = base58.encode(Buffer.from(RFC_PUB, 'hex'));
  const full = JSON.stringify([...hexToArr(RFC_SEED), ...hexToArr(RFC_PUB)]);
  for (const input of [RFC_SEED, '0x' + RFC_SEED, JSON.stringify(hexToArr(RFC_SEED)), full, base58.encode(Buffer.from(RFC_SEED + RFC_PUB, 'hex'))]) {
    const r = convertKeypair(input);
    assert.equal(r.warning, '');
    const o = rows(r);
    assert.equal(o['Public key (address)'], pub);
    assert.equal(o['Seed (hex, 32 bytes)'], RFC_SEED);
    assert.equal(o['Secret key (JSON array, 64 bytes)'], full);
  }
});

test('Example: seed 1…32 in id.json form', () => {
  const example = '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,121,181,86,46,143,230,84,249,64,120,177,18,232,169,139,167,144,31,133,58,230,149,190,215,224,227,145,11,173,4,150,100]';
  const r = convertKeypair(example);
  assert.equal(r.warning, '');
  const o = rows(r);
  assert.equal(o['Seed (hex, 32 bytes)'], '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20');
  assert.equal(o['Secret key (JSON array, 64 bytes)'], example);
  // The public key is the second half of the id.json array.
  assert.equal(o['Public key (address)'], base58.encode(Uint8Array.from(JSON.parse(example).slice(32))));
  assert.equal(base58.decode(o['Secret key (base58, 64 bytes)']).length, 64);
  assert.equal(base58.encode(base58.decode(o['Seed (base58, 32 bytes)'])), o['Seed (base58, 32 bytes)']);
  assert.equal(toIdJson(Uint8Array.from({ length: 32 }, (_, i) => i + 1)), example);
});

test('a 64-byte key with the wrong public half warns but uses the right key', () => {
  const bad = JSON.stringify([...hexToArr(RFC_SEED), ...new Array(32).fill(0)]);
  const r = convertKeypair(bad);
  assert.equal(r.warning, MISMATCH_WARNING);
  assert.equal(rows(r)['Public key (address)'], base58.encode(Buffer.from(RFC_PUB, 'hex')));
});

test('bad input throws a readable error', () => {
  assert.throws(() => convertKeypair(''), /Secret key is empty/);
  assert.throws(() => convertKeypair('[1,2,'), /does not parse/);
  assert.throws(() => convertKeypair('[1,256]'), /numbers 0–255/);
  assert.throws(() => convertKeypair('[1,2,3]'), /must be 32 or 64 bytes \(got 3\)/);
  assert.throws(() => convertKeypair('not-base58!'), /not a JSON array, hex or base58/);
});
