import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAccounts, checkWords, normalizeMnemonic, parseIntField, coinMismatch } from '../../src/cosmos/mnemonic-accounts/mnemonic-accounts.js';

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('Example: the "abandon … about" test mnemonic on the Cosmos Hub', () => {
  const a = deriveAccounts({ mnemonic: ABANDON, coin: 118, prefix: 'cosmos', account: 0, start: 0, count: 3 });
  assert.equal(a.length, 3);
  assert.deepEqual(a.map(x => x.path), ["m/44'/118'/0'/0/0", "m/44'/118'/0'/0/1", "m/44'/118'/0'/0/2"]);
  // Well-known first address (Keplr, CosmJS) and its key.
  assert.equal(a[0].address, 'cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4');
  assert.equal(a[0].privateKey, 'c4a48e2fce1481cd3294b4490f6678090ea98d3d0e5cd984558ab0968741b104');
  assert.equal(Buffer.from(a[0].publicKey, 'hex').toString('base64'), 'Ak9OKtmcNNYLm6YoPJQxqEGK+GcyEpYfl6d7Y3f80Fti');
  assert.equal(a[0].ethAddress, '');
  assert.equal(new Set(a.map(x => x.address)).size, 3);
});

test('coin type 60 gives Ethereum-style addresses', () => {
  const [a] = deriveAccounts({ mnemonic: ABANDON, coin: 60, prefix: 'inj', count: 1 });
  // The well-known first Ethereum account of this mnemonic.
  assert.equal(a.ethAddress, '0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  assert.match(a.address, /^inj1/);
});

test('start index, account and passphrase change the derivation', () => {
  const all = deriveAccounts({ mnemonic: ABANDON, coin: 118, prefix: 'cosmos', count: 3 });
  const [third] = deriveAccounts({ mnemonic: ABANDON, coin: 118, prefix: 'cosmos', start: 2, count: 1 });
  assert.deepEqual(third, all[2]);
  const [acct1] = deriveAccounts({ mnemonic: ABANDON, coin: 118, prefix: 'cosmos', account: 1, count: 1 });
  assert.equal(acct1.path, "m/44'/118'/1'/0/0");
  assert.notEqual(acct1.address, all[0].address);
  const [withPass] = deriveAccounts({ mnemonic: ABANDON, passphrase: 'TREZOR', coin: 118, prefix: 'cosmos', count: 1 });
  assert.notEqual(withPass.address, all[0].address);
  // Messy whitespace and case are normalized.
  const [messy] = deriveAccounts({ mnemonic: '  ' + ABANDON.toUpperCase().replace(/ /g, '\n  ') + ' ', coin: 118, prefix: 'cosmos', count: 1 });
  assert.equal(messy.address, all[0].address);
});

test('mnemonic checks', () => {
  assert.equal(normalizeMnemonic('  A  b\tC '), 'a b c');
  assert.equal(checkWords(ABANDON), '');
  assert.match(checkWords('abandon abandon'), /12, 15, 18, 21 or 24 words; this one has 2/);
  assert.match(checkWords(ABANDON.replace('about', 'aboutx')), /Not in the BIP39 English word list: aboutx\./);
  assert.match(checkWords(ABANDON.replace('about', 'abandon')), /checksum doesn't match/);
  assert.throws(() => deriveAccounts({ mnemonic: ABANDON.replace('about', 'abandon'), coin: 118, prefix: 'cosmos', count: 1 }), /checksum doesn't match/);
});

test('number fields', () => {
  assert.equal(parseIntField('5', 1, 50, 'Count'), 5);
  assert.throws(() => parseIntField('0', 1, 50, 'Count'), /Count must be a whole number from 1 to 50\./);
  assert.throws(() => parseIntField('51', 1, 50, 'Count'), /from 1 to 50/);
  assert.throws(() => parseIntField('1.5', 0, 9, 'Account'), /Account must be a whole number/);
});

test('coin type mismatch warning', () => {
  assert.equal(coinMismatch('cosmos', 118), '');
  assert.match(coinMismatch('terra', 118), /^Terra wallets normally use coin type 330, not 118\./);
  assert.equal(coinMismatch('unknown', 118), '');
});
