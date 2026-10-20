import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ibcHash, lookupDenom, KNOWN } from '../../src/cosmos/ibc-denom/ibc-denom.js';

// Well-known IBC denoms as they appear on chain.
const VECTORS = {
  'transfer/channel-0/uatom': 'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2', // ATOM on Osmosis
  'transfer/channel-141/uosmo': 'ibc/14F9BC3E44B8A9C1BE1FB08980FAB87034C9905EF17CF2F5008FC085218811CC', // OSMO on the Hub
  'transfer/channel-750/uusdc': 'ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4', // USDC on Osmosis
};

test('ibcHash matches well-known denoms', () => {
  for (const [trace, hash] of Object.entries(VECTORS)) assert.equal(ibcHash(trace), hash);
});

test('empty input gives no result', () => {
  assert.equal(lookupDenom('  '), null);
});

test('Example: ATOM on Osmosis', () => {
  const r = lookupDenom('transfer/channel-0/uatom');
  assert.deepEqual(r.rows, [
    ['IBC denom', VECTORS['transfer/channel-0/uatom']],
    ['Path', 'transfer/channel-0', '1 hop'],
    ['Base denom', 'uatom'],
  ]);
});

test('multi-hop traces and surrounding slashes', () => {
  const r = lookupDenom('/transfer/channel-1/transfer/channel-2/uatom/');
  assert.equal(r.rows[0][1], ibcHash('transfer/channel-1/transfer/channel-2/uatom'));
  assert.deepEqual(r.rows[1], ['Path', 'transfer/channel-1 → transfer/channel-2', '2 hops, newest first']);
});

test('a known hash is looked up, in any case', () => {
  const r = lookupDenom(VECTORS['transfer/channel-0/uatom'].toLowerCase());
  assert.deepEqual(r.rows, [['Trace', 'transfer/channel-0/uatom', 'ATOM on Osmosis'], ['Base denom', 'uatom']]);
  assert.equal(KNOWN.length, 10);
});

test('an unknown hash gets a note with the query path', () => {
  const h = 'ab'.repeat(32);
  const r = lookupDenom('ibc/' + h);
  assert.equal(r.rows, undefined);
  assert.match(r.note, /isn't in the built-in list/);
  assert.ok(r.note.includes('/ibc/apps/transfer/v1/denom_traces/' + h.toUpperCase()));
});

test('malformed input throws', () => {
  assert.throws(() => lookupDenom('ibc/1234'), /followed by 64 hex characters/);
  assert.throws(() => lookupDenom('uatom'), /one or more "port\/channel" pairs/);
  assert.throws(() => lookupDenom('transfer/channel-0'), /one or more "port\/channel" pairs/);
  assert.throws(() => lookupDenom('transfer/chan-0/uatom'), /"chan-0" doesn't look like a channel ID/);
});
