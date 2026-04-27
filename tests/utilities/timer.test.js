import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, toMs, splitSeconds } from '../../src/utilities/timer/timer.js';

test('fmt shows MM:SS under an hour and H:MM:SS above', () => {
  assert.equal(fmt(300000), '05:00'); // the default 5 minutes
  assert.equal(fmt(0), '00:00');
  assert.equal(fmt(59000), '00:59');
  assert.equal(fmt(3599000), '59:59');
  assert.equal(fmt(3600000), '1:00:00');
  assert.equal(fmt(99 * 3600000 + 59 * 60000 + 59000), '99:59:59');
});

test('fmt rounds partial seconds up while counting down', () => {
  assert.equal(fmt(1), '00:01');
  assert.equal(fmt(999), '00:01');
  assert.equal(fmt(1001), '00:02');
  assert.equal(fmt(59999), '01:00');
});

test('toMs adds up the fields and treats blanks as 0', () => {
  assert.equal(toMs('0', '5', '0'), 300000);
  assert.equal(toMs('1', '30', '15'), (3600 + 1800 + 15) * 1000);
  assert.equal(toMs('', '', ''), 0);
  assert.equal(toMs('abc', '1', ''), 60000);
});

test('splitSeconds fills the fields for each preset', () => {
  assert.deepEqual(splitSeconds(60), { h: 0, m: 1, s: 0 });
  assert.deepEqual(splitSeconds(1500), { h: 0, m: 25, s: 0 });
  assert.deepEqual(splitSeconds(3600), { h: 1, m: 0, s: 0 });
  assert.deepEqual(splitSeconds(3725), { h: 1, m: 2, s: 5 });
  for (const t of [60, 300, 600, 1500, 3600]) {
    const { h, m, s } = splitSeconds(t);
    assert.equal(toMs(h, m, s), t * 1000);
  }
});
