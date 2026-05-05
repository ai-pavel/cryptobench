import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPS, words, statsText } from '../../src/utilities/transform-text/transform-text.js';

test('words splits on punctuation, spaces and camelCase humps', () => {
  assert.deepEqual(words('helloWorld foo-bar_baz'), ['hello', 'World', 'foo', 'bar', 'baz']);
  assert.deepEqual(words('  Ünïcode wörds 42x '), ['Ünïcode', 'wörds', '42x']);
  assert.deepEqual(words('version2Beta'), ['version2', 'Beta']);
  assert.deepEqual(words('--'), []);
});

test('case operations', () => {
  assert.equal(OPS.upper('straße'), 'STRASSE');
  assert.equal(OPS.lower('HeLLo'), 'hello');
  assert.equal(OPS.title('the QUICK brown-fox (jumps) "over"'), 'The Quick Brown-Fox (Jumps) "Over"');
  assert.equal(OPS.sentence('HELLO THERE. how are you? fine!  ok'), 'Hello there. How are you? Fine!  Ok');
  assert.equal(OPS.camel('Hello big World\nfoo_bar'), 'helloBigWorld\nfooBar');
  assert.equal(OPS.snake('Hello big World\nfooBar'), 'hello_big_world\nfoo_bar');
  assert.equal(OPS.kebab('Hello, big World!'), 'hello-big-world');
});

test('clean-up operations', () => {
  assert.equal(OPS.trim('  a  \n\tb\t'), 'a\nb');
  assert.equal(OPS.spaces('a  \t b\nc    d'), 'a b\nc d');
  assert.equal(OPS.empty('a\n\n  \nb\n'), 'a\nb');
  assert.equal(OPS.sort('pear\napple\nBanana'), 'apple\nBanana\npear');
  assert.equal(OPS.unique('a\nb\na\nc\nb'), 'a\nb\nc');
  assert.equal(OPS.reverseLines('1\n2\n3'), '3\n2\n1');
  assert.equal(OPS.reverse('abc😀'), '😀cba'); // by code point, keeps the emoji whole
});

test('Base64 (RFC 4648 test vectors) and UTF-8', () => {
  const vectors = [['', ''], ['f', 'Zg=='], ['fo', 'Zm8='], ['foo', 'Zm9v'], ['foob', 'Zm9vYg=='], ['fooba', 'Zm9vYmE='], ['foobar', 'Zm9vYmFy']];
  for (const [plain, enc] of vectors) {
    assert.equal(OPS.b64e(plain), enc);
    assert.equal(OPS.b64d(enc), plain);
  }
  assert.equal(OPS.b64e('héllo €'), 'aMOpbGxvIOKCrA==');
  assert.equal(OPS.b64d('  aMOpbGxvIOKCrA==\n'), 'héllo €');
});

test('Base64 decode rejects invalid input and non-UTF-8 bytes', () => {
  assert.throws(() => OPS.b64d('not base64!'));
  assert.throws(() => OPS.b64d('/w==')); // 0xFF is not valid UTF-8
});

test('URL encoding', () => {
  assert.equal(OPS.urle('a b&c=d/é'), 'a%20b%26c%3Dd%2F%C3%A9');
  assert.equal(OPS.urld('a%20b%26c%3Dd%2F%C3%A9'), 'a b&c=d/é');
  assert.throws(() => OPS.urld('%E0%A4%A'), URIError);
});

test('statsText counts characters by code point, words and lines', () => {
  assert.equal(statsText(''), '0 characters · 0 words · 0 lines');
  assert.equal(statsText('hello world'), '11 characters · 2 words · 1 lines');
  assert.equal(statsText('a😀\n\nb c\n'), '8 characters · 3 words · 4 lines');
});
