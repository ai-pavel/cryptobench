import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayToRaw, rawToDisplay, parseRaw, parseExponent, group, resultRows, PRESETS } from '../../src/cosmos/unit-converter/unit-converter.js';

test('Example: 2.5 ATOM is 2500000uatom', () => {
  const [disp, base, e] = PRESETS[0];
  assert.deepEqual([disp, base, e], ['ATOM', 'uatom', 6]);
  const raw = displayToRaw('2.5', e);
  assert.equal(raw, 2500000n);
  assert.deepEqual(resultRows(raw, e, disp, base), [
    ['In ATOM', '2.5', '2.5'],
    ['In uatom', '2500000', '2,500,000'],
    ['Coin string', '2500000uatom', 'The format used in transactions and CLI commands'],
    ['1 ATOM', '1000000uatom'],
  ]);
});

test('18-decimal tokens convert exactly (no floating point)', () => {
  assert.equal(displayToRaw('1', 18), 10n ** 18n);
  assert.equal(displayToRaw('123456789.000000000000000001', 18), 123456789000000000000000001n);
  assert.equal(rawToDisplay(1n, 18), '0.000000000000000001');
  assert.equal(rawToDisplay(123456789000000000000000001n, 18), '123456789.000000000000000001');
});

test('display amounts: separators, leading/trailing dots, trailing zeros', () => {
  assert.equal(displayToRaw(' 1,000_000 ', 6), 1000000000000n);
  assert.equal(displayToRaw('.5', 6), 500000n);
  assert.equal(displayToRaw('5.', 6), 5000000n);
  assert.equal(displayToRaw('0.000001', 6), 1n);
  assert.equal(rawToDisplay(1500000n, 6), '1.5');
  assert.equal(rawToDisplay(0n, 6), '0');
  assert.equal(rawToDisplay(42n, 0), '42');
});

test('grouping and labels', () => {
  assert.equal(group('1234567'), '1,234,567');
  assert.equal(group('123'), '123');
  const rows = resultRows(1234567891n, 6, '', '');
  assert.deepEqual(rows[0], ['In units', '1234.567891', '1,234.567891']);
  assert.equal(rows[2][1], '1234567891base');
});

test('invalid amounts throw', () => {
  assert.throws(() => displayToRaw('1.2345678', 6), /Too many decimal places: this token has 6, so the smallest unit is 0\.000001/);
  // Quirk: with exponent 0 the message says the smallest unit is 0.1 (it is really 1).
  assert.throws(() => displayToRaw('0.1', 0), /smallest unit is 0\.1\./);
  for (const bad of ['', '.', '-1', '1e6', 'abc', '1.2.3']) assert.throws(() => displayToRaw(bad, 6), /non-negative decimal number/);
  assert.throws(() => parseRaw('1.5'), /whole non-negative number/);
  assert.equal(parseRaw('1,500,000'), 1500000n);
});

test('exponent must be a whole number from 0 to 36', () => {
  assert.equal(parseExponent('18'), 18);
  for (const bad of ['-1', '37', '1.5', 'x']) assert.throws(() => parseExponent(bad), /Exponent must be a whole number from 0 to 36/);
});
