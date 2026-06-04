import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, v4, v7, ulid, generate, inspect } from '../../src/dev/uuid/uuid.js';
import { InputError } from '../../src/dev/lib/ui.js';

const values = rows => Object.fromEntries(rows.map(r => [r.label, r.value]));
const RFC_TIME = '2022-02-22T19:22:22.000Z'; // RFC 9562 appendix A examples all use this time

test('RFC 9562 A.1: UUIDv1', () => {
  const v = values(inspect('C232AB00-9414-11EC-B3C8-9F6BDECED846'));
  assert.equal(v.Canonical, 'c232ab00-9414-11ec-b3c8-9f6bdeced846');
  assert.equal(v.Version, '1 (time-based)');
  assert.equal(v.Variant, 'RFC 9562 (standard)');
  assert.equal(v.Timestamp, RFC_TIME);
  assert.equal(v.Node, '9f:6b:de:ce:d8:46');
});

test('RFC 9562 A.4/A.5: UUIDv6 and UUIDv7', () => {
  const v6 = values(inspect('1EC9414C-232A-6B00-B3C8-9F6BDECED846'));
  assert.equal(v6.Version, '6 (reordered time)');
  assert.equal(v6.Timestamp, RFC_TIME);
  const v7rows = inspect('017F22E2-79B0-7CC3-98C4-DC0C0C07398F');
  assert.equal(values(v7rows).Version, '7 (Unix time-ordered)');
  assert.equal(values(v7rows).Timestamp, RFC_TIME);
  assert.equal(v7rows.find(r => r.label === 'Timestamp').note, '1645557742000 ms since the epoch');
});

test('RFC 9562 A.3: UUIDv4, URN and integer forms', () => {
  const v = values(inspect('urn:uuid:919108f7-52d1-4320-9bac-f847db4148a8'));
  assert.equal(v.Version, '4 (random)');
  assert.equal(v.Timestamp, undefined);
  assert.equal(v.URN, 'urn:uuid:919108f7-52d1-4320-9bac-f847db4148a8');
  assert.equal(v['As integer'], BigInt('0x919108f752d143209bacf847db4148a8').toString());
  assert.equal(values(inspect('{919108F752D143209BACF847DB4148A8}')).Canonical, '919108f7-52d1-4320-9bac-f847db4148a8');
});

test('the example value and nil / max UUIDs', () => {
  const ex = values(inspect('018f3e1c-7b2a-7c3d-9e4f-1a2b3c4d5e6f'));
  assert.equal(ex.Timestamp, new Date(0x018f3e1c7b2a).toISOString());
  const nil = values(inspect('00000000-0000-0000-0000-000000000000'));
  assert.equal(nil.Version, 'Nil UUID');
  assert.equal(nil.Variant, 'NCS (reserved)');
  assert.equal(nil['As integer'], '0');
  const max = values(inspect('ffffffff-ffff-ffff-ffff-ffffffffffff'));
  assert.equal(max.Version, 'Max UUID');
  assert.equal(max.Variant, 'Future (reserved)');
  assert.equal(max['As integer'], (2n ** 128n - 1n).toString());
});

test('ULID: spec example', () => {
  // github.com/ulid/spec: ulid(1469918176385) starts with 01ARYZ6S41.
  const v = values(inspect('01ARYZ6S41TSV4RRFFQ69G5FAV'));
  assert.equal(v.Type, 'ULID');
  assert.equal(v.Timestamp, new Date(1469918176385).toISOString());
  assert.equal(v.Randomness, 'TSV4RRFFQ69G5FAV');
  assert.equal(values(inspect('01aryz6s41tsv4rrffq69g5fav')).Randomness, 'TSV4RRFFQ69G5FAV');
  assert.match(ulid(1469918176385), /^01ARYZ6S41[0-9A-HJKMNP-TV-Z]{16}$/);
});

test('empty and invalid input', () => {
  assert.equal(inspect('  '), null);
  assert.throws(() => inspect('81ARYZ6S41TSV4RRFFQ69G5FAV'), /first character must be 0-7/);
  assert.throws(() => inspect('not-a-uuid'), InputError);
  assert.throws(() => inspect('919108f7-52d1-4320-9bac-f847db4148a'), /32 hex digits/);
});

test('generated v4 and v7 values are well-formed and v7 sorts', () => {
  assert.match(v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const now = Date.UTC(2024, 0, 1);
  const ids = Array.from({ length: 50 }, () => v7(now));
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual([...ids].sort(), ids);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(values(inspect(ids[0])).Timestamp, '2024-01-01T00:00:00.000Z');
  assert.equal(fmt('0123456789abcdef0123456789abcdef'), '01234567-89ab-cdef-0123-456789abcdef');
});

test('generate: count clamping and formatting options', () => {
  assert.equal(generate('5', 'v4').length, 5);
  assert.equal(generate('', 'v4').length, 1);
  assert.equal(generate('0', 'v4').length, 1);
  assert.equal(generate('5000', 'v4').length, 1000);
  assert.match(generate(1, 'v4', { upper: true, nodash: true })[0], /^[0-9A-F]{32}$/);
  assert.match(generate(1, 'ulid', { upper: false, nodash: true })[0], /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
});
