import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeRows, decodeBase58, EXAMPLES } from '../../src/bitcoin/base58check/base58check.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;

test('empty input gives no result', () => {
  assert.equal(encodeRows(' ', '', true), null);
  assert.equal(decodeBase58('', true), null);
});

test('Example: genesis address in Base58Check', () => {
  const { version, payload } = EXAMPLES.encode.check;
  const rows = encodeRows(version, payload, true);
  assert.equal(value(rows, 'Base58Check'), '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  assert.equal(value(rows, 'Bytes encoded'), '00' + payload + value(rows, 'Checksum'));
});

test('Example: Bitcoin wiki plain Base58', () => {
  const { version, payload } = EXAMPLES.encode.plain;
  const rows = encodeRows(version, payload, false);
  assert.equal(value(rows, 'Base58'), '16UwLL9Risc3QfPqBUvKofHmBQ7wMtjvM');
  assert.equal(value(rows, 'Leading zero bytes'), '1 (each becomes a leading “1”)');
  const d = decodeBase58(EXAMPLES.decode.plain, false);
  assert.equal(value(d.rows, 'Hex'), payload.toLowerCase());
  assert.equal(value(d.rows, 'Length'), '25 bytes');
});

test('Example: decode the genesis address', () => {
  const r = decodeBase58(EXAMPLES.decode.check, true);
  assert.equal(r.status, 'ok');
  assert.equal(r.message, '✓ Checksum is valid');
  assert.equal(value(r.rows, 'Version byte'), '00');
  assert.equal(value(r.rows, 'Payload'), '62e907b15cbf27d5425399ebf6f0fb50ebb88f18');
  assert.equal(r.rows.find(x => x.label === 'Payload').note, '20 bytes');
  assert.equal(value(r.rows, 'Expected checksum'), undefined);
});

test('a typo breaks the checksum', () => {
  const r = decodeBase58('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb', true);
  assert.equal(r.status, 'bad');
  assert.equal(r.message, '✗ Checksum does not match: the string has a typo');
  assert.notEqual(value(r.rows, 'Expected checksum'), value(r.rows, 'Checksum'));
});

test('all-zero data is all ones', () => {
  assert.equal(value(encodeRows('', '000000', false), 'Base58'), '111');
  assert.equal(value(encodeRows('', '000000', false), 'Leading zero bytes'), '3 (each becomes a leading “1”)');
});

test('bad input throws', () => {
  assert.throws(() => decodeBase58('1A0z', true), /"0" is not in the Base58 alphabet \(0, O, I and l are left out to avoid confusion\)/);
  assert.throws(() => decodeBase58('1A+z', true), /^Error: "\+" is not in the Base58 alphabet$/);
  assert.throws(() => decodeBase58('1111', true), /Too short to contain a 4-byte checksum/);
  assert.throws(() => encodeRows('0', 'ab', true));
  assert.throws(() => encodeRows('00', 'xy', true));
});
