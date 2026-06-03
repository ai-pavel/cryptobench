import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, toJson, renderFields } from '../../src/dev/protobuf-decoder/protobuf-decoder.js';
import { InputError } from '../../src/dev/lib/ui.js';

const json = (h, fmt = 'hex') => JSON.parse(decode(h, fmt).json);

test('protobuf encoding guide examples', () => {
  // https://protobuf.dev/programming-guides/encoding/
  assert.deepEqual(json('089601'), { 1: 150 });
  assert.deepEqual(json('120774657374696e67'), { 2: 'testing' });
  assert.deepEqual(json('1a03089601'), { 3: { 1: 150 } });
  assert.deepEqual(json('3206038e029ea705'), { 6: [3, 270, 86942] });
});

test('example message', () => {
  const r = decode('0a05416c696365101e1a0d0a0b4578616d706c6520496e632204010203042d0000c03f', 'auto');
  assert.deepEqual(JSON.parse(r.json), { 1: 'Alice', 2: 30, 3: { 1: 'Example Inc' }, 4: [1, 2, 3, 4], 5: 1.5 });
  assert.match(r.html, /<span>1<\/span> <span class="w">length-delimited · offset 0<\/span> <span class="w">string, 5 bytes<\/span><\/div><div class="v">&quot;Alice&quot;<\/div>/);
  assert.match(r.html, /<div class="v">uint: 30<\/div><div class="alt">sint \(zigzag\): 15<\/div>/);
  assert.match(r.html, /<details open><summary><span>3<\/span>.*message, 13 bytes/);
  assert.match(r.html, /\[1, 2, 3, 4\] \(packed varints\).*bytes: 01020304/);
  assert.match(r.html, /<div class="v">float: 1.5<\/div><div class="alt">fixed32: 1069547520 · sfixed32: 1069547520<\/div>/);
});

test('repeated fields become arrays', () => {
  assert.deepEqual(json('08010802'), { 1: [1, 2] });
  assert.deepEqual(toJson([]), {});
  assert.equal(renderFields([]), '');
});

test('zigzag and large varints', () => {
  // sint32 -1 is zigzag 1; 2^64-1 doesn't fit a JS number.
  assert.match(decode('0801', 'hex').html, /sint \(zigzag\): -1/);
  assert.deepEqual(json('08ffffffffffffffffff01'), { 1: '18446744073709551615' });
});

test('empty and invalid input', () => {
  assert.equal(decode(' ', 'auto'), null);
  assert.throws(() => decode('0a05416c', 'hex'), e => e instanceof InputError && /Not a valid protobuf message/.test(e.message));
  assert.throws(() => decode('zz', 'hex'), InputError);
});
