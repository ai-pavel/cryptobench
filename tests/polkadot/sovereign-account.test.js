import { test } from 'node:test';
import assert from 'node:assert/strict';
import { account, sovereignAccounts, prefixFrom } from '../../src/polkadot/sovereign-account/sovereign-account.js';
import { ss58Encode, toHex } from '../../src/polkadot/lib/dot.js';

const zeros = n => '00'.repeat(n);

test('example: Asset Hub (1000) — "para"/"sibl" ‖ u32 LE ‖ zero padding', () => {
  const { relay, sib } = sovereignAccounts('1000');
  assert.equal(toHex(relay), '0x70617261' + 'e8030000' + zeros(24));
  assert.equal(toHex(sib), '0x7369626c' + 'e8030000' + zeros(24));
  // Asset Hub's well-known sovereign account on the Polkadot relay chain.
  assert.equal(ss58Encode(relay, prefixFrom('0', '')), '13YMK2edbuhwMBxeUWm9c643A2wyYHwSVh1bCM7tShtg7Dtk');
});

test('Moonbeam (2004) and the u32 range limits', () => {
  assert.equal(toHex(sovereignAccounts(' 2004 ').relay), '0x70617261' + 'd4070000' + zeros(24));
  assert.equal(toHex(sovereignAccounts('0').sib), '0x7369626c' + zeros(28));
  assert.equal(toHex(sovereignAccounts('4294967295').relay), '0x70617261' + 'ffffffff' + zeros(24));
  assert.equal(account('para', 1).length, 32);
});

test('errors', () => {
  for (const bad of ['', '-1', '1.5', 'abc', '4294967296']) {
    assert.throws(() => sovereignAccounts(bad), /Parachain ID must be a whole number from 0 to 4294967295/);
  }
});
