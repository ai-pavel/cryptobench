import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBytes, parseStrict, encodeDer, fromDer, fromRs, verdict, curveParams, EXAMPLE } from '../../src/crypto/der-signature/der-signature.js';

const hexOf = b => Buffer.from(b).toString('hex');
const row = (res, label) => res.rows.find(r => r[0] === label);
// secp256k1 group order (SEC 2).
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

test('curve orders', () => {
  assert.equal(curveParams('secp256k1').n, N);
  assert.equal(curveParams('P-256').n, 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n);
  assert.equal(curveParams('P-384').len, 48);
});

test('the Example: a Bitcoin DER signature with SIGHASH_ALL', () => {
  const res = fromDer(EXAMPLE.der, true, 'secp256k1');
  assert.equal(row(res, 'r')[1], EXAMPLE.r);
  assert.deepEqual(row(res, 's'), ['s', EXAMPLE.s, 'low-S']);
  assert.equal(row(res, 'r‖s (hex)')[1], EXAMPLE.r + EXAMPLE.s);
  assert.deepEqual(row(res, 'DER (hex)'), ['DER (hex)', EXAMPLE.der, 'with sighash byte']);
  assert.equal(row(res, 'DER (base64)')[1], Buffer.from(EXAMPLE.der.slice(0, -2), 'hex').toString('base64'));
  assert.deepEqual(row(res, 'Sighash'), ['Sighash', '0x01 SIGHASH_ALL']);
  assert.deepEqual(res.issues, []);
  assert.deepEqual(verdict(res), { cls: 'big-result ok', text: '✅ Valid strict DER with low-S.' });
  // Without the sighash option the trailing byte is an error.
  assert.throws(() => fromDer(EXAMPLE.der, false, 'secp256k1'), /Sequence length byte says 69, but 70 bytes follow/);
});

test('r, s → DER round-trips the Example', () => {
  const res = fromRs({ rs: '', r: EXAMPLE.r, s: EXAMPLE.s, appendHash: '01' }, 'secp256k1');
  assert.equal(row(res, 'DER (hex)')[1], EXAMPLE.der);
  const viaRs = fromRs({ rs: EXAMPLE.r + EXAMPLE.s, r: '', s: '', appendHash: '' }, 'secp256k1');
  assert.deepEqual(row(viaRs, 'DER (hex)'), ['DER (hex)', EXAMPLE.der.slice(0, -2), '71 bytes']);
  assert.equal(fromRs({ rs: '', r: EXAMPLE.r, s: '', appendHash: '' }, 'secp256k1'), null);
  assert.throws(() => fromRs({ rs: 'abcd', r: '', s: '', appendHash: '' }, 'secp256k1'), /r‖s must be 64 bytes for secp256k1; got 2/);
});

test('minimal integer encoding', () => {
  assert.equal(hexOf(encodeDer(1n, 0x80n)), '300702010102020080');
  assert.equal(hexOf(encodeDer(0n, 0x7fn)), '300602010002017f');
  assert.deepEqual(parseStrict(encodeDer(0x1234n, 0xffn)), { r: 0x1234n, s: 0xffn, issues: [] });
});

test('high-S is flagged and normalized to n − s', () => {
  const sHigh = N - BigInt('0x' + EXAMPLE.s);
  const res = fromRs({ rs: '', r: EXAMPLE.r, s: sHigh.toString(16), appendHash: '01' }, 'secp256k1');
  assert.equal(res.high, true);
  assert.equal(row(res, 's')[2], 'high-S');
  assert.deepEqual(row(res, 'Low-S DER'), ['Low-S DER', EXAMPLE.der, 'Normalized: s replaced with n − s']);
  assert.deepEqual(verdict(res), { cls: 'big-result', text: '⚠️ Valid strict DER, but s is high (not accepted by Bitcoin relay rules).' });
});

test('BIP66 non-strict encodings are reported as issues', () => {
  // r = 0x80 without its 0x00 prefix (negative).
  assert.deepEqual(parseStrict(readBytes('3006020180020101')).issues, ['r is negative (high bit set without a 0x00 prefix).']);
  // s = 0x0001 with an unnecessary leading zero.
  assert.deepEqual(parseStrict(readBytes('300702010102020001')).issues, ['s has an unnecessary leading zero byte.']);
  const res = fromDer('300702010102020001', false, 'secp256k1');
  assert.equal(verdict(res).text, '❌ Not strict DER / not a valid signature encoding.');
});

test('range checks', () => {
  const res = fromRs({ rs: '', r: '00', s: N.toString(16), appendHash: '' }, 'secp256k1');
  assert.deepEqual(res.issues, ['r is out of range (must be 1 … n−1).', 's is out of range (must be 1 … n−1).']);
});

test('structural errors throw', () => {
  assert.throws(() => readBytes('  '), /Paste a signature/);
  assert.throws(() => readBytes('not base64!'), /Not hex or base64/);
  assert.throws(() => parseStrict(readBytes('300602')), /Too short for a DER signature \(3 bytes\)/);
  assert.throws(() => parseStrict(readBytes('3106020101020101')), /Must start with 0x30 \(SEQUENCE\); found 0x31/);
  assert.throws(() => parseStrict(readBytes('3006030101020101')), /Expected INTEGER \(0x02\) for r at byte 2/);
  assert.throws(() => parseStrict(readBytes('3006020001020101')), /r has zero length/);
  assert.throws(() => parseStrict(readBytes('3006020101020201')), /s length 2 runs past the end/);
  // base64 input works too.
  assert.deepEqual(parseStrict(readBytes(Buffer.from('3006020101020102', 'hex').toString('base64'))).s, 2n);
});

test('non-standard sighash byte', () => {
  const res = fromDer('300602010102010205', true, 'secp256k1');
  assert.deepEqual(row(res, 'Sighash'), ['Sighash', '0x05 (non-standard)']);
});
