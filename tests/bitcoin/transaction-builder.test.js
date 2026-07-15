import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTx, EXAMPLE, SAMPLE_IN, SAMPLE_OUT } from '../../src/bitcoin/transaction-builder/transaction-builder.js';
import { parseTx as parseBytes, hexToBytes } from '../../src/bitcoin/lib/btc.js';

const parseTx = hex => parseBytes(hexToBytes(hex));
const value = (rows, label) => rows.find(r => r.label === label)?.value;
const opts = (over = {}) => ({ version: EXAMPLE.version, locktime: String(EXAMPLE.locktime), key: EXAMPLE.key, spend: EXAMPLE.spend, inputs: EXAMPLE.inputs, outputs: EXAMPLE.outputs, ...over });

// BIP84 test wallet, m/84'/0'/0'/0/0 (the key behind bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu).
const BIP84_WIF = 'KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d';
const TXID = '8acca8e5bb5d524ee5b8251319f4799cdf0d63006f0f78af3b38945fe81673f9';

test('Example: unsigned BIP84 spend', () => {
  const rows = buildTx(opts());
  assert.equal(value(rows, 'Unsigned transaction'), '020000000139e6eaa9f4f76c3227449869b6e98bd83241a58c810fa1c8582e30e7e0114fd70000000000fdffffff01b8820100000000001600149c90f934ea51fa0f6504177043e0908da692998300000000');
  assert.equal(rows[0].note, '82 bytes');
  assert.equal(value(rows, 'TXID'), TXID);
  assert.match(value(rows, 'PSBT (base64)'), /^cHNidP8B/);
  assert.equal(value(rows, 'Totals'), 'in 100,000 sats (0.00100000 BTC) · out 99,000 sats (0.00099000 BTC) · fee 1,000 sats (0.00001000 BTC)');
  assert.equal(value(rows, 'Signed transaction'), undefined);
});

test('signing the Example with the BIP84 key (RFC 6979) keeps the TXID', () => {
  const rows = buildTx(opts({ key: BIP84_WIF }));
  const signed = parseTx(value(rows, 'Signed transaction'));
  assert.equal(value(rows, 'Signed TXID'), TXID);
  assert.equal(signed.txid, TXID);
  assert.equal(signed.vsize, 110);
  assert.equal(rows.find(r => r.label === 'Signed transaction').note, '110 vbytes, 9.09 sat/vB');
  // Witness: a DER signature with SIGHASH_ALL and the compressed BIP84 public key.
  const [sig, pub] = signed.inputs[0].witness;
  assert.equal(sig[0], 0x30);
  assert.equal(sig[sig.length - 1], 0x01);
  assert.equal(Buffer.from(pub).toString('hex'), '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c');
});

test('P2PKH and P2TR spends sign too', () => {
  const p2pkh = parseTx(value(buildTx(opts({ key: BIP84_WIF, spend: 'p2pkh' })), 'Signed transaction'));
  assert.equal(p2pkh.segwit, false);
  assert.ok(p2pkh.inputs[0].scriptSig.length > 100);
  const p2tr = parseTx(value(buildTx(opts({ key: BIP84_WIF, spend: 'p2tr' })), 'Signed transaction'));
  // Key path spend: a single 64-byte Schnorr signature (SIGHASH_DEFAULT).
  assert.equal(p2tr.inputs[0].witness.length, 1);
  assert.equal(p2tr.inputs[0].witness[0].length, 64);
});

test('the default sample rows build', () => {
  const rows = buildTx(opts({ inputs: [SAMPLE_IN], outputs: [SAMPLE_OUT] }));
  assert.match(value(rows, 'Totals'), /fee 10,000 sats/);
});

test('outputs: hex scripts and BTC amounts; unknown input amounts', () => {
  const rows = buildTx(opts({ inputs: [{ ...EXAMPLE.inputs[0], amount: '' }], outputs: [{ to: '6a0568656c6c6f', amount: '0.001 BTC' }], version: '1', locktime: '840000' }));
  assert.equal(value(rows, 'Totals'), 'in ? · out 100,000 sats (0.00100000 BTC)');
  const tx = parseTx(value(rows, 'Unsigned transaction'));
  assert.equal(tx.version, 1);
  assert.equal(tx.locktime, 840000);
  assert.equal(Buffer.from(tx.outputs[0].script).toString('hex'), '6a0568656c6c6f');
});

test('bad input throws', () => {
  assert.throws(() => buildTx(opts({ inputs: [] })), /at least one input and one output/);
  assert.throws(() => buildTx(opts({ inputs: [{ ...EXAMPLE.inputs[0], txid: 'abcd' }] })), /Input 0: TXID must be 32 bytes/);
  assert.throws(() => buildTx(opts({ outputs: [{ to: '', amount: '1' }] })), /Output 0: address or script is empty/);
  assert.throws(() => buildTx(opts({ outputs: [{ to: EXAMPLE.outputs[0].to, amount: '100001' }] })), /Outputs \(100001\) exceed inputs \(100000\)/);
  assert.throws(() => buildTx(opts({ key: BIP84_WIF, inputs: [{ ...EXAMPLE.inputs[0], amount: '' }] })), /the amount is needed to sign/);
  assert.throws(() => buildTx(opts({ locktime: '4294967296' })));
  assert.throws(() => buildTx(opts({ outputs: [{ to: 'bc1qnotanaddress', amount: '1' }] })));
});
