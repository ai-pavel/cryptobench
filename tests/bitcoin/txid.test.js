import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { txidRows, flip, EXAMPLE_TX } from '../../src/bitcoin/txid/txid.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;
const sha = b => createHash('sha256').update(b).digest();
const hash256Rev = hex => Buffer.from(sha(sha(Buffer.from(hex, 'hex')))).reverse().toString('hex');

// The genesis block's coinbase transaction.
const GENESIS_COINBASE = '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000';

test('empty input gives no result', () => {
  assert.equal(txidRows('  '), null);
});

test('flip reverses byte order', () => {
  assert.equal(flip('0102abcd'), 'cdab0201');
});

test('genesis coinbase: known TXID, no witness, coinbase note', () => {
  const rows = txidRows(GENESIS_COINBASE);
  assert.equal(value(rows, 'TXID'), '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b');
  assert.equal(value(rows, 'wTXID'), value(rows, 'TXID'));
  // The internal order is what the genesis header holds as its merkle root.
  assert.equal(value(rows, 'TXID, internal order'), '3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a');
  assert.equal(rows.find(r => r.label === 'wTXID').note, 'Same as the TXID: no witness data');
  assert.equal(value(rows, 'Segwit'), 'No');
  assert.ok(value(rows, 'Coinbase'));
  assert.equal(value(rows, 'Size / weight'), '204 bytes, 816 WU, 204 vbytes');
});

test('Example: segwit transaction, wTXID is HASH256 of all bytes', () => {
  const rows = txidRows(EXAMPLE_TX);
  const txid = value(rows, 'TXID'), wtxid = value(rows, 'wTXID');
  assert.notEqual(txid, wtxid);
  assert.equal(wtxid, hash256Rev(EXAMPLE_TX));
  assert.equal(value(rows, 'TXID, internal order'), flip(txid));
  assert.match(value(rows, 'Segwit'), /^Yes/);
  assert.equal(value(rows, 'Coinbase'), undefined);
  const size = EXAMPLE_TX.length / 2;
  assert.match(rows.find(r => r.label === 'wTXID').note, new RegExp(`all ${size} bytes`));
});

test('bad transactions throw', () => {
  assert.throws(() => txidRows('zz'));
  assert.throws(() => txidRows('0100000001'));
});
