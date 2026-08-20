import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solToLamports, lamportsToSol, group, parseInt_, feeRows } from '../../src/solana/unit-converter/unit-converter.js';

test('SOL to lamports is exact (1 SOL = 10^9 lamports)', () => {
  assert.equal(solToLamports('1'), 1000000000n);
  assert.equal(solToLamports('1.5'), 1500000000n);
  assert.equal(solToLamports('.000000001'), 1n);
  assert.equal(solToLamports('0.'), 0n);
  assert.equal(solToLamports(' 1,000_000 '), 1000000n * 1000000000n);
  assert.equal(solToLamports('123456789.123456789'), 123456789123456789n);
});

test('bad SOL amounts throw', () => {
  for (const s of ['', '.', '-1', '1e9', 'abc', '1.2.3']) assert.throws(() => solToLamports(s), /Enter a non-negative SOL amount/);
  assert.throws(() => solToLamports('0.0000000001'), /at most 9 decimal places/);
});

test('lamports to SOL drops trailing zeros', () => {
  // Example: rent-exempt minimum for a 165-byte token account.
  assert.equal(lamportsToSol(2039280n), '0.00203928');
  assert.equal(lamportsToSol(0n), '0');
  assert.equal(lamportsToSol(1n), '0.000000001');
  assert.equal(lamportsToSol(1000000000n), '1');
  assert.equal(lamportsToSol(18446744073709551615n), '18446744073.709551615');
});

test('integers parse with separators and reject the rest', () => {
  assert.equal(parseInt_(' 2,039,280 ', 'Lamports'), 2039280n);
  assert.throws(() => parseInt_('1.5', 'Lamports'), /^Error: Lamports must be a whole non-negative number\.$/);
  assert.throws(() => parseInt_('', 'Price'), /Price must be/);
  assert.equal(group(1234567n), '1,234,567');
  assert.equal(group(999n), '999');
});

test('default fee: 200,000 CU at 10,000 micro-lamports, one signature', () => {
  assert.deepEqual(feeRows('200000', '10000', '1'), [
    ['Priority fee', '2,000 lamports', '0.000002 SOL'],
    ['Base fee', '5,000 lamports', '0.000005 SOL'],
    ['Total', '7,000 lamports', '0.000007 SOL'],
  ]);
});

test('priority fee rounds up', () => {
  assert.equal(feeRows('1', '1', '0')[0][1], '1 lamports');
  assert.equal(feeRows('1000000', '1', '2')[2][1], '10,001 lamports');
  assert.equal(feeRows('0', '0', '0')[2][1], '0 lamports');
  assert.throws(() => feeRows('x', '1', '1'), /Compute unit limit must be/);
  assert.throws(() => feeRows('1', '1', '-1'), /Signatures must be/);
});
