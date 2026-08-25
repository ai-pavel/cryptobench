import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, checkMnemonic, accountRange, deriveAccounts, mnemonicToSeedSync } from '../../src/solana/mnemonic-accounts/mnemonic-accounts.js';
import { base58 } from '../../src/solana/lib/sol.js';

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const hexOf = b => Buffer.from(b).toString('hex');

test('normalize collapses whitespace and case', () => {
  assert.equal(normalize('  Abandon\n ABOUT\t x '), 'abandon about x');
  assert.equal(normalize('   '), '');
});

test('BIP-39 seed vectors (empty and TREZOR passphrase)', () => {
  assert.equal(hexOf(mnemonicToSeedSync(ABANDON, '')), '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4');
  assert.equal(hexOf(mnemonicToSeedSync(ABANDON, 'TREZOR')), 'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04');
});

test('Example: Phantom path gives the well-known first address', () => {
  const words = checkMnemonic(ABANDON);
  assert.equal(words.length, 12);
  const scheme = "m/44'/501'/{i}'/0'";
  assert.deepEqual(accountRange(scheme, '0', '3'), { start: 0, count: 3, single: false });
  const accts = deriveAccounts(mnemonicToSeedSync(ABANDON, ''), scheme, 0, 3);
  assert.deepEqual(accts.map(a => a.path), ["m/44'/501'/0'/0'", "m/44'/501'/1'/0'", "m/44'/501'/2'/0'"]);
  // Address Phantom / Solflare show for the BIP-39 test mnemonic.
  assert.equal(accts[0].address, 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');
  // The secret key's second half is the address.
  assert.equal(base58.encode(base58.decode(accts[0].secret).slice(32)), accts[0].address);
});

test('SLIP-0010 ed25519 test vector 1', () => {
  const seed = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
  const pub = a => hexOf(base58.decode(a.address));
  assert.equal(pub(deriveAccounts(seed, 'm', 0, 1)[0]), 'a4b2856bfec510abab89753fac1ac0e1112364e7d250545963f135f2a33188ed');
  assert.equal(pub(deriveAccounts(seed, "m/{i}'", 0, 1)[0]), '8c8a13df77a28f3445213a0f432fde644acaa215fc72dcdf300d5efaa85d350c');
  assert.equal(pub(deriveAccounts(seed, "m/0'/1'", 0, 1)[0]), '1932a5270f335bed617d5b935c80aedb1a35bd9fc1e31acafd5372c30f5c1187');
});

test('Solana CLI scheme uses the first 32 bytes of the seed', () => {
  assert.deepEqual(accountRange('cli', '7', '50'), { start: 7, count: 1, single: true });
  const seed = mnemonicToSeedSync(ABANDON, '');
  const [a] = deriveAccounts(seed, 'cli', 0, 1);
  assert.equal(a.path, '(no derivation)');
  assert.equal(hexOf(base58.decode(a.secret).slice(0, 32)), hexOf(seed.slice(0, 32)));
});

test('account range is clamped', () => {
  const s = "m/44'/501'/{i}'";
  assert.deepEqual(accountRange(s, '-3', '500'), { start: 0, count: 100, single: false });
  assert.deepEqual(accountRange(s, '', ''), { start: 0, count: 1, single: false });
  assert.deepEqual(accountRange("m/44'/501'", '2', '5'), { start: 2, count: 1, single: true });
});

test('bad paths throw', () => {
  assert.throws(() => accountRange("m/44'/501'/{i}", '0', '1'), /hardened indexes only/);
  assert.throws(() => accountRange('x/1', '0', '1'), /Invalid derivation path "x\/1"/);
});

test('bad mnemonics throw readable errors', () => {
  assert.throws(() => checkMnemonic('abandon foo qqq'), /^Error: Not in the BIP-39 English word list: foo, qqq$/);
  assert.throws(() => checkMnemonic('abandon abandon abandon'), /12, 15, 18, 21 or 24 words \(got 3\)/);
  assert.throws(() => checkMnemonic(ABANDON.replace('about', 'abandon')), /Checksum is invalid/);
});
