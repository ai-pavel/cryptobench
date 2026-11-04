import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HASHERS, TYPES, PRESETS, intLE, storagePrefix, buildKey, splitKey } from '../../src/polkadot/storage-key/storage-key.js';
import { toHex } from '../../src/polkadot/lib/dot.js';

const ALICE_DOT = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
const ALICE_HEX = 'd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
// Well-known storage keys (as seen in polkadot.js / chain state queries).
const SYSTEM_ACCOUNT_ALICE = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9de1e86a9a8c739864cf3cc5ec2bea59f' + ALICE_HEX;
const TOTAL_ISSUANCE = '0xc2261276cc9d1f8598ea4b6a74b15c2f57c875e4cff74148e4628f264b974c80';
const TIMESTAMP_NOW = '0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb';
const PARAS_HEADS_1000 = '0xcd710b30bd2eab0352ddcc26417aa1941b3c252fcb29d88eff4f3de5de4476c3b6ff6f7d467b87a9e8030000';
const preset = name => PRESETS.find(p => p[0] === name).slice(1);
const build = name => toHex(buildKey(...preset(name)).full);

test('well-known keys from the presets', () => {
  assert.equal(build('System.Account'), SYSTEM_ACCOUNT_ALICE);
  assert.equal(build('Balances.TotalIssuance'), TOTAL_ISSUANCE);
  assert.equal(build('Timestamp.Now'), TIMESTAMP_NOW);
  assert.equal(build('Paras.Heads'), PARAS_HEADS_1000);
});

test('parts list each prefix and hashed key', () => {
  const { full, parts } = buildKey(...preset('System.Account'));
  assert.equal(full.length, 80);
  assert.deepEqual(parts.map(p => p[0]), ['Twox128(pallet)', 'Twox128(item)', 'Blake2_128Concat(key 1)']);
  assert.equal(parts[0][1], '0x26aa394eea5630e07c48ae0c9558cef7');
  assert.equal(parts[1][1], '0xb99d880ec681799c0cf30e8886371da9');
  assert.equal(toHex(storagePrefix(' System ', 'Account ')), SYSTEM_ACCOUNT_ALICE.slice(0, 66));
});

test('example split: a System.Account key', () => {
  const rows = splitKey(SYSTEM_ACCOUNT_ALICE, 'System', 'Account', preset('System.Account')[2]);
  assert.deepEqual(rows.map(r => r[2].note), ['matches Twox128("System")', 'matches Twox128("Account")', 'Blake2_128Concat hash checks out']);
  assert.equal(rows[2][0], 'Key 1 (AccountId32)');
  assert.equal(rows[2][1], `5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY  (0x${ALICE_HEX})`);
});

test('split a double map, a Twox64Concat u32 and mismatches', () => {
  const [p, i, ks] = preset('Assets.Account');
  const rows = splitKey(toHex(buildKey(p, i, ks).full), p, i, ks);
  assert.equal(rows[2][1], '1984');
  assert.equal(rows[3][0], 'Key 2 (AccountId32)');
  assert.equal(splitKey(PARAS_HEADS_1000, 'Paras', 'Heads', preset('Paras.Heads')[2])[2][1], '1000');
  const wrong = splitKey(SYSTEM_ACCOUNT_ALICE, 'Balances', 'Account', [['Twox64Concat', 'AccountId32', '']]);
  assert.equal(wrong[0][2].note, 'does not match the pallet name above');
  assert.equal(wrong[2][2].note, 'Twox64Concat hash does not match — wrong hasher or type?');
  assert.equal(wrong[3][0], 'Left over');
});

test('opaque hashers, Identity and raw last keys', () => {
  const opaque = splitKey(SYSTEM_ACCOUNT_ALICE, 'System', 'Account', [['Blake2_128', 'AccountId32', '']]);
  assert.match(opaque[2][2].note, /hides the key/);
  assert.equal(opaque[3][0], 'Left over');
  const k = toHex(buildKey('A', 'B', [['Identity', 'Raw SCALE hex', '0x0102']]).full);
  const rows = splitKey(k, 'A', 'B', [['Identity', 'Raw SCALE hex', '']]);
  assert.deepEqual(rows[2], ['Key 1 (Raw SCALE hex)', '0x0102', { note: 'Identity' }]);
  assert.throws(() => splitKey(k, 'A', 'B', [['Identity', 'Raw SCALE hex', ''], ['Identity', 'u32', '']]), /raw keys can only be split when they are the last key/);
});

test('hashers and integer types', () => {
  assert.equal(toHex(HASHERS.Identity.hash(new Uint8Array([1]))), '0x01');
  assert.equal(toHex(HASHERS.Twox64Concat.hash(intLE('1000', 4))), '0xb6ff6f7d467b87a9e8030000');
  assert.equal(toHex(intLE(' 1 ', 8)), '0x0100000000000000');
  assert.equal(TYPES.u128.show(intLE('340282366920938463463374607431768211455', 16)), '340282366920938463463374607431768211455');
  assert.equal(toHex(TYPES.AccountId32.enc(ALICE_DOT)), '0x' + ALICE_HEX);
});

test('errors', () => {
  assert.throws(() => buildKey(' ', 'Account', []), /Enter the pallet and storage item names/);
  assert.throws(() => buildKey('System', 'Account', [['Twox64Concat', 'u32', '-1']]), /^Error: Key 1: Expected a whole number, got "-1"\.$/);
  assert.throws(() => buildKey('System', 'Account', [['Identity', 'H256', '0x12']]), /Key 1: H256 must be 32 bytes/);
  assert.throws(() => buildKey('System', 'Account', [['Identity', 'AccountId32', '']]), /Key 1: /);
  assert.throws(() => splitKey('0x1234', 'System', 'Account', []), /at least 32 bytes/);
  assert.throws(() => splitKey(SYSTEM_ACCOUNT_ALICE.slice(0, -2), 'System', 'Account', preset('System.Account')[2]), /Key 1: the storage key is too short/);
  assert.throws(() => splitKey('0xzz', 'System', 'Account', []));
});
