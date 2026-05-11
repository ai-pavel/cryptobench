import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync as nodeGzip } from 'node:zlib';
import {
  uniquePath, zipTime, zipName, zipFlags, readZip, isTar, readTar, readArchive,
  archiveBase, openedMessage, filterEntries, repackTree, baseName, fmtSize,
} from '../../src/utilities/archive/archive.js';

// The page uses the vendored fflate UMD build as a global; the ESM build is the same library.
before(async () => { globalThis.fflate = await import('../../src/assets/vendor/fflate@0.8.3/esm/browser.js'); });

const te = new TextEncoder(), td = new TextDecoder();
const text = e => td.decode(e.data);

// A minimal POSIX ustar header block (+ data blocks), checksum included.
function tarEntry(name, data, { type = '0', prefix = '', ustar = true, size } = {}) {
  data = typeof data === 'string' ? te.encode(data) : data;
  const h = new Uint8Array(512);
  const put = (s, o) => h.set(te.encode(s), o);
  put(name, 0); put('0000644\0', 100); put('0000000\0', 108); put('0000000\0', 116);
  if (size instanceof Uint8Array) h.set(size, 124); else put((size ?? data.length).toString(8).padStart(11, '0') + '\0', 124);
  put('00000000000\0', 136); h[156] = type.charCodeAt(0);
  if (ustar) { put('ustar\0', 257); put('00', 263); }
  if (prefix) put(prefix, 345);
  h.fill(32, 148, 156);
  put(h.reduce((s, b) => s + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
  const body = new Uint8Array(Math.ceil(data.length / 512) * 512); body.set(data);
  return [h, body];
}
const tar = (...entries) => {
  const parts = [...entries.flat(), new Uint8Array(1024)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

test('uniquePath numbers clashing names before the extension', () => {
  const taken = new Set(['a.txt', 'dir/b']);
  assert.equal(uniquePath('a.txt', taken), 'a (2).txt');
  assert.equal(uniquePath('a.txt', taken), 'a (3).txt');
  assert.equal(uniquePath('dir/b', taken), 'dir/b (2)');
  assert.equal(uniquePath('new.md', taken), 'new.md');
  assert.ok(taken.has('new.md'));
  // Dots in folder names are not treated as extensions.
  assert.equal(uniquePath('v1.2/readme', new Set(['v1.2/readme'])), 'v1.2/readme (2)');
});

test('zipTime clamps to the DOS date range', () => {
  assert.equal(zipTime(0 + Date.UTC(1970, 0, 1) + 1), Date.UTC(1980, 0, 2));
  assert.equal(zipTime(Date.UTC(2200, 0, 1)), Date.UTC(2099, 11, 30));
  assert.equal(zipTime(Date.UTC(2024, 5, 1)), Date.UTC(2024, 5, 1));
});

test('zipName adds .zip and defaults to archive', () => {
  assert.equal(zipName('  '), 'archive.zip');
  assert.equal(zipName('photos'), 'photos.zip');
  assert.equal(zipName('photos.ZIP'), 'photos.ZIP');
});

test('ZIP round trip through readArchive skips folder entries', async () => {
  const zip = fflate.zipSync({ 'a.txt': te.encode('hello'), 'dir/': new Uint8Array(0), 'dir/b.txt': te.encode('world') });
  const entries = await readArchive(zip, 'x.zip');
  assert.deepEqual(entries.map(e => [e.path, text(e)]), [['a.txt', 'hello'], ['dir/b.txt', 'world']]);
  assert.deepEqual(zipFlags(zip), { encrypted: false });
});

test('encrypted ZIP entries are detected from the central directory', async () => {
  const zip = fflate.zipSync({ 'a.txt': te.encode('hello') });
  const cd = zip.findLastIndex((_, i) => zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 1 && zip[i + 3] === 2);
  zip[cd + 8] |= 1; // general purpose flag bit 0: encrypted
  assert.deepEqual(zipFlags(zip), { encrypted: true });
  await assert.rejects(readArchive(zip, 'x.zip'), /password-protected/);
  const aes = fflate.zipSync({ 'a.txt': te.encode('hello') });
  aes[cd + 10] = 99; aes[cd + 11] = 0; // compression method 99: WinZip AES
  assert.equal(zipFlags(aes).encrypted, true);
});

test('ZIP without an end of central directory is damaged', async () => {
  await assert.rejects(readArchive(te.encode('PK\x03\x04 broken'), 'x.zip'), /This ZIP file is damaged \(no central directory\)\./);
});

test('ustar: regular files, prefix field, folders and links skipped', () => {
  const buf = tar(
    tarEntry('dir/', '', { type: '5' }),
    tarEntry('a.txt', 'A'.repeat(600)),
    tarEntry('name.txt', 'p', { prefix: 'very/long' }),
    tarEntry('link', '', { type: '2' }),
    tarEntry('c.bin', 'c', { type: '7' }),
  );
  assert.equal(isTar(buf), true);
  const entries = readTar(buf);
  assert.deepEqual(entries.map(e => [e.path, e.data.length]), [['a.txt', 600], ['very/long/name.txt', 1], ['c.bin', 1]]);
});

test('GNU long names (L) and pax paths (x) override the header name', () => {
  const long = 'd/'.repeat(80) + 'file.txt';
  const pax = `${long.length + 11} path=${long}\n`;
  const buf = tar(
    tarEntry('././@LongLink', long + '\0', { type: 'L' }), tarEntry(long.slice(0, 99), 'one'),
    tarEntry('PaxHeader', pax, { type: 'x' }), tarEntry('short', 'two'),
    tarEntry('plain', 'three'),
  );
  assert.deepEqual(readTar(buf).map(e => [e.path, text(e)]), [[long, 'one'], [long, 'two'], ['plain', 'three']]);
});

test('base-256 sizes and truncation', () => {
  const size = new Uint8Array(12); size[0] = 0x80; size[11] = 5;
  assert.deepEqual(readTar(tar(tarEntry('big', 'hello', { size }))).map(text), ['hello']);
  const cut = tar(tarEntry('a', 'x'.repeat(1000))).subarray(0, 512 + 600);
  assert.throws(() => readTar(cut), /This TAR file is truncated\./);
});

test('TAR.GZ and plain GZ (RFC 1952) via readArchive', async () => {
  const tgz = nodeGzip(tar(tarEntry('in.txt', 'inside')));
  assert.deepEqual((await readArchive(tgz, 'x.tgz')).map(e => [e.path, text(e)]), [['in.txt', 'inside']]);
  const gz = nodeGzip(te.encode('just text'));
  assert.deepEqual((await readArchive(gz, 'notes.txt.gz')).map(e => [e.path, text(e)]), [['notes.txt', 'just text']]);
  assert.equal((await readArchive(gz, 'bundle.TGZ'))[0].path, 'bundle.tar');
  assert.equal((await readArchive(gz, '.gz'))[0].path, 'file');
  await assert.rejects(readArchive(new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3]), 'x.gz'), /This GZIP file is damaged\./);
});

test('unsupported formats', async () => {
  await assert.rejects(readArchive(te.encode('Rar!\x1a\x07\x00'), 'x.rar'), /RAR archives are not supported/);
  await assert.rejects(readArchive(new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]), 'x.7z'), /7-Zip archives are not supported/);
  await assert.rejects(readArchive(te.encode('hello'), 'x.txt'), /This file is not a supported archive\. Supported: ZIP, TAR, TAR\.GZ, GZ\./);
});

