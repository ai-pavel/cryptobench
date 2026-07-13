import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bitsRows, targetRows, EXAMPLES, DEFAULTS } from '../../src/bitcoin/target-bits/target-bits.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;
const labels = rows => rows.map(r => r.label);

test('empty input gives no result', () => {
  assert.equal(bitsRows(' '), null);
  assert.equal(targetRows(''), null);
});

test('Example: genesis bits are difficulty 1', () => {
  const rows = bitsRows(EXAMPLES.bits);
  assert.equal(value(rows, 'Target'), '00000000ffff' + '0'.repeat(52));
  assert.equal(value(rows, 'Exponent / mantissa'), '0x1d (29 bytes) / 0x00ffff');
  assert.equal(value(rows, 'Difficulty'), '1');
  assert.equal(value(rows, 'Leading zero bits'), '32');
  assert.equal(value(rows, 'Canonical bits'), '0x1d00ffff');
  assert.ok(!labels(rows).includes('Warning'));
});

test('Example: genesis target encodes to 0x1d00ffff exactly', () => {
  for (const t of [EXAMPLES.target, DEFAULTS.target]) {
    const rows = targetRows(t);
    assert.equal(value(rows, 'Bits'), '0x1d00ffff');
    assert.equal(rows[1].note, 'Exactly representable');
    assert.equal(value(rows, 'Difficulty'), '1');
  }
});

test('Bitcoin Core SetCompact/GetCompact vectors (arith_uint256_tests)', () => {
  // [bits, target, canonical bits]
  const vectors = [
    ['0x01003456', 0n, '0x00000000'],
    ['0x01123456', 0x12n, '0x01120000'],
    ['0x02008000', 0x80n, '0x02008000'],
    ['0x05009234', 0x92340000n, '0x05009234'],
    ['0x04123456', 0x12345600n, '0x04123456'],
    ['0x20123456', 0x1234560000000000000000000000000000000000000000000000000000000000n, '0x20123456'],
  ];
  for (const [bits, target, canon] of vectors) {
    const rows = bitsRows(bits);
    assert.equal(value(rows, 'Target'), target.toString(16).padStart(64, '0'), bits);
    assert.equal(value(rows, 'Canonical bits'), canon, bits);
  }
  // Block 100,000 bits, without the 0x prefix.
  assert.equal(value(bitsRows('1b04864c'), 'Target'), '000000000004864c' + '0'.repeat(48));
});

test('negative and overflowing bits warn', () => {
  const neg = bitsRows('0x04923456');
  assert.match(neg.find(r => r.label === 'Warning').value, /sign bit/);
  assert.equal(neg.find(r => r.label === 'Warning').cls, 'bad');
  const over = bitsRows('0xff123456');
  assert.ok(over.some(r => r.label === 'Warning' && /overflows 256 bits/.test(r.value)));
});

test('targets that need rounding are rounded down', () => {
  const rows = targetRows('0x123456789');
  assert.equal(value(rows, 'Bits'), '0x05012345');
  assert.equal(value(rows, 'Target after rounding'), (0x0123450000n).toString(16).padStart(64, '0'));
  assert.match(rows[1].note, /rounded down/);
  // A top byte ≥ 0x80 needs an extra byte so the sign bit stays clear.
  assert.equal(value(targetRows('0x80'), 'Bits'), '0x02008000');
});

test('bad input throws', () => {
  assert.throws(() => bitsRows('0x1d00ffff00'), /4-byte number/);
  assert.throws(() => bitsRows('xyz'), /4-byte number/);
  assert.throws(() => targetRows('1' + '0'.repeat(64)), /fit in 256 bits/);
  assert.throws(() => targetRows('nothex'));
});
