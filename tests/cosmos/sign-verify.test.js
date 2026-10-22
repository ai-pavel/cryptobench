import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify as nodeVerify } from 'node:crypto';
import { signDoc, sortedJson, escapeJson, dataBytes, privateKey, isMnemonicInput, signArbitrary, verifyArbitrary } from '../../src/cosmos/sign-verify/sign-verify.js';
import { encodeBech32, decodeBech32 } from '../../src/cosmos/lib/cosmos.js';

// The "abandon … about" test mnemonic's first Cosmos account (m/44'/118'/0'/0/0).
const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const KEY = 'c4a48e2fce1481cd3294b4490f6678090ea98d3d0e5cd984558ab0968741b104';
const PUB = 'Ak9OKtmcNNYLm6YoPJQxqEGK+GcyEpYfl6d7Y3f80Fti';
const ADDR = 'cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4';
const DATA = 'Sign in to example.com';
// Keplr's signArbitrary(…, ADDR, DATA) for this key (RFC 6979, so deterministic).
const SIG = 'k1TCYs+EWgHI1ZEc8eYdJZbHB8o+VPYzEGUr7PBbeaxbbmyy/5goYer/WBoViMwwQUO8oYci7I4V5VAU1QKLNw==';

// Verify with Node's own ECDSA as an independent check: SPKI header for a compressed secp256k1 key.
const spki = pub => createPublicKey({ key: Buffer.concat([Buffer.from('3036301006072a8648ce3d020106052b8104000a032200', 'hex'), Buffer.from(pub, 'base64')]), format: 'der', type: 'spki' });

test('ADR-36 sign doc: sorted keys, empty fee, base64 data', () => {
  assert.equal(signDoc(ADDR, new TextEncoder().encode(DATA)),
    '{"account_number":"0","chain_id":"","fee":{"amount":[],"gas":"0"},"memo":"","msgs":[{"type":"sign/MsgSignData","value":{"data":"U2lnbiBpbiB0byBleGFtcGxlLmNvbQ==","signer":"' + ADDR + '"}}],"sequence":"0"}');
});

test('amino JSON helpers', () => {
  assert.equal(sortedJson({ b: 1, a: [{ d: 'x', c: null }] }), '{"a":[{"c":null,"d":"x"}],"b":1}');
  assert.equal(escapeJson('{"m":"<a&b>"}'), '{"m":"\\u003ca\\u0026b\\u003e"}');
});

test('data encodings', () => {
  assert.deepEqual(dataBytes('hi', 'text'), new TextEncoder().encode('hi'));
  assert.deepEqual(dataBytes('6869', 'hex'), Uint8Array.of(0x68, 0x69));
  assert.deepEqual(dataBytes('aGk=', 'base64'), Uint8Array.of(0x68, 0x69));
  assert.deepEqual(dataBytes(' ', 'hex'), new Uint8Array());
  assert.throws(() => dataBytes('zz', 'hex'), /Data is not valid hex/);
});

test('Example: sign in to example.com', () => {
  const r = signArbitrary({ keyText: KEY, prefix: 'cosmos', data: DATA, enc: 'text' });
  assert.equal(r.signer, ADDR);
  assert.deepEqual(r.std, { pub_key: { type: 'tendermint/PubKeySecp256k1', value: PUB }, signature: SIG });
  assert.ok(nodeVerify('sha256', Buffer.from(r.doc), { key: spki(PUB), dsaEncoding: 'ieee-p1363' }, Buffer.from(SIG, 'base64')));
});

test('a mnemonic signs with its m/44\'/118\'/0\'/0/i key', () => {
  assert.equal(isMnemonicInput(ABANDON), true);
  assert.equal(isMnemonicInput(KEY), false);
  const k = privateKey(ABANDON, 0);
  assert.equal(Buffer.from(k.key).toString('hex'), KEY);
  assert.equal(k.from, "mnemonic, m/44'/118'/0'/0/0");
  assert.equal(signArbitrary({ keyText: ABANDON, index: '0', prefix: 'cosmos', data: DATA, enc: 'text' }).std.signature, SIG);
  assert.notEqual(signArbitrary({ keyText: ABANDON, index: '1', prefix: 'cosmos', data: DATA, enc: 'text' }).signer, ADDR);
});

