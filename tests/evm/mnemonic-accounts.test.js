import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, checkMnemonic, parseOptions, seedOf, deriveAccounts } from '../../src/evm/mnemonic-accounts/mnemonic-accounts.js';
import { bytesToHex } from '../../src/evm/lib/evm.js';

const HARDHAT = 'test test test test test test test test test test test junk';
const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const STD = "m/44'/60'/0'/0/{i}";

test('normalize collapses whitespace and case', () => {
  assert.equal(normalize('  Test\ttest\n TEST  '), 'test test test');
});

test('valid mnemonics pass', () => {
  assert.equal(checkMnemonic(HARDHAT), null);
  assert.equal(checkMnemonic(ABANDON), null);
  assert.equal(checkMnemonic('zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo vote'), null);
});

test('mnemonic problems are explained', () => {
  assert.equal(checkMnemonic(''), 'A mnemonic has 12, 15, 18, 21 or 24 words; this one has 0');
  assert.equal(checkMnemonic('test test test'), 'A mnemonic has 12, 15, 18, 21 or 24 words; this one has 3');
  assert.equal(checkMnemonic(HARDHAT.replace('junk', 'junky').replace('test', 'tset')), 'Not in the BIP-39 English word list: tset, junky');
  assert.equal(checkMnemonic(HARDHAT.replace('junk', 'test')), 'The checksum is wrong: one of the words is probably mistyped or out of order');
});

test('BIP-39 seed vector with passphrase TREZOR', async () => {
  const seed = await seedOf(ABANDON, 'TREZOR');
  assert.equal(bytesToHex(seed), '0xc55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04');
});

test('example: Hardhat/Anvil default accounts', async () => {
  const accounts = deriveAccounts(await seedOf(HARDHAT, ''), parseOptions(STD, '0', '5'));
  assert.deepEqual(accounts.map(a => a.address), [
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  ]);
  assert.equal(accounts[0].privateKey, '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  assert.equal(accounts[1].privateKey, '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  assert.equal(accounts[2].path, "m/44'/60'/0'/0/2");
  assert.equal(accounts[4].index, 4);
});

test('start index and the abandon…about vector', async () => {
  const [acc] = deriveAccounts(await seedOf(ABANDON, ''), parseOptions(STD, '0', '1'));
  assert.equal(acc.address, '0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  const later = deriveAccounts(await seedOf(HARDHAT, ''), parseOptions(` ${STD} `, '3', '1'));
  assert.deepEqual(later.map(a => [a.index, a.address]), [[3, '0x90F79bf6EB2c4f870365E785982E1f101E93b906']]);
});

test('passphrase is NFKD-normalized', async () => {
  assert.deepEqual(await seedOf(HARDHAT, 'é'), await seedOf(HARDHAT, 'é'));
});

test('bad options throw', () => {
  assert.throws(() => parseOptions("m/44'/60'/x", '0', '5'), /Path must look like/);
  assert.throws(() => parseOptions('44/60', '0', '5'), /Path must look like/);
  assert.throws(() => parseOptions(STD, '-1', '5'), /Start index must be a whole number from 0/);
  assert.throws(() => parseOptions(STD, String(2 ** 31), '5'), /Start index/);
  assert.throws(() => parseOptions(STD, '1.5', '5'), /Start index/);
  assert.throws(() => parseOptions(STD, '0', '0'), /Accounts must be between 1 and 100/);
  assert.throws(() => parseOptions(STD, '0', '101'), /Accounts must be between 1 and 100/);
});
