import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAddress } from '../../src/evm/checksum-address/checksum-address.js';

// Test vectors from EIP-55.
const VALID = [
  '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
  '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
];

test('empty input gives no result', () => {
  assert.equal(checkAddress('  '), null);
});

test('EIP-55 vectors have a valid checksum', () => {
  for (const addr of VALID) {
    const r = checkAddress(addr);
    assert.equal(r.status, 'ok');
    assert.equal(r.checksummed, addr);
    assert.equal(r.lowercase, addr.toLowerCase());
    assert.equal(r.wrong, null);
  }
});

test('all-lowercase and all-uppercase addresses have no checksum', () => {
  const lower = checkAddress(VALID[0].toLowerCase());
  assert.equal(lower.status, 'warn');
  assert.match(lower.message, /all lowercase/);
  assert.equal(lower.checksummed, VALID[0]);
  const upper = checkAddress('0x' + VALID[0].slice(2).toUpperCase());
  assert.equal(upper.status, 'warn');
  assert.match(upper.message, /all uppercase/);
});

test('wrong case is reported letter by letter', () => {
  const typo = '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'; // second letter flipped
  const r = checkAddress(typo);
  assert.equal(r.status, 'bad');
  assert.match(r.message, /1 letter has the wrong case/);
  assert.deepEqual(r.wrong.map((w, i) => w && i).filter(x => x !== false), [1]);
});

test('invalid hex throws', () => {
  assert.throws(() => checkAddress('0xnothex'));
});
