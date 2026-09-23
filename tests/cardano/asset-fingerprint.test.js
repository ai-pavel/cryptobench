import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, nameHexToText, nameTextToHex } from '../../src/cardano/asset-fingerprint/asset-fingerprint.js';

// Test vectors from CIP-14: [policy ID, asset name (hex), fingerprint].
const P1 = '7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373';
const P2 = '1e349c9bdea19fd6c147626a5260bc44b71635f398b67c59881df209';
const VECTORS = [
  [P1, '', 'asset1rjklcrnsdzqp65wjgrg55sy9723kw09mlgvlc3'],
  ['7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc37e', '', 'asset1nl0puwxmhas8fawxp8nx4e2q3wekg969n2auw3'],
  [P2, '', 'asset1uyuxku60yqe57nusqzjx38aan3f2wq6s93f6ea'],
  [P1, '504154415445', 'asset13n25uv0yaf5kus35fm2k86cqy60z58d9xmde92'],
  [P2, '504154415445', 'asset1hv4p5tv2a837mzqrst04d0dcptdjmluqvdx9k3'],
  [P2, P1, 'asset1aqrdypg669jgazruv5ah07nuyqe0wxjhe2el6f'],
  [P1, P2, 'asset17jd78wukhtrnmjh3fngzasxm8rck0l2r4hhyyt'],
  [P1, '00'.repeat(32), 'asset1pkpwyknlvul7az0xx8czhl60pyel45rpje4z8w'],
];

test('empty policy gives no result', () => {
  assert.equal(fingerprint('  ', 'PATATE', false), null);
});

test('CIP-14 vectors (name in hex)', () => {
  for (const [p, n, fp] of VECTORS) assert.equal(fingerprint(p, n, true).fingerprint, fp);
});

test('CIP-14 vectors given as a full asset ID', () => {
  for (const [p, n, fp] of VECTORS.filter(v => v[1])) {
    const r = fingerprint('0x' + p + n, 'ignored', false);
    assert.equal(r.fingerprint, fp);
    assert.equal(r.policyId, p);
    assert.equal(r.assetId, p + n);
  }
});

test('Example: PATATE as text', () => {
  const r = fingerprint(P1, 'PATATE', false);
  assert.deepEqual(r, {
    fingerprint: 'asset13n25uv0yaf5kus35fm2k86cqy60z58d9xmde92',
    policyId: P1, nameHex: '504154415445', nameLength: 6, nameText: 'PATATE', assetId: P1 + '504154415445',
  });
});

test('empty and non-text names have no text form', () => {
  assert.equal(fingerprint(P1, '', false).nameText, null);
  assert.equal(fingerprint(P1, 'ff00', true).nameText, null);
  assert.equal(fingerprint(P1.toUpperCase(), '', false).policyId, P1);
});

test('input errors throw', () => {
  assert.throws(() => fingerprint('xyz', '', false), /The policy ID must be hex\./);
  assert.throws(() => fingerprint(P1.slice(2), '', false), /56 hex characters\); this one has 54\./);
  assert.throws(() => fingerprint(P1 + 'abc', '', false), /even number of hex characters/);
  assert.throws(() => fingerprint(P1, 'x'.repeat(33), false), /at most 32 bytes; this one is 33\./);
  assert.throws(() => fingerprint(P1, '00'.repeat(33), true), /this one is 33\./);
  assert.throws(() => fingerprint(P1, 'zz', true), /Not valid hex/);
});

test('switching the name between text and hex', () => {
  assert.equal(nameTextToHex('PATATE'), '504154415445');
  assert.equal(nameHexToText('504154415445'), 'PATATE');
  assert.equal(nameHexToText(''), '');
  assert.equal(nameHexToText('nothex'), 'nothex');
});
