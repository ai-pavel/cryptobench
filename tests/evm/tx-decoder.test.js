import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeTransaction, EXAMPLE } from '../../src/evm/tx-decoder/tx-decoder.js';
import { rlpEncode, bigIntToBytes, hexToBytes, bytesToHex, keccak, signHash } from '../../src/evm/lib/evm.js';

const row = (r, label) => r.rows.find(x => x && x.label === label);

test('empty input gives no result', () => {
  assert.equal(describeTransaction(' '), null);
});

test('EIP-155 example transaction (from the EIP text)', () => {
  // Signed with private key 0x4646…46; nonce 9, 20 gwei, 21000 gas, 1 ETH to 0x3535…35, chain 1.
  const raw = '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83';
  const r = describeTransaction(raw);
  assert.equal(row(r, 'Type').value, '0 · Legacy (EIP-155)');
  assert.equal(row(r, 'From (recovered)').value, '0x9d8A62f656a8d1615C1294fd71e9CFb3E4855A4F');
  assert.equal(row(r, 'Chain ID').value, '1 · Ethereum');
  assert.equal(row(r, 'Nonce').value, '9');
  assert.equal(row(r, 'Value').value, '1 ETH');
  assert.equal(row(r, 'Value').note, '1000000000000000000 wei');
  assert.equal(row(r, 'Gas price').value, '20 gwei');
  assert.equal(row(r, 'Gas limit').value, '21000');
  assert.equal(row(r, 'Max cost').value, '1.00042 ETH');
  assert.equal(row(r, 'Data').note, 'empty');
  assert.equal(row(r, 'v').value, '37');
  // Signing hash given in EIP-155.
  assert.equal(row(r, 'Signing hash').value, '0xdaf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53');
  assert.equal(row(r, 'Max fee per gas'), undefined);
  assert.equal(r.decodeData, null);
});

test('example: EIP-1559 USDC transfer signed by Hardhat account #0', () => {
  const r = describeTransaction(EXAMPLE);
  assert.equal(row(r, 'Type').value, '2 · EIP-1559 (dynamic fee)');
  assert.equal(row(r, 'From (recovered)').value, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  assert.equal(row(r, 'To').value, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
  assert.equal(row(r, 'Chain ID').value, '1 · Ethereum');
  assert.equal(row(r, 'Nonce').value, '7');
  assert.equal(row(r, 'Max priority fee').value, '1 gwei');
  assert.equal(row(r, 'Max fee per gas').value, '30 gwei');
  assert.equal(row(r, 'Gas limit').value, '60000');
  assert.equal(row(r, 'Gas price'), undefined);
  assert.equal(row(r, 'Access list').value, '(empty)');
  assert.equal(row(r, 'y parity').value, '1');
  assert.equal(row(r, 'Data').note, '68 bytes · selector 0xa9059cbb');
  assert.equal(r.decodeData, row(r, 'Data').value);
  assert.equal(row(r, 'Transaction hash').value, bytesToHex(keccak(hexToBytes(EXAMPLE))));
});

test('contract creation shows the new contract address', () => {
  // Legacy EIP-155 deployment (nonce 0) signed by Hardhat #0: the first Hardhat deployment
  // famously lands at 0x5FbDB2315678afecb367f032d93F642f64180aa3.
  const priv = hexToBytes('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const body = [new Uint8Array(), bigIntToBytes(10n ** 9n), bigIntToBytes(100000n), new Uint8Array(), new Uint8Array(), Uint8Array.of(0)];
  const sig = signHash(keccak(rlpEncode([...body, bigIntToBytes(1n), new Uint8Array(), new Uint8Array()])), priv);
  const raw = bytesToHex(rlpEncode([...body, bigIntToBytes(BigInt(37 + sig.yParity)), sig.r, sig.s]));
  const r = describeTransaction(raw);
  const to = row(r, 'To');
  assert.equal(to.value, 'Contract creation');
  assert.equal(to.copy, false);
  assert.equal(to.note, 'New contract address: 0x5FbDB2315678afecb367f032d93F642f64180aa3');
  assert.equal(row(r, 'Data').note, '1 bytes');
  assert.equal(r.decodeData, null);
});

test('pre-EIP-155 chain id', () => {
  const priv = hexToBytes('0x' + '46'.repeat(32));
  const body = [Uint8Array.of(9), bigIntToBytes(20n * 10n ** 9n), bigIntToBytes(21000n), hexToBytes('0x' + '35'.repeat(20)), bigIntToBytes(10n ** 18n), new Uint8Array()];
  const sig = signHash(keccak(rlpEncode(body)), priv);
  const r = describeTransaction(bytesToHex(rlpEncode([...body, bigIntToBytes(BigInt(sig.v)), sig.r, sig.s])));
  assert.equal(row(r, 'Chain ID').value, 'None (pre-EIP-155, valid on any chain)');
  assert.equal(row(r, 'From (recovered)').value, '0x9d8A62f656a8d1615C1294fd71e9CFb3E4855A4F');
});

test('malformed transactions throw', () => {
  assert.throws(() => describeTransaction('0x'), /Transaction is empty/);
  assert.throws(() => describeTransaction('0x7f00'), /Unknown transaction type 0x7f/);
  assert.throws(() => describeTransaction('0xc0'), /legacy transaction has 9 fields/);
  assert.throws(() => describeTransaction(EXAMPLE.slice(0, -4)));
  assert.throws(() => describeTransaction('nothex'));
});
