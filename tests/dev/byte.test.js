import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARSE, fieldValues, byteRows } from '../../src/dev/byte/byte.js';
import { InputError } from '../../src/dev/lib/ui.js';

const values = rows => Object.fromEntries(rows.map(r => [r.label, r.value]));

test('every field parses the same byte', () => {
  assert.equal(PARSE.bin('0b00101010'), 42);
  assert.equal(PARSE.bin('0010 1010'), 42);
  assert.equal(PARSE.hex('0x2A'), 42);
  assert.equal(PARSE.oct('52'), 42);
  assert.equal(PARSE.dec('42'), 42);
  assert.equal(PARSE.sdec('42'), 42);
  assert.equal(PARSE.ch('*'), 42);
  assert.equal(PARSE.sdec('-1'), 255);
  assert.equal(PARSE.sdec('-128'), 128);
  assert.equal(PARSE.ch('é'), 0xe9);
});

test('out-of-range and malformed input throws', () => {
  assert.throws(() => PARSE.bin('100000000'), /up to 8 digits/);
  assert.throws(() => PARSE.hex('100'), /one or two digits/);
  assert.throws(() => PARSE.oct('400'), /0 … 377/);
  assert.throws(() => PARSE.dec('256'), /0 … 255/);
  assert.throws(() => PARSE.sdec('128'), /−128 … 127/);
  assert.throws(() => PARSE.ch(''), /Type a character/);
  // '€' is U+20AC, UTF-8 e2 82 ac.
  assert.throws(() => PARSE.ch('€'), e => e instanceof InputError && /U\+20AC.*e2 82 ac/.test(e.message));
});

test('field values for 0x2a (the initial byte) and edge bytes', () => {
  assert.deepEqual(fieldValues(42), { bin: '00101010', hex: '2a', oct: '52', dec: '42', sdec: '42', ch: '*' });
  assert.equal(fieldValues(255).sdec, '-1');
  assert.equal(fieldValues(10).ch, '');
  assert.equal(fieldValues(127).ch, '');
  assert.equal(fieldValues(0x85).ch, '');
  assert.equal(fieldValues(0xe9).ch, 'é');
});

test('result rows for 0x2a', () => {
  const v = values(byteRows(42));
  assert.equal(v.Character, '"*"');
  assert.equal(v.Hex, '0x2a');
  assert.equal(v.Binary, '0b00101010');
  assert.equal(v.Nibbles, 'high 2 (0x2), low 10 (0xa)');
  assert.equal(v.Escape, '*');
  assert.equal(v['HTML entity'], '&#42;');
  assert.equal(v['URL-encoded'], '%2A');
  assert.equal(v['Set bits'], '3');
  assert.equal(v['Bits reversed'], '0x54');
  assert.equal(v['Inverted (NOT)'], '0xd5');
});

test('escapes and control characters', () => {
  assert.equal(values(byteRows(92)).Escape, '\\\\');
  assert.equal(values(byteRows(10)).Escape, '\\x0a');
  assert.equal(values(byteRows(10)).Character, 'LF (Line feed)');
  assert.equal(values(byteRows(0x20))['URL-encoded'], '%20');
  assert.equal(values(byteRows(0x01))['Bits reversed'], '0x80');
});
