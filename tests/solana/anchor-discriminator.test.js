import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { discriminator, words, snake, pascal } from '../../src/solana/anchor-discriminator/anchor-discriminator.js';

const rows = r => Object.fromEntries(r);
const sha8 = s => createHash('sha256').update(s).digest('hex').slice(0, 16);

test('empty input gives no result', () => {
  assert.equal(discriminator('   ', 'global', true), null);
});

test('Example: global:initialize is afaf6d1f0d989bed', () => {
  const r = rows(discriminator('initialize', 'global', true));
  assert.equal(r['Preimage'], 'global:initialize');
  assert.equal(r['Discriminator (hex)'], 'afaf6d1f0d989bed');
  assert.equal(r['Byte array'], '[175, 175, 109, 31, 13, 152, 155, 237]');
  // Little-endian u64 of afaf6d1f0d989bed.
  assert.equal(r['As u64 (LE)'], BigInt('0xed9b980d1f6dafaf').toString());
});

test('discriminator is the first 8 bytes of sha256(kind:name)', () => {
  for (const [name, kind] of [['MyAccount', 'account'], ['TradeEvent', 'event'], ['transfer_tokens', 'global']]) {
    assert.equal(rows(discriminator(name, kind, false))['Discriminator (hex)'], sha8(`${kind}:${name}`));
  }
});

test('names are converted the way Anchor does', () => {
  assert.equal(rows(discriminator('transferTokens', 'global', true))['Preimage'], 'global:transfer_tokens');
  assert.equal(rows(discriminator('my_account', 'account', true))['Preimage'], 'account:MyAccount');
  assert.equal(rows(discriminator('  my_account ', 'account', false))['Preimage'], 'account:my_account');
});

test('case helpers split words on case changes and punctuation', () => {
  assert.deepEqual(words('HTTPServer-v2 name'), ['HTTP', 'Server', 'v2', 'name']);
  assert.equal(snake('InitializeMint2'), 'initialize_mint2');
  assert.equal(snake('HTTPServer'), 'http_server');
  assert.equal(pascal('vault_state'), 'VaultState');
  assert.equal(pascal('tradeEvent'), 'TradeEvent');
});
