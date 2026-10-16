import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { moduleRows, escrowRows, moduleAddressBytes, escrowAddressBytes, MODULES } from '../../src/cosmos/derived-addresses/derived-addresses.js';

// Well-known Cosmos Hub module accounts (as listed by `query auth module-accounts`).
const KNOWN_MODULES = {
  fee_collector: 'cosmos17xpfvakm2amg962yls6f84z3kell8c5lserqta',
  distribution: 'cosmos1jv65s3grqf6v6jl3dp4t6c9t9rk99cd88lyufl',
  bonded_tokens_pool: 'cosmos1fl48vsnmsdzcv85q5d2q4z5ajdha8yu34mf0eh',
  not_bonded_tokens_pool: 'cosmos1tygms3xhhs3yv487phx3dw4a95jn7t7lpm470r',
  gov: 'cosmos10d07y265gmmuvt4z0w9aw880jnsr700j6zn9kn',
};

test('module addresses match the known Cosmos Hub accounts', () => {
  for (const [name, addr] of Object.entries(KNOWN_MODULES)) assert.equal(moduleRows('cosmos', name)[0][1], addr, name);
});

test('module address bytes are the first 20 bytes of SHA-256(name)', () => {
  const rows = moduleRows('cosmos', ' distribution ');
  assert.equal(rows[1][1], createHash('sha256').update('distribution').digest('hex').slice(0, 40));
  assert.equal(moduleAddressBytes('mint').length, 20);
  assert.ok(MODULES.includes('distribution'));
});

test('empty module name or port/channel gives no result', () => {
  assert.equal(moduleRows('cosmos', ' '), null);
  assert.equal(escrowRows('cosmos', '', 'channel-0', 'ics20-1'), null);
  assert.equal(escrowRows('cosmos', 'transfer', ' ', 'ics20-1'), null);
});

test('Example: channel-141 escrow address on the Cosmos Hub', () => {
  const r = escrowRows('cosmos', 'transfer', 'channel-141', 'ics20-1');
  assert.equal(r.note, '');
  assert.equal(r.rows[0][2], 'transfer/channel-141');
  // ICS-20: SHA-256(version ‖ 0x00 ‖ "port/channel"), truncated to 20 bytes.
  const expected = createHash('sha256').update(Buffer.concat([Buffer.from('ics20-1'), Buffer.from([0]), Buffer.from('transfer/channel-141')])).digest('hex').slice(0, 40);
  assert.equal(r.rows[1][1], expected);
  assert.match(r.rows[0][1], /^cosmos1/);
  assert.deepEqual(escrowAddressBytes('transfer', 'channel-141', 'ics20-1'), Uint8Array.from(Buffer.from(expected, 'hex')));
});

test('unusual channel IDs get a note but still compute', () => {
  const r = escrowRows('osmo', 'transfer', 'chan-1', 'ics20-1');
  assert.match(r.note, /channel IDs normally look like "channel-123"/);
  assert.match(r.rows[0][1], /^osmo1/);
});

test('an invalid prefix throws', () => {
  assert.throws(() => moduleRows('Cosmos', 'gov'), /Prefix must use lowercase/);
});
