import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, fmtDiv, isoWeek, toMillis, detectedText, timestampRows, NS } from '../../src/dev/timestamp/timestamp.js';
import { InputError } from '../../src/dev/lib/ui.js';

const values = rows => Object.fromEntries(rows.map(r => [r.label, r.value]));

test('units are detected from the number of digits', () => {
  assert.deepEqual(parse('1700000000', 'auto'), { ns: 1700000000000000000n, unit: 's' });
  assert.deepEqual(parse('1700000000123', 'auto'), { ns: 1700000000123000000n, unit: 'ms' });
  assert.deepEqual(parse('1700000000123456', 'auto'), { ns: 1700000000123456000n, unit: 'us' });
  assert.deepEqual(parse('1700000000123456789', 'auto'), { ns: 1700000000123456789n, unit: 'ns' });
  assert.deepEqual(parse('1700000000', 'ms'), { ns: 1700000000000000n, unit: 'ms' });
});

test('fractions, separators and negative numbers are exact', () => {
  assert.equal(parse('1700000000.5', 'auto').ns, 1700000000500000000n);
  assert.equal(parse('1_700_000_000', 'auto').ns, 1700000000000000000n);
  assert.equal(parse('-1.5', 's').ns, -1500000000n);
  assert.equal(parse('0', 'auto').unit, 's');
});

test('dates are parsed', () => {
  assert.deepEqual(parse('2024-05-01T12:00:00Z', 'auto'), { ns: 1714564800000000000n, unit: 'date' });
});

test('bad input throws', () => {
  assert.throws(() => parse('  ', 'auto'), /Enter a timestamp/);
  assert.throws(() => parse('not a date', 'auto'), InputError);
  assert.throws(() => toMillis(10n ** 30n), /outside the range/);
  assert.throws(() => timestampRows(-(10n ** 30n), 'UTC'), InputError);
});

test('fmtDiv keeps every digit', () => {
  assert.equal(fmtDiv(1700000000123000000n, NS.s), '1700000000.123');
  assert.equal(fmtDiv(1700000000000000000n, NS.s), '1700000000');
  assert.equal(fmtDiv(-1500000000n, NS.s), '-1.5');
  assert.equal(fmtDiv(1n, NS.ms), '0.000001');
});

test('toMillis rounds toward -infinity', () => {
  assert.equal(toMillis(1500000n), 1);
  assert.equal(toMillis(-1500000n), -2);
});

test('ISO week numbers (ISO 8601 edge cases)', () => {
  assert.deepEqual(isoWeek(2021, 1, 3), { year: 2020, week: 53 });
  assert.deepEqual(isoWeek(2021, 1, 4), { year: 2021, week: 1 });
  assert.deepEqual(isoWeek(2008, 12, 29), { year: 2009, week: 1 });
  assert.deepEqual(isoWeek(2023, 11, 14), { year: 2023, week: 46 });
});

test('detected note', () => {
  assert.equal(detectedText('date', true), 'Read as a date.');
  assert.equal(detectedText('s', true), 'Read as seconds (detected from the number of digits).');
  assert.equal(detectedText('ms', false), 'Read as milliseconds.');
});

test('rows for 1700000000 in UTC and another zone', () => {
  const now = Date.UTC(2023, 10, 14, 23, 13, 20);
  const v = values(timestampRows(1700000000000000000n, 'UTC', now));
  assert.equal(v['Unix seconds'], '1700000000');
  assert.equal(v.Milliseconds, '1700000000000');
  assert.equal(v.Microseconds, '1700000000000000');
  assert.equal(v.Nanoseconds, '1700000000000000000');
  assert.equal(v['ISO 8601 (UTC)'], '2023-11-14T22:13:20.000Z');
  assert.equal(v['RFC 2822 / HTTP date'], 'Tue, 14 Nov 2023 22:13:20 GMT');
  assert.equal(v.UTC, '2023-11-14 22:13:20 +00:00');
  assert.match(v.Readable, /^Tuesday, November 14, 2023 at 10:13:20 PM/);
  assert.equal(v.Relative, '1 hour ago');
  assert.equal(v['Day of year / ISO week'], 'Day 318 · Week 46 of 2023');
  const tokyo = values(timestampRows(1700000000123000000n, 'Asia/Tokyo', now));
  assert.equal(tokyo['Asia/Tokyo'], '2023-11-15 07:13:20.123 +09:00');
  assert.equal(tokyo['Day of year / ISO week'], 'Day 319 · Week 46 of 2023');
});
