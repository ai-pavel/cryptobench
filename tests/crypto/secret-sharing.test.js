import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mul, div, split, combine, splitSecret, parseShares, recover } from '../../src/crypto/secret-sharing/secret-sharing.js';

const enc = s => new TextEncoder().encode(s);
const hexOf = b => Buffer.from(b).toString('hex');

test('GF(2^8) multiplication matches FIPS-197 §4.2', () => {
  assert.equal(mul(0x57, 0x83), 0xc1);
  assert.equal(mul(0x57, 0x13), 0xfe);
  assert.equal(mul(0x57, 0x02), 0xae); // xtime
  assert.equal(mul(0, 0x83), 0);
  assert.equal(mul(1, 0x83), 0x83);
  for (let a = 1; a < 256; a++) assert.equal(mul(div(1, a), a), 1);
  assert.throws(() => div(1, 0), /Duplicate share x-coordinates/);
});

test('hand-computed shares recover the secret', () => {
  // f(x) = 0x42 + 7x: f(1) = 0x45, f(2) = 0x42 ^ 0x0e = 0x4c. Secret "B".
  assert.deepEqual(recover('4501\n4c02'), { count: 2, secret: Uint8Array.of(0x42), text: 'B' });
  // f(x) = 0x41 + x + x²: f(1) = 0x41, f(2) = 0x47, f(3) = 0x41 ^ 3 ^ 5 = 0x47. Secret "A".
  assert.equal(recover('4101\n4702\n0x47 03').text, 'A');
  // Below the threshold the result is just wrong, not an error.
  assert.notEqual(hexOf(recover('4101\n4702').secret), '41');
});

test('split then combine round-trips for every K-subset', () => {
  const secret = enc('my secret recovery phrase');
  const shares = split(secret, 5, 3);
  assert.equal(shares.length, 5);
  assert.ok(shares.every(s => s.length === secret.length + 1 && s.at(-1) !== 0));
  assert.equal(new Set(shares.map(s => s.at(-1))).size, 5);
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) for (let c = b + 1; c < 5; c++)
    assert.deepEqual(combine([shares[a], shares[b], shares[c]]), secret);
  assert.deepEqual(combine(shares), secret); // more than K also works
});

test('Example: "hello", 3 shares, threshold 2', () => {
  const { n, k, shares } = splitSecret('hello', 'utf8', 3, 2);
  assert.equal(n, 3); assert.equal(k, 2);
  assert.ok(shares.every(s => /^[0-9a-f]{12}$/.test(s)));
  const r = recover([shares[0], shares[2]].join('\n'));
  assert.equal(r.text, 'hello');
  assert.equal(r.count, 2);
});

test('binary secrets are shown as hex only', () => {
  const { shares } = splitSecret('00ff10', 'hex', 2, 2);
  const r = recover(shares.join('\n'));
  assert.equal(hexOf(r.secret), '00ff10');
  assert.equal(r.text, null);
});

test('split input errors', () => {
  assert.throws(() => splitSecret('', 'utf8', 3, 2), /The secret is empty\./);
  assert.throws(() => splitSecret('zz', 'hex', 3, 2), /Secret is not valid hex\./);
  assert.throws(() => splitSecret('x', 'utf8', 1, 2), /Shares must be 2–255\./);
  assert.throws(() => splitSecret('x', 'utf8', 3, 256), /Threshold must be 2–255\./);
  assert.throws(() => splitSecret('x', 'utf8', 3, 4), /threshold cannot be larger/);
});

test('combine input errors', () => {
  assert.throws(() => parseShares('4501'), /Paste at least two shares/);
  assert.throws(() => parseShares('4501\nxyz'), /Share 2 is not hex\./);
  assert.throws(() => recover('4501\n4c0203'), /same length/);
  assert.throws(() => recover('01\n02'), /Shares are too short/);
  assert.throws(() => recover('4501\n4501'), /same x-coordinate/);
  assert.throws(() => recover('4500\n4c02'), /x = 0/);
});
