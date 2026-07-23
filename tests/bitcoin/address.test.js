import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressInfo, scriptRows, partsScript, bech32Typo, decodeAddress, EXAMPLE } from '../../src/bitcoin/address/address.js';
import { NETWORKS, hexToBytes, bytesToHex } from '../../src/bitcoin/lib/btc.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;

test('empty input gives no result', () => {
  assert.equal(addressInfo('  '), null);
});

test('Example: BIP84 first receive address', () => {
  const r = addressInfo(EXAMPLE.address);
  assert.equal(r.message, '✓ Valid P2WPKH address');
  assert.equal(value(r.rows, 'Network'), 'Bitcoin mainnet');
  assert.equal(value(r.rows, 'Encoding'), 'Bech32 (BIP173)');
  assert.equal(value(r.rows, 'Human-readable part'), 'bc');
  assert.equal(value(r.rows, 'Witness version'), '0');
  assert.equal(value(r.rows, 'Witness program'), EXAMPLE.program);
  assert.equal(value(r.rows, 'scriptPubKey'), EXAMPLE.script);
  assert.equal(value(r.rows, 'ASM'), `OP_0 ${EXAMPLE.program}`);
  // The other two modes of the Example give the same address.
  assert.equal(value(scriptRows(hexToBytes(EXAMPLE.script), NETWORKS.mainnet), 'Address'), EXAMPLE.address);
  assert.equal(value(scriptRows(partsScript(EXAMPLE.ptype, EXAMPLE.program, '2'), NETWORKS.mainnet), 'Address'), EXAMPLE.address);
});

test('BIP173 / BIP350 valid addresses', () => {
  const up = addressInfo('BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4');
  assert.equal(value(up.rows, 'Witness program'), '751e76e8199196d454941c45d1b3a323f1433bd6');
  const wsh = addressInfo('tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7');
  assert.equal(wsh.message, '✓ Valid P2WSH address');
  assert.equal(value(wsh.rows, 'Network'), 'Bitcoin testnet, Bitcoin signet');
  assert.equal(value(wsh.rows, 'Witness program'), '1863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262');
  const tr = addressInfo('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0');
  assert.equal(tr.message, '✓ Valid P2TR address');
  assert.equal(value(tr.rows, 'Encoding'), 'Bech32m (BIP350)');
  assert.equal(value(tr.rows, 'Witness program'), '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
});

test('Base58 addresses', () => {
  const pkh = addressInfo('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  assert.equal(pkh.message, '✓ Valid P2PKH address');
  assert.equal(value(pkh.rows, 'Version byte'), '0x00');
  assert.equal(value(pkh.rows, 'Public key hash'), '62e907b15cbf27d5425399ebf6f0fb50ebb88f18');
  assert.match(value(pkh.rows, 'Raw Base58 bytes'), /^0062e907b15cbf27d5425399ebf6f0fb50ebb88f18[0-9a-f]{8}$/);
  const sh = addressInfo('3MaB7QVq3k4pQx3BhsvEADgzQonLSBwMdj');
  assert.equal(value(sh.rows, 'Script hash'), 'da1745e9b549bd0bfa1a569971c77eba30cd5a4b');
  assert.equal(value(sh.rows, 'Version byte'), '0x05');
});

test('BIP173 / BIP350 invalid addresses explain why', () => {
  // Version 2 with a bech32 (not bech32m) checksum.
  assert.throws(() => addressInfo('bc1zw508d6qejxtdg4y5r3zarvaryvqyzf3du'), /^Error: Valid Bech32 checksum, but not a valid segwit address/);
  // Invalid human-readable part.
  assert.throws(() => addressInfo('tc1qw508d6qejxtdg4y5r3zarvary0c5xw7kg3g4ty'), /"tc" is not a known Bitcoin, Litecoin or test network prefix/);
  assert.throws(() => addressInfo('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb'), /checksum does not match/);
  assert.throws(() => decodeAddress('hello'));
});

test('a one-character bech32 typo is located', () => {
  const typo = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyv';
  assert.throws(() => addressInfo(typo));
  assert.deepEqual(bech32Typo(typo), { index: 41, char: 'v', fix: 'u', fixed: EXAMPLE.address });
  assert.equal(bech32Typo('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb'), null);
});

test('scripts: networks, no-address scripts', () => {
  const ltc = scriptRows(hexToBytes(EXAMPLE.script), NETWORKS.litecoin);
  assert.match(value(ltc, 'Address'), /^ltc1q/);
  assert.equal(value(ltc, 'Human-readable part'), 'ltc');
  assert.throws(() => scriptRows(hexToBytes(EXAMPLE.script), NETWORKS.dogecoin), /no segwit addresses/);
  const p2pk = scriptRows(hexToBytes('210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ac'), NETWORKS.mainnet);
  assert.equal(value(p2pk, 'Address'), 'No address: this script type has no standard address');
  assert.equal(p2pk[0].copy, false);
  assert.equal(value(p2pk, 'Public key'), '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
  // Testnet P2PKH version byte.
  assert.equal(value(scriptRows(partsScript('p2pkh', '62e907b15cbf27d5425399ebf6f0fb50ebb88f18', ''), NETWORKS.testnet), 'Version byte'), '0x6f');
});

test('build from parts', () => {
  assert.equal(bytesToHex(partsScript('p2sh', 'da1745e9b549bd0bfa1a569971c77eba30cd5a4b', '')), 'a914da1745e9b549bd0bfa1a569971c77eba30cd5a4b87');
  const tr = scriptRows(partsScript('p2tr', '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', ''), NETWORKS.mainnet);
  assert.equal(value(tr, 'Address'), 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0');
  const v2 = scriptRows(partsScript('witness', '751e', '2'), NETWORKS.mainnet);
  assert.equal(value(v2, 'Type'), 'Segwit v2 (not yet defined)');
  assert.equal(value(v2, 'Encoding'), 'Bech32m (BIP350, witness v1+)');
  assert.throws(() => partsScript('p2wpkh', 'abcd', ''), /P2WPKH needs 20 bytes; this is 2/);
  assert.throws(() => partsScript('witness', '751e', '17'));
});
