import { test } from 'node:test';
import assert from 'node:assert/strict';
import { big, mod, powmod, egcd, isProbablePrime, sqrtmod, calculate, stepsHtml } from '../../src/crypto/modular-arithmetic/modular-arithmetic.js';

const SECP_P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const SECP_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const ED_P = 2n ** 255n - 19n;
const ED_L = 2n ** 252n + 27742317777372353535851937790883648493n;
const P256_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const value = (rows, label) => rows.find(r => r[0] === label)?.[1];

test('integer parsing', () => {
  assert.equal(big(' 1_000,000 ', 'a'), 1000000n);
  assert.equal(big('0xff', 'a'), 255n);
  assert.equal(big('-0x10', 'a'), -16n);
  assert.throws(() => big('  ', 'a'), /^Error: a is empty\.$/);
  assert.throws(() => big('1.5', 'b'), /b must be a decimal or 0x-hex integer\./);
  assert.throws(() => big('0xg', 'n'), /n must be a decimal or 0x-hex integer\./);
});

test('mod is always non-negative', () => {
  assert.equal(mod(-7n, 3n), 2n);
  assert.equal(mod(7n, 3n), 1n);
  assert.deepEqual(calculate('mod', '-7', '', '3').rows, [['a mod n (decimal)', '2', 'always in 0 … n−1'], ['a mod n (hex)', '0x2']]);
});

test('extended Euclid: the textbook gcd(240, 46) example', () => {
  const steps = [];
  assert.deepEqual(egcd(240n, 46n, steps), { g: 2n, x: -9n, y: 47n });
  assert.equal(steps.length, 5);
  const { rows } = calculate('gcd', '240', '', '46');
  assert.equal(value(rows, 'gcd(a, n) (decimal)'), '2');
  assert.equal(value(rows, 'lcm(a, n) (decimal)'), '5520');
  assert.equal(value(rows, 'Bézout'), '-9 · a + 47 · n = 2');
  assert.equal(value(calculate('gcd', '-12', '', '18').rows, 'gcd(a, n) (decimal)'), '6');
});

test('modular inverse', () => {
  const r = calculate('inv', '3', '', '11');
  assert.equal(value(r.rows, 'a⁻¹ mod n (decimal)'), '4');
  assert.equal(value(r.rows, 'Check'), 'a · a⁻¹ mod n = 1');
  assert.match(stepsHtml(r.steps), /^<p class="section-title">Extended Euclid<\/p>/);
  assert.equal(value(calculate('inv', '-3', '', '11').rows, 'a⁻¹ mod n (decimal)'), '7');
  assert.throws(() => calculate('inv', '6', '', '9'), /No inverse: gcd\(a, n\) = 3, not 1\./);
});

test('Example: inverse of 3 modulo the secp256k1 order', () => {
  // n ≡ 1 (mod 3), so 3⁻¹ = (2n + 1) / 3.
  const { rows } = calculate('inv', '3', '', '0x' + SECP_N.toString(16));
  assert.equal(value(rows, 'a⁻¹ mod n (hex)'), '0x' + ((2n * SECP_N + 1n) / 3n).toString(16));
  assert.equal(value(rows, 'Check'), 'a · a⁻¹ mod n = 1');
});

test('modular power, including Fermat and negative exponents', () => {
  assert.equal(value(calculate('pow', '3', '5', '11').rows, 'aᵇ mod n (decimal)'), '1');
  assert.equal(value(calculate('pow', '4', '13', '497').rows, 'aᵇ mod n (decimal)'), '445'); // the classic Wikipedia example
  assert.equal(powmod(2n, SECP_P - 1n, SECP_P), 1n);
  assert.equal(value(calculate('pow', '3', '-1', '11').rows, 'aᵇ mod n (decimal)'), '4');
  assert.equal(value(calculate('pow', '3', '-2', '11').rows, 'aᵇ mod n (decimal)'), '5'); // 4² = 16 ≡ 5
  assert.equal(value(calculate('pow', '5', '0', '7').rows, 'aᵇ mod n (decimal)'), '1');
  assert.throws(() => calculate('pow', '2', '-1', '4'), /Negative exponent needs an inverse/);
});

test('Miller–Rabin on the curve constants and known composites', () => {
  for (const p of [2n, 3n, 37n, 41n, SECP_P, SECP_N, ED_P, ED_L, P256_P, P256_N, 2n ** 127n - 1n]) assert.ok(isProbablePrime(p), p.toString(16));
  for (const c of [0n, 1n, 4n, 561n, 1105n, 3215031751n, 2n ** 128n + 1n, SECP_P * 3n]) assert.ok(!isProbablePrime(c), c.toString());
});

test('square roots: secp256k1 generator and Ed25519 √−1', () => {
  // y² = x³ + 7 at the secp256k1 base point.
  const gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
  const gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;
  const r = calculate('sqrt', (mod(gx ** 3n + 7n, SECP_P)).toString(), '', SECP_P.toString());
  const roots = [value(r.rows, '√a mod p (hex)'), value(r.rows, 'other root (hex)')];
  assert.deepEqual(roots.sort(), ['0x' + gy.toString(16), '0x' + (SECP_P - gy).toString(16)].sort());
  // p ≡ 5 (mod 8) takes the Tonelli–Shanks path; √−1 is Ed25519's well-known SQRT_M1.
  const m1 = sqrtmod(-1n, ED_P);
  assert.ok([m1, ED_P - m1].includes(0x2b8324804fc1df0b2b4d00993dfbd7a72f431806ad2fe478c4ee1b274a0ea0b0n));
  const small = calculate('sqrt', '10', '', '13').rows; // 6² = 36 ≡ 10, 7² = 49 ≡ 10
  assert.equal(value(small, '√a mod p (decimal)'), '6');
  assert.equal(value(small, 'other root (decimal)'), '7');
  assert.equal(sqrtmod(0n, 13n), 0n);
  assert.equal(sqrtmod(1n, 2n), 1n);
  assert.equal(sqrtmod(2n, 41n) ** 2n % 41n, 2n); // 41 ≡ 1 (mod 8)
});

test('square root errors and modulus checks', () => {
  assert.throws(() => calculate('sqrt', '5', '', '13'), /quadratic non-residue/);
  assert.throws(() => calculate('sqrt', '4', '', '15'), /p is not prime/);
  assert.throws(() => calculate('sqrt', '4', '', ''), /^Error: p is empty\.$/);
  assert.throws(() => calculate('mod', '4', '', '0'), /The modulus must be positive\./);
  assert.throws(() => calculate('mod', '4', '', '-5'), /The modulus must be positive\./);
});
