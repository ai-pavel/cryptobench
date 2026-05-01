import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, durations, fmt } from '../../src/utilities/break-time/break-time.js';

test('presets: 20-20-20 rule, Pomodoro 25/5, deep work 50/10', () => {
  assert.deepEqual([durations('eyes').work, durations('eyes').rest], [1200, 20]);
  assert.deepEqual([durations('pomodoro').work, durations('pomodoro').rest], [1500, 300]);
  assert.deepEqual([durations('deep').work, durations('deep').rest], [3000, 600]);
  for (const p of Object.keys(PRESETS)) assert.ok(PRESETS[p].hint, p);
});

test('custom durations come from the minutes fields, at least 1 minute', () => {
  assert.deepEqual(durations('custom', '45', '5'), { work: 2700, rest: 300 });
  assert.deepEqual(durations('custom', '', 'x'), { work: 60, rest: 60 });
  assert.deepEqual(durations('custom', '0', '-3'), { work: 60, rest: 60 });
  assert.deepEqual(durations('custom', '0.5', '1.5'), { work: 60, rest: 90 });
});

test('fmt rounds up, clamps at zero and adds hours when needed', () => {
  assert.equal(fmt(1200000), '20:00');
  assert.equal(fmt(20000), '00:20');
  assert.equal(fmt(1), '00:01');
  assert.equal(fmt(0), '00:00');
  assert.equal(fmt(-5000), '00:00');
  assert.equal(fmt(4 * 3600000), '4:00:00');
});
