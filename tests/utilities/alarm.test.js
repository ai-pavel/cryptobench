import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextAt, untilLabel, alarmDetails, notificationBody, newAlarm, catchUp, esc, MISSED_GRACE } from '../../src/utilities/alarm/alarm.js';

// Local-time timestamps, so the tests hold in any time zone.
const at = (h, m, s = 0, day = 15) => new Date(2025, 0, day, h, m, s).getTime();

test('nextAt picks today when the time is still ahead', () => {
  assert.equal(nextAt('07:30', at(6, 0)), at(7, 30));
});

test('nextAt rolls to tomorrow when the time has passed or is now', () => {
  assert.equal(nextAt('07:30', at(8, 0)), at(7, 30, 0, 16));
  assert.equal(nextAt('07:30', at(7, 30)), at(7, 30, 0, 16)); // strictly after
  assert.equal(nextAt('07:30', at(7, 29, 59)), at(7, 30));
});

test('nextAt handles midnight and month ends', () => {
  assert.equal(nextAt('00:00', at(23, 59)), at(0, 0, 0, 16));
  assert.equal(nextAt('06:00', new Date(2025, 0, 31, 12).getTime()), new Date(2025, 1, 1, 6).getTime());
});

test('untilLabel rounds up to whole minutes', () => {
  assert.equal(untilLabel(0), 'in 0m');
  assert.equal(untilLabel(1), 'in 1m');
  assert.equal(untilLabel(60000), 'in 1m');
  assert.equal(untilLabel(60001), 'in 2m');
  assert.equal(untilLabel(59 * 60000), 'in 59m');
  assert.equal(untilLabel(60 * 60000), 'in 1h 0m');
  assert.equal(untilLabel((25 * 60 + 5) * 60000), 'in 25h 5m');
  assert.equal(untilLabel(-5000), 'in 0m');
});

test('alarmDetails describes label, repeat and time left', () => {
  const now = at(6, 0);
  assert.equal(alarmDetails({ label: 'Stand-up', daily: true, enabled: true, next: at(7, 30) }, now), 'Stand-up · Daily · in 1h 30m');
  assert.equal(alarmDetails({ label: '', daily: false, enabled: true, snoozed: true, next: at(6, 5) }, now), 'Once · snoozed, in 5m');
  assert.equal(alarmDetails({ label: '', daily: false, enabled: false, next: at(6, 5) }, now), 'Once');
  assert.equal(alarmDetails({ label: '<b>', daily: false, enabled: false }, now), '&lt;b&gt; · Once');
});

test('esc escapes HTML special characters', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('notificationBody', () => {
  assert.equal(notificationBody({ time: '07:30', label: 'Gym' }), '07:30 · Gym');
  assert.equal(notificationBody({ time: '07:30', label: '' }), '07:30');
});

test('newAlarm validates the time and schedules the next occurrence', () => {
  const now = at(6, 0);
  const a = newAlarm('07:30', '  Stand-up ', true, now);
  assert.equal(a.time, '07:30');
  assert.equal(a.label, 'Stand-up');
  assert.equal(a.daily, true);
  assert.equal(a.enabled, true);
  assert.equal(a.next, at(7, 30));
  assert.match(a.id, /^[0-9a-z]+$/);
  assert.equal(newAlarm('7:30', '', false, now), null);
  assert.equal(newAlarm('', '', false, now), null);
});

test('catchUp keeps recently missed alarms due and fixes older ones', () => {
  const now = at(12, 0);
  const recent = { time: '11:55', daily: false, enabled: true, next: at(11, 55) };
  const oldOnce = { time: '09:00', daily: false, enabled: true, next: at(9, 0) };
  const oldDaily = { time: '09:00', daily: true, enabled: true, next: at(9, 0) };
  const future = { time: '13:00', daily: false, enabled: true, next: at(13, 0) };
  const off = { time: '09:00', daily: false, enabled: false, next: at(9, 0) };
  catchUp([recent, oldOnce, oldDaily, future, off], now);
  assert.equal(recent.enabled, true);
  assert.equal(recent.next, at(11, 55));
  assert.equal(oldOnce.enabled, false);
  assert.equal(oldDaily.enabled, true);
  assert.equal(oldDaily.next, at(9, 0, 0, 16));
  assert.equal(future.next, at(13, 0));
  assert.equal(off.next, at(9, 0));
  // Exactly at the grace boundary counts as too old.
  const edge = { time: '11:50', daily: false, enabled: true, next: now - MISSED_GRACE };
  catchUp([edge], now);
  assert.equal(edge.enabled, false);
});
