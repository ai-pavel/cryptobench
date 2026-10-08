import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeJson, decodeToJson } from '../../src/sui/bcs/bcs.js';
import { parseSchema } from '../../src/sui/lib/bcs.js';

const hexOf = rows => rows[0][1];

const EXAMPLE_SCHEMA = 'struct {\n  amount: u64,\n  recipient: address,\n  memo: option<string>,\n  tags: vector<u8>,\n  big: u256,\n  e: enum { A, B(u16), C { x: bool } },\n  arr: [u32; 2]\n}';
const EXAMPLE_JSON = '{"amount":"1000000000","recipient":"0x2","memo":"hello","tags":[1,2],"big":"115792089237316195423570985008687907853269984665640564039457584007913129639935","e":{"C":{"x":true}},"arr":[1,4294967295]}';
const EXAMPLE_BYTES = '0x00ca9a3b000000000000000000000000000000000000000000000000000000000000000000000002010568656c6c6f020102ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff020101000000ffffffff';

test('Example encodes to the Example bytes and decodes back', () => {
  const schema = parseSchema(EXAMPLE_SCHEMA);
  const rows = encodeJson(schema, EXAMPLE_JSON);
  assert.equal(hexOf(rows), EXAMPLE_BYTES);
  assert.equal(rows[2][1], `${(EXAMPLE_BYTES.length - 2) / 2} bytes`);
  const back = JSON.parse(decodeToJson(schema, EXAMPLE_BYTES));
  assert.equal(back.memo, 'hello');
  assert.equal(String(back.amount), '1000000000');
  assert.deepEqual(back.arr.map(String), ['1', '4294967295']);
  // Round trip: re-encoding the decoded value gives the same bytes.
  assert.equal(hexOf(encodeJson(schema, decodeToJson(schema, EXAMPLE_BYTES))), EXAMPLE_BYTES);
});

// Known encodings from the BCS specification: little-endian integers, ULEB128 lengths,
// 0/1 option and bool tags, 32-byte addresses.
test('BCS spec encodings', () => {
  const enc = (t, v) => hexOf(encodeJson(parseSchema(t), JSON.stringify(v)));
  assert.equal(enc('u8', 1), '0x01');
  assert.equal(enc('u16', 4660), '0x3412');
  assert.equal(enc('u32', 305419896), '0x78563412');
  assert.equal(enc('u64', '1311768467750121216'), '0x00efcdab78563412');
  assert.equal(enc('bool', true), '0x01');
  assert.equal(enc('option<u8>', null), '0x00');
  assert.equal(enc('option<u8>', 8), '0x0108');
  assert.equal(enc('string', 'çå∞≠¢õß∂ƒ∫'), '0x18c3a7c3a5e2889ee289a0c2a2c3b5c39fe28882c692e288ab');
  assert.equal(enc('vector<u8>', '0x0102'), '0x020102');
  assert.equal(enc('vector<u8>', new Array(128).fill(0)), '0x8001' + '00'.repeat(128));
  assert.equal(enc('address', '0x1'), '0x' + '00'.repeat(31) + '01');
  assert.equal(enc('(u8, bool)', [1, false]), '0x0100');
  assert.equal(enc('enum { A, B(u16) }', { B: 1 }), '0x010100');
});

test('decode accepts base64 too', () => {
  assert.equal(decodeToJson(parseSchema('u16'), 'NBI='), '4660');
});

test('errors', () => {
  const schema = parseSchema('u8');
  assert.throws(() => encodeJson(schema, '{'), /^Error: Value is not valid JSON: /);
  assert.throws(() => encodeJson(schema, '256'));
  assert.throws(() => decodeToJson(schema, '0x0102')); // trailing bytes
  assert.throws(() => decodeToJson(parseSchema('u32'), '0x01')); // too short
});
