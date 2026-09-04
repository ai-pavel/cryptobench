import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountToUnits, parseUnits, unitsToAmount, parseDecimals } from '../../src/ton/unit-converter/unit-converter.js';

// 1 TON = 10^9 nanotons; USDT on TON has 6 decimals.
test('TON ↔ nanotons', () => {
  assert.equal(amountToUnits('1', 9), '1000000000');
  assert.equal(amountToUnits('0.000000001', 9), '1');
  assert.equal(amountToUnits('1_000.5', 9), '1000500000000');
  assert.equal(unitsToAmount('1000000000', 9), '1');
  assert.equal(unitsToAmount('1', 9), '0.000000001');
});

test('Example values: 5500000 nanotons and 12.5 USDT', () => {
  assert.equal(unitsToAmount('5500000', 9), '0.0055');
  assert.equal(amountToUnits('12.5', 6), '12500000');
});

test('separators, signs and zero decimals', () => {
  assert.equal(unitsToAmount(' 1,234,567 ', 3), '1234.567');
  assert.equal(unitsToAmount('1 000', 0), '1000');
  assert.equal(unitsToAmount('-1500', 3), '-1.5');
  assert.equal(parseUnits('-42'), -42n);
  assert.equal(amountToUnits('-0.5', 1), '-5');
  assert.equal(amountToUnits('.5', 1), '5');
});

test('round trip of a large amount', () => {
  const big = '123456789012345678901234567890.123456789';
  assert.equal(unitsToAmount(amountToUnits(big, 9), 9), big);
});

test('invalid units and amounts throw', () => {
  assert.throws(() => parseUnits('1.5'), /Units must be a whole number/);
  assert.throws(() => parseUnits(''), /Units must be a whole number/);
  assert.throws(() => amountToUnits('abc', 9), /Not a valid number/);
  assert.throws(() => amountToUnits('0.0000000001', 9), /Too many decimal places: at most 9/);
  assert.equal(amountToUnits('0.1000000000', 9), '100000000'); // trailing zeros are fine
});

test('decimals must be 0..255', () => {
  assert.equal(parseDecimals('6'), 6);
  assert.equal(parseDecimals('0'), 0);
  assert.equal(parseDecimals('255'), 255);
  for (const bad of ['-1', '256', '1.5', 'x']) assert.throws(() => parseDecimals(bad), /Decimals must be a whole number from 0 to 255/);
});