test('invalid private keys throw', () => {
  assert.throws(() => privateKey(ABANDON.replace('about', 'abandon')), /not valid BIP39/);
  assert.throws(() => privateKey(ABANDON, '-1'), /Account index must be a whole number/);
  assert.throws(() => privateKey('abcd'), /Private key is 2 bytes/);
  assert.throws(() => privateKey('00'.repeat(32)), /out of range/);
  assert.throws(() => privateKey('ff'.repeat(32)), /out of range/);
});

test('Example: verify a Keplr signature', () => {
  const r = verifyArbitrary({ addr: ADDR, data: DATA, enc: 'text', sig: SIG, pub: PUB });
  assert.deepEqual(r, { valid: true, sigOk: true, keyMatches: true, derivedAddress: ADDR });
  // The same signature as StdSignature JSON, with the key inside.
  const json = JSON.stringify({ pub_key: { type: 'tendermint/PubKeySecp256k1', value: PUB }, signature: SIG });
  assert.equal(verifyArbitrary({ addr: ADDR, data: DATA, enc: 'text', sig: json }).valid, true);
  // The same bytes given as hex.
  assert.equal(verifyArbitrary({ addr: ADDR, data: Buffer.from(DATA).toString('hex'), enc: 'hex', sig: SIG, pub: PUB }).valid, true);
});

test('tampered data, another signer, or another key is invalid', () => {
  const changed = verifyArbitrary({ addr: ADDR, data: DATA + '!', enc: 'text', sig: SIG, pub: PUB });
  assert.equal(changed.valid, false); assert.equal(changed.sigOk, false); assert.equal(changed.keyMatches, true);
  const otherKey = signArbitrary({ keyText: '01'.repeat(32), prefix: 'cosmos', data: DATA, enc: 'text' });
  const wrongSigner = verifyArbitrary({ addr: otherKey.signer, data: DATA, enc: 'text', sig: SIG, pub: PUB });
  assert.equal(wrongSigner.valid, false); assert.equal(wrongSigner.keyMatches, false);
  const roundTrip = verifyArbitrary({ addr: otherKey.signer, data: DATA, enc: 'text', sig: JSON.stringify(otherKey.std) });
  assert.equal(roundTrip.valid, true);
});

test('empty fields give no result; malformed input throws', () => {
  assert.equal(verifyArbitrary({ addr: '', data: DATA, enc: 'text', sig: SIG }), null);
  assert.equal(verifyArbitrary({ addr: ADDR, data: DATA, enc: 'text', sig: ' ' }), null);
  const valoper = encodeBech32('cosmosvaloper', decodeBech32(ADDR).bytes);
  assert.throws(() => verifyArbitrary({ addr: valoper, data: DATA, enc: 'text', sig: SIG, pub: PUB }), /not a validator address/);
  assert.throws(() => verifyArbitrary({ addr: ADDR, data: DATA, enc: 'text', sig: '{oops' }), /isn't valid JSON/);
  assert.throws(() => verifyArbitrary({ addr: ADDR, data: DATA, enc: 'text', sig: '{"pub_key":{}}' }), /no "signature" field/);
  assert.throws(() => verifyArbitrary({ addr: ADDR, data: DATA, enc: 'text', sig: SIG }), /A public key is needed/);
  assert.throws(() => verifyArbitrary({ addr: ADDR, data: DATA, enc: 'text', sig: 'AAAA', pub: PUB }), /Signature is 2 bytes/);
  assert.throws(() => verifyArbitrary({ addr: ADDR, data: DATA, enc: 'text', sig: SIG, pub: 'AAAA' }), /not a valid secp256k1 point/);
  assert.throws(() => verifyArbitrary({ addr: ADDR.slice(0, -1) + 'x', data: DATA, enc: 'text', sig: SIG, pub: PUB }), /Signer address/);
});
