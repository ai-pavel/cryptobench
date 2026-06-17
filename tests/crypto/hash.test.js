import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ALGOS, FILE_ALGOS, hashBytes, normExpected, matchMessage, resultsTable } from '../../src/crypto/hash/hash.js';

// hash-wasm's UMD build is loaded with a <script> tag in the browser; in Node it is a CommonJS module.
const hw = createRequire(import.meta.url)('../../src/assets/vendor/hash-wasm@4.12.0/dist/index.umd.min.js');
const ALL = new Set(ALGOS.map(a => a[0]));
const abc = new TextEncoder().encode('abc');

// Published digests of "abc": FIPS 180-2 / 202, RFC 1321, RFC 7693, the Keccak team, BLAKE3 and RIPEMD-160 papers.
const ABC = {
  md5: '900150983cd24fb0d6963f7d28e17f72',
  sha1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
  sha224: '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7',
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  sha384: 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
  sha512: 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  sha512_256: '53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23',
  sha3_256: '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532',
  sha3_512: 'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0',
  keccak256: '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45',
  blake2b: 'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923',
  blake2s: '508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982',
  blake3: '6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85',
  ripemd160: '8eb208f7e05d987a9b044a8e98c6b087f15a0bfc',
};
const hexOf = b => Buffer.from(b).toString('hex');

test('every algorithm gives the published digest of "abc"', async () => {
  const res = await hashBytes(hw, abc, ALL);
  assert.deepEqual(res.map(r => r.id), ALGOS.map(a => a[0]));
  for (const r of res) if (ABC[r.id]) assert.equal(hexOf(r.bytes), ABC[r.id], r.name);
  assert.equal(res.find(r => r.id === 'keccak512').bytes.length, 64);
});

test('SHA-256 of the empty string (FIPS 180-4)', async () => {
  const [r] = await hashBytes(hw, new Uint8Array(), new Set(['sha256']));
  assert.equal(hexOf(r.bytes), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('only enabled algorithms run; files default to the usual four', async () => {
  const res = await hashBytes(hw, abc, new Set(FILE_ALGOS));
  assert.deepEqual(res.map(r => r.name), ['MD5', 'SHA-1', 'SHA-256', 'SHA-512']);
});

test('expected checksum formats', () => {
  assert.equal(normExpected('   '), null);
  assert.deepEqual(normExpected('0xBA:78:16'), { hex: 'ba7816' });
  assert.deepEqual(normExpected(`${ABC.sha256}  file.txt`), { hex: ABC.sha256 });
  assert.deepEqual(normExpected(`SHA256 (file.txt) = ${ABC.sha256.toUpperCase()}`), { hex: ABC.sha256 });
  assert.deepEqual(normExpected('kAFQmDzST7DWlj99KOF/cg=='), { hex: ABC.md5 }); // base64 of MD5("abc")
  assert.deepEqual(normExpected('not a hash!'), { bad: true });
});

test('match and mismatch messages', async () => {
  const res = await hashBytes(hw, abc, ALL);
  assert.equal(matchMessage(res, null), null);
  assert.equal(matchMessage([], normExpected(ABC.sha256)), null);
  assert.deepEqual(matchMessage(res, normExpected(ABC.sha256)), { ok: true, text: '✅ Match: SHA-256' });
  assert.deepEqual(matchMessage(res, { bad: true }), { ok: false, text: 'The expected hash is not hex or base64.' });
  const wrong = matchMessage(res, normExpected('00'.repeat(20)));
  assert.equal(wrong.ok, false);
  assert.equal(wrong.text, '❌ Mismatch. A 160-bit checksum is SHA-1 / RIPEMD-160 here, and it differs — the data is not the same.');
  const md5Only = await hashBytes(hw, abc, new Set(['md5']));
  assert.match(matchMessage(md5Only, normExpected('00'.repeat(32))).text, /A 256-bit checksum is usually SHA-256.*turn it on/);
  assert.equal(matchMessage(md5Only, normExpected('00'.repeat(5))).text, '❌ Mismatch. No common algorithm gives a 40-bit hash.');
});

test('results table encodes and highlights', async () => {
  const res = await hashBytes(hw, abc, new Set(['md5', 'sha256']));
  assert.equal(resultsTable([], 'hex', null), '');
  const html = resultsTable(res, 'base64', normExpected(ABC.md5));
  assert.match(html, /<tr class="hl-match"><th>MD5<div class="muted">128 bits<\/div>/);
  assert.match(html, /data-copy="kAFQmDzST7DWlj99KOF\/cg=="/);
  assert.match(html, /<tr class=""><th>SHA-256/);
});

test('bad input throws through parseBytes', async () => {
  const { parseBytes } = await import('../../src/crypto/lib/common.js');
  assert.throws(() => parseBytes('abz', 'hex', 'Input'), /Input is not valid hex/);
});
