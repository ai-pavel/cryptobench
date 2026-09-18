import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect, EXAMPLES } from '../../src/cardano/address-inspector/address-inspector.js';
import { bech32Encode, fromHex, decode, encode, Tag } from '../../src/cardano/lib/cardano.js';
import { base58 } from '../../src/assets/vendor/@scure/base@2.4.0/index.esm.js';

// Test vectors from CIP-19 (payment key hash 9493…, stake key hash 337b…, script hash c37b…).
const PAY = '9493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e';
const STAKE = '337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251';
const SCRIPT = 'c37b1b5dc0669f1d3c61a6fddb2e8fde96be87b881c60bce8e8d542f';
const STAKE_ADDR = 'stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw';
const get = (rows, label) => rows.find(r => r.label === label)?.value;

test('empty input gives no result', () => {
  assert.equal(inspect('  \n'), null);
});

test('Example: base address', () => {
  const r = inspect(EXAMPLES.base);
  assert.equal(r.warning, '');
  assert.equal(r.stake.info, 'Mainnet · shared by every base address of this wallet account.');
  assert.deepEqual(r.stake.rows, [{ label: 'Stake address', value: STAKE_ADDR }, { label: 'Stake address (hex)', value: 'e1' + STAKE }]);
  assert.equal(get(r.rows, 'Type'), '0 · Base address (key payment, key stake)');
  assert.equal(get(r.rows, 'Network'), '1 · Mainnet');
  assert.deepEqual(r.rows.find(x => x.label === 'Payment credential (key hash)'), { label: 'Payment credential (key hash)', value: PAY, note: 'addr_vkh1jjfnzhxe966a33psfenm0ct2udkkr569qf55v4uprgkgu8zsvmg' });
  assert.equal(r.rows.find(x => x.label === 'Stake credential (key hash)').note, 'stake_vkh1xdak9nllvsp6q636e0p5lrzxqq7xnlne5d3gemafc3e9z3v4vud');
  assert.equal(r.rows.at(-1).note, 'Header byte 0x01 · 57 bytes');
});

test('Example: script payment base address shares the same stake address', () => {
  const r = inspect(EXAMPLES.script);
  assert.equal(r.stake.rows[0].value, STAKE_ADDR);
  const c = r.rows.find(x => x.label === 'Payment credential (script hash)');
  assert.equal(c.value, SCRIPT);
  assert.equal(c.note, 'script1cda3khwqv60360rp5m7akt50m6ttapacs8rqhn5w342z7r35m37');
});

test('Example: enterprise address has no stake part', () => {
  const r = inspect(EXAMPLES.enterprise);
  assert.match(r.stake.info, /^Enterprise addresses have no stake part/);
  assert.deepEqual(r.stake.rows, []);
  assert.equal(get(r.rows, 'Type'), '6 · Enterprise address (key payment, no stake)');
});

test('Example: pointer address (CIP-19 pointer 2498243 / 27 / 3)', () => {
  const r = inspect(EXAMPLES.pointer);
  assert.match(r.stake.info, /slot 2498243, transaction 27, certificate 3\./);
  assert.equal(get(r.rows, 'Pointer'), 'slot 2498243 · transaction 27 · certificate 3');
  assert.equal(get(r.rows, 'Bytes (hex)'), '41' + PAY + '8198bd431b03');
});

test('Example: stake address', () => {
  const r = inspect(EXAMPLES.stake);
  assert.equal(r.stake.info, 'This is already a stake address.');
  assert.equal(r.stake.rows[1].label, 'Stake credential (key hash)');
  assert.equal(r.stake.rows[1].value, STAKE);
  assert.equal(get(r.rows, 'Type'), '14 · Reward / stake address (key)');
});

test('testnet addresses and hex input', () => {
  const r = inspect('addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae');
  assert.equal(r.stake.rows[0].value, 'stake_test1uqehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gssrtvn');
  assert.equal(get(r.rows, 'Network'), '0 · Testnet (preprod, preview…)');
  assert.equal(get(inspect('0x01' + PAY + STAKE).rows, 'Bech32'), EXAMPLES.base);
});

test('a prefix that does not match the network gives a warning', () => {
  const r = inspect(bech32Encode('addr_test', fromHex('01' + PAY + STAKE)));
  assert.equal(r.warning, 'The prefix "addr_test" doesn\'t match the address type and network (expected "addr").');
});

test('Example: Byron (Daedalus) address', () => {
  const r = inspect(EXAMPLES.byron);
  assert.match(r.stake.info, /^Byron addresses have no stake part/);
  assert.equal(get(r.rows, 'Network'), 'Mainnet');
  assert.equal(get(r.rows, 'Spending data type'), '0 · public key');
  assert.ok(get(r.rows, 'Encrypted derivation path'));
  assert.deepEqual(r.rows.find(x => x.label === 'Checksum'), { label: 'Checksum', value: 'CRC32 OK', ok: true });
});

test('a Byron address with a wrong CRC32 is flagged', () => {
  const [payload, crc] = decode(base58.decode(EXAMPLES.byron));
  const bad = base58.encode(encode([payload, (crc + 1) % 2 ** 32]));
  assert.ok(payload instanceof Tag);
  const c = inspect(bad).rows.find(x => x.label === 'Checksum');
  assert.equal(c.ok, false);
  assert.equal(c.value, 'CRC32 mismatch: the address is corrupted');
});

test('invalid input throws', () => {
  assert.throws(() => inspect('addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3y'), /Invalid bech32 address/);
  assert.throws(() => inspect('hello world'), /Not a Cardano address/);
});
