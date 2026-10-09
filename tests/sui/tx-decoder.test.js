import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLE, decodeTransactionHtml, sui, group, arg, usageHints, inputRow, commandHtml, expirationText } from '../../src/sui/tx-decoder/tx-decoder.js';
import { blake2b, base58, base64, hex, parseTypeTag } from '../../src/sui/lib/sui.js';

test('Example transaction', () => {
  const html = decodeTransactionHtml(EXAMPLE);
  // Digest = base58(BLAKE2b-256("TransactionData::" ‖ bytes)).
  const bytes = base64.decode(EXAMPLE);
  const digest = base58.encode(blake2b(new Uint8Array([...new TextEncoder().encode('TransactionData::'), ...bytes]), { dkLen: 32 }));
  assert.equal(digest, '9dz1HdmGQLKkZofQdK7oAogL9FZzeLeCh5BQT4gCSAFU');
  assert.ok(html.includes(`data-copy="${digest}"`));
  assert.ok(html.includes('0xa2d14fad60c56049ecf75246a481934691214ce413e6a8ae2fe6834c173a6133<div class="muted">Same as sender</div>'));
  assert.ok(html.includes('50,000,000 MIST<div class="muted">0.05 SUI</div>'));
  assert.ok(html.includes('1,000 MIST per unit'));
  assert.ok(html.includes('Epoch 500'));
  assert.ok(html.includes('<p class="section-title">Gas payment (1)</p>'));
  assert.ok(html.includes('Programmable transaction: inputs (7)'));
  assert.ok(html.includes('<div class="muted">u64 1000000000</div>')); // SplitCoins amount hint
  assert.ok(html.includes('string &quot;memo ✓&quot;'));
  assert.ok(html.includes('initial shared version 1, read-only'));
  assert.ok(html.includes('<p class="section-title">Commands (5)</p>'));
  assert.ok(html.includes('0x2::coin::join&lt;0x2::sui::SUI&gt;'));
  assert.ok(html.includes('Objects: Result 0.0 → recipient Input 1'));
  assert.ok(html.includes('Into Gas coin from Input 4'));
  assert.ok(html.includes('Type: u64; elements: Input 5, Input 6'));
  // Hex input decodes the same.
  assert.equal(decodeTransactionHtml('0x' + hex.encode(bytes)), html);
});

test('transaction kind only (no sender, gas or expiration)', () => {
  const bytes = base64.decode(EXAMPLE);
  // Drop the version byte and the trailing sender (32), gas data (1 + 73 + 32 + 8 + 8) and Epoch expiration (1 + 8).
  const kind = bytes.slice(1, bytes.length - 163);
  const html = decodeTransactionHtml(base64.encode(kind));
  assert.ok(html.startsWith('<p class="note">These bytes are a transaction kind only'));
  assert.ok(html.includes('inputs (7)'));
  assert.ok(!html.includes('Digest'));
});

test('errors', () => {
  assert.throws(() => decodeTransactionHtml('0x01'), /Unknown TransactionData version 1/);
  assert.throws(() => decodeTransactionHtml(EXAMPLE.slice(0, 40)));
  assert.throws(() => decodeTransactionHtml('not base64!'));
});

test('amount formatting', () => {
  assert.equal(sui('50000000'), '0.05 SUI');
  assert.equal(sui('1000000000'), '1 SUI');
  assert.equal(sui('1'), '0.000000001 SUI');
  assert.equal(sui('0'), '0 SUI');
  assert.equal(group('1234567'), '1,234,567');
});

test('arguments and usage hints', () => {
  assert.equal(arg({ GasCoin: true }), 'Gas coin');
  assert.equal(arg({ Input: 0 }), 'Input 0');
  assert.equal(arg({ Result: 2 }), 'Result 2');
  assert.equal(arg({ NestedResult: [1, 3] }), 'Result 1.3');
  assert.deepEqual(usageHints({ commands: [
    { SplitCoins: { coin: { GasCoin: true }, amounts: [{ Input: 0 }, { Result: 1 }] } },
    { TransferObjects: { objects: [{ Result: 0 }], address: { Input: 1 } } },
  ] }), { 0: 'u64', 1: 'address' });
});

test('inputs and commands', () => {
  assert.equal(inputRow({ FundsWithdrawal: { maxAmount: '5', typeArg: parseTypeTag('0x2::sui::SUI'), from: 'Sender' } }, 2),
    '<tr><td>2</td><td>Funds withdrawal</td><td class="mono">up to 5 of 0x2::sui::SUI from Sender</td></tr>');
  assert.ok(inputRow({ Object: { Receiving: { objectId: '0x1', version: '3', digest: 'abc' } } }, 0).includes('<td>Receiving object</td>'));
  assert.equal(commandHtml({ Publish: { modules: [new Uint8Array(3), new Uint8Array(4)], dependencies: [] } }, 0),
    '<div class="cmd"><span class="name">0. Publish</span><div class="muted">2 module(s), 7 bytes; dependencies: none</div></div>');
  assert.ok(commandHtml({ MakeMoveVec: { type: null, elements: [] } }, 1).includes('Type: inferred (objects); elements: none'));
});

test('expiration text', () => {
  assert.equal(expirationText({ None: true }), 'None');
  assert.equal(expirationText({ Epoch: '7' }), 'Epoch 7');
  assert.equal(expirationText({ ValidDuring: { minEpoch: '1', maxEpoch: null, minTimestamp: '0', maxTimestamp: null, chain: 'abc', nonce: 5 } }),
    'ValidDuring: min epoch 1, after 1970-01-01T00:00:00.000Z, chain abc, nonce 5');
});
