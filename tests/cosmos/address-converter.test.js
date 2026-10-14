import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertAddress } from '../../src/cosmos/address-converter/address-converter.js';

// The well-known account of the "abandon … about" test mnemonic at m/44'/118'/0'/0/0.
const ADDR = 'cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4';
// Its bytes: RIPEMD-160(SHA-256(pubkey)), checked independently with node:crypto.
const HEX = '28ff5c6d57d8cfd492b6fb42614536ed648e01fd';
const row = (rows, label) => rows.find(r => r[0] === label);

test('empty input gives no result', () => {
  assert.equal(convertAddress('  '), null);
});

test('Example: a Cosmos Hub account address', () => {
  const r = convertAddress(ADDR);
  assert.equal(r.prefix, 'cosmos');
  assert.equal(r.base, 'cosmos');
  assert.equal(r.kind, '');
  assert.equal(r.note, '');
  assert.deepEqual(r.summary[1], ['Bytes (hex)', HEX, '20 bytes — a key-derived account address']);
  assert.equal(row(r.forms, 'Account')[1], ADDR);
  assert.match(row(r.forms, 'Validator operator')[1], /^cosmosvaloper1/);
  assert.match(row(r.forms, 'Validator consensus')[2], /Format only/);
  assert.equal(r.othersTitle, 'Same bytes on other chains');
  assert.match(row(r.others, 'Osmosis')[1], /^osmo19rl4cm2hmr8afy4kldpxz3fka4jguq0a/);
  assert.match(row(r.others, 'Terra')[2], /Coin type 330/);
  assert.match(row(r.others, 'Injective')[2], /Ethereum-style keys/);
  assert.equal(row(r.others, 'Osmosis')[2], '');
});

test('every other-chain address round-trips to the same bytes', () => {
  const r = convertAddress(ADDR);
  for (const [, addr] of r.others) assert.equal(convertAddress(addr).summary[1][1], HEX);
});

test('hex input is accepted, with or without 0x', () => {
  for (const input of [HEX, '0x' + HEX.toUpperCase()]) {
    const r = convertAddress(input);
    assert.equal(r.prefix, '');
    assert.equal(r.summary[0][1], '(none — hex input)');
    assert.equal(row(r.forms, 'Account')[1], ADDR);
  }
});

test('validator operator addresses keep their form on other chains', () => {
  const valoper = convertAddress(ADDR).forms[1][1];
  const r = convertAddress(valoper);
  assert.equal(r.base, 'cosmos');
  assert.equal(r.kind, 'valoper');
  assert.equal(r.summary[0][2], 'cosmos + valoper');
  assert.equal(r.othersTitle, 'valoper form on other chains');
  assert.match(row(r.others, 'Osmosis')[1], /^osmovaloper1/);
  assert.equal(row(r.forms, 'Account')[1], ADDR);
});

test('custom prefix', () => {
  const r = convertAddress(ADDR, ' BitSong ');
  assert.equal(r.others[0][0], 'bitsong (custom)');
  assert.match(r.others[0][1], /^bitsong1/);
  assert.throws(() => convertAddress(ADDR, 'bit-song'), /Custom prefix must use lowercase letters and digits only/);
});

test('32-byte addresses are labelled, unusual lengths get a note', () => {
  const r32 = convertAddress('cosmos14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s4hmalr');
  assert.equal(r32.bytes.length, 32);
  assert.match(r32.summary[1][2], /module, interchain account or contract/);
  assert.equal(r32.note, '');
  const r4 = convertAddress('deadbeef');
  assert.match(r4.note, /this address is 4 bytes/);
});

test('invalid input throws', () => {
  assert.throws(() => convertAddress('cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal5'), /invalid checksum/);
  assert.throws(() => convertAddress('Cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4'), /mixes upper and lower case/);
  assert.throws(() => convertAddress('xyz'), /has no "1" separator/);
  assert.throws(() => convertAddress('0xabc'), /odd number of hex digits/);
});
