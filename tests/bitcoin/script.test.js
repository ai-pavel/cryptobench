import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeScript, fromHexInput, fromAsmInput, opcodeReference, EXAMPLE_HEX } from '../../src/bitcoin/script/script.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;
const labels = rows => rows.map(r => r.label);
const hex = h => fromHexInput(h).script;

test('empty input gives no result', () => {
  assert.equal(fromHexInput(' '), null);
  assert.equal(fromAsmInput(''), null);
});

test('Example: P2PKH of the genesis address', () => {
  const r = fromHexInput(EXAMPLE_HEX);
  assert.equal(r.asm, 'OP_DUP OP_HASH160 62e907b15cbf27d5425399ebf6f0fb50ebb88f18 OP_EQUALVERIFY OP_CHECKSIG');
  const d = describeScript(r.script);
  assert.equal(value(d.rows, 'Template'), 'P2PKH (pay to public key hash)');
  assert.equal(value(d.rows, 'Address (mainnet)'), '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  assert.equal(value(d.rows, 'Size'), '25 bytes, 5 ops');
  assert.ok(!labels(d.rows).includes('As P2SH redeem script'));
  assert.deepEqual(d.ops[2], { range: '2–22', name: 'PUSH 20', data: '62e907b15cbf27d5425399ebf6f0fb50ebb88f18', size: 20 });
  assert.deepEqual(d.ops[0], { range: '0', name: 'OP_DUP', data: null, size: 0 });
});

test('ASM assembles back to the same hex', () => {
  assert.equal(fromAsmInput(fromHexInput(EXAMPLE_HEX).asm).hex, EXAMPLE_HEX);
  // OP_ prefix optional, numbers as minimal script numbers (BIP112 CSV with 144 blocks).
  assert.equal(fromAsmInput('144 csv drop').hex, '029000b275');
  assert.equal(fromAsmInput('0 -1 1 16 17').hex, '004f516001' + '11');
});

test('P2PK of G: P2WSH address from BIP173', () => {
  const d = describeScript(hex('210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ac'));
  assert.equal(value(d.rows, 'Template'), 'P2PK (pay to public key)');
  assert.equal(value(d.rows, 'As P2WSH witness script'), 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3');
  assert.ok(labels(d.rows).includes('As P2SH redeem script'));
});

test('OP_TRUE as a P2SH redeem script', () => {
  const d = describeScript(hex('51'));
  assert.equal(value(d.rows, 'Template'), 'Non-standard script');
  assert.equal(value(d.rows, 'As P2SH redeem script'), '3MaB7QVq3k4pQx3BhsvEADgzQonLSBwMdj');
});

test('segwit outputs have addresses (BIP173 P2WPKH)', () => {
  const d = describeScript(hex('0014751e76e8199196d454941c45d1b3a323f1433bd6'));
  assert.equal(value(d.rows, 'Template'), 'P2WPKH (native segwit v0, key hash)');
  assert.equal(value(d.rows, 'Address (mainnet)'), 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
});

test('OP_RETURN data is shown as hex and text', () => {
  const d = describeScript(fromAsmInput('OP_RETURN 68656c6c6f').script);
  assert.equal(value(d.rows, 'OP_RETURN data'), '68656c6c6f');
  assert.equal(d.rows.find(r => r.label === 'OP_RETURN data').note, 'As text: hello');
  assert.ok(!labels(d.rows).includes('As P2SH redeem script'));
  // Not valid UTF-8: no text note.
  assert.equal(describeScript(hex('6a02ff00')).rows.find(r => r.label === 'OP_RETURN data').note, '');
});

test('bare multisig lists its keys', () => {
  const k = '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c';
  const d = describeScript(fromAsmInput(`1 ${k} 1 OP_CHECKMULTISIG`).script);
  assert.equal(value(d.rows, 'Template'), 'Bare multisig (1-of-1)');
  assert.equal(value(d.rows, 'Keys'), k);
});

test('empty pushes keep their data column', () => {
  const d = describeScript(hex('4c00'));
  assert.deepEqual(d.ops[0], { range: '0–1', name: 'OP_PUSHDATA1', data: '', size: 0 });
});

test('opcode reference is sorted and includes direct pushes', () => {
  const ref = opcodeReference();
  assert.deepEqual(ref.slice(0, 2), [[0, 'OP_0'], [1, 'PUSH 1–75 bytes (0x01–0x4b)']]);
  assert.ok(ref.every((r, i) => i === 0 || r[0] > ref[i - 1][0]));
  assert.ok(ref.some(([c, n]) => c === 0xb2 && n === 'OP_CHECKSEQUENCEVERIFY'));
});

test('bad input throws', () => {
  assert.throws(() => fromHexInput('0g'));
  assert.throws(() => fromHexInput('05aa'));
  assert.throws(() => fromAsmInput('OP_FOO'), /Unknown opcode or token "OP_FOO"/);
});
