import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parsePublicKey, mnemonicPublicKey, walletOptions, walletAddresses, defaultWalletId } from '../../src/ton/wallet-address/wallet-address.js';
import { walletCode } from '../../src/ton/lib/ton.js';

// The Example's public key (of the test mnemonic shown by the Mnemonic Keys tool).
const PUB = '4ccc0f23905323a49b2b64efe0ec35e8497a49f3532a4736b1f265f85280fb6d';
const MNEMONIC = 'voice fortune fox tiny force rookie give wear promote depth dawn whip life october supreme excite green unveil hunt unable struggle dream wool wrap';
const DEFAULTS = { wc: '0', net: 'main', wid: '', sub: '0' };

// Well-known code cell hashes of the standard wallet contracts.
const CODE_HASH = {
  v3r1: 'b61041a58a7980b946e8fb9e198e3c904d24799ffa36574ea4251c41a566f581',
  v3r2: '84dafa449f98a6987789ba232358072bc0f76dc4524002a5d0918b9a75d2d599',
  v4r2: 'feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0',
  v5r1: '20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f',
};

const sha256 = (...parts) => createHash('sha256').update(Buffer.concat(parts.map(p => Buffer.from(p)))).digest();
const u16 = n => [n >> 8, n & 0xff];

// Independent StateInit hash (TON cell representation hash) for v3/v4 wallets:
// data = seqno:uint32 wallet_id:uint32 public_key:bits256 [plugins:(HashmapE) = 0 bit for v4].
function stateInitHash(version, pub, walletId) {
  const code = walletCode(version);
  assert.equal(Buffer.from(code.hash()).toString('hex'), CODE_HASH[version]);
  const bytes = [0, 0, 0, 0, ...[24, 16, 8, 0].map(s => (walletId >>> s) & 0xff), ...pub];
  let dataCell;
  if (version === 'v4r2') {
    // 321 bits: one 0 bit, then the completion tag 1 and padding.
    dataCell = sha256([0, 81], bytes, [0x40]);
  } else {
    dataCell = sha256([0, 80], bytes);
  }
  // StateInit: 00110 (no split_depth, no special, code, data, no library) + 2 refs.
  return sha256([2, 1, 0x34], u16(code.depth()), [0, 0], code.hash(), dataCell).toString('hex');
}

test('public key parsing', () => {
  assert.equal(parsePublicKey(PUB).length, 32);
  assert.deepEqual(parsePublicKey(Buffer.from(PUB, 'hex').toString('base64')), parsePublicKey(PUB));
  assert.throws(() => parsePublicKey('  '), /Enter a public key/);
  assert.throws(() => parsePublicKey('00'.repeat(31)), /Public key must be 32 bytes, got 31/);
});

test('settings parsing and errors', () => {
  assert.deepEqual(walletOptions(DEFAULTS), { workchain: 0, walletId: undefined, subwallet: 0, testnet: false });
  assert.deepEqual(walletOptions({ wc: '-1', net: 'test', wid: ' 42 ', sub: '' }), { workchain: -1, walletId: 42, subwallet: 0, testnet: true });
  assert.throws(() => walletOptions({ ...DEFAULTS, wid: '4294967296' }), /Wallet ID must be a whole number from 0 to 4294967295/);
  assert.throws(() => walletOptions({ ...DEFAULTS, wid: '1.5' }), /Wallet ID/);
  assert.throws(() => walletOptions({ ...DEFAULTS, sub: '32768' }), /Subwallet must be from 0 to 32767/);
  assert.equal(defaultWalletId('0'), '698983191');
  assert.equal(defaultWalletId('-1'), '698983190');
});

test('Example: all versions, newest first, matching an independent StateInit hash', () => {
  const ws = walletAddresses(parsePublicKey(PUB), walletOptions(DEFAULTS));
  assert.deepEqual(ws.map(w => w.name), ['Wallet v5r1 (W5)', 'Wallet v4r2', 'Wallet v3r2', 'Wallet v3r1']);
  for (const w of ws) {
    assert.match(w.raw, /^0:[0-9a-f]{64}$/);
    assert.match(w.bounceable, /^EQ/);
    assert.match(w.nonBounceable, /^UQ/);
  }
  const by = Object.fromEntries(ws.map(w => [w.version, w]));
  for (const v of ['v3r1', 'v3r2', 'v4r2']) assert.equal(by[v].raw, '0:' + stateInitHash(v, Buffer.from(PUB, 'hex'), 698983191));
});

test('custom wallet ID, workchain and testnet', () => {
  const pub = parsePublicKey(PUB);
  const ws = walletAddresses(pub, walletOptions({ wc: '-1', net: 'test', wid: '7', sub: '0' }));
  const v4 = ws.find(w => w.version === 'v4r2');
  assert.equal(v4.raw, '-1:' + stateInitHash('v4r2', pub, 7));
  assert.match(v4.bounceable, /^kf/); // testnet + bounceable + masterchain
  assert.match(v4.nonBounceable, /^0f/);
  // v5r1 ignores the wallet ID field but depends on the network and subwallet.
  const main = walletAddresses(pub, walletOptions(DEFAULTS))[0].raw;
  const test5 = walletAddresses(pub, walletOptions({ ...DEFAULTS, net: 'test' }))[0].raw;
  const sub5 = walletAddresses(pub, walletOptions({ ...DEFAULTS, sub: '1' }))[0].raw;
  assert.notEqual(main, test5);
  assert.notEqual(main, sub5);
});

test('mnemonic gives the Example public key', async () => {
  assert.equal(Buffer.from(await mnemonicPublicKey(MNEMONIC, '')).toString('hex'), PUB);
  await assert.rejects(() => mnemonicPublicKey('foo abandon qux', ''), /Not in the word list: foo, qux/);
});
