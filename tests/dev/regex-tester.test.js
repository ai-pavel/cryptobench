import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { flagsError, timeoutMessage, matchStatus, highlightHtml, groupsTableHtml } from '../../src/dev/regex-tester/regex-tester.js';

// Run the page's (classic) worker in a sandbox and collect what it posts back.
const WORKER = readFileSync(new URL('../../src/dev/regex-tester/worker.js', import.meta.url), 'utf8');
function runWorker(msg) {
  const posted = [];
  const ctx = vm.createContext({ postMessage: m => posted.push(m) });
  vm.runInContext(WORKER, ctx);
  ctx.onmessage({ data: { id: 1, replacement: null, ...msg } });
  return posted[0];
}

const EXAMPLE = {
  pattern: '(?<user>[\\w.+-]+)@(?<domain>[\\w-]+\\.[\\w.-]+)', flags: 'g',
  text: 'Contact alice@example.com or bob.smith+news@mail.example.org.\nNot an email: carol@localhost',
  replacement: '$<user> at $<domain>',
};

test('flags validation', () => {
  assert.equal(flagsError(''), null);
  assert.equal(flagsError('gimsuyd'), null);
  assert.equal(flagsError('gg'), 'Flags can be d, g, i, m, s, u, v, y, each at most once.');
  assert.equal(flagsError('x'), 'Flags can be d, g, i, m, s, u, v, y, each at most once.');
  assert.match(timeoutMessage(), /^Stopped after 1.5 s/);
});

test('example: two emails with named groups', () => {
  const d = runWorker(EXAMPLE);
  assert.deepEqual([...d.matches].map(m => [m.index, m.text, [...m.groups]]), [
    [8, 'alice@example.com', ['alice', 'example.com']],
    [29, 'bob.smith+news@mail.example.org.', ['bob.smith+news', 'mail.example.org.']],
  ]);
  assert.deepEqual([...d.groupNames], ['user', 'domain']);
  assert.equal(d.replaced, 'Contact alice at example.com or bob.smith+news at mail.example.org.\nNot an email: carol@localhost');
  assert.deepEqual(matchStatus(d.matches, d.truncated), { cls: 'status ok', text: '2 matches' });
  assert.equal(highlightHtml(EXAMPLE.text, d.matches),
    'Contact <mark>alice@example.com</mark> or <mark>bob.smith+news@mail.example.org.</mark>\nNot an email: carol@localhost');
  const table = groupsTableHtml(d.matches, d.groupNames);
  assert.match(table, /^<tr><th>#<\/th><th>Index<\/th><th>Match<\/th><th>1 &lt;user&gt;<\/th><th>2 &lt;domain&gt;<\/th><\/tr>/);
  assert.match(table, /<tr><td>1<\/td><td>8<\/td><td class="mono">alice@example.com<\/td><td class="mono">alice<\/td>/);
});

test('status text', () => {
  assert.deepEqual(matchStatus([], false), { cls: 'status warn', text: 'No matches' });
  assert.equal(matchStatus([{}], false).text, '1 match');
  assert.equal(matchStatus(new Array(5000).fill({}), true).text, '5000+ matches');
});

test('highlighting escapes HTML and marks empty matches', () => {
  assert.equal(highlightHtml('<a>', [{ index: 1, text: 'a', groups: [] }]), '&lt;<mark>a</mark>&gt;');
  assert.equal(highlightHtml('ab', [{ index: 1, text: '', groups: [] }]), 'a<mark>​</mark>b');
});

test('matches table: unmatched groups and no matches', () => {
  const d = runWorker({ pattern: '(a)|(b)', flags: 'g', text: 'b' });
  assert.match(groupsTableHtml(d.matches, d.groupNames), /<td class="mono"><span class="muted">—<\/span><\/td><td class="mono">b<\/td>/);
  assert.equal(groupsTableHtml([], []), '');
});

test('worker: invalid pattern, non-global and empty matches', () => {
  assert.match(runWorker({ pattern: '(', flags: '', text: '' }).error, /Invalid regular expression/);
  assert.equal(runWorker({ pattern: 'o', flags: '', text: 'foo' }).matches.length, 1);
  assert.equal(runWorker({ pattern: 'x*', flags: 'g', text: 'ab' }).matches.length, 3);
  assert.equal(runWorker({ pattern: '', flags: 'gu', text: '😀' }).matches.length, 2);
  assert.deepEqual([...runWorker({ pattern: '[(]\\((?:x)(?<n>y)', flags: '', text: '' }).groupNames], ['n']);
});
