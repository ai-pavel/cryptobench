import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createdIds, fieldId } from '../../src/sui/object-id/object-id.js';
import { blake2b, base58, hex } from '../../src/sui/lib/sui.js';

const id = bytes => '0x' + hex.encode(blake2b(Uint8Array.from(bytes), { dkLen: 32 }));
const le64 = n => Array.from({ length: 8 }, (_, i) => Number((BigInt(n) >> BigInt(8 * i)) & 0xffn));
const DIGEST = '6wugsseErMNUqFfF9tCEkkKFvJMmQtRQATK7fpo6d4Cp';
const PARENT = '0x' + 'ab'.repeat(32);

test('created objects: BLAKE2b-256(0xf1 ‖ digest ‖ index u64 LE)', () => {
  const d = [...base58.decode(DIGEST)];
  // Example: index 0, one ID.
  assert.deepEqual(createdIds(DIGEST, '0', '1'), [['Index 0', id([0xf1, ...d, ...le64(0)])]]);
  assert.equal(createdIds(DIGEST, '0', '1')[0][1], '0x692a8a70a071981c8f2df25ad20f6f34e8b653b73fa38215094c5682d9a1ff37');
  const rows = createdIds(DIGEST, '3', '2');
  assert.deepEqual(rows.map(r => r[0]), ['Index 3', 'Index 4']);
  assert.equal(rows[1][1], id([0xf1, ...d, ...le64(4)]));
  // Indexes above 2^32 are encoded as full u64.
  assert.equal(createdIds(DIGEST, '4294967296', '')[0][1], id([0xf1, ...d, 0, 0, 0, 0, 1, 0, 0, 0]));
});

test('created objects: empty and errors', () => {
  assert.equal(createdIds('  ', '0', '1'), null);
  assert.throws(() => createdIds('0OIl', '0', '1'), /not valid base58/);
  assert.throws(() => createdIds('1111', '0', '1'), /32 bytes \(got 4\)/);
  assert.throws(() => createdIds(DIGEST, '-1', '1'), /Creation index must be a whole number/);
  assert.throws(() => createdIds(DIGEST, '0', '101'), /between 1 and 100/);
  assert.throws(() => createdIds(DIGEST, '0', '0'), /between 1 and 100/);
});

// u64 type tag in BCS is the TypeTag enum variant 2.
test('dynamic field: BLAKE2b-256(0xf0 ‖ parent ‖ len u64 ‖ key ‖ BCS(type))', () => {
  const rows = fieldId({ parent: PARENT, keytype: 'u64', keyval: '7', raw: false }, 'field');
  assert.deepEqual(rows, [
    ['Dynamic field ID', id([0xf0, ...Array(32).fill(0xab), ...le64(8), ...le64(7), 2])],
    ['Key type used', 'u64'],
    ['Key bytes (BCS)', '0x0700000000000000'],
  ]);
  // Raw BCS bytes give the same result.
  assert.deepEqual(fieldId({ parent: PARENT, keytype: 'u64', keyval: '0x0700000000000000', raw: true }, 'field'), rows);
  // A string key: ULEB length + UTF-8, type 0x1::string::String.
  const s = fieldId({ parent: '0x2', keytype: '0x1::string::String', keyval: '"name"', raw: false }, 'field');
  assert.equal(s[2][1], '0x046e616d65');
});

test('derived object wraps the key type in 0x2::derived_object::DerivedObjectKey<T>', () => {
  const rows = fieldId({ parent: PARENT, keytype: 'u64', keyval: '42', raw: false }, 'derived');
  assert.equal(rows[0][0], 'Derived object ID');
  assert.equal(rows[1][1], '0x2::derived_object::DerivedObjectKey<u64>');
  // TypeTag::Struct (7) ‖ address ‖ module ‖ name ‖ type params [u64].
  const str = s => [s.length, ...new TextEncoder().encode(s)];
  const tag = [7, ...Array(31).fill(0), 2, ...str('derived_object'), ...str('DerivedObjectKey'), 1, 2];
  assert.equal(rows[0][1], id([0xf0, ...Array(32).fill(0xab), ...le64(8), ...le64(42), ...tag]));
});

test('dynamic field: empty and errors', () => {
  assert.equal(fieldId({ parent: ' ', keytype: 'u64', keyval: '0', raw: false }, 'field'), null);
  assert.throws(() => fieldId({ parent: PARENT, keytype: 'u64<', keyval: '0', raw: false }, 'field'), /^Error: Key type: /);
  assert.throws(() => fieldId({ parent: PARENT, keytype: 'u64', keyval: 'abc', raw: false }, 'field'), /Key value is not valid JSON/);
  assert.throws(() => fieldId({ parent: PARENT, keytype: 'u64', keyval: 'zz', raw: true }, 'field'));
  assert.throws(() => fieldId({ parent: '0xzz', keytype: 'u64', keyval: '0', raw: false }, 'field'));
});
