import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePsbtText, entryText, EXAMPLE_PSBT } from '../../src/bitcoin/psbt-decoder/psbt-decoder.js';
import * as btc from '../../src/assets/vendor/@scure/btc-signer@1.8.1/index.esm.js';
import { base64 } from '../../src/assets/vendor/@scure/base@1.2.6/index.esm.js';
import { decodeWif } from '../../src/bitcoin/lib/btc.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;

test('empty input gives no result', () => {
  assert.equal(decodePsbtText('  \n'), null);
});

test('Example: unsigned BIP84 spend with UTXO and BIP32 path', () => {
  const r = decodePsbtText(EXAMPLE_PSBT);
  assert.equal(value(r.rows, 'PSBT version'), '0');
  assert.equal(value(r.rows, 'Unsigned TXID'), '8acca8e5bb5d524ee5b8251319f4799cdf0d63006f0f78af3b38945fe81673f9');
  assert.equal(value(r.rows, 'Inputs / outputs'), '1 / 1');
  assert.equal(value(r.rows, 'Inputs with signatures'), '0 of 1');
  assert.equal(value(r.rows, 'Fee'), '1,000 sats (0.00001000 BTC)');
  assert.equal(r.rows.find(r => r.label === 'Fee').note, '≈ 12.20 sat/vB on the unsigned size (the final size is larger)');
  assert.deepEqual(r.maps.map(m => m.title), ['Global', 'Input 0 · d74f11e0e7302e58c8a10f818ca54132d88be9b669984427326cf7f4a9eae639:0', 'Output 0 · 99,000 sats (0.00099000 BTC)']);
  const [utxo, deriv] = r.maps[1].entries;
  assert.equal(utxo.name, 'WITNESS_UTXO');
  assert.match(utxo.text, /bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu \(mainnet\)/);
  // 73c5da0a is the master fingerprint of the BIP84 test mnemonic.
  assert.equal(deriv.text, 'Public key 0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c\n[73c5da0a] m/84\'/0\'/0\'/0/0');
  assert.deepEqual(r.maps[2].entries, []);
});

test('hex input decodes the same as base64', () => {
  const hex = Buffer.from(EXAMPLE_PSBT, 'base64').toString('hex');
  assert.deepEqual(decodePsbtText(hex), decodePsbtText(EXAMPLE_PSBT));
});

test('a partially signed PSBT counts its signature', () => {
  const tx = btc.Transaction.fromPSBT(base64.decode(EXAMPLE_PSBT));
  tx.sign(decodeWif('KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d').priv);
  const r = decodePsbtText(base64.encode(tx.toPSBT()));
  assert.equal(value(r.rows, 'Inputs with signatures'), '1 of 1');
  const sig = r.maps[1].entries.find(e => e.name === 'PARTIAL_SIG');
  assert.match(sig.text, /^Public key 0330d54f.*\nSignature 30.*\nSighash SIGHASH_ALL/);
});

test('without the UTXO the fee is unknown', () => {
  const tx = btc.Transaction.fromPSBT(base64.decode(EXAMPLE_PSBT));
  const bare = new btc.Transaction();
  bare.addInput({ txid: tx.getInput(0).txid, index: 0, sequence: 0xfffffffd });
  bare.addOutputAddress('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g', 99000n);
  const r = decodePsbtText(base64.encode(bare.toPSBT()));
  assert.equal(value(r.rows, 'Fee'), 'Unknown: not every input carries its UTXO');
  assert.equal(r.rows.find(r => r.label === 'Fee').note, '');
});

test('unknown entries show key data and value in hex', () => {
  const e = { name: 'UNKNOWN_0xee', type: 0xee, keyData: Uint8Array.of(1, 2), value: Uint8Array.of(0xab) };
  assert.equal(entryText('input', e, {}), 'Key data 0102\nab');
  assert.equal(entryText('input', { ...e, keyData: new Uint8Array(0) }, {}), 'ab');
});

test('bad input throws', () => {
  assert.throws(() => decodePsbtText('not base64!!'), /Not valid base64 or hex/);
  // BIP174 invalid test vector: a network transaction, not a PSBT.
  assert.throws(() => decodePsbtText('AgAAAAEmgXE3Ht/yhek3re6ks3t4AAAA'), /magic bytes/);
  assert.throws(() => decodePsbtText(EXAMPLE_PSBT.slice(0, 40)));
});
