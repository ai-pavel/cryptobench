import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deriveAta } from '../../src/solana/token-account/token-account.js';
import { base58, TOKEN_PROGRAM, TOKEN_2022_PROGRAM, ATA_PROGRAM } from '../../src/solana/lib/sol.js';

const WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// ATA = sha256(wallet || token program || mint || bump || ATA program || "ProgramDerivedAddress"), computed independently.
const ata = (wallet, mint, program, bump) => base58.encode(createHash('sha256')
  .update(Buffer.concat([base58.decode(wallet), base58.decode(program), base58.decode(mint), Buffer.of(bump), base58.decode(ATA_PROGRAM), Buffer.from('ProgramDerivedAddress')]))
  .digest());

test('Example: USDC account of a wallet under the Token program', () => {
  const r = deriveAta(WALLET, USDC, TOKEN_PROGRAM);
  assert.deepEqual(r.rows, [['Associated token account', 'FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B'], ['Bump', '254']]);
  assert.equal(r.rows[0][1], ata(WALLET, USDC, TOKEN_PROGRAM, 254));
  assert.equal(r.offCurve, false);
});

test('Token-2022 gives a different address', () => {
  const r = deriveAta(WALLET, USDC, TOKEN_2022_PROGRAM);
  assert.notEqual(r.rows[0][1], 'FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B');
  assert.equal(r.rows[0][1], ata(WALLET, USDC, TOKEN_2022_PROGRAM, Number(r.rows[1][1])));
});

test('an off-curve (PDA) owner is flagged', () => {
  const r = deriveAta('FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B', USDC, TOKEN_PROGRAM);
  assert.equal(r.offCurve, true);
});

test('bad addresses throw labelled errors', () => {
  assert.throws(() => deriveAta('abc', USDC, TOKEN_PROGRAM), /^Error: Wallet must decode to 32 bytes \(got 3\)\.$/);
  assert.throws(() => deriveAta(WALLET, '0xdead', TOKEN_PROGRAM), /^Error: Mint is not valid base58\.$/);
});
