import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, detect, typed, quote, csvToJson, jsonToCsv } from '../../src/dev/csv-json/csv-json.js';
import { InputError } from '../../src/dev/lib/ui.js';

const EXAMPLE = 'name,age,city,notes\nAlice,30,Lisbon,"Likes ""quotes"", commas"\nBob,25,Porto,\n"Carol Ann",41,"New\nYork",multi-line cell';

test('RFC 4180 section 2 examples', () => {
  assert.deepEqual(parseCsv('aaa,bbb,ccc\r\nzzz,yyy,xxx\r\n', ','), [['aaa', 'bbb', 'ccc'], ['zzz', 'yyy', 'xxx']]);
  assert.deepEqual(parseCsv('aaa,bbb,ccc\r\nzzz,yyy,xxx', ','), [['aaa', 'bbb', 'ccc'], ['zzz', 'yyy', 'xxx']]);
  assert.deepEqual(parseCsv('"aaa","bbb","ccc"\r\nzzz,yyy,xxx', ','), [['aaa', 'bbb', 'ccc'], ['zzz', 'yyy', 'xxx']]);
  assert.deepEqual(parseCsv('"aaa","b\r\nbb","ccc"\r\nzzz,yyy,xxx', ','), [['aaa', 'b\r\nbb', 'ccc'], ['zzz', 'yyy', 'xxx']]);
  assert.deepEqual(parseCsv('"aaa","b""bb","ccc"', ','), [['aaa', 'b"bb', 'ccc']]);
});

test('unclosed quotes throw', () => {
  assert.throws(() => parseCsv('a,"b', ','), e => e instanceof InputError && e.message === 'A quoted field is never closed (missing ").');
});

test('delimiter detection', () => {
  assert.equal(detect('a;b;c\n1;2;3'), ';');
  assert.equal(detect('a\tb\n1\t2'), '\t');
  assert.equal(detect('a|b\n1|2'), '|');
  assert.equal(detect('a,b\n1,2'), ',');
  assert.equal(detect('single'), ',');
});

test('typed values', () => {
  assert.equal(typed(''), null);
  assert.equal(typed('true'), true);
  assert.equal(typed('false'), false);
  assert.equal(typed('-1.5e3'), -1500);
  assert.equal(typed('007'), '007');
  assert.equal(typed('9007199254740993'), '9007199254740993');
  assert.equal(typed('1e999'), '1e999');
  assert.equal(typed('TRUE'), 'TRUE');
});

test('example CSV → JSON', () => {
  const r = csvToJson(EXAMPLE);
  assert.deepEqual(r.json, [
    { name: 'Alice', age: 30, city: 'Lisbon', notes: 'Likes "quotes", commas' },
    { name: 'Bob', age: 25, city: 'Porto', notes: null },
    { name: 'Carol Ann', age: 41, city: 'New\nYork', notes: 'multi-line cell' },
  ]);
  assert.equal(r.note, '3 rows · delimiter: comma');
  assert.deepEqual(r.preview.header, ['name', 'age', 'city', 'notes']);
  assert.deepEqual(r.preview.rows[1], ['Bob', '25', 'Porto', '']);
});

test('CSV → JSON options', () => {
  assert.deepEqual(csvToJson('a;b\n1;x', { types: false }).json, [{ a: '1', b: 'x' }]);
  const raw = csvToJson('1,2\n3,4', { header: false });
  assert.deepEqual(raw.json, [[1, 2], [3, 4]]);
  assert.equal(raw.note, '2 rows · delimiter: comma');
  assert.equal(raw.preview.header, undefined);
  assert.deepEqual(csvToJson(',b\n1', { delim: ',' }).json, [{ column1: 1, b: null }]);
  assert.equal(csvToJson('a\n1', {}).note, '1 row · delimiter: comma');
  assert.equal(csvToJson('a|b\n1|2', { delim: '|' }).note, '1 row · delimiter: pipe');
  assert.throws(() => csvToJson(' \n'), /Paste some CSV/);
});

test('JSON → CSV quotes fields that need it', () => {
  const r = jsonToCsv(JSON.stringify([{ name: 'Alice', age: 30, city: 'Lisbon' }, { name: 'Bob', age: 25, city: 'Porto', tags: ['a', 'b'] }], null, 2));
  assert.equal(r.csv, 'name,age,city,tags\nAlice,30,Lisbon,\nBob,25,Porto,"[""a"",""b""]"');
  assert.deepEqual(r.preview.header, ['name', 'age', 'city', 'tags']);
  assert.deepEqual(r.preview.rows[1], ['Bob', '25', 'Porto', '["a","b"]']);
  assert.equal(jsonToCsv('[[1,"a;b"],[null,"x\\"y"]]', ';').csv, '1;"a;b"\n;"x""y"');
  assert.equal(quote('line\nbreak', ','), '"line\nbreak"');
});

test('round trip through RFC 4180 quoting', () => {
  const rows = [['a', 'b,c', 'd"e', 'f\ng']];
  const csv = jsonToCsv(JSON.stringify(rows)).csv;
  assert.deepEqual(parseCsv(csv, ','), rows);
});

test('JSON → CSV errors', () => {
  assert.throws(() => jsonToCsv('{"a":1}'), /needs an array/);
  assert.throws(() => jsonToCsv('[1, 2]'), /Every item must be an object/);
  assert.throws(() => jsonToCsv(''), /Paste some JSON/);
});

test('auto-detect with a quoted line break across line 10', () => {
  const text = Array.from({ length: 9 }, (_, i) => `a${i},b`).join('\n') + '\nx,"multi\nline"';
  assert.equal(csvToJson(text, { header: false }).json.length, 10);
});
