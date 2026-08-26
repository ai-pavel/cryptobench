import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, validate, fmt, dur, estimateText, defaultThreads, threadCount, resultRows } from '../../src/solana/vanity-address/vanity-address.js';

test('character match counts follow the base58 alphabet', () => {
  assert.equal(matches('a', true), 1);
  assert.equal(matches('0', true), 0);
  assert.equal(matches('a', false), 2); // a, A
  assert.equal(matches('o', false), 1); // o only: base58 has no O
  assert.equal(matches('L', false), 1); // L only: base58 has no l
  assert.equal(matches('i', false), 1); // i only: base58 has no I
  assert.equal(matches('1', false), 1);
});

test('Example: "ab" case-insensitive needs about 841 keys', () => {
  const v = validate('ab', '', false);
  assert.deepEqual(v, { p: 'ab', s: '', cs: false, expected: (58 / 2) ** 2 });
  assert.equal(estimateText(v, 0), 'About 841 keys on average. Speed is shown once the search starts.');
  assert.equal(estimateText(v, 841), 'About 841 keys on average · roughly 1 s at the current speed.');
});

test('expected keys grow by 58 per case-sensitive character', () => {
  const v = validate(' Sun ', 'X', true);
  assert.equal(v.p, 'Sun');
  assert.equal(v.expected, 58 ** 4);
  assert.equal(estimateText(validate('abcdefg', '', true), 0).endsWith(' Long patterns can take days or longer.'), true);
});

test('impossible or empty patterns are errors', () => {
  assert.deepEqual(validate('a0', '', false), { error: '"0" can never appear in an address: base58 has no 0, O, I or l.' });
  assert.deepEqual(validate('', 'l', true), { error: '"l" can never appear in an address: base58 has no 0, O, I or l.' });
  assert.equal(validate('', 'l', false).error, undefined); // matches L
  assert.deepEqual(validate('  ', '', false), { error: 'Enter a prefix, a suffix or both.' });
});

test('number and duration formatting', () => {
  assert.equal(fmt(999.4), '999');
  assert.equal(fmt(1500), '1.5K');
  assert.equal(fmt(2500000), '2.5M');
  assert.equal(fmt(3e9), '3.0B');
  assert.equal(dur(Infinity), '—');
  assert.equal(dur(59.4), '59 s');
  assert.equal(dur(90), '2 min');
  assert.equal(dur(5400), '1.5 h');
  assert.equal(dur(86400 * 3), '3 days');
  assert.equal(dur(86400 * 365 * 2500), '2.5K years');
});

test('thread counts are clamped', () => {
  assert.equal(defaultThreads(8), 7);
  assert.equal(defaultThreads(undefined), 3);
  assert.equal(defaultThreads(1), 1);
  assert.equal(defaultThreads(64), 16);
  assert.equal(threadCount('0'), 1);
  assert.equal(threadCount('100'), 32);
  assert.equal(threadCount('x'), 1);
  assert.equal(threadCount('4'), 4);
});

test('result rows for a found seed (RFC 8032 test 1 key)', () => {
  const seed = Uint8Array.from(Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex'));
  const rows = resultRows(seed);
  assert.deepEqual(rows.map(r => r[0]), ['Address', 'Secret key (base58)', 'Secret key (JSON array)']);
  const arr = JSON.parse(rows[2][1]);
  assert.equal(Buffer.from(arr.slice(32)).toString('hex'), 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
  assert.equal(Buffer.from(arr.slice(0, 32)).toString('hex'), Buffer.from(seed).toString('hex'));
});
