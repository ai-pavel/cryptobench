import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrap76, encodeRows, decodeRows, fileRows } from '../../src/dev/base64/base64.js';

const enc = (s, o) => encodeRows(s, o)[0].value;

test('RFC 4648 section 10 test vectors encode', () => {
  const vectors = { '': '', f: 'Zg==', fo: 'Zm8=', foo: 'Zm9v', foob: 'Zm9vYg==', fooba: 'Zm9vYmE=', foobar: 'Zm9vYmFy' };
  for (const [plain, b64] of Object.entries(vectors)) assert.equal(enc(plain), b64);
});

test('RFC 4648 section 10 test vectors decode', () => {
  const vectors = { Zg: 'f', 'Zm8=': 'fo', Zm9v: 'foo', 'Zm9vYg==': 'foob', 'Zm9vYmE=': 'fooba', Zm9vYmFy: 'foobar' };
  for (const [b64, plain] of Object.entries(vectors)) assert.equal(decodeRows(b64).rows[0].value, plain);
});

test('example text round-trips (UTF-8, emoji)', () => {
  const rows = encodeRows('Hello, world! 👋');
  assert.equal(rows[0].label, 'Base64');
  assert.equal(rows[0].value, 'SGVsbG8sIHdvcmxkISDwn5GL');
  assert.equal(rows[1].value, '18 bytes → 24 characters');
  const d = decodeRows('SGVsbG8sIHdvcmxkISDwn5GL');
  assert.equal(d.rows[0].label, 'Text (UTF-8)');
  assert.equal(d.rows[0].value, 'Hello, world! 👋');
  assert.equal(d.rows[2].value, '18 bytes');
});

test('URL-safe alphabet and padding options', () => {
  // 0xfb 0xff → "+/8=" standard, "-_8" URL-safe without padding.
  assert.equal(enc('û'), 'w7s=');
  const rows = encodeRows('??>', { url: true, pad: false });
  assert.equal(rows[0].label, 'Base64url');
  assert.equal(rows[0].value, 'Pz8-');
  assert.equal(enc('??>'), 'Pz8+');
  assert.equal(enc('a', { pad: false }), 'YQ');
  assert.deepEqual([...decodeRows('-_8').bytes], [0xfb, 0xff]);
  assert.deepEqual([...decodeRows('+/8=').bytes], [0xfb, 0xff]);
});

test('MIME wrapping at 76 characters', () => {
  const s = 'A'.repeat(160);
  assert.equal(wrap76(s, false), s);
  assert.deepEqual(wrap76(s, true).split('\n').map(l => l.length), [76, 76, 8]);
  assert.equal(wrap76('A'.repeat(76), true), 'A'.repeat(76));
});

test('decoding binary data, data URIs and whitespace', () => {
  const d = decodeRows('AAEC/w==');
  assert.equal(d.rows[0].value, 'Not readable text (binary data); see hex below.');
  assert.equal(d.rows[1].value, '00 01 02 ff');
  assert.equal(decodeRows('data:text/plain;base64,aGk=').rows[0].value, 'hi');
  assert.equal(decodeRows('aG\nk=').rows[0].value, 'hi');
});

test('empty and invalid input', () => {
  assert.equal(decodeRows('  '), null);
  assert.throws(() => decodeRows('abc$'), /Not valid base64: only/);
  assert.throws(() => decodeRows('abcde'), /off by one character/);
});

test('file rows and data URI', () => {
  const r = fileRows('a.txt', 'text/plain', new Uint8Array([104, 105]));
  assert.equal(r.uri, 'data:text/plain;base64,aGk=');
  assert.equal(r.rows[0].value, 'a.txt · text/plain · 2 bytes');
  const u = fileRows('x', '', new Uint8Array([0]));
  assert.equal(u.uri, 'data:application/octet-stream;base64,AA==');
  assert.equal(u.rows[0].value, 'x · unknown type · 1 bytes');
});
