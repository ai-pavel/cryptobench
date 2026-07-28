import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMnemonic, mnemonicRows, mnemonicFromEntropy, EXAMPLE } from '../../src/bitcoin/mnemonic-seed/mnemonic-seed.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;

test('empty input gives no result', () => {
  assert.equal(checkMnemonic('  \n'), null);
  assert.equal(mnemonicFromEntropy(' '), null);
});

test('Example: BIP39 (Trezor) vector with passphrase TREZOR', async () => {
  const c = checkMnemonic(EXAMPLE.mnemonic);
  assert.equal(c.status, 'ok');
  assert.equal(c.message, '✓ Valid 12-word BIP39 mnemonic');
  const rows = await mnemonicRows(c.words, EXAMPLE.passphrase);
  assert.equal(value(rows, 'Entropy'), '00000000000000000000000000000000');
  assert.equal(rows[0].note, '128 bits');
  // SHA-256 of 16 zero bytes starts with 0x37: checksum 0011 = 3 = "about".
  assert.equal(value(rows, 'Checksum bits'), '0011');
  assert.equal(value(rows, 'Seed (BIP39)'), 'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04');
  assert.equal(rows[2].note, 'With the passphrase');
  assert.equal(value(rows, 'BIP32 root key'), 'xprv9s21ZrQH143K3h3fDYiay8mocZ3afhfULfb5GX8kCBdno77K4HiA15Tg23wpbeF1pLfs1c5SPmYHrEpTuuRhxMwvKDwqdKiGJS9XFKzUsAF');
  assert.match(value(rows, 'Words (index)'), /^1\. abandon \(0\)\n/);
  assert.match(value(rows, 'Words (index)'), /\n12\. about \(3\)$/);
});

test('BIP39 (Trezor) vector: legal winner … yellow', async () => {
  const words = mnemonicFromEntropy('7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f');
  assert.equal(words, 'legal winner thank year wave sausage worth useful legal winner thank yellow');
  const rows = await mnemonicRows(words, 'TREZOR');
  assert.equal(value(rows, 'Seed (BIP39)'), '2e8905819b8723fe2c1d161860e5ee1830318dbf49a83bd451cfb8440c28bd6fa457fe1296106559a3c80937a1c1069be3a3a5bd381ee6260e8d9739fce1f607');
  assert.equal(value(rows, 'BIP32 root key'), 'xprv9s21ZrQH143K2gA81bYFHqU68xz1cX2APaSq5tt6MFSLeXnCKV1RVUJt9FWNTbrrryem4ZckN8k4Ls1H6nwdvDTvnV7zEXs2HgPezuVccsq');
});

test('24 words: 8 checksum bits, no passphrase', async () => {
  const words = mnemonicFromEntropy('ff'.repeat(32));
  assert.equal(words, 'zoo '.repeat(23) + 'vote');
  const c = checkMnemonic(words.toUpperCase());
  assert.equal(c.words, words);
  const rows = await mnemonicRows(c.words, '');
  assert.equal(rows[0].note, '256 bits');
  assert.equal(value(rows, 'Checksum bits').length, 8);
  assert.equal(rows[2].note, 'No passphrase');
});

test('invalid mnemonics are explained', () => {
  const swapped = checkMnemonic('about abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon');
  assert.equal(swapped.status, 'bad');
  assert.equal(swapped.message, '✗ Checksum does not match: a word is wrong or the order is changed');
  assert.equal(checkMnemonic('abandon abandon').message, '✗ 2 words; a BIP39 mnemonic has 12, 15, 18, 21 or 24');
  assert.match(checkMnemonic(EXAMPLE.mnemonic.replace('about', 'bitcoinz')).message, /Not in the BIP39 English word list: bitcoinz/);
});

test('bad entropy throws', () => {
  assert.throws(() => mnemonicFromEntropy('00'.repeat(15)), /16, 20, 24, 28 or 32 bytes/);
  assert.throws(() => mnemonicFromEntropy('zz'));
});
