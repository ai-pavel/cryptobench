import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertAddress } from '../../src/ton/address-converter/address-converter.js';

// The address used throughout the TON documentation's "Smart contract addresses" page.
const RAW = '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8';
const BOUNCEABLE = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';
const NON_BOUNCEABLE = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI';

const asMap = r => Object.fromEntries(r.rows);

test('empty input gives no result', () => {
  assert.equal(convertAddress('   '), null);
});

test('Example: bounceable mainnet address in every form', () => {
  const r = convertAddress(BOUNCEABLE);
  const m = asMap(r);
  assert.equal(m['Raw'], RAW);
  assert.equal(m['Bounceable (contracts)'], BOUNCEABLE);
  assert.equal(m['Non-bounceable (wallets)'], NON_BOUNCEABLE);
  assert.match(m['Bounceable · testnet'], /^kQ/);
  assert.match(m['Non-bounceable · testnet'], /^0Q/);
  assert.equal(r.rows.length, 7);
  assert.equal(r.info, 'Input: user-friendly · bounceable · mainnet · base64url · workchain 0 · <span class="ok">checksum OK</span>');
});

test('raw input converts to the same friendly forms', () => {
  const r = convertAddress(RAW);
  assert.equal(r.info, 'Input: raw address · workchain 0');
  assert.equal(asMap(r)['Bounceable (contracts)'], BOUNCEABLE);
  assert.equal(asMap(r)['Non-bounceable (wallets)'], NON_BOUNCEABLE);
});

test('every output form parses back to the same raw address', () => {
  for (const [, v] of convertAddress(BOUNCEABLE).rows) assert.equal(asMap(convertAddress(v))['Raw'], RAW);
});

test('testnet and non-bounceable flags are detected', () => {
  const tn = asMap(convertAddress(BOUNCEABLE))['Non-bounceable · testnet'];
  assert.match(convertAddress(tn).info, /non-bounceable · testnet/);
  const std = asMap(convertAddress(BOUNCEABLE))['Bounceable · standard base64'];
  assert.match(convertAddress(std).info, /bounceable · mainnet · (base64|base64url) ·/);
});

test('masterchain raw address', () => {
  const r = convertAddress('-1:' + '3'.repeat(64));
  assert.equal(r.info, 'Input: raw address · workchain -1');
  assert.match(asMap(r)['Bounceable (contracts)'], /^Ef8z/);
});

test('invalid addresses throw', () => {
  assert.throws(() => convertAddress('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2M'), /Checksum \(CRC16\) does not match/);
  assert.throws(() => convertAddress('hello'), /Expected a raw address/);
  assert.throws(() => convertAddress('200:' + '0'.repeat(64)), /Workchain must be between -128 and 127/);
});
