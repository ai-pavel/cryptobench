import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect, decodeInput, encodeInput } from '../../src/dev/cbor-decoder/cbor-decoder.js';
import { InputError } from '../../src/dev/lib/ui.js';

const hex = h => Uint8Array.from(Buffer.from(h, 'hex'));
const cborHex = json => encodeInput(json).rows[0].value;

test('example input decodes', () => {
  const r = decodeInput('a3636b65796568656c6c6f6566697273741819646c69737483f5f6fb400921fb54442d18', 'auto');
  assert.equal(r.diag, '{\n  "key": "hello",\n  "first": 25,\n  "list": [true, null, 3.141592653589793_3]\n}');
  assert.deepEqual(JSON.parse(r.json), { key: 'hello', first: 25, list: [true, null, Math.PI] });
  assert.deepEqual(r.rows, [{ label: 'Size', value: '36 bytes', copy: false }]);
  assert.deepEqual(r.notes, []);
});

test('RFC 8949 appendix A: encoding', () => {
  assert.equal(cborHex('0'), '00');
  assert.equal(cborHex('23'), '17');
  assert.equal(cborHex('24'), '1818');
  assert.equal(cborHex('1000'), '1903e8');
  assert.equal(cborHex('1000000'), '1a000f4240');
  assert.equal(cborHex('1000000000000'), '1b000000e8d4a51000');
  assert.equal(cborHex('-1'), '20');
  assert.equal(cborHex('-1000'), '3903e7');
  assert.equal(cborHex('100000.0'), '1a000186a0'); // JSON can't tell 100000.0 from 100000
  assert.equal(cborHex('1.1'), 'fb3ff199999999999a');
  assert.equal(cborHex('false'), 'f4');
  assert.equal(cborHex('true'), 'f5');
  assert.equal(cborHex('null'), 'f6');
  assert.equal(cborHex('""'), '60');
  assert.equal(cborHex('"IETF"'), '6449455446');
  assert.equal(cborHex('"\\u00fc"'), '62c3bc');
  assert.equal(cborHex('[]'), '80');
  assert.equal(cborHex('[1, [2, 3], [4, 5]]'), '8301820203820405');
  assert.equal(cborHex('{"a": 1, "b": [2, 3]}'), 'a26161016162820203');
});

test('RFC 8949 appendix A: diagnostic notation', () => {
  const d = h => decodeInput(h, 'hex').diag;
  assert.equal(d('1bffffffffffffffff'), '18446744073709551615');
  assert.equal(d('3bffffffffffffffff'), '-18446744073709551616');
  assert.equal(d('f93e00'), '1.5_1');
  assert.equal(d('f97c00'), 'Infinity_1');
  assert.equal(d('c074323031332d30332d32315432303a30343a30305a'), '0("2013-03-21T20:04:00Z")');
  assert.equal(d('c249010000000000000000'), "2(h'010000000000000000')");
  assert.equal(d('4401020304'), "h'01020304'");
  assert.equal(d('5f42010243030405ff'), "(_ h'0102', h'030405')");
  assert.equal(d('7f657374726561646d696e67ff'), '(_ "strea", "ming")');
  assert.equal(d('9fff'), '[_ ]');
  assert.equal(d('f0'), 'simple(16)');
  assert.equal(d('f7'), 'undefined');
});

test('JSON view and tag notes', () => {
  const big = decodeInput('c249010000000000000000', 'hex');
  assert.equal(big.json, '"18446744073709551616"');
  assert.deepEqual(big.notes, ['Tag 2 at offset 0: unsigned bignum = 18446744073709551616']);
  const epoch = decodeInput('c11a514b67b0', 'hex'); // 1(1363896240)
  assert.equal(epoch.json, '"2013-03-21T20:04:00.000Z"');
  assert.deepEqual(decodeInput('d818456449455446', 'hex').notes, ['Tag 24 at offset 0: encoded CBOR data item = "IETF"']);
});

test('CBOR sequences and base64 input', () => {
  const r = inspect(hex('0102'));
  assert.equal(r.diag, '1,\n2');
  assert.equal(r.json, '[\n  1,\n  2\n]');
  assert.equal(r.rows[0].value, '2 bytes · 2 top-level items (CBOR sequence)');
  assert.equal(decodeInput('ZElFVEY=', 'base64').diag, '"IETF"');
});

test('encode mode: the example JSON', () => {
  const r = encodeInput('{"name": "Alice", "age": 30, "tags": ["a", "b"], "pi": 3.14, "ok": true}');
  assert.equal(r.rows[0].value, 'a5646e616d6565416c69636563616765181e64746167738261616162627069fb40091eb851eb851f626f6bf5');
  assert.equal(r.rows[1].value, Buffer.from(r.rows[0].value, 'hex').toString('base64'));
  assert.equal(r.rows[2].value, '44 bytes');
  assert.deepEqual(JSON.parse(r.json), { name: 'Alice', age: 30, tags: ['a', 'b'], pi: 3.14, ok: true });
});

test('empty and invalid input', () => {
  assert.equal(decodeInput('  ', 'auto'), null);
  assert.throws(() => encodeInput('{oops'), e => e instanceof InputError && e.message.startsWith('Invalid JSON: '));
  assert.throws(() => decodeInput('zz', 'hex'), InputError);
  assert.throws(() => decodeInput('1a00', 'hex'), InputError); // truncated
});
