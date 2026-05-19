import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberToBytes, bytesToNumber } from '../../src/dev/little-endian/little-endian.js';
import { InputError } from '../../src/dev/lib/ui.js';

const values = rows => Object.fromEntries(rows.filter(Boolean).map(r => [r.label, r.value]));

test('example: 0x12345678 as 32-bit', () => {
  const v = values(numberToBytes('305419896', 32, false));
  assert.equal(v['Big-endian'], '12 34 56 78');
  assert.equal(v['Little-endian'], '78 56 34 12');
  assert.equal(v['Big-endian hex'], '0x12345678');
  assert.equal(v['Little-endian hex'], '0x78563412');
  assert.equal(v['Little-endian array'], '[120, 86, 52, 18]');
});

test('negative numbers use two\'s complement', () => {
  const v = values(numberToBytes('-2', 16, false));
  assert.equal(v['Big-endian'], 'ff fe');
  assert.equal(v['Little-endian'], 'fe ff');
});

test('prefixed input and wide types', () => {
  assert.equal(values(numberToBytes('0x0102', 64, false))['Little-endian'], '02 01 00 00 00 00 00 00');
  assert.equal(values(numberToBytes('0b1', 8, false))['Big-endian'], '01');
});

test('out-of-range numbers throw', () => {
  assert.throws(() => numberToBytes('256', 8, false), InputError);
  assert.throws(() => numberToBytes('128', 8, true), /signed 8-bit/);
  assert.throws(() => numberToBytes('-129', 8, false), InputError);
  assert.throws(() => numberToBytes('12z', 32, false), /not a valid base-10 digit/);
});

test('bytes → number: the example bytes read back', () => {
  const v = values(bytesToNumber('78 56 34 12', 32, false, 'le'));
  assert.equal(v['Unsigned value'], '305419896');
  assert.equal(v['Hex (big-endian)'], '0x12345678');
  assert.equal(v['Reversed bytes'], '12 34 56 78');
  assert.equal(v.Note, undefined);
  assert.equal(values(bytesToNumber('12345678', 32, false, 'be'))['Unsigned value'], '305419896');
});

test('bytes → number: signed values and padding', () => {
  assert.equal(values(bytesToNumber('ff ff ff ff', 32, true, 'le'))['Signed value'], '-1');
  const v = values(bytesToNumber('01 00', 32, false, 'le'));
  assert.equal(v['Unsigned value'], '1');
  assert.equal(v.Note, 'Padded 2 byte(s) to 4 with zero high bytes.');
});

test('bytes → number: errors', () => {
  assert.throws(() => bytesToNumber('01 02 03', 16, false, 'le'), /3 bytes don't fit in 16 bits/);
  assert.throws(() => bytesToNumber('abc', 32, false, 'le'), /even number of digits/);
  assert.throws(() => bytesToNumber('zz', 32, false, 'le'), /only contain 0-9/);
  assert.throws(() => bytesToNumber('', 32, false, 'le'), /Enter hex bytes/);
});
