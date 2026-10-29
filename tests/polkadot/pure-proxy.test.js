import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, prefixFrom, intIn, pureAccount } from '../../src/polkadot/pure-proxy/pure-proxy.js';
import { blake2, fromHex, toHex } from '../../src/polkadot/lib/dot.js';

const ALICE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const ALICE_HEX = 'd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
const base = { who: ALICE, ptype: '0', pcustom: '0', idx: '0', height: '22000000', ext: '2' };

test('example: preimage is "modlpy/proxy____" ‖ spawner ‖ u32 height ‖ u32 ext index ‖ u8 type ‖ u16 index', () => {
  // Hand-built SCALE preimage: 22000000 = 0x014fb180 → LE 80b14f01.
  const preimage = Buffer.from('modlpy/proxy____').toString('hex') + ALICE_HEX + '80b14f01' + '02000000' + '00' + '0000';
  assert.equal(toHex(pureAccount(base)), toHex(blake2(fromHex(preimage), 256)));
});

test('every field changes the account; custom proxy type index', () => {
  const ref = toHex(pureAccount(base));
  for (const [k, v] of [['ptype', '1'], ['idx', '1'], ['height', '22000001'], ['ext', '3']]) {
    assert.notEqual(toHex(pureAccount({ ...base, [k]: v })), ref, k);
  }
  const custom = pureAccount({ ...base, ptype: 'custom', pcustom: '7' });
  assert.equal(toHex(custom), toHex(pureAccount({ ...base, ptype: '7' })));
  const preimage = Buffer.from('modlpy/proxy____').toString('hex') + ALICE_HEX + 'ffffffff' + 'ffffffff' + 'ff' + 'ffff';
  assert.equal(toHex(pureAccount({ ...base, height: '4294967295', ext: '4294967295', ptype: 'custom', pcustom: '255', idx: '65535' })), toHex(blake2(fromHex(preimage), 256)));
});

test('proxy type tables (Any is 0 on both relay chains)', () => {
  assert.equal(TYPES[0][1][0], 'Any');
  assert.equal(TYPES[0][1][6], 'CancelProxy');
  assert.equal(TYPES[1][1][5], 'CancelProxy');
  assert.equal(prefixFrom('0', ''), 0);
});

test('number fields are range-checked', () => {
  assert.equal(intIn(' 65535 ', 65535, 'Index'), 65535);
  assert.throws(() => intIn('65536', 65535, 'Index'), /^Error: Index must be a whole number from 0 to 65535\.$/);
  assert.throws(() => pureAccount({ ...base, height: '-1' }), /Block number must be a whole number from 0 to 4294967295/);
  assert.throws(() => pureAccount({ ...base, ext: '4294967296' }), /Extrinsic index/);
  assert.throws(() => pureAccount({ ...base, ptype: 'custom', pcustom: '256' }), /Proxy type index must be a whole number from 0 to 255/);
  assert.throws(() => pureAccount({ ...base, who: '' }), /Enter an spawner/);
  assert.throws(() => pureAccount({ ...base, who: '0x1234' }), /must be 32 bytes/);
});
