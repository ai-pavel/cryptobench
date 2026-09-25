import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { decodeTx, parseTxInput, txSummary, summaryHtml, treeHtml, certNote, metadataOf, unset, EXAMPLE } from '../../src/cardano/tx-decoder/tx-decoder.js';
import { blake2b } from '../../src/assets/vendor/@noble/hashes@1.8.0/blake2b.esm.js';
import { encode, fromHex, toHex, CborMap } from '../../src/cardano/lib/cardano.js';

// The Example is [body, witnesses, true, auxiliary data]; its body is the map after the 0x84 array head.
const BODY_HEX = EXAMPLE.slice(2, EXAMPLE.indexOf('a100d90102'));
const tx = (body, wits = new CborMap([])) => toHex(encode([new CborMap(body), wits]));

test('Example: the transaction ID is Blake2b-256 of the body bytes', () => {
  const t = decodeTx(parseTxInput(EXAMPLE));
  assert.equal(toHex(t.id), toHex(blake2b(fromHex(BODY_HEX), { dkLen: 32 })));
  const s = txSummary(t);
  assert.equal(s.txId, 'b9bec5b57d77775255fe2fe5644ff71d45289f2dde7d3a284c69dacb51c70952');
  assert.equal(s.fee, 170000n);
  assert.equal(s.outputs, 2);
  assert.equal(s.total, 2000000n + 1234567n);
  assert.equal(s.isValid, true);
});

test('Example: the signature verifies, as Node\'s own Ed25519 confirms', () => {
  const t = decodeTx(parseTxInput(EXAMPLE));
  const { signatures, allOk } = txSummary(t);
  assert.equal(signatures.length, 1);
  assert.equal(allOk, true);
  const [[vk, sig]] = unset(t.wits.get(0));
  const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(vk).toString('base64url') }, format: 'jwk' });
  assert.equal(verify(null, t.id, key, sig), true);
  assert.equal(signatures[0].publicKey, toHex(vk));
  assert.equal(signatures[0].keyHash, toHex(blake2b(vk, { dkLen: 28 })));
  assert.match(summaryHtml(txSummary(t)), /✓ 1 valid/);
});

test('Example: details tree', () => {
  const t = decodeTx(parseTxInput(EXAMPLE));
  const html = treeHtml(t);
  // CIP-19 base address, CIP-14 fingerprint of PATATE, a stake delegation, the CIP-20 message.
  assert.ok(html.includes('addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x'));
  assert.ok(html.includes('PATATE · asset13n25uv0yaf5kus35fm2k86cqy60z58d9xmde92'));
  assert.ok(html.includes('stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw'));
  assert.ok(html.includes('Hash of the metadata · matches the auxiliary data'));
  assert.ok(html.includes('#0 · Stake delegation'));
  assert.equal(certNote(unset(t.body.get(4))[0]), 'Credential: key hash 337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251 · pool pool1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zdqn7r6');
  assert.deepEqual(metadataOf(t.aux).entries.map(([k]) => k), [674]);
  assert.ok(html.includes('✓ valid signature'));
});

test('a cardano-cli JSON envelope gives the same bytes', () => {
  const env = JSON.stringify({ type: 'Tx BabbageEra', description: '', cborHex: EXAMPLE });
  assert.equal(toHex(parseTxInput(env)), EXAMPLE);
});

test('a tampered signature is reported as invalid', () => {
  const bad = EXAMPLE.replace('6cf3feeb', '6cf3feec');
  const s = txSummary(decodeTx(parseTxInput(bad)));
  assert.equal(s.signatures[0].ok, false);
  assert.equal(s.allOk, false);
  assert.match(summaryHtml(s), /✗ some signatures are invalid/);
  assert.match(treeHtml(decodeTx(parseTxInput(bad))), /✗ invalid signature/);
});

test('unsigned and phase-2 invalid transactions', () => {
  const unsigned = txSummary(decodeTx(fromHex(tx([[0, []], [1, []], [2, 0]]))));
  assert.equal(unsigned.signatures.length, 0);
  assert.equal(unsigned.fee, 0n);
  assert.match(summaryHtml(unsigned), /None \(unsigned or script-only\)/);
  const invalid = decodeTx(fromHex(toHex(encode([new CborMap([[0, []], [1, []]]), new CborMap([]), false, null]))));
  assert.equal(invalid.isValid, false);
  assert.match(summaryHtml(txSummary(invalid)), /Phase-2 validity/);
});

test('input errors throw', () => {
  assert.throws(() => parseTxInput('{"cborHex": '), /^Error: Invalid JSON: /);
  assert.throws(() => parseTxInput('{"type": "Tx"}'), /The JSON has no "cborHex" field\./);
  assert.throws(() => parseTxInput('xyz'), /Not valid hex/);
  assert.throws(() => decodeTx(parseTxInput(EXAMPLE + '00')), /Extra 1 bytes after the transaction\./);
  assert.throws(() => decodeTx(parseTxInput(BODY_HEX)), /Not a transaction: expected \[body, witnesses, …\]/);
});
