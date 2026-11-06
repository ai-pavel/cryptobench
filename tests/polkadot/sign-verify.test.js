import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EX_DEV, msgBytes, signMessage, verifyMessage, verifyHtml, exampleVerify } from '../../src/polkadot/sign-verify/sign-verify.js';
import { fromHex } from '../../src/polkadot/lib/dot.js';

const ALICE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const alice = o => signMessage({ phrase: EX_DEV, path: '//Alice', type: 'sr25519', enc: 'text', msg: 'Hello Polkadot', wrap: true, ...o });
const row = (rows, k) => rows.find(r => r && r[0] === k);

// RFC 8032 section 7.1, Ed25519 tests 1 and 2.
const RFC = [
  { sk: '0x9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', pk: '0xd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', msg: '',
    sig: '0xe5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b' },
  { sk: '0x4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', pk: '0x3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c', msg: '72',
    sig: '0x92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00' },
];

test('message bytes: text is UTF-8, hex is decoded', () => {
  assert.deepEqual([...msgBytes('text', 'hi')], [0x68, 0x69]);
  assert.deepEqual([...msgBytes('hex', '0x6869')], [0x68, 0x69]);
  assert.throws(() => msgBytes('hex', 'xyz'));
});

test('RFC 8032 Ed25519 vectors sign and verify', () => {
  for (const v of RFC) {
    const s = signMessage({ phrase: v.sk, path: '', type: 'ed25519', enc: 'hex', msg: v.msg, wrap: false });
    assert.equal(s.sig, v.sig);
    assert.equal(row(s.rows, 'Public key')[1], v.pk);
    assert.equal(row(s.rows, 'Signed bytes')[2].note, 'the message as is');
    const { result } = verifyMessage({ addr: v.pk, enc: 'hex', msg: v.msg, sig: v.sig });
    assert.deepEqual(result, { type: 'ed25519', wrapped: false, multi: false });
  }
});

test('example: sign as //Alice (sr25519, wrapped) and verify', () => {
  const s = alice();
  assert.equal(s.addr, ALICE);
  assert.match(s.sig, /^0x[0-9a-f]{128}$/);
  assert.equal(row(s.rows, 'Signature')[2].note, '64 bytes, sr25519');
  assert.equal(row(s.rows, 'Signed bytes')[1], '0x' + Buffer.from('<Bytes>Hello Polkadot</Bytes>').toString('hex'));
  assert.equal(row(s.rows, 'Signed hash'), undefined);
  const v = verifyMessage({ addr: s.addr, enc: 'text', msg: 'Hello Polkadot', sig: s.sig });
  assert.deepEqual(v.result, { type: 'sr25519', wrapped: true, multi: false });
  assert.match(verifyHtml(v.result, v.id), /✅ Valid signature[\s\S]*signed wrapped in &lt;Bytes&gt;/);
});

test('example verify signature is valid', () => {
  const { addr, msg, sig } = exampleVerify();
  assert.equal(addr, ALICE);
  assert.equal(msg, 'Hello Polkadot');
  assert.equal(verifyMessage({ addr, enc: 'text', msg, sig }).result.type, 'sr25519');
});

test('already-wrapped messages are not wrapped twice; unwrapped detection', () => {
  const s = alice({ msg: '<Bytes>hi</Bytes>' });
  assert.equal(row(s.rows, 'Signed bytes')[2].note, 'the message as is');
  const raw = alice({ msg: 'hi', wrap: false });
  const v = verifyMessage({ addr: ALICE, enc: 'text', msg: '<Bytes>hi</Bytes>', sig: raw.sig });
  assert.equal(v.result.wrapped, 'unwrapped');
  assert.match(verifyHtml(v.result, v.id), /signed without the &lt;Bytes&gt; wrapper you entered/);
});

test('ECDSA: 65-byte signature, signed hash row, verify by 33-byte public key', () => {
  const s = alice({ type: 'ecdsa' });
  assert.equal(s.addr, '5C7C2Z5sWbytvHpuLTvzKunnnRwQxft1jiqrLD5rhucQ5S9X');
  assert.equal(fromHex(s.sig).length, 65);
  assert.ok(row(s.rows, 'Signed hash'));
  const pk = row(s.rows, 'Public key')[1];
  assert.equal(verifyMessage({ addr: pk, enc: 'text', msg: 'Hello Polkadot', sig: s.sig }).result.type, 'ecdsa');
});

test('MultiSignature type byte prefix is accepted', () => {
  const s = alice();
  const v = verifyMessage({ addr: ALICE, enc: 'text', msg: 'Hello Polkadot', sig: '0x01' + s.sig.slice(2) });
  assert.equal(v.result.multi, true);
  assert.match(verifyHtml(v.result, v.id), /MultiSignature with a type byte/);
});

test('wrong message or signer is not valid', () => {
  const s = alice();
  const v = verifyMessage({ addr: ALICE, enc: 'text', msg: 'Hello Kusama', sig: s.sig });
  assert.equal(v.result, null);
  assert.match(verifyHtml(v.result, v.id), /❌ Not a valid signature/);
  assert.equal(verifyMessage({ addr: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', enc: 'text', msg: 'Hello Polkadot', sig: s.sig }).result, null);
});

test('errors', () => {
  assert.throws(() => alice({ path: 'Alice' }), /A path is a list of junctions/);
  assert.throws(() => alice({ phrase: '' }), /Enter a mnemonic/);
  assert.throws(() => verifyMessage({ addr: '0x1234', enc: 'text', msg: '', sig: '0x' + '00'.repeat(64) }), /A public key must be 32 bytes \(or 33 for ECDSA\)/);
  assert.throws(() => verifyMessage({ addr: ALICE, enc: 'text', msg: '', sig: '0x1234' }), /Signatures are 64 bytes .*; got 2\./);
  assert.throws(() => verifyMessage({ addr: 'notanaddress0', enc: 'text', msg: '', sig: '0x' + '00'.repeat(64) }));
});
