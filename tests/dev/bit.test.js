import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskOf, parseValue, bitRows } from '../../src/dev/bit/bit.js';

const values = rows => Object.fromEntries(rows.map(r => [r.label, r.value]));

test('masks', () => {
  assert.equal(maskOf(8), 0xffn);
  assert.equal(maskOf(64), 0xffffffffffffffffn);
});

test('the initial value 0xdeadbeef', () => {
  const u = parseValue('0xdeadbeef', 32);
  assert.equal(u, 0xdeadbeefn);
  const v = values(bitRows(u, 32, false));
  assert.equal(v.Decimal, '3735928559');
  assert.equal(v.Hex, '0xdeadbeef');
  assert.equal(v.Binary, '1101 1110 1010 1101 1011 1110 1110 1111');
  assert.equal(v.Octal, '0o33653337357');
  assert.equal(v['Set bits'], '24');
  assert.equal(values(bitRows(u, 32, true)).Decimal, '-559038737');
});

test('negative input becomes two\'s complement; hex is zero-padded', () => {
  assert.equal(parseValue('-1', 8), 0xffn);
  assert.equal(parseValue('-32768', 16), 0x8000n);
  assert.equal(values(bitRows(1n, 16, false)).Hex, '0x0001');
});

test('out-of-range and invalid input throws', () => {
  assert.throws(() => parseValue('256', 8), /unsigned 8-bit/);
  assert.throws(() => parseValue('-129', 8), /signed 8-bit/);
  assert.throws(() => parseValue('0xzz', 32), /not a valid base-16 digit/);
  assert.throws(() => parseValue('', 32), /Enter a number/);
});
