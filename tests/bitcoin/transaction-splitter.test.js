import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitTx, fieldValue, color, EXAMPLE_TX } from '../../src/bitcoin/transaction-splitter/transaction-splitter.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;
const field = (fields, group, name) => fields.find(f => f.group === group && f.name === name);

const GENESIS_COINBASE = '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000';

test('empty input gives no result', () => {
  assert.equal(splitTx(' ', 'mainnet'), null);
});

test('Example: fields cover every byte in order', () => {
  const r = splitTx(EXAMPLE_TX, 'mainnet');
  assert.equal(r.fields.map(f => f.raw).join(''), EXAMPLE_TX);
  r.fields.forEach((f, i) => assert.equal(f.start, i ? r.fields[i - 1].end : 0));
  assert.equal(value(r.rows, 'Summary'), 'Version 2, 1 input(s), 1 output(s), segwit');
  assert.ok(value(r.rows, 'wTXID'));
});

test('Example: output pays the second BIP84 receive address', () => {
  const r = splitTx(EXAMPLE_TX, 'mainnet');
  assert.equal(field(r.fields, 'Output 0', 'scriptPubKey').value,
    'P2WPKH (native segwit v0, key hash) · bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g\nOP_0 9c90f934ea51fa0f6504177043e0908da6929983');
  assert.equal(field(r.fields, 'Output 0', 'Amount (sats)').value, '99,000 sats (0.00099000 BTC)');
  assert.equal(field(r.fields, 'Input 0', 'Sequence').value, '0xfffffffd');
  assert.equal(field(r.fields, 'Footer', 'Locktime').value, 'No locktime (0)');
  assert.equal(field(r.fields, 'Witness 0', 'Item 1').raw, '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c');
  assert.equal(value(r.rows, 'Total output'), '99,000 sats (0.00099000 BTC)');
});

test('the network changes addresses; Dogecoin has none for segwit', () => {
  const tb = field(splitTx(EXAMPLE_TX, 'testnet').fields, 'Output 0', 'scriptPubKey').value;
  assert.match(tb, / · tb1q/);
  const doge = field(splitTx(EXAMPLE_TX, 'dogecoin').fields, 'Output 0', 'scriptPubKey').value;
  assert.equal(doge, 'P2WPKH (native segwit v0, key hash)\nOP_0 9c90f934ea51fa0f6504177043e0908da6929983');
});

test('genesis coinbase: legacy, 50 BTC, P2PK output', () => {
  const r = splitTx(GENESIS_COINBASE, 'mainnet');
  assert.equal(value(r.rows, 'TXID'), '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b');
  assert.equal(value(r.rows, 'wTXID'), undefined);
  assert.equal(value(r.rows, 'Summary'), 'Version 1, 1 input(s), 1 output(s), legacy');
  assert.equal(value(r.rows, 'Total output'), '5,000,000,000 sats (50.00000000 BTC)');
  assert.match(field(r.fields, 'Output 0', 'scriptPubKey').value, /^P2PK \(pay to public key\)\n04678afd[0-9a-f]{122} OP_CHECKSIG$/);
  assert.match(field(r.fields, 'Input 0', 'scriptSig').value, /^ffff001d /);
});

test('field values and colours', () => {
  assert.equal(fieldValue({ name: 'Locktime', value: 840000 }, null), 'Block height 840,000');
  assert.equal(fieldValue({ name: 'scriptSig', value: new Uint8Array(0) }, null), '');
  assert.equal(fieldValue({ name: 'Item 0', value: Uint8Array.of(1) }, null), '');
  assert.deepEqual(['Header', 'Inputs', 'Input 3', 'Outputs', 'Output 0', 'Witness 0', 'Footer', 'Other'].map(color), [0, 1, 1, 2, 2, 4, 3, 5]);
});

test('bad transactions throw', () => {
  assert.throws(() => splitTx('zz', 'mainnet'));
  assert.throws(() => splitTx(GENESIS_COINBASE + '00', 'mainnet'), /unexpected bytes after the locktime/);
});
