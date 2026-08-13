import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInput, decodeInput, readable, EXAMPLES } from '../../src/evm/rlp/rlp.js';

const enc = json => encodeInput(json).hex;

test('empty input gives no result', () => {
  assert.equal(encodeInput('  '), null);
  assert.equal(decodeInput(''), null);
});

test('encode: vectors from the Ethereum RLP specification', () => {
  assert.equal(enc('"dog"'), '0x83646f67');
  assert.equal(enc('["cat", "dog"]'), '0xc88363617483646f67');
  assert.equal(enc('""'), '0x80');
  assert.equal(enc('[]'), '0xc0');
  assert.equal(enc('0'), '0x80');
  assert.equal(enc('"0x00"'), '0x00');
  assert.equal(enc('"0x0f"'), '0x0f');
  assert.equal(enc('15'), '0x0f');
  assert.equal(enc('1024'), '0x820400');
  assert.equal(enc('[[], [[]], [[], [[]]]]'), '0xc7c0c1c0c3c0c1c0');
  const lorem = encodeInput('"Lorem ipsum dolor sit amet, consectetur adipisicing elit"');
  assert.equal(lorem.hex.slice(0, 8), '0xb8384c');
  assert.equal(lorem.size, 58);
});

test('encode: the page example', () => {
  assert.deepEqual(encodeInput(EXAMPLES.encode), { hex: '0xd48363617483646f6782040084deadbeefc3c0c1c0', size: 21 });
});

test('decode: the page example ["cat", "dog"]', () => {
  const r = decodeInput(EXAMPLES.decode);
  assert.deepEqual(JSON.parse(r.tree), ['0x636174', '0x646f67']);
  assert.deepEqual(JSON.parse(r.readable), ['cat', 'dog']);
});

test('decode round-trips the encode example', () => {
  const r = decodeInput(encodeInput(EXAMPLES.encode).hex);
  // Short non-text byte strings without a leading zero read as numbers.
  assert.deepEqual(JSON.parse(r.readable), ['cat', 'dog', 1024, 0xdeadbeef, [[], [[]]]]);
  assert.deepEqual(JSON.parse(r.tree), ['0x636174', '0x646f67', '0x0400', '0xdeadbeef', [[], [[]]]]);
});

test('readable view: empty, text, small numbers, other bytes', () => {
  assert.equal(readable(new Uint8Array()), '');
  assert.equal(readable(Uint8Array.of(0x68, 0x69)), 'hi');
  assert.equal(readable(Uint8Array.of(4, 0)), 1024);
  assert.equal(readable(Uint8Array.of(0, 1)), '0x0001');
  assert.equal(readable(new Uint8Array(9).fill(1)), '0x010101010101010101');
});

test('encode errors', () => {
  assert.throws(() => encodeInput('[cat]'), /Input is not valid JSON/);
  assert.throws(() => encodeInput('[1, -1]'), /value\[1\]: only non-negative integers/);
  assert.throws(() => encodeInput('1.5'), /only non-negative integers/);
  assert.throws(() => encodeInput('[null]'), /value\[0\]: use strings, numbers or arrays \(got null\)/);
  assert.throws(() => encodeInput('{"a": 1}'), /got object/);
  assert.throws(() => encodeInput('["0xabc"]'));
});

test('decode errors: truncated and non-canonical RLP', () => {
  assert.throws(() => decodeInput('0x83646f'), /RLP data ended unexpectedly/);
  assert.throws(() => decodeInput('0xb800'), /Non-canonical RLP/);
  assert.throws(() => decodeInput('nothex'));
});
