import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retarget, TARGET_SPAN, EXAMPLE } from '../../src/bitcoin/target-adjustment/target-adjustment.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;
const row = (rows, label) => rows.find(r => r.label === label);
const span = s => retarget('timespan', { bits: '0x1d00ffff', span: String(s) });

test('the target timespan is two weeks', () => {
  assert.equal(TARGET_SPAN, 1209600n);
});

test('exactly two weeks keeps the bits', () => {
  const r = span(1209600);
  assert.equal(value(r.rows, 'New bits'), '0x1d00ffff');
  assert.equal(value(r.rows, 'Difficulty'), '1 → 1');
  assert.equal(row(r.rows, 'Difficulty').note, '+0.00%');
  assert.equal(row(r.rows, 'Actual timespan').note, 'Expected 1209600 s (2 weeks)');
  assert.equal(row(r.rows, 'New target').note, '');
});

test('half the time doubles the difficulty', () => {
  const r = span(604800);
  assert.equal(value(r.rows, 'New bits'), '0x1c7fff80');
  assert.equal(value(r.rows, 'Difficulty'), '1 → 2');
  assert.equal(row(r.rows, 'Difficulty').note, '+100.00%');
  assert.equal(value(r.rows, 'Actual timespan'), '604800 s (7 d)');
});

test('the timespan is clamped to a quarter', () => {
  const r = span(0);
  assert.equal(value(r.rows, 'New bits'), '0x1c3fffc0');
  assert.equal(value(r.rows, 'Difficulty'), '1 → 4');
  assert.equal(row(r.rows, 'Actual timespan').note, 'Clamped to 302400 s (the 4× limit)');
});

test('easier than the proof-of-work limit is capped', () => {
  const r = span(1209600 * 10);
  assert.equal(value(r.rows, 'New bits'), '0x1d00ffff');
  assert.equal(row(r.rows, 'Actual timespan').note, 'Clamped to 4838400 s (the 4× limit)');
  assert.match(value(r.rows, 'Note'), /capped at the minimum difficulty/);
  // From a harder target, 4× is the most the target can grow.
  const h = retarget('timespan', { bits: '0x1c3fffc0', span: '9999999' });
  assert.equal(value(h.rows, 'New bits'), '0x1d00ffff');
  assert.equal(value(h.rows, 'Difficulty'), '4 → 1');
  assert.equal(row(h.rows, 'Difficulty').note, '-75.00%');
});

test('timestamps mode measures last minus first', () => {
  const ts = retarget('timestamps', { bits: EXAMPLE.bits, first: String(EXAMPLE.first), last: String(EXAMPLE.last) });
  const sp = retarget('timespan', { bits: EXAMPLE.bits, span: String(EXAMPLE.span) });
  assert.equal(EXAMPLE.last - EXAMPLE.first, EXAMPLE.span);
  assert.deepEqual(ts.rows, sp.rows);
  assert.equal(value(ts.rows, 'Actual timespan'), '1097484 s (12 d 16 h 51 min)');
  // Last before first: a negative span is shown as is and clamped.
  const neg = retarget('timestamps', { bits: '0x1d00ffff', first: '100', last: '50' });
  assert.equal(value(neg.rows, 'Actual timespan'), '-50 s (0 s)');
  assert.equal(value(neg.rows, 'New bits'), '0x1c3fffc0');
});

test('bad input throws', () => {
  assert.throws(() => retarget('timespan', { bits: 'zz', span: '1' }), /Bits must be hex/);
  assert.throws(() => retarget('timespan', { bits: '0x1d00ffff', span: 'two weeks' }));
  assert.throws(() => retarget('timestamps', { bits: '0x1d00ffff', first: '', last: '5' }));
});
