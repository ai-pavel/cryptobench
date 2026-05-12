import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';
import { encryptFile, decryptFile, isEncrypted, strength, resultMessage, fmtSize, HEADER, ITERATIONS, VERSION } from '../../src/utilities/encrypt-files/encrypt-files.js';

const bytes = async blob => new Uint8Array(await blob.arrayBuffer());

// Build an .enc file independently with node:crypto, following the documented layout:
// TBXENC · version · iterations (BE u32) · salt(16) · IV(12) · AES-256-GCM(nameLen u16 · name · body) + tag, header as AAD.
function referenceEnc({ password, name, body, iterations = 1, salt = Buffer.alloc(16, 1), iv = Buffer.alloc(12, 2), version = 1 }) {
  const header = Buffer.alloc(39);
  header.write('TBXENC', 0, 'latin1'); header[6] = version;
  header.writeUInt32BE(iterations, 7); salt.copy(header, 11); iv.copy(header, 27);
  const key = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const nameBytes = Buffer.from(name, 'utf8'), len = Buffer.alloc(2);
  len.writeUInt16BE(nameBytes.length);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(header);
  const ct = Buffer.concat([c.update(Buffer.concat([len, nameBytes, Buffer.from(body)])), c.final(), c.getAuthTag()]);
  return new File([header, ct], name + '.enc');
}

test('RFC 7914 PBKDF2-HMAC-SHA256 vector (sanity check of the reference KDF)', () => {
  assert.equal(pbkdf2Sync('passwd', 'salt', 1, 64, 'sha256').toString('hex'),
    '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783');
});

test('decrypts a file built independently from the documented format', async () => {
  const f = referenceEnc({ password: 'correct horse', name: 'notes ✓.txt', body: 'hello world' });
  const out = await decryptFile(f, 'correct horse');
  assert.equal(out.name, 'notes ✓.txt');
  assert.equal(new TextDecoder().decode(await bytes(out.blob)), 'hello world');
});

test('encrypted output has the documented header and decrypts with node:crypto', async () => {
  const body = new Uint8Array(1000).map((_, i) => i & 255);
  const out = await encryptFile(new File([body], 'data.bin'), 'pw');
  assert.equal(out.name, 'data.bin.enc');
  const buf = Buffer.from(await bytes(out.blob));
  assert.equal(buf.subarray(0, 6).toString('latin1'), 'TBXENC');
  assert.equal(buf[6], VERSION);
  assert.equal(buf.readUInt32BE(7), ITERATIONS);
  assert.equal(buf.length, HEADER + 2 + 'data.bin'.length + body.length + 16);
  const key = pbkdf2Sync('pw', buf.subarray(11, 27), ITERATIONS, 32, 'sha256');
  const d = createDecipheriv('aes-256-gcm', key, buf.subarray(27, 39));
  d.setAAD(buf.subarray(0, HEADER)); d.setAuthTag(buf.subarray(buf.length - 16));
  const plain = Buffer.concat([d.update(buf.subarray(HEADER, buf.length - 16)), d.final()]);
  assert.equal(plain.readUInt16BE(0), 8);
  assert.equal(plain.subarray(2, 10).toString(), 'data.bin');
  assert.deepEqual(new Uint8Array(plain.subarray(10)), body);
});

test('round trip, wrong password and tampering', async () => {
  const enc = await encryptFile(new File(['secret'], 'a.txt'), 'pw1');
  const f = new File([enc.blob], enc.name);
  const dec = await decryptFile(f, 'pw1');
  assert.equal(dec.name, 'a.txt');
  assert.equal(await dec.blob.text(), 'secret');
  await assert.rejects(decryptFile(f, 'pw2'), /Wrong password, or the file is damaged\./);
  // Flipping a header byte (authenticated as AAD) must fail too.
  const buf = await bytes(enc.blob); buf[20] ^= 1;
  await assert.rejects(decryptFile(new File([buf], 'x.enc'), 'pw1'), /Wrong password/);
});

test('empty stored name falls back to the file name without .enc', async () => {
  const f = referenceEnc({ password: 'p', name: '', body: 'x' });
  const out = await decryptFile(new File([f], 'photo.JPG.ENC'), 'p');
  assert.equal(out.name, 'photo.JPG');
});

test('foreign files and unknown versions are rejected', async () => {
  await assert.rejects(decryptFile(new File(['just some text that is long enough to pass the size check'], 'x.enc'), 'p'), /Not a file encrypted with this tool\./);
  await assert.rejects(decryptFile(new File(['TBXENC'], 'x.enc'), 'p'), /Not a file encrypted/);
  const v2 = referenceEnc({ password: 'p', name: 'n', body: 'x', version: 2 });
  await assert.rejects(decryptFile(v2, 'p'), /Unsupported format version 2\./);
});

test('isEncrypted checks the magic and minimum length', () => {
  const head = new Uint8Array(HEADER); head.set(new TextEncoder().encode('TBXENC'));
  assert.equal(isEncrypted(head), true);
  assert.equal(isEncrypted(head.subarray(0, HEADER - 1)), false);
  head[0] = 0; assert.equal(isEncrypted(head), false);
});

test('password strength', () => {
  assert.deepEqual(strength(''), [0, '']);
  assert.deepEqual(strength('abc'), [0, 'Very weak']);
  assert.deepEqual(strength('Ab1!'), [1, 'Weak']); // short passwords cap at Weak
  assert.deepEqual(strength('abcdefgh'), [1, 'Weak']);
  assert.deepEqual(strength('abcdefgh1'), [2, 'Fair']);
  assert.deepEqual(strength('Abcdefgh1'), [3, 'Good']);
  assert.deepEqual(strength('Correct-Horse-Battery-9'), [4, 'Strong']);
});

test('result message and sizes', () => {
  assert.equal(resultMessage(1, 1, 'encrypt'), '1 of 1 file encrypted.');
  assert.equal(resultMessage(2, 3, 'decrypt'), '2 of 3 files decrypted.');
  assert.equal(fmtSize(2048), '2.0 KB');
});
