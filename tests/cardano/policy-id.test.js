import { test } from 'node:test';
import assert from 'node:assert/strict';
import { policyId, TEMPLATES } from '../../src/cardano/policy-id/policy-id.js';
import { blake2b } from '../../src/assets/vendor/@noble/hashes@1.8.0/blake2b.esm.js';
import { fromHex, toHex } from '../../src/cardano/lib/cardano.js';

// Policy ID = Blake2b-224(0x00 || script CBOR); the CBOR below is written by hand
// from the native_script CDDL in the Cardano ledger spec.
const KEY1 = '9493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e';
const KEY2 = '337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251';
const KEY3 = 'c37b1b5dc0669f1d3c61a6fddb2e8fde96be87b881c60bce8e8d542f';
const sig = k => '8200581c' + k;
const expectedId = cbor => toHex(blake2b(fromHex('00' + cbor), { dkLen: 28 }));
const json = j => JSON.stringify(j, null, 2);

test('empty input gives no result', () => {
  assert.equal(policyId('  '), null);
});

test('Example: single signature', () => {
  const r = policyId(json(TEMPLATES.sig));
  assert.equal(r.cbor, sig(KEY1));
  assert.equal(r.policyId, expectedId(sig(KEY1)));
  assert.match(r.bech32, /^script1[02-9ac-hj-np-z]{51}$/);
  assert.deepEqual(r.json, TEMPLATES.sig);
});

test('Example: signature + time lock (before slot 150000000)', () => {
  // [1, [sig, [5, 150000000]]]
  const cbor = '8201' + '82' + sig(KEY1) + '82051a08f0d180';
  const r = policyId(json(TEMPLATES.lock));
  assert.equal(r.cbor, cbor);
  assert.equal(r.policyId, expectedId(cbor));
});

test('Example: 2 of 3', () => {
  const cbor = '830302' + '83' + sig(KEY1) + sig(KEY2) + sig(KEY3);
  const r = policyId(json(TEMPLATES.multi));
  assert.equal(r.cbor, cbor);
  assert.equal(r.policyId, expectedId(cbor));
});

test('CBOR input gives the same policy ID and the cardano-cli JSON', () => {
  const cbor = '8201' + '82' + sig(KEY1) + '82051a08f0d180';
  const r = policyId(cbor.toUpperCase());
  assert.equal(r.policyId, expectedId(cbor));
  assert.deepEqual(r.json, TEMPLATES.lock);
  assert.deepEqual(policyId('8202' + '82' + sig(KEY1) + '8204190400').json,
    { type: 'any', scripts: [{ type: 'sig', keyHash: KEY1 }, { type: 'after', slot: 1024 }] });
});

test('input errors throw', () => {
  assert.throws(() => policyId('{"type": "sig"'), /^Error: Invalid JSON: /);
  assert.throws(() => policyId('{"type": "sig", "keyHash": "abcd"}'), /"keyHash" must be a 28-byte hex key hash/);
  assert.throws(() => policyId('{"type": "nope"}'), /unknown type "nope"/);
  assert.throws(() => policyId('{"type": "before", "slot": -1}'), /"slot" must be a non-negative integer/);
  assert.throws(() => policyId('{"type": "all", "scripts": [{"type": "x"}]}'), /script\.scripts\[0\]: unknown type/);
  assert.throws(() => policyId('{"type": "atLeast", "required": -1, "scripts": []}'), /"required" must be a non-negative integer/);
  assert.throws(() => policyId('zz'), /Not valid hex/);
  assert.throws(() => policyId('01'), /A native script is a CBOR array\./);
  // 1024 encoded with a 4-byte argument instead of 2 bytes: not canonical.
  assert.throws(() => policyId('82041a00000400'), /isn't in canonical form/);
});
