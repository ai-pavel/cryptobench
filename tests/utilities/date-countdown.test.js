import { test } from 'node:test';
import assert from 'node:assert/strict';
import { span, countdownLabel, esc } from '../../src/utilities/date-countdown/date-countdown.js';

const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

test('span splits a duration into days, hours, minutes and seconds', () => {
  assert.equal(span(0), '0d 00h 00m 00s');
  assert.equal(span(999), '0d 00h 00m 00s');
  assert.equal(span(D + 2 * H + 3 * M + 4 * S), '1d 02h 03m 04s');
  assert.equal(span(400 * D + 23 * H + 59 * M + 59 * S), '400d 23h 59m 59s');
});

test('span ignores the sign', () => {
  assert.equal(span(-(D + 5 * S)), '1d 00h 00m 05s');
});

test('countdownLabel counts down, then up with "ago"', () => {
  const now = Date.UTC(2025, 0, 1);
  assert.equal(countdownLabel(now + 90 * M, now), '0d 01h 30m 00s');
  assert.equal(countdownLabel(now, now), '0d 00h 00m 00s');
  assert.equal(countdownLabel(now - 3 * D, now), '3d 00h 00m 00s ago');
  // New Year 2026 seen from 2025-01-01: 365 days.
  assert.equal(countdownLabel(Date.UTC(2026, 0, 1), now), '365d 00h 00m 00s');
});

test('esc escapes names', () => {
  assert.equal(esc('<Tom & "Jerry\'s">'), '&lt;Tom &amp; &quot;Jerry&#39;s&quot;&gt;');
});
