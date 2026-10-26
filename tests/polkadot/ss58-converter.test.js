import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameOf, decodeInput, decodedRows, addressRows } from '../../src/polkadot/ss58-converter/ss58-converter.js';

// Well-known //Alice dev account (sr25519).
const ALICE_HEX = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
const ALICE_42 = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const ALICE_DOT = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
const ALICE_KSM = 'HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F';
const hex = b => '0x' + Buffer.from(b).toString('hex');

test('network names by prefix', () => {
  assert.equal(nameOf(0), 'Polkadot / Paseo');
  assert.equal(nameOf(2), 'Kusama');
  assert.equal(nameOf(42), 'Generic Substrate / Westend / Bittensor');
  assert.equal(nameOf(1234), 'Unknown network');
});

test('example: //Alice generic address decodes to her public key', () => {
  const { payload, prefix } = decodeInput(ALICE_42);
  assert.equal(prefix, 42);
  assert.equal(hex(payload), ALICE_HEX);
  assert.deepEqual(decodedRows(payload, prefix), [
    ['Network', 'Generic Substrate / Westend / Bittensor (prefix 42)', { copy: false }],
    ['Account id', ALICE_HEX, { note: '32 bytes' }],
  ]);
});

test('default value: //Alice on Polkadot', () => {
  const { payload, prefix } = decodeInput(ALICE_DOT);
  assert.equal(prefix, 0);
  assert.equal(hex(payload), ALICE_HEX);
});

test('address rows list each prefix once, with known Alice addresses', () => {
  const rows = addressRows(decodeInput(ALICE_HEX).payload);
  const byLabel = Object.fromEntries(rows);
  assert.equal(byLabel['Polkadot / Paseo (0)'], ALICE_DOT);
  assert.equal(byLabel['Kusama (2)'], ALICE_KSM);
  assert.equal(byLabel['Generic Substrate / Westend / Bittensor (42)'], ALICE_42);
  assert.equal(new Set(rows.map(r => r[0])).size, rows.length);
  assert.equal(rows.length, 9);
});

test('hex input has no network row; 33-byte ECDSA keys get a note', () => {
  const { payload, prefix } = decodeInput(ALICE_HEX);
  assert.equal(prefix, null);
  assert.equal(decodedRows(payload, prefix)[0], null);
  const ecdsa = decodeInput('0x02' + '11'.repeat(32));
  assert.match(decodedRows(ecdsa.payload, null)[1][2].note, /^33 bytes — an ECDSA public key/);
});

test('custom prefix goes first and is validated', () => {
  const p = decodeInput(ALICE_HEX).payload;
  const rows = addressRows(p, ' 2 ');
  assert.deepEqual(rows[0], ['Custom (2)', ALICE_KSM]);
  assert.throws(() => addressRows(p, 'abc'), /Custom prefix must be a number/);
  assert.throws(() => addressRows(p, '46'), /reserved/);
  assert.throws(() => addressRows(p, '16384'), /0 to 16383/);
});

test('input errors', () => {
  assert.throws(() => decodeInput(''), /Enter an address/);
  assert.throws(() => decodeInput('0x1234'), /Expected a 32-byte account id or 33-byte ECDSA key \(got 2 bytes\)/);
  assert.throws(() => decodeInput('0xzz'));
  assert.throws(() => decodeInput('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQ0'), /Not valid Base58/);
  assert.throws(() => decodeInput(ALICE_42.slice(0, -1) + 'Z'), /Checksum mismatch|Unexpected length/);
});
