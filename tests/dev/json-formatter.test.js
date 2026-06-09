import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatJson } from '../../src/dev/json-formatter/json-formatter.js';
import { InputError } from '../../src/dev/lib/ui.js';

const EXAMPLE = '{"name":"Alice","age":30,"tags":["admin","dev"],"address":{"city":"Lisbon","zip":"1000-001"},"active":true,"score":null}';

test('example is formatted with 2 spaces', () => {
  const r = formatJson(EXAMPLE);
  assert.equal(r.text, JSON.stringify(JSON.parse(EXAMPLE), null, 2));
  assert.match(r.text, /^\{\n  "name": "Alice",\n  "age": 30,\n  "tags": \[\n    "admin",/);
  assert.equal(r.warning, null);
  assert.equal(r.valid, `Valid JSON · ${r.text.length} bytes formatted (${EXAMPLE.length} in input)`);
});

test('indent options and sorting keys', () => {
  assert.equal(formatJson('{"b":1,"a":[1]}', { indent: '0' }).text, '{"b":1,"a":[1]}');
  assert.equal(formatJson('{"b":1,"a":[1]}', { indent: '0', sort: true }).text, '{"a":[1],"b":1}');
  assert.equal(formatJson('{"a":1}', { indent: 'tab' }).text, '{\n\t"a": 1\n}');
  assert.equal(formatJson('{"a":1}', { indent: '4' }).text, '{\n    "a": 1\n}');
  assert.equal(formatJson('{"z":{"y":1,"x":2}}', { indent: '0', sort: true }).text, '{"z":{"x":2,"y":1}}');
});

test('sizes are counted in UTF-8 bytes', () => {
  assert.equal(formatJson('"é"', { indent: '0' }).valid, 'Valid JSON · 4 bytes formatted (4 in input)');
});

test('precision warning for numbers beyond 2^53', () => {
  const r = formatJson('{"id": 9007199254740993, "ok": 9007199254740991}');
  assert.equal(r.warning, 'Precision warning: 9007199254740993 can\'t be represented exactly as a JavaScript number and changes when reformatted.');
  assert.match(r.text, /9007199254740992/);
});

test('invalid JSON points at the line and column', () => {
  assert.throws(() => formatJson(''), /Paste some JSON/);
  assert.throws(() => formatJson('{"a": 1,\n "b": }'), e => e instanceof InputError && /^Invalid JSON at line 2, column 7: Unexpected "}"\n "b": }\n      \^$/.test(e.message));
  assert.throws(() => formatJson("{'a': 1}"), /Expected a property name in double quotes/);
  assert.throws(() => formatJson('[1,]'), /Trailing comma before "\]"/);
});
