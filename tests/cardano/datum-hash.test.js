import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datumHash, fromJSON, toJSON, TEMPLATES, CBOR_EXAMPLE } from '../../src/cardano/datum-hash/datum-hash.js';
import { encode, decode, toHex } from '../../src/cardano/lib/cardano.js';

const json = j => JSON.stringify(j, null, 2);
const cborOf = j => toHex(encode(fromJSON(j)));

test('empty input gives no result', () => {
  assert.equal(datumHash(' \n '), null);
});

test('well-known datum hashes: unit (Constr 0 []) and the integer 42', () => {
  const unit = datumHash(json(TEMPLATES.unit));
  assert.equal(unit.cbor, 'd87980');
  assert.equal(unit.hash, '923918e403bf43c34b4ef6b48eb2ee04babed17320d8d1b9ff9ad086e86f44ec');
  assert.equal(unit.source, 'Encoded from JSON the way cardano-cli does.');
  const int = datumHash(json(TEMPLATES.int));
  assert.equal(int.cbor, '182a');
  assert.equal(int.hash, '9e1199a988ba72ffd6e9c269cadb3b53b5f360ff99f112d9b2ee30c4d74ad88b');
  // The same bytes pasted as CBOR hash the same.
  assert.equal(datumHash('d87980').hash, unit.hash);
  assert.equal(datumHash('d87980').source, 'Hashed exactly as given.');
});

test('Example: nested uses indefinite-length lists like cardano-cli', () => {
  const r = datumHash(json(TEMPLATES.nested));
  // Constr 1 = tag 122; [_ 1, h'00ff', [_ -5, 7], {h'aa': 7}]
  assert.equal(r.cbor, 'd87a9f014200ff9f2407ffa141aa07ff');
  assert.equal(r.bytes, 16);
  assert.deepEqual(r.json, TEMPLATES.nested);
});

test('Example: CBOR is hashed exactly as given and decoded to JSON', () => {
  const r = datumHash(CBOR_EXAMPLE);
  assert.equal(r.cbor, CBOR_EXAMPLE);
  assert.equal(r.bytes, 26);
  // c2 49 010000000000000180: bignum 0x010000000000000180 = 2^64 + 384, kept exact.
  assert.deepEqual(r.json.fields[2], { list: [{ int: -5 }, { int: (2n ** 64n + 384n).toString() }] });
  // Re-encoding that JSON gives the cardano-cli form, which is the same here.
  assert.equal(datumHash(JSON.stringify(r.json)).cbor, CBOR_EXAMPLE);
});

test('constructor tags: 0-6 -> 121-127, 7-127 -> 1280+, larger -> 102', () => {
  assert.equal(cborOf({ constructor: 6, fields: [] }), 'd87f80');
  assert.equal(cborOf({ constructor: 7, fields: [] }), 'd9050080');
  assert.equal(cborOf({ constructor: 127, fields: [] }), 'd9057880');
  assert.equal(cborOf({ constructor: 128, fields: [] }), 'd86682188080');
  for (const n of [6, 7, 127, 128]) assert.equal(toJSON(decode(encode(fromJSON({ constructor: n, fields: [] })))).constructor, n);
});

test('big integers stay exact and long byte strings are chunked', () => {
  assert.equal(datumHash('{"int": 18446744073709551616}').cbor, 'c249010000000000000000');
  assert.equal(datumHash('{"int": -18446744073709551617}').cbor, 'c349010000000000000000');
  assert.equal(cborOf({ bytes: 'ab'.repeat(64) }), '5840' + 'ab'.repeat(64));
  assert.equal(cborOf({ bytes: 'ab'.repeat(65) }), '5f5840' + 'ab'.repeat(64) + '41abff');
});

test('input errors throw', () => {
  assert.throws(() => datumHash('{"int": 1'), /^Error: Invalid JSON: /);
  assert.throws(() => datumHash('{"int": "1.5"}'), /datum\.int must be an integer\./);
  // A fractional JSON number passes the type check and fails in BigInt() with a RangeError.
  assert.throws(() => datumHash('{"int": 1.5}'), RangeError);
  // Every object inherits a "constructor" property, so an unknown key ends up in the
  // constructor branch instead of reaching the "unknown key" message.
  assert.throws(() => datumHash('{"foo": 1}'), /datum\.constructor must be a non-negative integer\./);
  assert.throws(() => datumHash('{"list": [{"int": 1}, 2]}'), /datum\.list\[1\]: expected an object/);
  assert.throws(() => datumHash('{"constructor": -1, "fields": []}'), /datum\.constructor must be a non-negative integer\./);
  assert.throws(() => datumHash('{"constructor": 0}'), /datum\.fields must be an array\./);
  assert.throws(() => datumHash('{"map": [{"k": {"int": 1}}]}'), /datum\.map\[0\]\.v: expected an object/);
  assert.throws(() => datumHash('xyz'), /Not valid hex/);
  assert.throws(() => datumHash('f5'), /not valid Plutus data/); // CBOR true
});
