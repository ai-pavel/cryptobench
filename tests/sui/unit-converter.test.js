import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suiToMist, mistToSui, group, whole, gasBudget } from '../../src/sui/unit-converter/unit-converter.js';

// 1 SUI = 10^9 MIST.
test('SUI to MIST is exact', () => {
  assert.equal(suiToMist('1'), 1_000_000_000n);
  assert.equal(suiToMist('2.5'), 2_500_000_000n); // the Example
  assert.equal(suiToMist('0.000000001'), 1n);
  assert.equal(suiToMist('.5'), 500_000_000n);
  assert.equal(suiToMist('3.'), 3_000_000_000n);
  assert.equal(suiToMist(' 1,000_000 '), 1_000_000_000_000_000n);
  assert.equal(suiToMist('10000000000'), 10_000_000_000n * 1_000_000_000n); // total supply, beyond 2^53
});

test('SUI input errors', () => {
  assert.throws(() => suiToMist(''), /non-negative SUI amount/);
  assert.throws(() => suiToMist('.'), /non-negative SUI amount/);
  assert.throws(() => suiToMist('-1'), /non-negative SUI amount/);
  assert.throws(() => suiToMist('1e9'), /non-negative SUI amount/);
  assert.throws(() => suiToMist('0.0000000001'), /at most 9 decimal places/);
});

test('MIST to SUI trims trailing zeros', () => {
  assert.equal(mistToSui(2_500_000_000n), '2.5');
  assert.equal(mistToSui(1n), '0.000000001');
  assert.equal(mistToSui(0n), '0');
  assert.equal(mistToSui(1_000_000_000n), '1');
});

test('whole numbers and grouping', () => {
  assert.equal(whole(' 1_000 ', 'MIST'), 1000n);
  assert.throws(() => whole('1.5', 'MIST'), /MIST must be a whole non-negative number/);
  assert.throws(() => whole('', 'Gas units'), /Gas units must be/);
  assert.equal(group(1234567n), '1,234,567');
  assert.equal(group(999n), '999');
});

test('gas budget', () => {
  // Page defaults: 1000 MIST × 10,000,000 units = 10 SUI.
  assert.deepEqual(gasBudget('1000', '10000000'), { budget: 10_000_000_000n, mist: '10,000,000,000 MIST', sui: '10 SUI' });
  // Example: 750 × 2,000,000.
  assert.deepEqual(gasBudget('750', '2000000'), { budget: 1_500_000_000n, mist: '1,500,000,000 MIST', sui: '1.5 SUI' });
  assert.throws(() => gasBudget('x', '1'), /Gas price must be/);
});
