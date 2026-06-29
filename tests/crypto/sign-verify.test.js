import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signOrVerify, readSig, keyLabel, lowSLabel, A, EXAMPLE } from '../../src/crypto/sign-verify/sign-verify.js';

const base = { label: 'X', msgEnc: 'utf8', prehashed: false, lowS: false, sig: '' };
const sign = o => signOrVerify({ ...base, mode: 'sign', ...o });
const verify = o => signOrVerify({ ...base, mode: 'verify', ...o });
const row = (res, label) => res.rows.find(r => r[0] === label)?.[1];
const VALID = { cls: 'big-result ok', text: '✅ Valid signature.' };
const INVALID = { cls: 'big-result bad', text: '❌ Invalid signature.' };

test('empty key or signature gives no result', async () => {
  assert.equal(await sign({ algo: 'ed25519', key: ' ', msg: 'x' }), null);
  assert.equal(await verify({ algo: 'ed25519', key: EXAMPLE.pub, msg: '72', msgEnc: 'hex' }), null);
});

test('Ed25519: RFC 8032 tests 1 and 2 (the Example)', async () => {
  const s2 = await sign({ algo: 'ed25519', key: EXAMPLE.priv, msg: EXAMPLE.msg, msgEnc: 'hex' });
  assert.equal(row(s2, 'Public key'), EXAMPLE.pub);
  assert.equal(row(s2, 'Signature (hex)'), EXAMPLE.sig);
  assert.equal(row(s2, 'Signature (base64)'), Buffer.from(EXAMPLE.sig, 'hex').toString('base64'));
  const s1 = await sign({ algo: 'ed25519', key: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', msg: '' });
  assert.equal(row(s1, 'Signature (hex)'), 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b');
  assert.deepEqual((await verify({ algo: 'ed25519', key: EXAMPLE.pub, msg: '72', msgEnc: 'hex', sig: EXAMPLE.sig })).verdict, VALID);
  assert.deepEqual((await verify({ algo: 'ed25519', key: EXAMPLE.pub, msg: '73', msgEnc: 'hex', sig: EXAMPLE.sig })).verdict, INVALID);
  // A PEM private key also works for verifying (test 1's key against test 1's signature).
  const pem = '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIJ1hsZ3v/VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g\n-----END PRIVATE KEY-----';
  assert.deepEqual((await verify({ algo: 'ed25519', key: pem, msg: '', sig: row(s1, 'Signature (hex)') })).verdict, VALID);
  await assert.rejects(verify({ algo: 'ed25519', key: EXAMPLE.pub, msg: '72', msgEnc: 'hex', sig: 'abcd' }), /An Ed25519 signature is 64 bytes; got 2/);
});

test('ECDSA P-256: RFC 6979 A.2.5, SHA-256, message "sample"', async () => {
  const key = 'c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721';
  const r = 'efd48b2aacb6a8fd1140dd9cd45e81d69d2c877b56aaf991c34d0ea84eaf3716';
  const s = 'f7cb1c942d657c41d436c7a1b6e29f65f3e900dbb9aff4064dc4ab2f843acda8';
  const res = await sign({ algo: 'ecdsa-p256', key, msg: 'sample' });
  assert.equal(row(res, 'Public key (compressed)'), '0360fed4ba255a9d31c961eb74c6356d68c049b8923b61fa6ce669622e60f29fb6');
  assert.equal(row(res, 'Signature r‖s (hex)'), r + s);
  assert.equal(row(res, 'r'), r);
  assert.deepEqual(res.rows.find(x => x[0] === 's'), ['s', s, 'high-S']);
  assert.match(row(res, 'Signature DER (hex)'), /^3046022100efd48b2a/);
  // Low-S normalization changes s; requiring low-S rejects the original high-S signature.
  const low = await sign({ algo: 'ecdsa-p256', key, msg: 'sample', lowS: true });
  assert.notEqual(row(low, 's'), s);
  const pub = row(res, 'Public key (compressed)');
  assert.deepEqual((await verify({ algo: 'ecdsa-p256', key: pub, msg: 'sample', sig: r + s })).verdict, VALID);
  assert.deepEqual((await verify({ algo: 'ecdsa-p256', key: pub, msg: 'sample', sig: row(res, 'Signature DER (base64)') })).verdict, VALID);
  assert.deepEqual((await verify({ algo: 'ecdsa-p256', key: pub, msg: 'sample', sig: r + s, lowS: true })).verdict,
    { cls: 'big-result bad', text: '⚠️ Mathematically valid, but high-S: rejected because low-S is required.' });
  assert.deepEqual((await verify({ algo: 'ecdsa-p256', key: pub, msg: 'test', sig: r + s })).verdict, INVALID);
  await assert.rejects(verify({ algo: 'ecdsa-p256', key: pub, msg: 'sample', sig: 'abcd' }), /A raw P-256 signature is 64 bytes; got 2/);
});

test('ECDSA secp256k1: private key 1, "Satoshi Nakamoto" (RFC 6979 nonce, low-S)', async () => {
  const res = await sign({ algo: 'ecdsa-k1', key: '00'.repeat(31) + '01', msg: 'Satoshi Nakamoto', lowS: true });
  assert.equal(row(res, 'Public key (compressed)'), '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
  assert.equal(row(res, 'Signature r‖s (hex)'), '934b1ea10a4b3c1757e2b0c017d0b6143ce3c9a7e6a4a49860d7a6ab210ee3d82442ce9d2b916064108014783e923ec36b49743e2ffa1c4496f01a512aafd9e5');
});

test('ECDSA prehashed digests', async () => {
  const key = 'c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721';
  const digest = 'af2bdbe1aa9b6ec1e2ade1d694f41fc71a831d0268e9891562113d8a62add1bf'; // SHA-256("sample")
  const res = await sign({ algo: 'ecdsa-p256', key, msg: digest, msgEnc: 'hex', prehashed: true });
  assert.equal(row(res, 'r'), 'efd48b2aacb6a8fd1140dd9cd45e81d69d2c877b56aaf991c34d0ea84eaf3716');
  await assert.rejects(sign({ algo: 'ecdsa-p256', key, msg: 'ab', msgEnc: 'hex', prehashed: true }), /A P-256 digest must be 32 bytes; got 1/);
});

test('Schnorr: BIP340 test vectors', async () => {
  // Vector 0: secret key 3, all-zero message.
  const v0 = { pk: 'f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9', msg: '00'.repeat(32), sig: 'e907831f80848d1069a5371b402410364bdf1c5f8307b0084c55f1ce2dca821525f66a4a85ea8b71e482a74f382d2ce5ebeee8fdb2172f477df4900d310536c0' };
  assert.deepEqual((await verify({ algo: 'schnorr', key: v0.pk, msg: v0.msg, msgEnc: 'hex', sig: v0.sig })).verdict, VALID);
  // Vector 1 is valid; vector 6 (same key and message) is not.
  const pk = 'dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659', msg = '243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89';
  assert.deepEqual((await verify({ algo: 'schnorr', key: pk, msg, msgEnc: 'hex', sig: '6896bd60eeae296db48a229ff71dfe071bde413e6d43f917dc8dcf8c78de33418906d11ac976abccb20b091292bff4ea897efcb639ea871cfa95f6de339e4b0a' })).verdict, VALID);
  assert.deepEqual((await verify({ algo: 'schnorr', key: pk, msg, msgEnc: 'hex', sig: 'fff97bd5755eeea420453a14355235d382f6472f8568a18b2f057a14602975563cc27944640ac607cd107ae10923d9ef7a73c643e166be5ebeafa34b1ac553e2' })).verdict, INVALID);
  // Signing uses random aux data, so check the x-only key and that the signature verifies.
  const s = await sign({ algo: 'schnorr', key: '00'.repeat(31) + '03', msg: v0.msg, msgEnc: 'hex' });
  assert.equal(row(s, 'Public key (x-only)'), v0.pk);
  assert.deepEqual((await verify({ algo: 'schnorr', key: v0.pk, msg: v0.msg, msgEnc: 'hex', sig: row(s, 'Signature (hex)') })).verdict, VALID);
  await assert.rejects(verify({ algo: 'schnorr', key: v0.pk, msg: v0.msg, msgEnc: 'hex', sig: '00' }), /A BIP340 signature is 64 bytes; got 1/);
});

// A 1024-bit RSA key and its signature over "hello" made with `openssl dgst -sha256 -sign`.
const RSA_KEY = `-----BEGIN PRIVATE KEY-----
MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAJRp8VTenqh3tBzj
WwiGggG4PdTp7Cn+eCeDuIdOdF1KZO8v5PQFw8w1QvQHVBHyDXFxJgtntlwM49/I
CDpg3y8it816WdSszAxdMK0Urx7szOqCYyv1NPZtg6LrM9L0jtSNUZ4uJzWY08lp
Dra8VYoMD7ymGeTSQnlJgoknTMd1AgMBAAECgYBHoq9SyLWKGWU9gFwDTHFaBSUL
LPHJ/0Ldx818udie4va/IL4BLvsoCRlNEnB4zP3CINw9Kw0xdyNSc4nNK87thEgL
32BjyW0zodczIpQ+0SuwL53iKRS9ENYFJWKgkBlNkfGxXnO4oNzHltZak3NbkUSE
iTZ7yGLWuohiwrt2bQJBAMN7GUo/5WMs+mNt7CWI6m10DihDr5MYPVpI25HUjkMx
u54Nxqxe879WsiMF6xZAwMDFGzC74INOMDuOU6pyeC8CQQDCXIgaWH+6yIVpQ9Fr
yJmx2avTNxgrk1aQkgcJSZigKM/51QQrhz87GdIfomjzS5c4A4VORU0pNmDihNVP
zm2bAkEAwjyvBHg5FjK7GdE/tIw3ZErNRnT7IM4VKID8rAro0Ru5sXM+1kgDKzya
BPL8hUASR3mTavlEPTST+JmTyOm1QQJAA3zVlGNyJ0/h1Pm6kEyRNXfKdYfPjzid
nQqBxdDkRDt3P+xqnr1WjSDxfE/Vwkfg9shZZAYqVEr9ghMQINZ7cQJAf0DTunIY
u19Ysddnst0t2xAqjEwUNCOeh5nglZEZx5uenfmqMu0STmQLkR8JHscsYJVUp4vs
g1qZ7e7Vy3RErw==
-----END PRIVATE KEY-----`;
const RSA_SIG = '50953fbd389a8be2c1fe6e9ed8ebdf9b297e0a48a7718b8b7c9fb7094740a13ba46b0b0addd94ec699363a903e3e7604a921b11280cb1988a7829134f4246595fad2b30b8d8ea9b4435fb8a30f0b10a41bc402de81acaa2f6a2910637ef56f23c0171c407f11ac2d754e8e40d45ed6378704c60c3a7376fce4ec0970e476acc5';

test('RSASSA-PKCS1-v1_5 matches OpenSSL; RSA-PSS round-trips', async () => {
  const res = await sign({ algo: 'rsa-pkcs1', key: RSA_KEY, msg: 'hello' });
  assert.equal(row(res, 'Signature (hex)'), RSA_SIG);
  const pub = row(res, 'Public key (SPKI PEM)');
  assert.match(pub, /^-----BEGIN PUBLIC KEY-----/);
  assert.deepEqual((await verify({ algo: 'rsa-pkcs1', key: pub, msg: 'hello', sig: RSA_SIG })).verdict, VALID);
  assert.deepEqual((await verify({ algo: 'rsa-pkcs1', key: pub, msg: 'hellO', sig: RSA_SIG })).verdict, INVALID);
  const pss = await sign({ algo: 'rsa-pss', key: RSA_KEY, msg: 'hello' });
  assert.deepEqual((await verify({ algo: 'rsa-pss', key: pub, msg: 'hello', sig: row(pss, 'Signature (base64)') })).verdict, VALID);
});

test('key errors', async () => {
  await assert.rejects(sign({ algo: 'ecdsa-p256', label: 'ECDSA P-256 (SHA-256)', key: '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIJ1hsZ3v/VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g\n-----END PRIVATE KEY-----', msg: 'x' }),
    /That is a Ed25519 key; ECDSA P-256 \(SHA-256\) needs P-256/);
  await assert.rejects(sign({ algo: 'rsa-pkcs1', key: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAPUAXw+hDiVqStwqnTRt+vJyYLM8uxJaMwM1V8Sr0Zgw=\n-----END PUBLIC KEY-----', msg: 'x' }), /That is a Ed25519 key; X needs RSA/);
  await assert.rejects(sign({ algo: 'ed25519', key: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAPUAXw+hDiVqStwqnTRt+vJyYLM8uxJaMwM1V8Sr0Zgw=\n-----END PUBLIC KEY-----', msg: 'x' }), /Signing needs a private key/);
  await assert.rejects(sign({ algo: 'ed25519', key: EXAMPLE.priv, msg: 'zz', msgEnc: 'hex' }), /Message is not valid hex/);
});

test('signature parsing and labels', () => {
  assert.equal(Buffer.from(readSig(' 0xABCD ')).toString('hex'), 'abcd');
  assert.equal(Buffer.from(readSig('q80')).toString('hex'), 'abcd'); // unpadded base64
  assert.throws(() => readSig(''), /Paste a signature/);
  assert.throws(() => readSig('!!'), /Signature is not hex or base64/);
  assert.equal(lowSLabel('sign'), 'Low-S (normalize s ≤ n/2)');
  assert.equal(keyLabel('verify', A.schnorr), 'Public key (32-byte x-only hex, hex, PEM or JWK; a private key also works)');
  assert.equal(keyLabel('sign', A.ed25519), 'Private key (hex, PEM or JWK)');
});
