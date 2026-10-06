import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMnemonic, checkMnemonic, checkRange, deriveAccounts, mnemonicSeed, derive, DEFAULT_PATH } from '../../src/sui/mnemonic-accounts/mnemonic-accounts.js';

// Vectors from the Sui TypeScript SDK keypair tests (ed25519 / secp256k1 / secp256r1, account 0).
const FILM = 'film crazy soon outside stand loop subway crumble thrive popular green nuclear struggle pistol arm wife phrase warfare march wheat nephew ask sunny firm';
const ACT = 'act wing dilemma glory episode region allow mad tourist humble muffin oblige';
const first = (phrase, flag) => deriveAccounts(mnemonicSeed(phrase), flag, DEFAULT_PATH[flag], '0', '1')[0];

test('Example mnemonic: Ed25519 (m/44\'/784\'/0\'/0\'/0\')', () => {
  const list = deriveAccounts(mnemonicSeed(FILM), 0, DEFAULT_PATH[0], '0', '3');
  assert.equal(list.length, 3);
  assert.deepEqual(list.map(a => a.path), ["m/44'/784'/0'/0'/0'", "m/44'/784'/1'/0'/0'", "m/44'/784'/2'/0'/0'"]);
  assert.equal(list[0].address, '0xa2d14fad60c56049ecf75246a481934691214ce413e6a8ae2fe6834c173a6133');
  assert.equal(list[0].suiprivkey, 'suiprivkey1qrwsjvr6gwaxmsvxk4cfun99ra8uwxg3c9pl0nhle7xxpe4s80y05ctazer');
  assert.equal(new Set(list.map(a => a.address)).size, 3);
});

test('Secp256k1 (m/54\'/784\'/0\'/0/0) and Secp256r1 (m/74\'/784\'/0\'/0/0)', () => {
  assert.equal(first(FILM, 1).address, '0x9e8f732575cc5386f8df3c784cd3ed1b53ce538da79926b2ad54dcc1197d2532');
  assert.equal(first(ACT, 2).address, '0x4a822457f1970468d38dae8e63fb60eefdaa497d74d781f581ea2d137ec36f3a');
});

test('start index offsets the accounts', () => {
  const seed = mnemonicSeed(FILM);
  const a = deriveAccounts(seed, 0, DEFAULT_PATH[0], '0', '3');
  const b = deriveAccounts(seed, 0, DEFAULT_PATH[0], '2', '1');
  assert.equal(b[0].i, 2);
  assert.equal(b[0].address, a[2].address);
});

test('mnemonic normalisation and validation', () => {
  assert.equal(normalizeMnemonic('  Film  CRAZY\nsoon '), 'film crazy soon');
  checkMnemonic(FILM);
  checkMnemonic(ACT);
  assert.throws(() => checkMnemonic('film crazy soon'), /12, 15, 18, 21 or 24 words \(got 3\)/);
  assert.throws(() => checkMnemonic(ACT.replace('act', 'xyzzy')), /Not in the BIP-39 English word list: xyzzy$/);
  assert.throws(() => checkMnemonic(ACT.replace('oblige', 'act')), /checksum is wrong/);
});

test('range and path errors', () => {
  checkRange(DEFAULT_PATH[0], '0', '5');
  assert.throws(() => checkRange("m/44'/784'/0'/0'/0'", '0', '5'), /needs \{i\}/);
  assert.throws(() => checkRange(DEFAULT_PATH[0], '2147483648', '5'), /below 2³¹/);
  assert.throws(() => checkRange(DEFAULT_PATH[0], '-1', '5'), /Start index/);
  assert.throws(() => checkRange(DEFAULT_PATH[0], '0', '0'), /between 1 and 50/);
  assert.throws(() => checkRange(DEFAULT_PATH[0], '0', '51'), /between 1 and 50/);
  const seed = mnemonicSeed(FILM);
  assert.throws(() => derive(seed, 1, "m/54'/784'/0'/0'/0'"), /must look like m\/54'\/784'\/0'\/0\/0/);
  assert.throws(() => derive(seed, 0, "m/44'/784'/0'/0/0")); // SLIP-0010 Ed25519 is hardened only
});
