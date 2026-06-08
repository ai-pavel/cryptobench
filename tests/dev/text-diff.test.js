import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordDiff, diffTexts } from '../../src/dev/text-diff/text-diff.js';

const A = 'The quick brown fox\njumps over the lazy dog.\nLine three stays.\nThis line will be removed.\nPack my box with five dozen liquor jugs.';
const B = 'The quick brown fox\nleaps over the lazy cat.\nLine three stays.\nPack my box with five dozen liquor jugs.\nA new last line.';
const lines = html => html.split('<div class="ln">').slice(1);

test('example: side by side', () => {
  const r = diffTexts(A, B);
  assert.deepEqual(r.stats, { cls: 'status ', text: '+2 lines added, −2 removed' });
  const ls = lines(r.html);
  assert.equal(ls.length, 6);
  assert.equal(ls[1], '<div class="no del">2</div><div class="tx del"><del>jumps</del> over the lazy <del>dog</del>.</div><div class="no ins">2</div><div class="tx ins"><ins>leaps</ins> over the lazy <ins>cat</ins>.</div></div>');
  assert.equal(ls[3], '<div class="no del">4</div><div class="tx del">This line will be removed.</div><div class="no empty"></div><div class="tx empty"></div></div>');
  assert.equal(ls[5], '<div class="no empty"></div><div class="tx empty"></div><div class="no ins">5</div><div class="tx ins">A new last line.</div></div>');
});

test('example: inline', () => {
  const ls = lines(diffTexts(A, B, { split: false }).html);
  assert.deepEqual(ls.map(l => l.match(/<div class="tx [a-z]*">(.*?)<\/div><\/div>$/)[1]), [
    '&nbsp; The quick brown fox',
    '− <del>jumps</del> over the lazy <del>dog</del>.',
    '+ <ins>leaps</ins> over the lazy <ins>cat</ins>.',
    '&nbsp; Line three stays.',
    '− This line will be removed.',
    '&nbsp; Pack my box with five dozen liquor jugs.',
    '+ A new last line.',
  ]);
});

test('identical texts, ignoring whitespace and case', () => {
  assert.deepEqual(diffTexts('a\nb', 'a\nb').stats, { cls: 'status ok', text: 'No differences.' });
  assert.equal(diffTexts('a  b', ' a b').stats.text, '+1 line added, −1 removed');
  assert.equal(diffTexts('a  b', ' a b', { ws: true }).stats.text, 'No differences.');
  assert.equal(diffTexts('Hello', 'hello', { ignoreCase: true }).stats.text, 'No differences.');
});

test('long unchanged runs collapse to 3 lines of context', () => {
  const a = Array.from({ length: 20 }, (_, i) => `line ${i}`);
  const b = [...a]; b[10] = 'changed';
  const html = diffTexts(a.join('\n'), b.join('\n')).html;
  const gaps = html.match(/⋯ \d+ unchanged lines?/g);
  assert.deepEqual(gaps, ['⋯ 7 unchanged lines', '⋯ 6 unchanged lines']);
  assert.equal(lines(diffTexts(a.join('\n'), b.join('\n'), { collapse: false }).html).length, 20);
});

test('word diff escapes HTML and honours ignore case', () => {
  assert.deepEqual(wordDiff('<a> x', '<a> y'), ['&lt;a&gt; <del>x</del>', '&lt;a&gt; <ins>y</ins>']);
  assert.deepEqual(wordDiff('Foo bar', 'foo baz', true), ['Foo <del>bar</del>', 'foo <ins>baz</ins>']);
});
