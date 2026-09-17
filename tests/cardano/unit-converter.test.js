import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAda, parseLovelace, adaString, group, MAX_SUPPLY } from '../../src/cardano/unit-converter/unit-converter.js';

test('Example amounts: 1 ADA = 1,000,000 lovelace; fee, stake key and pool deposits', () => {
  assert.equal(parseAda('1.5'), 1500000n);         // default value
  assert.equal(parseAda('1'), 1000000n);
  assert.equal(parseAda('0.17'), 170000n);
  assert.equal(parseAda('2'), 2000000n);           // stake key deposit: 2,000,000 lovelace
  assert.equal(parseAda('500'), 500000000n);       // pool deposit: 500,000,000 lovelace
});

test('ADA input forms', () => {
  assert.equal(parseAda('.5'), 500000n);
  assert.equal(parseAda('5.'), 5000000n);
  assert.equal(parseAda('0.000001'), 1n);
  assert.equal(parseAda(' 1,234_567.89 '), 1234567890000n);
  assert.equal(parseAda('-0.25'), -250000n);
  assert.equal(parseAda('45000000000'), MAX_SUPPLY);
  assert.equal(parseAda('99999999999999999999.999999'), 99999999999999999999999999n);
});

test('lovelace input forms', () => {
  assert.equal(parseLovelace('1,000,000'), 1000000n);
  assert.equal(parseLovelace('-1'), -1n);
});

test('formatting ADA and grouping digits', () => {
  assert.equal(adaString(1500000n), '1.5');
  assert.equal(adaString(1n), '0.000001');
  assert.equal(adaString(0n), '0');
  assert.equal(adaString(-250000n), '-0.25');
  assert.equal(adaString(MAX_SUPPLY), '45000000000');
  assert.equal(group('1500000'), '1,500,000');
  assert.equal(group('-1234'), '-1,234');
  assert.equal(group('999'), '999');
  for (const v of [0n, 1n, 170000n, 123456789012345n, -42n]) assert.equal(parseAda(adaString(v)), v);
});

test('input errors throw', () => {
  assert.throws(() => parseAda(''), /^Error: Enter an ADA amount, e\.g\. 1\.5$/);
  assert.throws(() => parseAda('1e6'), /Enter an ADA amount/);
  assert.throws(() => parseAda('1.0000001'), /ADA has 6 decimal places/);
  assert.throws(() => parseLovelace('1.5'), /Lovelace is a whole number: no decimals\./);
  assert.throws(() => parseLovelace(''), /Lovelace is a whole number/);
});
