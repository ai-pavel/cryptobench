import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeSeed, describeSeed, derivePda, TYPES } from '../../src/solana/pda-finder/pda-finder.js';
import { base58, ATA_PROGRAM, TOKEN_PROGRAM } from '../../src/solana/lib/sol.js';

const hexOf = b => Buffer.from(b).toString('hex');
const WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const exampleSeeds = () => [WALLET, TOKEN_PROGRAM, USDC].map(v => encodeSeed('pubkey', v));

// Reference PDA hash, computed independently with node:crypto.
const pdaHash = (seeds, bump, program) => createHash('sha256')
  .update(Buffer.concat([...seeds, Buffer.of(bump), base58.decode(program), Buffer.from('ProgramDerivedAddress')]))
  .digest();

test('Example: associated token account of a wallet for USDC', () => {
  const rows = derivePda(exampleSeeds(), ATA_PROGRAM, '');
  assert.deepEqual(rows.map(r => r[0]), ['Address', 'Canonical bump', 'Address (hex)']);
  assert.equal(rows[1][1], '254');
  assert.equal(rows[0][1], 'FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B');
  assert.equal(rows[2][1], hexOf(pdaHash(exampleSeeds(), 254, ATA_PROGRAM)));
});

test('a given bump is checked against the canonical one', () => {
  assert.deepEqual(derivePda(exampleSeeds(), ATA_PROGRAM, '254'), [
    ['Address', 'FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B'], ['Bump', '254', 'This is the canonical bump.'],
  ]);
  // Bumps 255 and 253 hash onto the curve; 254 is canonical.
  for (const b of ['255', '253']) assert.throws(() => derivePda(exampleSeeds(), ATA_PROGRAM, b), /on the ed25519 curve/);
  const r = derivePda(exampleSeeds(), ATA_PROGRAM, '251');
  assert.equal(r[0][1], base58.encode(pdaHash(exampleSeeds(), 251, ATA_PROGRAM)));
  assert.equal(r[1][2], 'Not canonical: findProgramAddress returns bump 254.');
});

test('bad program ID or bump throws', () => {
  assert.throws(() => derivePda([], 'abc', ''), /Program ID must decode to 32 bytes \(got 3\)/);
  assert.throws(() => derivePda([], ATA_PROGRAM, '256'), /Bump must be 0–255/);
  assert.throws(() => derivePda([], ATA_PROGRAM, '1.5'), /Bump must be 0–255/);
  assert.throws(() => derivePda([new Uint8Array(33)], ATA_PROGRAM, ''), /Seed 1 is 33 bytes; the maximum is 32/);
});

test('integer seeds are little-endian and range-checked', () => {
  assert.equal(hexOf(encodeSeed('u8', '255')), 'ff');
  assert.equal(hexOf(encodeSeed('u16', '258')), '0201');
  assert.equal(hexOf(encodeSeed('u32', ' 1 ')), '01000000');
  assert.equal(hexOf(encodeSeed('u64', '18446744073709551615')), 'ff'.repeat(8));
  assert.equal(hexOf(encodeSeed('i64', '-1')), 'ff'.repeat(8));
  assert.equal(hexOf(encodeSeed('i64', '-9223372036854775808')), '0000000000000080');
  assert.equal(hexOf(encodeSeed('u128', '1')), '01' + '00'.repeat(15));
  assert.throws(() => encodeSeed('u8', '256'), /u8 must be between 0 and 255/);
  assert.throws(() => encodeSeed('u64', '-1'), /u64 must be between 0 and 18446744073709551615/);
  assert.throws(() => encodeSeed('i64', '9223372036854775808'), /i64 must be between -9223372036854775808 and 9223372036854775807/);
  assert.throws(() => encodeSeed('u32', '1.5'), /u32 must be an integer/);
});

test('string, hex and pubkey seeds', () => {
  assert.equal(hexOf(encodeSeed('string', ' a ')), '206120'); // strings are not trimmed
  assert.equal(hexOf(encodeSeed('string', 'é')), 'c3a9');
  assert.equal(hexOf(encodeSeed('hex', '0xDE ad')), 'dead');
  assert.equal(encodeSeed('hex', '').length, 0);
  assert.throws(() => encodeSeed('hex', 'abc'), /even number/);
  assert.throws(() => encodeSeed('hex', 'zz'), /even number/);
  assert.equal(hexOf(encodeSeed('pubkey', '11111111111111111111111111111111')), '00'.repeat(32));
  assert.throws(() => encodeSeed('pubkey', ''), /Public key is empty/);
  assert.deepEqual(Object.keys(TYPES), ['string', 'pubkey', 'hex', 'u8', 'u16', 'u32', 'u64', 'i64', 'u128']);
});

test('seed description flags seeds over 32 bytes', () => {
  assert.deepEqual(describeSeed(new Uint8Array(0)), { bad: false, text: '0 bytes: (empty)' });
  assert.deepEqual(describeSeed(Uint8Array.of(1, 2)), { bad: false, text: '2 bytes: 0102' });
  assert.deepEqual(describeSeed(new Uint8Array(33)), { bad: true, text: `33 bytes: ${'00'.repeat(33)} · too long, max 32 bytes` });
});