test('archive names, messages and filtering', () => {
  assert.equal(archiveBase('photos.tar.gz'), 'photos');
  assert.equal(archiveBase('photos.TGZ'), 'photos');
  assert.equal(archiveBase('.zip'), 'archive');
  assert.equal(archiveBase('notes.txt'), 'notes.txt');
  assert.equal(baseName('a/b/c.txt'), 'c.txt');
  const entries = [{ path: 'Docs/A.txt', data: new Uint8Array(2048) }, { path: 'img/b.png', data: new Uint8Array(1) }];
  assert.equal(openedMessage('x.zip', entries), 'x.zip: 2 files, 2.0 KB unpacked.');
  assert.equal(openedMessage('x.zip', entries.slice(1)), 'x.zip: 1 file, 1 B unpacked.');
  assert.deepEqual(filterEntries(entries, ' docs '), [0]);
  assert.deepEqual(filterEntries(entries, ''), [0, 1]);
  assert.deepEqual(filterEntries(entries, 'zzz'), []);
  assert.equal(fmtSize(1048576), '1.0 MB');
});

test('repacking strips leading slashes and stores without compression', async () => {
  const tree = repackTree([{ path: '/abs/a.txt', data: te.encode('a') }]);
  assert.deepEqual(Object.keys(tree), ['abs/a.txt']);
  const zip = fflate.zipSync(tree);
  assert.deepEqual((await readZip(zip)).map(e => [e.path, text(e)]), [['abs/a.txt', 'a']]);
});
