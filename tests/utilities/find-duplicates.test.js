import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { sizeCandidates, findDuplicates, scanSummary, toCsv, fmtSize, CHUNK } from '../../src/utilities/find-duplicates/find-duplicates.js';

// The page loads the vendored hash-wasm UMD build; it also loads in Node via require.
const require = createRequire(import.meta.url);
const hashwasm = require('../../src/assets/vendor/hash-wasm@4.12.0/dist/index.umd.min.js');

const item = (path, content) => ({ path, file: new Blob([content]) });
// FIPS 180-2 SHA-256 test vector for "abc".
const SHA_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

test('only non-empty files with a shared size are candidates', () => {
  const items = [item('a', 'abc'), item('b', 'xyz'), item('c', 'abcd'), item('e1', ''), item('e2', '')];
  assert.deepEqual(sizeCandidates(items).map(it => it.path), ['a', 'b']);
});

test('identical contents are grouped with their SHA-256', async () => {
  const items = [item('z/copy.txt', 'abc'), item('a/orig.txt', 'abc'), item('other.txt', 'xyz')];
  const groups = await findDuplicates(sizeCandidates(items), await hashwasm.createSHA256());
  assert.deepEqual(groups, [{ hash: SHA_ABC, size: 3, paths: ['a/orig.txt', 'z/copy.txt'] }]);
});

test('groups are sorted by wasted bytes, biggest first', async () => {
  const big = 'x'.repeat(100), small = 'y'.repeat(10);
  const items = [item('s1', small), item('s2', small), item('s3', small), item('b1', big), item('b2', big)];
  const groups = await findDuplicates(sizeCandidates(items), await hashwasm.createSHA256());
  assert.deepEqual(groups.map(g => [g.size, g.paths.length]), [[100, 2], [10, 3]]);
});

test('files bigger than a chunk are hashed in pieces and report progress', async () => {
  const data = new Uint8Array(CHUNK + 5).fill(7);
  const items = [{ path: 'a', file: new Blob([data]) }, { path: 'b', file: new Blob([data]) }];
  const seen = [], files = [];
  const groups = await findDuplicates(items, await hashwasm.createSHA256(), {
    onBytes: (d, t) => seen.push([d, t]), onFile: (i, n) => files.push([i, n]),
  });
  assert.equal(groups.length, 1);
  assert.deepEqual(files, [[0, 2], [1, 2]]);
  assert.deepEqual(seen.at(-1), [2 * (CHUNK + 5), 2 * (CHUNK + 5)]);
  assert.equal(seen.length, 4);
});

test('a cancelled scan returns null', async () => {
  const items = [item('a', 'abc'), item('b', 'abc')];
  assert.equal(await findDuplicates(items, await hashwasm.createSHA256(), { cancelled: () => true }), null);
});

test('summary messages', () => {
  assert.deepEqual(scanSummary([], 1, 0), { status: 'Scanned 1 file.', summary: 'No duplicates found. 🎉' });
  const groups = [{ hash: 'h', size: 2048, paths: ['a', 'b', 'c'] }, { hash: 'g', size: 10, paths: ['d', 'e'] }];
  assert.deepEqual(scanSummary(groups, 7, 2), {
    status: 'Scanned 7 files. 2 empty files skipped.',
    summary: '2 duplicate groups · 3 extra copies · 4.0 KB wasted',
  });
  assert.equal(scanSummary([groups[1]], 2, 1).summary, '1 duplicate group · 1 extra copy · 10 B wasted');
  assert.equal(scanSummary([], 2, 1).status, 'Scanned 2 files. 1 empty file skipped.');
});

test('CSV escapes commas, quotes and newlines (RFC 4180)', () => {
  const csv = toCsv([{ hash: 'abc', size: 3, paths: ['plain.txt', 'a,b.txt', 'say "hi".txt', 'two\nlines'] }]);
  assert.equal(csv, 'group,sha256,size_bytes,path\n1,abc,3,plain.txt\n1,abc,3,"a,b.txt"\n1,abc,3,"say ""hi"".txt"\n1,abc,3,"two\nlines"\n');
  assert.equal(toCsv([]), 'group,sha256,size_bytes,path\n');
});

test('fmtSize', () => {
  assert.equal(fmtSize(0), '0 B');
  assert.equal(fmtSize(1023), '1023 B');
  assert.equal(fmtSize(1536), '1.5 KB');
  assert.equal(fmtSize(5 * 1048576), '5.0 MB');
  assert.equal(fmtSize(3 * 1073741824), '3.00 GB');
});
