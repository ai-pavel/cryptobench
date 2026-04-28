import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, lapRow } from '../../src/utilities/stopwatch/stopwatch.js';

test('fmt shows MM:SS.cc, adding hours only when needed', () => {
  assert.equal(fmt(0), '00:00.00');
  assert.equal(fmt(9), '00:00.00'); // truncates below a centisecond
  assert.equal(fmt(10), '00:00.01');
  assert.equal(fmt(1234), '00:01.23');
  assert.equal(fmt(61999), '01:01.99');
  assert.equal(fmt(3599999), '59:59.99');
  assert.equal(fmt(3600000), '1:00:00.00');
  assert.equal(fmt(36000000 + 61010), '10:01:01.01');
});

test('lapRow gives the split since the previous lap and the total', () => {
  assert.deepEqual(lapRow([], 5000), { n: 1, split: '00:05.00', total: '00:05.00' });
  assert.deepEqual(lapRow([5000], 12340), { n: 2, split: '00:07.34', total: '00:12.34' });
  assert.deepEqual(lapRow([5000, 12340], 72340), { n: 3, split: '01:00.00', total: '01:12.34' });
});
