import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashJson, signDigest, recoverSigner, EXAMPLE } from '../../src/evm/typed-data/typed-data.js';
import { keccakHex, utf8, bytesToHex } from '../../src/evm/lib/evm.js';

const row = (rows, label) => rows.find(r => r && r.label === label);
const MAIL = JSON.stringify(EXAMPLE, null, 2);
// EIP-712's example signer: the private key is keccak256("cow").
const COW_KEY = keccakHex(utf8('cow'));
const COW = '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826';
const MAIL_SIG = '0x4355c47d63924e8a72e509b65029052eb6c299d53a04e167c5775fd466751c9d07299936d304c153f6443dfa05f40ff007d72911b6f72307f996231605b915621c';

test('empty input gives no result', () => {
  assert.equal(hashJson('  '), null);
  assert.equal(signDigest(COW_KEY, null), null);
  assert.equal(signDigest(' ', new Uint8Array(32)), null);
  assert.equal(recoverSigner(MAIL_SIG, null), null);
  assert.equal(recoverSigner('', new Uint8Array(32)), null);
});

test('example: EIP-712 Mail test vector', () => {
  const h = hashJson(MAIL);
  assert.equal(bytesToHex(h.digest), '0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2');
  assert.equal(row(h.rows, 'Digest (signed hash)').value, '0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2');
  assert.equal(row(h.rows, 'Domain separator').value, '0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f');
  assert.equal(row(h.rows, 'Struct hash').value, '0xc52c0ee5d84264471806290a3f2c4cecfc5490626bf912d01f240d7a274b371e');
  assert.equal(row(h.rows, 'Encoded type').value, 'Mail(Person from,Person to,string contents)Person(string name,address wallet)');
});

test('sign: EIP-712 Mail signature by "cow"', () => {
  const rows = signDigest(COW_KEY, hashJson(MAIL).digest);
  assert.equal(row(rows, 'Signer').value, COW);
  assert.equal(row(rows, 'v').value, '28');
  assert.equal(row(rows, 'r').value, '0x4355c47d63924e8a72e509b65029052eb6c299d53a04e167c5775fd466751c9d');
  assert.equal(row(rows, 's').value, '0x07299936d304c153f6443dfa05f40ff007d72911b6f72307f996231605b91562');
  assert.equal(row(rows, 'Signature').value, MAIL_SIG);
});

test('recover: the Mail signature recovers "cow"', () => {
  assert.equal(recoverSigner(MAIL_SIG, hashJson(MAIL).digest), COW);
});

test('domain-only data has no struct hash', () => {
  const td = { ...EXAMPLE, primaryType: 'EIP712Domain', message: {} };
  const h = hashJson(JSON.stringify(td));
  assert.equal(row(h.rows, 'Domain separator').value, '0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f');
  assert.equal(row(h.rows, 'Struct hash'), undefined);
});

test('errors', () => {
  assert.throws(() => hashJson('{nope'), /^Error: Not valid JSON: /);
  assert.throws(() => hashJson(JSON.stringify({ ...EXAMPLE, primaryType: 'Letter' })));
  assert.throws(() => signDigest('0x00', hashJson(MAIL).digest), /Private key must be 32 bytes/);
  assert.throws(() => recoverSigner('0x1234', hashJson(MAIL).digest), /Signature must be 65 bytes/);
});
