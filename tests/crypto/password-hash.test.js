import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { hashParams, parseSalt, hashLabel, detect, verdictText, UNRECOGNIZED } from '../../src/crypto/password-hash/password-hash.js';

// worker.js uses hash-wasm's UMD build; in Node it loads as a CommonJS module.
const hw = createRequire(import.meta.url)('../../src/assets/vendor/hash-wasm@4.12.0/dist/index.umd.min.js');
const EXAMPLE = '$argon2id$v=19$m=19456,t=2,p=1$ZXhhbXBsZXNhbHQxMjM0NQ$28IdljkIUO5ULliXQ4F53vIBk+Jzbs82ppnGNfykamY';
const fields = o => id => String(o[id]);
const DEFAULTS = { m: 19456, t: 2, p: 1, len: 32, cost: 10, ln: 15, r: 8, sp: 1, slen: 32 };

test('parameters from the form fields', () => {
  assert.deepEqual(hashParams('argon2id', fields(DEFAULTS)), { m: 19456, t: 2, p: 1, len: 32 });
  assert.deepEqual(hashParams('bcrypt', fields(DEFAULTS)), { cost: 10 });
  assert.deepEqual(hashParams('scrypt', fields(DEFAULTS)), { ln: 15, r: 8, p: 1, len: 32 });
});

test('parameter range errors', () => {
  assert.throws(() => hashParams('argon2i', fields({ ...DEFAULTS, p: 17 })), /^Error: Parallelism must be a whole number from 1 to 16\.$/);
  // Argon2 memory must be at least 8 KiB per lane.
  assert.throws(() => hashParams('argon2d', fields({ ...DEFAULTS, p: 4, m: 31 })), /Memory must be a whole number from 32 to 4194304\./);
  assert.throws(() => hashParams('argon2id', fields({ ...DEFAULTS, t: 1.5 })), /Iterations must be a whole number/);
  assert.throws(() => hashParams('bcrypt', fields({ ...DEFAULTS, cost: 3 })), /Cost must be a whole number from 4 to 31\./);
  assert.throws(() => hashParams('scrypt', fields({ ...DEFAULTS, ln: 25 })), /log₂ N must be a whole number from 1 to 24\./);
  assert.throws(() => hashParams('scrypt', fields({ ...DEFAULTS, slen: 8 })), /Hash length must be a whole number from 16 to 128\./);
  assert.throws(() => hashParams('scrypt', fields({ ...DEFAULTS, r: '' })), /Block size/);
});

test('salt parsing and checks', () => {
  assert.equal(parseSalt('argon2id', '').length, 16);
  assert.notDeepEqual(parseSalt('scrypt', ' '), parseSalt('scrypt', ' '));
  assert.deepEqual([...parseSalt('argon2id', '6578616d706c6573')], [...Buffer.from('examples')]);
  assert.throws(() => parseSalt('bcrypt', '00'.repeat(15)), /bcrypt needs a 16-byte salt\./);
  assert.throws(() => parseSalt('argon2i', '00'.repeat(7)), /Argon2 needs a salt of at least 8 bytes\./);
  assert.equal(parseSalt('scrypt', '00').length, 1);
  assert.throws(() => parseSalt('scrypt', 'zz'), /Salt is not valid hex\./);
});

test('output labels and verdicts', () => {
  assert.equal(hashLabel('bcrypt'), 'bcrypt hash');
  assert.equal(hashLabel('scrypt'), 'scrypt hash (PHC)');
  assert.equal(hashLabel('argon2id'), 'argon2id hash (PHC)');
  assert.equal(verdictText(true), '✅ The password matches this hash.');
  assert.equal(verdictText(false), '❌ The password does not match.');
});

test('detecting hash strings', () => {
  assert.deepEqual(detect(EXAMPLE), { kind: 'argon2', rows: [['Algorithm', 'argon2id'], ['Version', '1.3 (19)'], ['Memory', '19456 KiB'], ['Iterations', '2'], ['Parallelism', '1']] });
  assert.equal(detect('$argon2i$v=16$m=64,t=1,p=1$c2FsdHNhbHQ$aGFzaA').rows[1][1], '16');
  // OpenBSD bcrypt test vector for "U*U".
  assert.deepEqual(detect('$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW'), { kind: 'bcrypt', rows: [['Algorithm', 'bcrypt ($2a$)'], ['Cost', '05 (2^05 rounds)']] });
  assert.deepEqual(detect('$scrypt$ln=10,r=8,p=16$TmFDbA$/bq+HJ00cgB4VucZDQHp/nxq18vII3gw53N2Y0s3MWIurzDZLiKjiG/xCSedmDDaxyevuUqD7m2DYMvfoswGQA'),
    { kind: 'scrypt', rows: [['Algorithm', 'scrypt'], ['N', '2^10'], ['r', '8'], ['p', '16']] });
  assert.equal(detect('$2b$10$tooshort'), null);
  assert.equal(detect('5f4dcc3b5aa765d61d8327deb882cf99'), null);
  assert.match(UNRECOGNIZED, /^Unrecognized hash string\./);
});

test('the Example hash is Argon2id of the Example password and salt', async () => {
  const salt = parseSalt('argon2id', '6578616d706c6573616c743132333435');
  const p = hashParams('argon2id', fields(DEFAULTS));
  const h = await hw.argon2id({ password: 'correct horse battery staple', salt, parallelism: p.p, iterations: p.t, memorySize: p.m, hashLength: p.len, outputType: 'encoded' });
  assert.equal(h, EXAMPLE);
  assert.equal(await hw.argon2Verify({ password: 'correct horse battery staple', hash: EXAMPLE }), true);
  assert.equal(await hw.argon2Verify({ password: 'wrong', hash: EXAMPLE }), false);
});

test('the scrypt PHC string above holds the RFC 7914 vector', async () => {
  const h = await hw.scrypt({ password: 'password', salt: 'NaCl', costFactor: 1024, blockSize: 8, parallelism: 16, hashLength: 64, outputType: 'hex' });
  assert.equal(h, 'fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640');
  assert.equal(Buffer.from(h, 'hex').toString('base64').replace(/=+$/, ''), '/bq+HJ00cgB4VucZDQHp/nxq18vII3gw53N2Y0s3MWIurzDZLiKjiG/xCSedmDDaxyevuUqD7m2DYMvfoswGQA');
});

test('the OpenBSD bcrypt vector verifies', async () => {
  assert.equal(await hw.bcryptVerify({ password: 'U*U', hash: '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW' }), true);
});
