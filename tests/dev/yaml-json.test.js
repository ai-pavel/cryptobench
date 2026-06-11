import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yamlToJson, jsonToYaml } from '../../src/dev/yaml-json/yaml-json.js';
import { InputError } from '../../src/dev/lib/ui.js';

const y2j = (t, ind) => JSON.parse(yamlToJson(t, ind).json);

test('example YAML', () => {
  const r = yamlToJson('service: api\nreplicas: 3\nenv:\n  - name: LOG_LEVEL\n    value: debug\n  - name: PORT\n    value: "8080"\nresources:\n  limits: { cpu: 500m, memory: 256Mi }\n');
  assert.deepEqual(JSON.parse(r.json), {
    service: 'api', replicas: 3,
    env: [{ name: 'LOG_LEVEL', value: 'debug' }, { name: 'PORT', value: '8080' }],
    resources: { limits: { cpu: '500m', memory: '256Mi' } },
  });
  assert.match(r.json, /^\{\n  "service": "api",/);
  assert.equal(r.note, '');
  assert.match(yamlToJson('a: 1', 4).json, /^\{\n {4}"a": 1\n\}$/);
});

test('YAML 1.2 spec examples 2.1, 2.2 and 2.10', () => {
  assert.deepEqual(y2j('- Mark McGwire\n- Sammy Sosa\n- Ken Griffey\n'), ['Mark McGwire', 'Sammy Sosa', 'Ken Griffey']);
  assert.deepEqual(y2j('hr:  65    # Home runs\navg: 0.278 # Batting average\nrbi: 147   # Runs Batted In\n'), { hr: 65, avg: 0.278, rbi: 147 });
  assert.deepEqual(y2j('---\nhr:\n  - Mark McGwire\n  # Following node labeled SS\n  - &SS Sammy Sosa\nrbi:\n  - *SS # Subsequent occurrence\n  - Ken Griffey\n'),
    { hr: ['Mark McGwire', 'Sammy Sosa'], rbi: ['Sammy Sosa', 'Ken Griffey'] });
});

test('YAML spec example 2.7: two documents become an array', () => {
  const r = yamlToJson('# Ranking of 1998 home runs\n---\n- Mark McGwire\n- Sammy Sosa\n- Ken Griffey\n\n# Team ranking\n---\n- Chicago Cubs\n- St Louis Cardinals\n');
  assert.deepEqual(JSON.parse(r.json), [['Mark McGwire', 'Sammy Sosa', 'Ken Griffey'], ['Chicago Cubs', 'St Louis Cardinals']]);
  assert.equal(r.note, '2 YAML documents, shown as a JSON array.');
});

test('JSON → YAML quotes strings that would change type', () => {
  assert.equal(jsonToYaml('{"a":[1,{"b":"x: y"}],"c":"8080","d":null,"e":true}'), "a:\n  - 1\n  - b: 'x: y'\nc: '8080'\nd: null\ne: true\n");
  assert.equal(jsonToYaml('{"a":{"b":1}}', 4), 'a:\n    b: 1\n');
  const round = { list: [1, 'two', { three: 3 }], s: 'multi\nline', n: null };
  assert.deepEqual(y2j(jsonToYaml(JSON.stringify(round))), round);
});

test('invalid input throws', () => {
  assert.throws(() => yamlToJson('  \n'), /Paste some YAML/);
  assert.throws(() => yamlToJson('a: [1, 2'), e => e instanceof InputError && e.message.startsWith('Invalid YAML: '));
  assert.throws(() => yamlToJson('a: 1\na: 2'), /Invalid YAML: duplicated mapping key/);
  assert.throws(() => jsonToYaml('{a: 1}'), /Invalid JSON at line 1, column 2/);
});
