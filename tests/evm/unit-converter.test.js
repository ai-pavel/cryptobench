import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertFrom, sup } from '../../src/evm/unit-converter/unit-converter.js';

test('blank input gives no result', () => {
  assert.equal(convertFrom('  ', 'ether'), null);
});

test('1 ether in every other unit', () => {
  assert.deepEqual(convertFrom('1', 'ether'), {
    wei: '1000000000000000000', kwei: '1000000000000000', mwei: '1000000000000',
    gwei: '1000000000', szabo: '1000000', finney: '1000',
  });
});

test('example: 21,000 gas at 30 gwei', () => {
  const r = convertFrom(String(21000 * 30), 'gwei');
  assert.equal(r.ether, '0.00063');
  assert.equal(r.wei, '630000000000000');
});

test('fractions, separators and exponents are exact', () => {
  assert.equal(convertFrom('1', 'wei').ether, '0.000000000000000001');
  assert.equal(convertFrom('1_000.5', 'gwei').wei, '1000500000000');
  assert.equal(convertFrom('1.5e-9', 'ether').wei, '1500000000');
});

test('invalid amounts throw', () => {
  assert.throws(() => convertFrom('0.5', 'wei'), /more decimal places/);
  assert.throws(() => convertFrom('-1', 'ether'), /non-negative decimal number/);
  assert.throws(() => convertFrom('abc', 'gwei'), /^Error: gwei must be/);
});

test('superscript exponent labels', () => {
  assert.equal(sup(18), '¹⁸');
  assert.equal(sup(9), '⁹');
});
