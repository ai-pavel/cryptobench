import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE, decodeToken, claimRows, expiryStatus, signatureRows, keyLabel, importParams, verifyNotice, verifySignature } from '../../src/dev/jwt-decoder/jwt-decoder.js';
import { InputError } from '../../src/dev/lib/ui.js';

// RFC 7515 appendix A.1: HS256 JWS and its JWK symmetric key ("k" is the base64url secret).
const RFC7515_A1 = 'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC7515_A1_K = 'AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow';

test('the jwt.io example decodes', () => {
  const p = decodeToken(SAMPLE);
  assert.deepEqual(p.header, { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(p.payload, { sub: '1234567890', name: 'John Doe', iat: 1516239022 });
  assert.equal(p.sig.length, 32);
  assert.deepEqual(decodeToken('Bearer ' + SAMPLE).payload, p.payload);
});

test('empty input gives no result', () => {
  assert.equal(decodeToken('   '), null);
});

test('malformed tokens throw', () => {
  assert.throws(() => decodeToken('a.b'), /3 parts separated by dots; this has 2/);
  assert.throws(() => decodeToken('a.b.c.d.e'), /encrypted token \(JWE/);
  assert.throws(() => decodeToken('!!.e30.'), /header isn't valid base64url/);
  assert.throws(() => decodeToken('e30.bm90IGpzb24.'), /payload isn't valid JSON/); // "not json"
  assert.throws(() => decodeToken('e30./w.'), /payload isn't valid UTF-8/);
});

test('claims and time claims', () => {
  const now = Date.UTC(2018, 0, 18, 1, 30, 22);
  const rows = claimRows({ sub: '1234567890', aud: ['a', 'b'], iat: 1516239022 }, now);
  assert.deepEqual(rows.map(r => [r.label, r.value]), [
    ['Subject (sub)', '1234567890'],
    ['Audience (aud)', '["a","b"]'],
    ['Issued at (iat)', '2018-01-18T01:30:22.000Z'],
  ]);
  assert.match(rows[2].note, / · now$/);
});

test('expiry status', () => {
  const now = 1300819380 * 1000;
  assert.deepEqual(expiryStatus({ exp: 1300819380 - 3600 }, now), { cls: 'status bad', text: 'Expired 1 hour ago.' });
  assert.deepEqual(expiryStatus({ exp: 1300819380 + 7200 }, now), { cls: 'status ok', text: 'Not expired: expires in 2 hours.' });
  assert.deepEqual(expiryStatus({ nbf: 1300819380 + 86400 }, now), { cls: 'status warn', text: 'Not valid yet: becomes valid tomorrow.' });
  assert.deepEqual(expiryStatus({}, now), { cls: 'status warn', text: 'No expiry (exp) claim.' });
});

test('signature rows and key label', () => {
  const rows = signatureRows({ alg: 'none' }, new Uint8Array());
  assert.equal(rows[1].value, '(empty)');
  assert.equal(rows[2].value, '0 bytes');
  assert.equal(keyLabel('HS512'), 'Secret');
  assert.equal(keyLabel('none'), 'No key needed (alg "none")');
  assert.match(keyLabel('RS256'), /^Public key/);
});

test('algorithm parameters', () => {
  assert.deepEqual(importParams('HS384'), { name: 'HMAC', hash: 'SHA-384' });
  assert.deepEqual(importParams('PS256'), { name: 'RSA-PSS', hash: 'SHA-256', saltLength: 32 });
  assert.deepEqual(importParams('ES512'), { name: 'ECDSA', namedCurve: 'P-521', hash: 'SHA-512' });
  assert.throws(() => importParams('HS1'), InputError);
});

test('verify notices', () => {
  assert.match(verifyNotice('none', '').text, /Unsigned token/);
  assert.equal(verifyNotice('HS256', ' ').text, 'Paste the key to check the signature.');
  assert.equal(verifyNotice('HS256', 'k'), null);
});

test('HS256: the jwt.io example verifies with its secret', async () => {
  const p = decodeToken(SAMPLE);
  assert.deepEqual(await verifySignature(p, 'your-256-bit-secret'), { cls: 'status ok', text: '✅ Signature verified.' });
  assert.deepEqual(await verifySignature(p, 'wrong'), { cls: 'status bad', text: '❌ Invalid signature for this key.' });
});

test('HS256: RFC 7515 A.1 verifies with its base64url secret', async () => {
  const p = decodeToken(RFC7515_A1);
  assert.equal(p.payload.iss, 'joe');
  assert.equal(p.payload.exp, 1300819380);
  assert.equal((await verifySignature(p, RFC7515_A1_K, true)).cls, 'status ok');
  assert.equal((await verifySignature(p, RFC7515_A1_K, false)).cls, 'status bad');
});

test('EdDSA: RFC 8037 A.4 verifies with its JWK', async () => {
  const segs = ['eyJhbGciOiJFZERTQSJ9', 'RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc', 'hgyY0il_MGCjP0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_MuM0KAg'];
  const sig = Uint8Array.from(Buffer.from(segs[2], 'base64url'));
  const jwk = '{"kty":"OKP","crv":"Ed25519","x":"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"}';
  assert.equal((await verifySignature({ segs, header: { alg: 'EdDSA' }, sig }, jwk)).cls, 'status ok');
});

test('RS256 with a PEM public key', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const b64u = s => Buffer.from(s).toString('base64url');
  const segs = [b64u('{"alg":"RS256"}'), b64u('{"sub":"x"}')];
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, Buffer.from(segs.join('.'))));
  segs.push(Buffer.from(sig).toString('base64url'));
  const spki = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString('base64');
  const pem = `-----BEGIN PUBLIC KEY-----\n${spki.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
  const p = decodeToken(segs.join('.'));
  assert.equal((await verifySignature(p, pem)).cls, 'status ok');
});

test('unusable keys give a message', async () => {
  const p = decodeToken('eyJhbGciOiJSUzI1NiJ9.e30.AA');
  assert.equal((await verifySignature(p, 'nope')).text, 'Paste a PEM public key or a JWK.');
  assert.match((await verifySignature(p, '-----BEGIN RSA PUBLIC KEY-----AA-----END RSA PUBLIC KEY-----')).text, /"RSA PUBLIC KEY" PEM isn't supported/);
  assert.equal((await verifySignature(p, '{"keys":[]}')).text, 'This is a JWK set; paste a single key from "keys".');
  assert.equal((await verifySignature(p, '{bad')).text, 'The JWK isn\'t valid JSON.');
  assert.match((await verifySignature(p, '{"kty":"RSA"}')).text, /^Couldn't use this key: /);
  const q = decodeToken('eyJhbGciOiJYWTEyMyJ9.e30.AA');
  assert.equal((await verifySignature(q, 'k')).text, 'Verifying "XY123" isn\'t supported here.');
});
