import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, encodeJson, decodeHex, decodedHtml } from '../../src/polkadot/scale-codec/scale-codec.js';
import { toHex } from '../../src/polkadot/lib/dot.js';

const enc = (type, json) => toHex(encodeJson(type, json));
const ALICE = 'd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';

test('compact integers (SCALE spec examples)', () => {
  assert.equal(enc('Compact<u32>', '0'), '0x00');
  assert.equal(enc('Compact<u32>', '1'), '0x04');
  assert.equal(enc('Compact<u32>', '42'), '0xa8');
  assert.equal(enc('Compact<u32>', '63'), '0xfc');
  assert.equal(enc('Compact<u32>', '64'), '0x0101');
  assert.equal(enc('Compact<u32>', '69'), '0x1501');
  assert.equal(enc('Compact<u32>', '16383'), '0xfdff');
  assert.equal(enc('Compact<u32>', '16384'), '0x02000100');
  assert.equal(enc('Compact<u32>', '65535'), '0xfeff0300');
  assert.equal(enc('Compact<u32>', '1073741823'), '0xfeffffff');
  assert.equal(enc('Compact<u32>', '1073741824'), '0x0300000040');
  assert.equal(enc('Compact<u128>', '"1000000000000"'), '0x070010a5d4e8');
});

test('fixed-width, bool, Option, Result, Vec, String (SCALE spec examples)', () => {
  assert.equal(enc('i8', '-1'), '0xff');
  assert.equal(enc('u16', '42'), '0x2a00');
  assert.equal(enc('u32', '16777215'), '0xffffff00');
  assert.equal(enc('bool', 'false'), '0x00');
  assert.equal(enc('Option<bool>', 'null'), '0x00');
  assert.equal(enc('Option<bool>', 'true'), '0x01');
  assert.equal(enc('Option<bool>', 'false'), '0x02');
  assert.equal(enc('Option<u8>', '42'), '0x012a');
  assert.equal(enc('Result<u8, bool>', '{"Ok": 42}'), '0x002a');
  assert.equal(enc('Result<u8, bool>', '{"Err": false}'), '0x0100');
  assert.equal(enc('Vec<u16>', '[4, 8, 15, 16, 23, 42]'), '0x18040008000f00100017002a00');
  assert.equal(enc('String', '"thanks"'), '0x187468616e6b73');
  assert.equal(enc('(u32, bool)', '[3, false]'), '0x0300000000');
});

test('example presets encode to the expected bytes', () => {
  const byName = Object.fromEntries(PRESETS.map(([n, t, v]) => [n, enc(t, v)]));
  // dest = //Alice, value = Compact(12345000000), memo = Some("thanks")
  assert.equal(byName.Transfer, '0x' + ALICE + '0740c0d1df02' + '01' + '187468616e6b73');
  assert.equal(byName.MultiAddress, '0x00' + ALICE);
  assert.equal(byName['Compact<u128>'], '0x070010a5d4e8');
  assert.equal(byName['Vec<(u32, bool)>'], '0x08' + '0100000001' + '7011010000');
  // flags = 2^127 → the top byte of a little-endian u128 is 0x80
  assert.ok(byName.AccountInfo.endsWith('00'.repeat(15) + '80'));
  assert.equal((byName.AccountInfo.length - 2) / 2, 80);
});

test('every preset round-trips through decode', () => {
  for (const [, t, v] of PRESETS) {
    const r = decodeHex(t, enc(t, v));
    assert.equal(r.rest, 0);
    assert.deepEqual(encodeJson(t, JSON.stringify(r.value, (k, x) => typeof x === 'bigint' ? x.toString() : x)), encodeJson(t, v));
  }
});

test('example decode: the Transfer preset', () => {
  const [, t, v] = PRESETS[0];
  const r = decodeHex(t, enc(t, v));
  assert.equal(r.used, 46);
  assert.equal(r.value.dest, '0x' + ALICE);
  assert.equal(String(r.value.value), '12345000000');
  assert.equal(r.value.memo, 'thanks');
  assert.doesNotMatch(decodedHtml(r), /left over/);
});

test('left-over bytes are reported; output is escaped', () => {
  const r = decodeHex('u8', '0x2a00');
  assert.deepEqual([r.used, r.rest], [1, 1]);
  assert.match(decodedHtml(r), /^<p class="error">Decoded 1 bytes; 1 bytes are left over — the type may be wrong\.<\/p><pre class="json">42<\/pre>$/);
  assert.match(decodedHtml(decodeHex('String', enc('String', '"<b>"'))), /&lt;b&gt;/);
});

test('empty hex decodes as no bytes', () => {
  assert.throws(() => decodeHex('u8', ''), /needs 1 bytes at offset 0, but only 0 remain/);
  assert.throws(() => decodeHex('u8', '0x'), /needs 1 bytes at offset 0, but only 0 remain/);

});

test('errors', () => {
  assert.throws(() => encodeJson('u8', '{'), /^Error: Value is not valid JSON: /);
  assert.throws(() => encodeJson('u8', '256'));
  assert.throws(() => encodeJson('NotAType', '1'));
  assert.throws(() => decodeHex('u8', '0xzz'));
  assert.throws(() => decodeHex('u32', '0x0102'), /needs 4 bytes at offset 0, but only 2 remain/);
});
