import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefixFrom, keyRows } from '../../src/polkadot/address-from-key/address-from-key.js';

// Well-known dev account keys (Substrate keyring).
const ALICE_SR = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
const ALICE_ECDSA = '0x020a1091341fe5664bfa1782d5e04779689068c916b04cb365ec3153755684d9a1';
// secp256k1 generator point G (private key 1) and its well-known Ethereum address.
const G = '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const G_UNCOMPRESSED = '0x0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
const G_ETH = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
const row = (rows, k) => rows.find(r => r[0] === k)?.[1];

test('prefix from network select or custom input', () => {
  assert.equal(prefixFrom('0', ''), 0);
  assert.equal(prefixFrom('1', ''), 2);
  assert.equal(prefixFrom('custom', '1284'), 1284);
  assert.ok(Number.isNaN(prefixFrom('custom', '')));
});

test('example: //Alice sr25519 key on Polkadot', () => {
  const rows = keyRows(ALICE_SR, 'auto', 0);
  assert.deepEqual(rows, [
    ['Key type', 'Sr25519 or Ed25519', { copy: false }],
    ['Address', '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5'],
    ['Account id', ALICE_SR],
  ]);
  assert.equal(row(keyRows(ALICE_SR, 'auto', 42), 'Address'), '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
  assert.equal(row(keyRows(ALICE_SR, 'ed25519', 42), 'Key type'), 'ed25519');
});

test('//Alice ECDSA key: account id is Blake2b-256 of the compressed key', () => {
  const rows = keyRows(ALICE_ECDSA, 'auto', 42);
  assert.equal(row(rows, 'Key type'), 'ECDSA (secp256k1)');
  assert.equal(row(rows, 'Address'), '5C7C2Z5sWbytvHpuLTvzKunnnRwQxft1jiqrLD5rhucQ5S9X');
  assert.equal(row(rows, 'Compressed key'), ALICE_ECDSA);
});

test('ECDSA: uncompressed key gives the same account; Ethereum address of G', () => {
  const a = keyRows(G, 'auto', 42), b = keyRows(G_UNCOMPRESSED, 'ecdsa', 42);
  assert.equal(row(a, 'Ethereum address'), G_ETH);
  assert.equal(row(b, 'Ethereum address'), G_ETH);
  assert.equal(row(b, 'Compressed key'), G);
  assert.equal(row(a, 'Account id'), row(b, 'Account id'));
});

test('errors', () => {
  assert.throws(() => keyRows('0x1234', 'auto', 0), /33\/65 bytes \(ECDSA\); got 2/);
  assert.throws(() => keyRows(G, 'sr25519', 0), /sr25519 public keys are 32 bytes \(got 33\)/);
  assert.throws(() => keyRows(ALICE_SR, 'ecdsa', 0), /ECDSA public keys are 33 or 65 bytes \(got 32\)/);
  assert.throws(() => keyRows('0x02' + 'ff'.repeat(32), 'auto', 0), /Not a valid secp256k1 point/);
  assert.throws(() => keyRows('nothex', 'auto', 0));
  assert.throws(() => keyRows(ALICE_SR, 'auto', NaN), /SS58 prefix/);
});
