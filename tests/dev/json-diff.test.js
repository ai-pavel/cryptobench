import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, diffJson } from '../../src/dev/json-diff/json-diff.js';

const A = '{"name":"Alice","age":30,"roles":["admin","dev"],"address":{"city":"Lisbon"},"active":true}';
const B = '{"name":"Alice","age":31,"roles":["dev","admin","ops"],"address":{"city":"Porto","zip":"4000"}}';

test('example: ordered arrays', () => {
  const r = diffJson(A, B);
  assert.deepEqual(r.diffs, [
    { kind: 'removed', path: '$.active', from: true },
    { kind: 'changed', path: '$.age', from: 30, to: 31 },
    { kind: 'changed', path: '$.roles[0]', from: 'admin', to: 'dev' },
    { kind: 'changed', path: '$.roles[1]', from: 'dev', to: 'admin' },
    { kind: 'added', path: '$.roles[2]', to: 'ops' },
    { kind: 'changed', path: '$.address.city', from: 'Lisbon', to: 'Porto' },
    { kind: 'added', path: '$.address.zip', to: '4000' },
  ]);
  assert.deepEqual(r.stats, { cls: 'status ', text: '7 differences: 2 added, 1 removed, 4 changed' });
  assert.match(r.html, /^<tr><th>Change<\/th><th>Path<\/th><th>Before<\/th><th>After<\/th><\/tr>/);
  assert.match(r.html, /<tr><td class="rem">removed<\/td><td class="mono">\$\.active<\/td><td class="mono">true<\/td><td class="mono"><\/td><\/tr>/);
  assert.match(r.html, /<td class="chg">changed<\/td><td class="mono">\$\.address\.city<\/td><td class="mono">&quot;Lisbon&quot;<\/td>/);
});

test('example: ignoring array order', () => {
  const r = diffJson(A, B, true);
  assert.deepEqual(r.diffs.filter(d => d.path.startsWith('$.roles')), [{ kind: 'added', path: '$.roles[2]', to: 'ops' }]);
  assert.equal(r.stats.text, '5 differences: 2 added, 1 removed, 2 changed');
});

test('equal documents', () => {
  const r = diffJson('{"a":[1,{"b":2}]}', '{ "a": [1, {"b": 2}] }');
  assert.deepEqual(r.diffs, []);
  assert.deepEqual(r.stats, { cls: 'status ok', text: 'The documents are equal.' });
  assert.equal(r.html, '');
  assert.deepEqual(diffJson('[{"a":1,"b":2}]', '[{"b":2,"a":1}]', true).diffs, []);
});

test('type changes, odd keys, duplicates in unordered arrays', () => {
  const out = [];
  compare({ 'a b': 1, x: [1] }, { 'a b': '1', x: { 0: 1 } }, '$', out, false);
  assert.deepEqual(out, [
    { kind: 'changed', path: '$["a b"]', from: 1, to: '1' },
    { kind: 'changed', path: '$.x', from: [1], to: { 0: 1 } },
  ]);
  assert.deepEqual(diffJson('[1,1,2]', '[2,1]', true).diffs, [{ kind: 'removed', path: '$[1]', from: 1 }]);
  assert.deepEqual(diffJson('null', '0').diffs, [{ kind: 'changed', path: '$', from: null, to: 0 }]);
});

test('invalid input names the document', () => {
  assert.throws(() => diffJson('', '{}'), /Paste some original JSON/);
  assert.throws(() => diffJson('{}', '{x}'), /Invalid changed JSON at line 1, column 2/);
});
