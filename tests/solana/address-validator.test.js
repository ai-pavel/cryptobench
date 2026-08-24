import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, parseLines } from '../../src/solana/address-validator/address-validator.js';

test('System Program is all-zero bytes and a known address', () => {
  const r = check('11111111111111111111111111111111');
  assert.equal(r.ok, true);
  assert.equal(r.hex, '00'.repeat(32));
  assert.equal(r.name, 'System Program');
  assert.equal(r.notes[0], 'Known address: System Program.');
});

test('Token program is recognised', () => {
  const r = check('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  assert.equal(r.ok, true);
  assert.equal(r.name, 'Token Program');
  assert.equal(r.hex, '06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9');
});

test('a wallet address is on the curve', () => {
  const r = check('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
  assert.equal(r.ok, true);
  assert.equal(r.name, undefined);
  assert.match(r.notes.at(-1), /^On the ed25519 curve/);
});

test('a PDA is off the curve', () => {
  // The Example's PDA (off curve: no private key).
  const r = check('FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B');
  assert.equal(r.ok, true);
  assert.match(r.notes[0], /^Off the ed25519 curve/);
});

test('characters outside the base58 alphabet are named', () => {
  assert.deepEqual(check('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWW0'), {
    ok: false, msg: 'Not base58: contains "0" (base58 has no 0, O, I or l)',
  });
  assert.equal(check('ab-c').msg, 'Not base58: contains "-"');
  assert.equal(check('OIl0O').msg, 'Not base58: contains "O", "I", "l", "0" (base58 has no 0, O, I or l)');
});

test('wrong length is rejected', () => {
  assert.deepEqual(check('abc'), { ok: false, msg: 'Decodes to 3 bytes; a Solana address is 32 bytes.' });
  // 33 bytes: a leading 1 adds a zero byte.
  assert.equal(check('1' + '11111111111111111111111111111111').msg, 'Decodes to 33 bytes; a Solana address is 32 bytes.');
});

test('input is split into trimmed non-empty lines', () => {
  assert.deepEqual(parseLines('  a \n\n b\n   \n'), ['a', 'b']);
  assert.deepEqual(parseLines(''), []);
});
