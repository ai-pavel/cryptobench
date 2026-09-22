import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAccount, checkPhrase, newPhrase, EXAMPLE } from '../../src/cardano/mnemonic-accounts/mnemonic-accounts.js';

// The Example phrase is the one behind the CIP-19 test vectors and the
// cardano-serialization-lib bip32_12_* address tests (Icarus root, m/1852'/1815'/0').
const form = over => ({ phrase: EXAMPLE, passphrase: '', account: '0', count: '1', role: '0', network: '1', ...over });

test('empty phrase gives no result', () => {
  assert.equal(deriveAccount(form({ phrase: '  ' })), null);
});

test('Example: payment key 0/0 has the CIP-19 key hash; base and stake addresses match cardano-serialization-lib', () => {
  const r = deriveAccount(form());
  assert.equal(r.addresses.length, 1);
  assert.equal(r.addresses[0].path, "m/1852'/1815'/0'/0/0");
  assert.equal(r.addresses[0].keyHash, '9493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e');
  assert.equal(r.addresses[0].address, 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwqfjkjv7');
  assert.equal(r.stakeAddress, 'stake1uyevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqxdekzz');
  assert.equal(r.stakeKeyHash, '32c728d3861e164cab28cb8f006448139c8f1740ffb8e7aa9e5232dc');
  assert.match(r.rootXsk, /^root_xsk1/);
  assert.match(r.acctXvk, /^acct_xvk1/);
  assert.match(r.stakeXsk, /^stake_xsk1/);
  assert.match(r.addresses[0].xsk, /^addr_xsk1/);
});

test('testnet addresses', () => {
  const r = deriveAccount(form({ network: '0' }));
  assert.equal(r.addresses[0].address, 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp');
  assert.equal(r.stakeAddress, 'stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl');
});

test('role, count, account and passphrase change the derivation', () => {
  const base = deriveAccount(form({ count: '3' }));
  assert.deepEqual(base.addresses.map(a => a.path), ["m/1852'/1815'/0'/0/0", "m/1852'/1815'/0'/0/1", "m/1852'/1815'/0'/0/2"]);
  assert.equal(new Set(base.addresses.map(a => a.address)).size, 3);
  const change = deriveAccount(form({ role: '1' }));
  assert.equal(change.addresses[0].path, "m/1852'/1815'/0'/1/0");
  assert.notEqual(change.addresses[0].keyHash, base.addresses[0].keyHash);
  assert.equal(change.stakeAddress, base.stakeAddress);
  const acct1 = deriveAccount(form({ account: '1' }));
  assert.notEqual(acct1.stakeAddress, base.stakeAddress);
  assert.notEqual(deriveAccount(form({ passphrase: 'x' })).rootXsk, base.rootXsk);
});

test('the phrase is normalised: case and extra spaces do not matter', () => {
  assert.equal(checkPhrase('  TEST walk\nnut penalty hip pave soap entry language right filter   choice '), EXAMPLE);
});

test('input errors throw', () => {
  assert.throws(() => deriveAccount(form({ phrase: 'test walk nut' })), /has 12, 15, 18, 21 or 24 words; this one has 3\./);
  assert.throws(() => deriveAccount(form({ phrase: EXAMPLE.replace('walk', 'wakl') })), /Not in the BIP-39 English word list: wakl/);
  assert.throws(() => deriveAccount(form({ phrase: EXAMPLE.replace('choice', 'abandon') })), /The checksum doesn't match/);
  assert.throws(() => deriveAccount(form({ account: '-1' })), /Account must be a whole number from 0\./);
  assert.throws(() => deriveAccount(form({ account: String(2 ** 31) })), /Account must be a whole number/);
  assert.throws(() => deriveAccount(form({ count: '0' })), /Show between 1 and 100 addresses\./);
  assert.throws(() => deriveAccount(form({ count: '101' })), /Show between 1 and 100 addresses\./);
});

test('new phrases are valid 15 and 24 word phrases', () => {
  assert.equal(checkPhrase(newPhrase(160)).split(' ').length, 15);
  assert.equal(checkPhrase(newPhrase(256)).split(' ').length, 24);
});
