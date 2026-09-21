import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFromForm, credential, parseNat } from '../../src/cardano/address-builder/address-builder.js';

// Test vectors from CIP-19.
const PAY = '9493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e';
const STAKE = '337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251';
const SCRIPT = 'c37b1b5dc0669f1d3c61a6fddb2e8fde96be87b881c60bce8e8d542f';
const form = over => ({ kind: 'base', network: '1', pay: PAY, payType: 'key', stake: STAKE, stakeType: 'key', slot: '0', txi: '0', certi: '0', ...over });
const POINTER = { slot: '2498243', txi: '27', certi: '3' };

test('both credentials empty gives no result', () => {
  assert.equal(buildFromForm(form({ pay: ' ', stake: '' })), null);
});

test('Example: CIP-19 base address (key, key)', () => {
  const a = buildFromForm(form());
  assert.equal(a.bech32, 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x');
  assert.equal(a.typeName, 'Base address (key payment, key stake)');
  assert.equal(a.hex, '01' + PAY + STAKE);
});

test('CIP-19 mainnet vectors for every address kind', () => {
  const cases = [
    [{ pay: SCRIPT, payType: 'script' }, 'addr1z8phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gten0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs9yc0hh'],
    [{ stake: SCRIPT, stakeType: 'script' }, 'addr1yx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzerkr0vd4msrxnuwnccdxlhdjar77j6lg0wypcc9uar5d2shs2z78ve'],
    [{ pay: SCRIPT, payType: 'script', stake: SCRIPT, stakeType: 'script' }, 'addr1x8phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gt7r0vd4msrxnuwnccdxlhdjar77j6lg0wypcc9uar5d2shskhj42g'],
    [{ kind: 'pointer', ...POINTER }, 'addr1gx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer5pnz75xxcrzqf96k'],
    [{ kind: 'pointer', pay: SCRIPT, payType: 'script', ...POINTER }, 'addr128phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtupnz75xxcrtw79hu'],
    [{ kind: 'enterprise' }, 'addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8'],
    [{ kind: 'enterprise', pay: SCRIPT, payType: 'script' }, 'addr1w8phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcyjy7wx'],
    [{ kind: 'reward' }, 'stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw'],
    [{ kind: 'reward', stake: SCRIPT, stakeType: 'script' }, 'stake178phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcccycj5'],
  ];
  for (const [over, want] of cases) assert.equal(buildFromForm(form(over)).bech32, want);
});

test('CIP-19 testnet vectors', () => {
  assert.equal(buildFromForm(form({ network: '0' })).bech32, 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae');
  assert.equal(buildFromForm(form({ network: '0', kind: 'enterprise' })).bech32, 'addr_test1vz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzerspjrlsz');
  assert.equal(buildFromForm(form({ network: '0', kind: 'reward' })).bech32, 'stake_test1uqehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gssrtvn');
});

test('bech32 credentials set the credential type', () => {
  // script1… for the CIP-19 script hash overrides the selected "key" type.
  const f = form({ pay: 'script1cda3khwqv60360rp5m7akt50m6ttapacs8rqhn5w342z7r35m37' });
  const a = buildFromForm(f);
  assert.equal(f.payType, 'script');
  assert.equal(a.bech32, 'addr1z8phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gten0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs9yc0hh');
  assert.equal(credential(PAY, 'script', 'payment').type, 'script');
});

test('the payment type is detected even when the stake credential then fails', () => {
  const f = form({ pay: 'script1cda3khwqv60360rp5m7akt50m6ttapacs8rqhn5w342z7r35m37', stake: 'nope' });
  assert.throws(() => buildFromForm(f), /stake credential must be a 28-byte hash/);
  assert.equal(f.payType, 'script');
});

test('input errors throw', () => {
  assert.throws(() => buildFromForm(form({ stake: '' })), /Enter the stake credential\./);
  assert.throws(() => buildFromForm(form({ kind: 'reward', stake: '', pay: PAY })), /Enter the stake credential\./);
  assert.throws(() => buildFromForm(form({ pay: PAY.slice(2) })), /payment credential must be a 28-byte hash/);
  assert.throws(() => buildFromForm(form({ kind: 'pointer', slot: '-1' })), /^Error: Slot must be a whole number\.$/);
  assert.throws(() => buildFromForm(form({ kind: 'pointer', txi: '1.5' })), /Transaction index must be a whole number\./);
  assert.throws(() => buildFromForm(form({ kind: 'pointer', certi: '' })), /Certificate index must be a whole number\./);
});

test('parseNat accepts whole numbers beyond 2^53', () => {
  assert.equal(parseNat(' 18446744073709551615 ', 'Slot'), 18446744073709551615n);
});
