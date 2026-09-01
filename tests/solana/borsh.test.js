import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchema, encode, decode, parseInputBytes, intBytes, EX } from '../../src/solana/borsh/borsh.js';

const hexOf = b => Buffer.from(b).toString('hex');
const enc = (schema, value) => hexOf(encode(parseSchema(schema), value));
const dec = (schema, h) => decode(parseSchema(schema), Uint8Array.from(Buffer.from(h, 'hex')));

test('Example 1: struct encodes per the Borsh spec and decodes back', () => {
  const [schema, json] = EX.ex1;
  const expected =
    '00ca9a3b00000000' + // amount: u64 LE 1,000,000,000
    '05000000' + '416c696365' + // name: u32 length + UTF-8 "Alice"
    '7e8c088760bfde1dddcf32c17f209b8242ee52aaf131facd88d0ea2c6d0b06f2' + // owner: 32 bytes
    '03000000' + '010203' + // tags: u32 length + items
    '00'; // delegate: None
  assert.equal(enc(schema, JSON.parse(json)), expected);
  assert.deepEqual(dec(schema, expected), {
    amount: '1000000000', name: 'Alice', owner: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', tags: [1, 2, 3], delegate: null,
  });
});

test('Example 2: enum is a one-byte variant index followed by its fields', () => {
  const [schema, json] = EX.ex2;
  assert.equal(enc(schema, JSON.parse(json)), '01' + '2a00000000000000');
  assert.equal(enc(schema, 'Close'), '02');
  assert.equal(enc(schema, { Initialize: { decimals: 9 } }), '0009');
  assert.deepEqual(dec(schema, '012a00000000000000'), { Transfer: ['42'] });
  assert.deepEqual(dec(schema, '0009'), { Initialize: { decimals: 9 } });
  assert.equal(dec(schema, '02'), 'Close');
});

test('integers are little-endian two\'s complement', () => {
  assert.equal(enc('u16', 258), '0201');
  assert.equal(enc('i8', -1), 'ff');
  assert.equal(enc('i32', -2), 'feffffff');
  assert.equal(enc('u64', '18446744073709551615'), 'ff'.repeat(8));
  assert.equal(enc('i128', '-1'), 'ff'.repeat(16));
  assert.equal(dec('i32', 'feffffff'), -2);
  assert.equal(dec('i64', 'ffffffffffffffff'), '-1');
  assert.equal(dec('u128', '01' + '00'.repeat(15)), '1');
  assert.throws(() => enc('u8', 256), /value: 256 is out of range/);
  assert.throws(() => enc('u8', 1.5), /value: expected an integer/);
  assert.equal(hexOf(intBytes(-128, 1, true, 'x')), '80');
});

test('floats, bools, strings, bytes and fixed arrays', () => {
  assert.equal(enc('f32', 1), '0000803f');
  assert.equal(enc('f64', -2.5), '00000000000004c0');
  assert.throws(() => enc('f64', 'x'), /Borsh forbids NaN/);
  assert.equal(enc('bool', true), '01');
  assert.equal(enc('string', 'é'), '02000000c3a9');
  assert.equal(enc('bytes', '0xdead'), '02000000dead');
  assert.equal(enc('bytes', [1, 2]), '020000000102');
  assert.equal(enc('[u8; 2]', 'beef'), 'beef');
  assert.equal(enc('[u16; 2]', [1, 2]), '01000200');
  assert.equal(dec('[u8; 2]', 'beef'), 'beef');
  assert.deepEqual(dec('[u16; 2]', '01000200'), [1, 2]);
  assert.equal(dec('f32', '0000803f'), 1);
  assert.equal(dec('bytes', '02000000dead'), 'dead');
  assert.deepEqual(dec('option<u8>', '0107'), 7);
});

test('schema errors', () => {
  assert.throws(() => parseSchema('foo'), /Unknown type "foo"/);
  assert.throws(() => parseSchema('vec<u8'), /Schema ends unexpectedly/);
  assert.throws(() => parseSchema('u8 u8'), /Unexpected "u8" after the end/);
  assert.throws(() => parseSchema('u8 $'), /Unexpected character "\$"/);
  assert.throws(() => parseSchema('enum {}'), /at least one variant/);
  assert.throws(() => parseSchema('[u8; x]'), /Array length must be a number/);
  assert.deepEqual(parseSchema('// comment\nstruct { a: u8, }'), { k: 'struct', fields: [['a', { k: 'int', size: 1, signed: false, name: 'u8' }]] });
});

test('value errors name the path', () => {
  const s = 'struct { a: u8, b: vec<pubkey>, c: option<u8> }';
  assert.equal(enc(s, { a: 1, b: [] }), '010000000000'); // missing option is None
  assert.throws(() => enc(s, { a: 1 }), /value\.b: missing/);
  assert.throws(() => enc(s, { a: 1, b: [], z: 1 }), /unknown field "z"/);
  assert.throws(() => enc(s, { a: 1, b: ['abc'] }), /value\.b\[0\]: a public key is 32 bytes \(got 3\)/);
  assert.throws(() => enc('enum { A, B }', 'C'), /unknown variant "C"\. Options: A, B\./);
  assert.throws(() => enc('[u8; 2]', 'aa'), /expected 2 bytes \(got 1\)/);
});

test('decode errors', () => {
  assert.throws(() => dec('u32', '0100'), /Not enough bytes: needed 4 more at offset 0/);
  assert.throws(() => dec('u8', '0102'), /Decoded 1 bytes but the input has 2: 1 trailing bytes/);
  assert.throws(() => dec('bool', '02'), /Invalid bool byte 2 at offset 0/);
  assert.throws(() => dec('option<u8>', '02'), /Invalid option tag 2/);
  assert.throws(() => dec('enum { A }', '01'), /variant index 1 at offset 0 does not exist \(1 variants\)/);
  assert.throws(() => dec('string', 'ff000000'), /Length 255 at offset 0 is larger than the input/);
  assert.throws(() => dec('string', '01000000ff'), /String at offset 4 is not valid UTF-8/);
});

test('input bytes: hex, base64 and base58, auto-detected', () => {
  assert.equal(hexOf(parseInputBytes(' 0xDE AD ', 'auto')), 'dead');
  assert.equal(hexOf(parseInputBytes('3q0=', 'auto')), 'dead');
  assert.equal(hexOf(parseInputBytes('2', 'base58')), '01');
  assert.throws(() => parseInputBytes('3q0=', 'hex'), /^Error: Bytes are not valid hex\.$/);
  assert.throws(() => parseInputBytes('!!', 'auto'), /not valid hex, base64 or base58/);
});
