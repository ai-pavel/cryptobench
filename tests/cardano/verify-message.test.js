import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { verifyMessage, coseKeyPub, tamper, EXAMPLE } from '../../src/cardano/verify-message/verify-message.js';
import { bech32Decode, fromHex, toHex } from '../../src/cardano/lib/cardano.js';

// The Example key is the CIP-19 test vector payment key (addr_vk1w0l2…, from "test walk nut …").
const ADDR_VK = toHex(bech32Decode('addr_vk1w0l2sr2zgfm26ztc6nl9xy8ghsk5sh6ldwemlpmp9xylzy4dtf7st80zhd').bytes);
const PROTECTED = EXAMPLE.sig.slice(6, 6 + 0x46 * 2);  // 84 58 46 <protected header bytes>
const PAYLOAD = toHex(new TextEncoder().encode(EXAMPLE.message));
const SIGNATURE = EXAMPLE.sig.slice(-128);
const checks = r => r.checks.map(c => c.text);

test('empty signature gives no result', () => {
  assert.equal(verifyMessage({ sig: ' ', key: EXAMPLE.key }), null);
});

test('Example: valid signature from the address\'s payment key, message matches', () => {
  const r = verifyMessage({ sig: EXAMPLE.sig, key: EXAMPLE.key, expected: EXAMPLE.message });
  assert.deepEqual(checks(r), ['✓ Valid signature', '✓ Key matches the address\'s payment credential', '✓ Message matches']);
  assert.ok(r.checks.every(c => c.ok));
  const get = l => r.rows.find(x => x.label === l);
  assert.equal(get('Public key').value, ADDR_VK);
  assert.equal(get('Key hash').value, '9493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e');
  assert.equal(get('Key hash').note, 'addr_vkh1jjfnzhxe966a33psfenm0ct2udkkr569qf55v4uprgkgu8zsvmg');
  assert.equal(get('Message').value, EXAMPLE.message);
  assert.equal(get('Signing address').value, 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwqfjkjv7');
  assert.equal(get('Algorithm'), undefined);
});

test('Example: Node\'s Ed25519 verifies the COSE Sig_structure built by hand', () => {
  // ["Signature1", protected, h'', payload] (RFC 9052 section 4.4)
  const sigStructure = '84' + '6a' + toHex(new TextEncoder().encode('Signature1')) + '5846' + PROTECTED + '40' + '5820' + PAYLOAD;
  const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(fromHex(ADDR_VK)).toString('base64url') }, format: 'jwk' });
  assert.equal(verify(null, fromHex(sigStructure), key, fromHex(SIGNATURE)), true);
});

test('a bare 32-byte public key works like the COSE_Key', () => {
  assert.equal(toHex(coseKeyPub(EXAMPLE.key)), ADDR_VK);
  assert.deepEqual(checks(verifyMessage({ sig: EXAMPLE.sig, key: ADDR_VK })), ['✓ Valid signature', '✓ Key matches the address\'s payment credential']);
});

test('without a key the decoded rows are shown and no checks yet', () => {
  const r = verifyMessage({ sig: EXAMPLE.sig, key: '' });
  assert.equal(r.checks, null);
  assert.deepEqual(r.rows.map(x => x.label), ['Signing address', 'Message', 'Payload (hex)']);
});

test('Tamper: the signature fails after changing one character', () => {
  const t = tamper(EXAMPLE.sig);
  assert.notEqual(t, EXAMPLE.sig);
  assert.equal(t.length, EXAMPLE.sig.length);
  const r = verifyMessage({ sig: t, key: EXAMPLE.key, expected: EXAMPLE.message });
  assert.deepEqual(checks(r), ['✗ Invalid signature', '✓ Key matches the address\'s payment credential', '✗ Message differs from the expected one']);
  assert.equal(r.rows.find(x => x.label === 'Message').value, 'Sign in to example.com\nnonce: 43');
});

test('a different key does not match the signing address', () => {
  const other = '00'.repeat(31) + '01';
  assert.deepEqual(checks(verifyMessage({ sig: EXAMPLE.sig, key: other })).slice(1), ['✗ Key doesn\'t match the signing address']);
});

test('input errors throw', () => {
  assert.throws(() => verifyMessage({ sig: 'zz', key: '' }), /Not valid hex/);
  assert.throws(() => verifyMessage({ sig: '83010203', key: '' }), /This isn't a COSE_Sign1 structure/);
  assert.throws(() => verifyMessage({ sig: EXAMPLE.sig, key: 'abcd' }), /neither a 32-byte public key nor valid COSE_Key CBOR|A COSE_Key is a CBOR map/);
  assert.throws(() => coseKeyPub('a10102'), /COSE_Key type 2 isn't OKP \(1\)\./);
  assert.throws(() => coseKeyPub('a201012001'), /COSE_Key curve 1 isn't Ed25519 \(6\)\./);
  assert.throws(() => coseKeyPub('a10101'), /no 32-byte public key \(label -2\)/);
  // Detached payload (null): the rows say so, and verifying needs the payload.
  const detached = '84' + '40' + 'a0' + 'f6' + '5840' + '00'.repeat(64);
  assert.equal(verifyMessage({ sig: detached, key: '' }).rows[1].value, '(detached: not included in the signature)');
  assert.throws(() => verifyMessage({ sig: detached, key: EXAMPLE.key }), /The payload is detached/);
});
