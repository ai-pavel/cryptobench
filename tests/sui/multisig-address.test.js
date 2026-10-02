import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multisig, parseSigner } from '../../src/sui/multisig-address/multisig-address.js';
import { blake2b, base64, hex, ed25519 } from '../../src/sui/lib/sui.js';

// Example: the "film crazy …" account 0 keys from the Sui TypeScript SDK vectors in all three schemes.
const ED = 'ACJkf+7vNjBgvUIFoWcaFfEKEjZ2WRixtfY42C8zz8Rp';
const K1 = 'AQK9lbNnoth4GgiL3LAFQGemymF4Q30U5ReN9qfFp+JbCw==';
const R1 = 'AgJ8+PjJHCyHvxf21ycmLkdGeUjA+ClnQBEn9awscbk50g==';
const EXAMPLE = `${ED} 1\n${K1} 2\n${R1} 3`;

// Address = BLAKE2b-256(0x03 ‖ threshold u16 LE ‖ for each signer: flag ‖ key ‖ weight).
function expectedAddress(keys, weights, threshold) {
  const parts = [3, threshold & 0xff, threshold >> 8];
  keys.forEach((k, i) => parts.push(...base64.decode(k), weights[i]));
  return '0x' + hex.encode(blake2b(Uint8Array.from(parts), { dkLen: 32 }));
}

test('Example: 3 signers, threshold 3', () => {
  const r = multisig(EXAMPLE, '3');
  assert.equal(r.rows[0][1], expectedAddress([ED, K1, R1], [1, 2, 3], 3));
  assert.equal(r.rows[0][1], '0x8983cc25d701650ca4342b535bcdfac8b88930f2f4d6d2420233bd91547f59c4');
  assert.equal(r.rows[2][1], '3 of total weight 6');
  assert.deepEqual(r.signers.map(s => [s.name, s.weight]), [['Ed25519', 1], ['Secp256k1', 2], ['Secp256r1', 3]]);
  // Signer addresses: SDK vectors for the same mnemonic.
  assert.equal(r.signers[0].address, '0xa2d14fad60c56049ecf75246a481934691214ce413e6a8ae2fe6834c173a6133');
  assert.equal(r.signers[1].address, '0x9e8f732575cc5386f8df3c784cd3ed1b53ce538da79926b2ad54dcc1197d2532');
  // BCS MultiSigPublicKey: 0x03, ULEB count, (enum tag ‖ key ‖ weight)*, u16 threshold.
  const pk = base64.decode(r.rows[1][1]);
  assert.deepEqual([...pk.slice(0, 3)], [3, 3, 0]);
  assert.deepEqual([...pk.slice(-2)], [3, 0]);
  assert.equal(pk.length, 1 + 1 + (1 + 32 + 1) + 2 * (1 + 33 + 1) + 2);
});

test('order, weights and threshold all change the address', () => {
  const base = multisig(EXAMPLE, '3').rows[0][1];
  assert.notEqual(multisig(`${K1} 2\n${ED} 1\n${R1} 3`, '3').rows[0][1], base);
  assert.notEqual(multisig(EXAMPLE, '4').rows[0][1], base);
  assert.equal(multisig(`${ED}\n${K1} 2`, '3').rows[0][1], expectedAddress([ED, K1], [1, 2], 3));
});

test('raw keys with a scheme prefix', () => {
  const rawHex = '0x' + hex.encode(base64.decode(ED).slice(1));
  const s = parseSigner(`ed25519:${rawHex} 5`, 1);
  assert.equal(s.flag, 0);
  assert.equal(s.weight, 5);
  assert.equal(multisig(`ED25519:${rawHex}`, '1').rows[0][1], multisig(ED, '1').rows[0][1]);
});

test('empty input gives no result', () => {
  assert.equal(multisig('\n  \n', '1'), null);
});

test('errors', () => {
  assert.throws(() => multisig(`${ED} 1 2`, '1'), /^Error: Line 1: expected "public key \[weight\]"\.$/);
  assert.throws(() => multisig(`\n${ED} 0`, '1'), /Line 2: weight must be a whole number from 1 to 255/);
  assert.throws(() => multisig(`${ED} 256`, '1'), /from 1 to 255/);
  assert.throws(() => multisig('AAAA', '1'), /Line 1: a 2-byte key without a scheme/);
  assert.throws(() => multisig(`${ED}\n${ED}`, '1'), /Signer 2 repeats an earlier key/);
  assert.throws(() => multisig(ED, 'x'), /Threshold must be a whole number/);
  assert.throws(() => multisig(ED, '0'), /between 1 and 65535/);
  assert.throws(() => multisig(ED, '2'), /Threshold 2 is more than the total weight 1/);
  const eleven = Array.from({ length: 11 }, (_, i) => 'ed25519:0x' + hex.encode(ed25519.getPublicKey(new Uint8Array(32).fill(i + 1)))).join('\n');
  assert.throws(() => multisig(eleven, '1'), /^Error: A multisig can have at most 10 signers \(got 11\)\.$/);
});
