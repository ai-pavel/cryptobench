import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEV, PRESETS, prefixFrom, clampCount, deriveAccounts } from '../../src/polkadot/mnemonic-accounts/mnemonic-accounts.js';

// Known values for the Substrate dev phrase (subkey / polkadot.js keyring).
const SEED = '0xfac7959dbfe72f052e5a0c3c8d6530f202b02fd8f9f5ca3580ec8deb7797479e';
const row = (r, k) => r.rows.find(x => x && x[0] === k)?.[1];
const derive = o => deriveAccounts({ phrase: DEV, path: '', pass: '', type: 'sr25519', prefix: 42, ...o });

test('example: dev phrase //Alice (sr25519)', () => {
  const r = derive({ path: '//Alice' });
  assert.equal(row(r, 'Address'), '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
  assert.equal(row(r, 'Public key'), '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d');
  assert.equal(row(r, 'Path'), '//Alice');
  assert.equal(r.rows.length, 6);
  assert.equal(r.numbered, null);
  // The Example button selects network option 2, Generic Substrate (42).
  assert.equal(prefixFrom('2', ''), 42);
  // On Kusama (option 1).
  assert.equal(row(derive({ path: '//Alice', prefix: prefixFrom('1', '') }), 'Address'), 'HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F');
});

test('other dev accounts', () => {
  assert.equal(row(derive({ path: '//Bob' }), 'Address'), '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty');
  assert.equal(row(derive({ path: '//Charlie' }), 'Address'), '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y');
  assert.equal(row(derive({ path: '//Alice//stash' }), 'Address'), '5GNJqTPyNqANBkUVMN1LPPrxXnFouWXoe2wNSmmEoLctxiZY');
  assert.equal(row(derive({}), 'Address'), '5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV');
  assert.equal(row(derive({}), 'Path'), '(none)');
});

test('ed25519 and ECDSA //Alice', () => {
  const ed = derive({ path: '//Alice', type: 'ed25519', reveal: true });
  assert.equal(row(ed, 'Address'), '5FA9nQDVg267DEd8m1ZypXLBnvN7SFxYwV7ndqSYGiN9TTpu');
  assert.equal(row(ed, 'Private key'), '0xabf8e5bdbe30c65656c0a3cbd181ff8a56294a69dfedd27982aace4a76909115');
  const ec = derive({ path: '//Alice', type: 'ecdsa' });
  assert.equal(row(ec, 'Address'), '5C7C2Z5sWbytvHpuLTvzKunnnRwQxft1jiqrLD5rhucQ5S9X');
  assert.equal(row(ec, 'Public key'), '0x020a1091341fe5664bfa1782d5e04779689068c916b04cb365ec3153755684d9a1');
  assert.ok(row(ec, 'Account id'));
  assert.throws(() => derive({ path: '//Alice/soft', type: 'ed25519' }), /supports only hard derivation/);
});

test('reveal shows the mini-secret seed (not the BIP-39 seed)', () => {
  const r = derive({ path: '//Alice', reveal: true });
  assert.equal(row(r, 'Seed (mini-secret)'), SEED);
  assert.match(row(r, 'Secret key (64 bytes)'), /^0x[0-9a-f]{128}$/);
  assert.equal(row(derive({ path: '//Alice' }), 'Seed (mini-secret)'), undefined);
});

test('hex seed input equals the mnemonic; whitespace in the phrase is normalised', () => {
  assert.equal(row(deriveAccounts({ phrase: SEED, path: '//Alice', pass: '', type: 'sr25519', prefix: 42 }), 'Address'), '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
  assert.equal(row(derive({ phrase: '  ' + DEV.replace(/ /g, '\n  ') + ' ', path: ' //Alice ' }), 'Address'), '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
});

test('password changes the account and is noted in the path', () => {
  const r = derive({ path: '//Alice', pass: 'secret' });
  assert.notEqual(row(r, 'Address'), '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
  assert.equal(row(r, 'Path'), '//Alice + password');
});

test('numbered accounts equal deriving path//i directly', () => {
  const r = derive({ path: '//Alice', list: true, count: '3' });
  assert.equal(r.numbered.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(r.numbered[i], [`//Alice//${i}`, row(derive({ path: `//Alice//${i}` }), 'Address')]);
  }
});

test('count clamping and presets', () => {
  assert.equal(clampCount('0'), 1);
  assert.equal(clampCount(''), 1);
  assert.equal(clampCount('99'), 50);
  assert.equal(clampCount('7'), 7);
  assert.deepEqual(PRESETS.slice(0, 2), ['', '//Alice']);
});

test('errors', () => {
  assert.throws(() => derive({ phrase: '   ' }), /Enter a mnemonic or a 0x-prefixed 32-byte seed/);
  assert.throws(() => derive({ path: 'Alice' }), /A path is a list of junctions/);
  assert.throws(() => derive({ path: '///x' }), /A path is a list of junctions/);
  assert.throws(() => derive({ phrase: DEV.replace('walk', 'wall') }), /Invalid mnemonic/);
  assert.throws(() => derive({ phrase: '0x1234' }), /A hex seed must be 32 bytes/);
});
