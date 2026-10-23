import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKENS, tokenAt, toBase, fromBase, group, resultRows } from '../../src/polkadot/unit-converter/unit-converter.js';

test('token decimals match the chains (DOT 10 since redenomination, KSM 12, TAO 9)', () => {
  assert.equal(tokenAt(0).decimals, 10);
  assert.equal(tokenAt(1).decimals, 12);
  assert.equal(tokenAt(2).decimals, 9);
  assert.equal(tokenAt(2).base, 'rao');
  assert.equal(tokenAt(8).decimals, 18);
});

test('custom token takes its decimals from the input, clamped to 0–40', () => {
  const custom = TOKENS.length - 1;
  assert.equal(tokenAt(custom, '6').decimals, 6);
  assert.equal(tokenAt(custom, '99').decimals, 40);
  assert.equal(tokenAt(custom, '-3').decimals, 0);
  assert.equal(tokenAt(custom, '').decimals, 0);
});

test('example: 12.5 DOT is 125 000 000 000 Planck', () => {
  assert.equal(toBase('12.5', 10), 125000000000n);
  assert.deepEqual(fromBase('125000000000', 10), { v: 125000000000n, text: '12.5' });
});

test('toBase accepts separators, leading dot, trailing dot', () => {
  assert.equal(toBase('1', 10), 10n ** 10n);
  assert.equal(toBase('1_000,000 ', 0), 1000000n);
  assert.equal(toBase('.5', 1), 5n);
  assert.equal(toBase('3.', 2), 300n);
  assert.equal(toBase('0.000000001', 9), 1n);
});

test('toBase rejects bad numbers and too many decimals', () => {
  assert.throws(() => toBase('', 10), /non-negative number/);
  assert.throws(() => toBase('.', 10), /non-negative number/);
  assert.throws(() => toBase('-1', 10), /non-negative number/);
  assert.throws(() => toBase('1e5', 10), /non-negative number/);
  assert.throws(() => toBase('0.0000000001', 9), /Too many decimal places: this token has 9/);
});

test('fromBase formats fractions and strips trailing zeros', () => {
  assert.equal(fromBase('1', 10).text, '0.0000000001');
  assert.equal(fromBase('10000000000', 10).text, '1');
  assert.equal(fromBase('1 000 000', 0).text, '1000000');
  assert.equal(fromBase('0', 12).text, '0');
  assert.throws(() => fromBase('1.5', 10), /whole number/);
  assert.throws(() => fromBase('', 10), /whole number/);
});

test('group inserts thousands separators', () => {
  assert.equal(group('125000000000'), '125 000 000 000');
  assert.equal(group('999'), '999');
  assert.equal(group('1000'), '1 000');
});

test('result rows and the u128 limit', () => {
  const t = tokenAt(0);
  assert.deepEqual(resultRows(t, 125000000000n, '12.5'), [
    ['DOT', '12.5'], ['Planck', '125000000000'], ['Grouped', '125 000 000 000', { copy: false }], ['Hex (u128)', '0x1d1a94a200'],
  ]);
  const max = (1n << 128n) - 1n;
  assert.equal(resultRows(t, max, '')[3][1], '0x' + 'f'.repeat(32));
  assert.throws(() => resultRows(t, 1n << 128n, ''), /Larger than u128/);
});
