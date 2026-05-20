import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertNumber } from '../../src/dev/number-converter/number-converter.js';
import { InputError } from '../../src/dev/lib/ui.js';

const values = rows => Object.fromEntries(rows.map(r => [r.label, r.value]));

test('example: 255 in every base', () => {
  const v = values(convertNumber('255', 'auto', 0));
  assert.equal(v.Decimal, '255');
  assert.equal(v.Hex, '0xff');
  assert.equal(v.Binary, '1111 1111');
  assert.equal(v.Octal, '0o377');
  assert.equal(v['Base 36'], '73');
  assert.equal(v['Bit length'], '8');
  assert.equal(v['8-bit pattern (hex)'], undefined);
});

test('prefixes are detected in auto mode and digits are grouped', () => {
  assert.equal(values(convertNumber('0xdeadbeef', 'auto', 0)).Decimal, '3,735,928,559');
  assert.equal(values(convertNumber('0b1010', 'auto', 0)).Decimal, '10');
  assert.equal(values(convertNumber('0o17', 'auto', 0)).Decimal, '15');
  assert.equal(values(convertNumber('ff', '16', 0)).Decimal, '255');
  assert.equal(values(convertNumber('zz', '36', 0)).Decimal, '1,295');
});

test('2^64 is handled exactly', () => {
  const v = values(convertNumber('18446744073709551616', 'auto', 0));
  assert.equal(v.Hex, '0x10000000000000000');
  assert.equal(v['Bit length'], '65');
});

test('negative numbers and two\'s complement patterns', () => {
  const v = values(convertNumber('-1', 'auto', 8));
  assert.equal(v.Hex, '-0x1');
  assert.equal(v['8-bit pattern (hex)'], '0xff');
  assert.equal(v['8-bit pattern (binary)'], '1111 1111');
  assert.equal(v['As unsigned'], '255');
  assert.equal(v['As signed'], '-1');
  const w = values(convertNumber('200', 'auto', 8));
  assert.equal(w['As signed'], '-56');
  assert.equal(values(convertNumber('-128', 'auto', 16))['16-bit pattern (hex)'], '0xff80');
});

test('invalid input throws', () => {
  assert.throws(() => convertNumber('', 'auto', 0), /Enter a number/);
  assert.throws(() => convertNumber('12', '2', 0), /"2" is not a valid base-2 digit/);
  assert.throws(() => convertNumber('0x', 'auto', 0), /after the prefix/);
  assert.throws(() => convertNumber('256', 'auto', 8), InputError);
  assert.throws(() => convertNumber('-129', 'auto', 8), /signed 8-bit/);
});
