import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multisigAccount, cmp } from '../../src/polkadot/multisig-address/multisig-address.js';
import { ss58Encode, toHex } from '../../src/polkadot/lib/dot.js';

const ALICE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const BOB = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const CHARLIE = '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y';
// Well-known 2-of-3 multisig of Alice, Bob and Charlie (as shown by polkadot.js).
const ABC_2 = '5DjYJStmdZ2rcqXbXGX7TW85JsrW6uG4y9MUcLq2BoPMpRA7';

test('example: 2 of 3 dev accounts', () => {
  const m = multisigAccount([ALICE, BOB, CHARLIE].join('\n'), '2');
  assert.equal(ss58Encode(m.id, 42), ABC_2);
  assert.equal(m.threshold, '2');
  assert.equal(m.count, 3);
  // sorted by account id bytes: Bob (0x8eaf…), Charlie (0x90b5…), Alice (0xd435…)
  assert.deepEqual(m.sorted.map(x => ss58Encode(x, 42)), [BOB, CHARLIE, ALICE]);
});

test('order, whitespace and blank lines do not matter; hex ids work', () => {
  const a = multisigAccount(`  ${CHARLIE}\n\n${ALICE}\n${BOB}  \n`, ' 2 ');
  assert.equal(ss58Encode(a.id, 42), ABC_2);
  const b = multisigAccount(['0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d', BOB, CHARLIE].join('\n'), '2');
  assert.equal(toHex(b.id), toHex(a.id));
});

test('threshold changes the account', () => {
  const t1 = multisigAccount([ALICE, BOB, CHARLIE].join('\n'), '1');
  const t3 = multisigAccount([ALICE, BOB, CHARLIE].join('\n'), '3');
  assert.notEqual(ss58Encode(t1.id, 42), ABC_2);
  assert.notEqual(toHex(t1.id), toHex(t3.id));
});

test('byte comparison', () => {
  assert.ok(cmp(new Uint8Array([1, 2]), new Uint8Array([1, 3])) < 0);
  assert.ok(cmp(new Uint8Array([2, 0]), new Uint8Array([1, 9])) > 0);
  assert.equal(cmp(new Uint8Array([1, 2]), new Uint8Array([1, 2])), 0);
});

test('errors', () => {
  assert.throws(() => multisigAccount(ALICE, '1'), /at least two signatories/);
  assert.throws(() => multisigAccount(Array(101).fill(ALICE).join('\n'), '1'), /at most 100/);
  assert.throws(() => multisigAccount(`${ALICE}\nnope`, '1'), /^Error: Line 2: /);
  assert.throws(() => multisigAccount(`${ALICE}\n${ALICE}`, '1'), /listed twice/);
  assert.throws(() => multisigAccount(`${ALICE}\n${BOB}`, '3'), /Threshold must be between 1 and 2/);
  assert.throws(() => multisigAccount(`${ALICE}\n${BOB}`, '0'), /Threshold/);
  assert.throws(() => multisigAccount(`${ALICE}\n${BOB}`, '1.5'), /Threshold/);
});
