import { test } from 'node:test';
import assert from 'node:assert/strict';
import { city, offsetMinutes, diffLabel, findZone, validZone, allZones, RENAMED, DEFAULTS } from '../../src/utilities/world-time/world-time.js';

const winter = new Date(Date.UTC(2025, 0, 15, 12));
const summer = new Date(Date.UTC(2025, 6, 15, 12));

test('city is the last part of the zone name, with spaces', () => {
  assert.equal(city('America/New_York'), 'New York');
  assert.equal(city('America/Argentina/Buenos_Aires'), 'Buenos Aires');
  assert.equal(city('UTC'), 'UTC');
});

test('offsetMinutes matches known UTC offsets, including DST', () => {
  assert.equal(offsetMinutes('UTC', winter), 0);
  assert.equal(offsetMinutes('America/New_York', winter), -300);
  assert.equal(offsetMinutes('America/New_York', summer), -240);
  assert.equal(offsetMinutes('Europe/London', summer), 60);
  assert.equal(offsetMinutes('Asia/Tokyo', winter), 540);
  assert.equal(offsetMinutes('Asia/Kolkata', winter), 330);
  assert.equal(offsetMinutes('Asia/Kathmandu', winter), 345);
  assert.equal(offsetMinutes('Pacific/Chatham', winter), 825); // +13:45 in southern summer
});

test('diffLabel compares with the local zone', () => {
  assert.equal(diffLabel('UTC', winter, 'UTC'), 'Same as local');
  assert.equal(diffLabel('Asia/Tokyo', winter, 'UTC'), '+9h from local');
  assert.equal(diffLabel('America/New_York', winter, 'UTC'), '−5h from local');
  assert.equal(diffLabel('Asia/Kolkata', winter, 'Europe/London'), '+5h 30m from local');
  assert.equal(diffLabel('America/St_Johns', winter, 'UTC'), '−3h 30m from local');
  assert.equal(diffLabel('Europe/London', summer, 'Europe/Lisbon'), 'Same as local');
});

test('validZone accepts IANA names only', () => {
  assert.equal(validZone('Europe/Kyiv'), true);
  assert.equal(validZone('Mars/Olympus_Mons'), false);
});

test('the zone list uses current names and includes the defaults', () => {
  for (const old of Object.keys(RENAMED)) assert.ok(!allZones.includes(old) || !validZone(RENAMED[old]), old);
  for (const z of DEFAULTS) assert.ok(allZones.includes(z), z);
});

test('findZone matches zone names, city names and other valid zones', () => {
  const zones = ['America/New_York', 'Europe/London', 'Asia/Tokyo'];
  assert.equal(findZone('europe/london', zones), 'Europe/London');
  assert.equal(findZone('  new york ', zones), 'America/New_York');
  assert.equal(findZone('TOKYO', zones), 'Asia/Tokyo');
  assert.equal(findZone('Asia/Kolkata', zones), 'Asia/Kolkata'); // not listed, but valid
  assert.equal(findZone('America/Los Angeles', zones), 'America/Los_Angeles');
  assert.equal(findZone('Atlantis', zones), null);
  assert.equal(findZone('Mars/Base', zones), null);
  assert.equal(findZone('', zones), null);
});
