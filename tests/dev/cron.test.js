import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explain } from '../../src/dev/cron/cron.js';
import { InputError } from '../../src/dev/lib/ui.js';

test('example: every 15 minutes during working hours on weekdays', () => {
  const now = Date.UTC(2024, 0, 6); // Saturday 2024-01-06 00:00 UTC
  const r = explain('*/15 9-17 * * MON-FRI', 'UTC', now);
  assert.match(r.description, /every 15 minutes/i);
  assert.deepEqual(r.fields, [
    { text: '*/15', name: 'Minute' }, { text: '9-17', name: 'Hour' }, { text: '*', name: 'Day of month' },
    { text: '*', name: 'Month' }, { text: 'MON-FRI', name: 'Day of week' },
  ]);
  assert.equal(r.runs.length, 10);
  assert.deepEqual(r.runs[0], { time: '2024-01-08 09:00:00 +00:00', weekday: 'Mon', relative: 'in 2 days' });
  assert.equal(r.runs[1].time, '2024-01-08 09:15:00 +00:00');
  assert.equal(r.runs[9].time, '2024-01-08 11:15:00 +00:00');
});

test('six fields include seconds', () => {
  const r = explain('*/30 * * * * *', 'UTC', Date.UTC(2024, 0, 1));
  assert.deepEqual(r.fields.map(f => f.name), ['Second', 'Minute', 'Hour', 'Day of month', 'Month', 'Day of week']);
  assert.equal(r.runs[0].time, '2024-01-01 00:00:30 +00:00');
});

test('macros and time zones', () => {
  const r = explain('@daily', 'Asia/Tokyo', Date.UTC(2024, 0, 1, 12));
  assert.equal(r.runs[0].time, '2024-01-02 00:00:00 +09:00');
});

test('a time skipped by a DST change is not run', () => {
  // 2024-03-10 02:30 doesn't exist in New York (clocks jump from 02:00 to 03:00).
  const r = explain('30 2 * * *', 'America/New_York', Date.UTC(2024, 2, 9, 12));
  assert.equal(r.runs[0].time, '2024-03-11 02:30:00 -04:00');
});

test('an impossible date has no runs', () => {
  assert.deepEqual(explain('0 0 30 2 *', 'UTC', Date.UTC(2024, 0, 1)).runs, []);
});

test('invalid expressions throw', () => {
  assert.throws(() => explain('', 'UTC'), InputError);
  assert.throws(() => explain('* * *', 'UTC'), /Expected 5 fields/);
  assert.throws(() => explain('@reboot', 'UTC'), /no schedule/);
  assert.throws(() => explain('@sometimes', 'UTC'), /Unknown macro/);
  assert.throws(() => explain('61 * * * *', 'UTC'), InputError);
});
