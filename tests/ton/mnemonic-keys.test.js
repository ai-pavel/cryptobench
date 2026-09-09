import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, pbkdf2Sync, createPrivateKey, createPublicKey } from 'node:crypto';
import { wordCountNote, mnemonicKeys } from '../../src/ton/mnemonic-keys/mnemonic-keys.js';
import { normalizeMnemonic } from '../../src/ton/lib/ton.js';

// The Example: a 24-word TON test mnemonic without a password.
const EXAMPLE = 'voice fortune fox tiny force rookie give wear promote depth dawn whip life october supreme excite green unveil hunt unable struggle dream wool wrap';

// Independent TON key derivation (as in tonweb-mnemonic / ton-crypto) with node:crypto:
// entropy = HMAC-SHA512(key = words joined by spaces, data = password),
// seed = PBKDF2-SHA512(entropy, "TON default seed", 100000)[0..32], keys via ed25519.
function referenceKeys(phrase, password = '') {
  const entropy = createHmac('sha512', phrase).update(password).digest();
  const seed = pbkdf2Sync(entropy, 'TON default seed', 100000, 64, 'sha512').subarray(0, 32);
  const priv = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  const pub = createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(-32);
  return { seed: seed.toString('hex'), pub: pub.toString('hex') };
}

test('word count note', () => {
  assert.equal(wordCountNote(normalizeMnemonic(EXAMPLE)), '');
  assert.equal(wordCountNote(['a', 'b', 'c']), '3 words. TON wallets use 24.');
});

test('Example mnemonic is valid and its keys match an independent derivation', async () => {
  const words = normalizeMnemonic(EXAMPLE);
  const r = await mnemonicKeys(words, '');
  assert.equal(r.valid, true);
  const m = Object.fromEntries(r.rows);
  const ref = referenceKeys(words.join(' '));
  assert.equal(m['Public key'], '4ccc0f23905323a49b2b64efe0ec35e8497a49f3532a4736b1f265f85280fb6d');
  assert.equal(m['Public key'], ref.pub);
  assert.equal(m['Private key (32-byte seed)'], ref.seed);
  assert.equal(m['Secret key (64 bytes: seed + public key)'], ref.seed + ref.pub);
});

test('normalization: case and extra whitespace do not matter', async () => {
  const messy = '  ' + EXAMPLE.toUpperCase().replace(/ /g, '   \n') + ' ';
  const a = await mnemonicKeys(normalizeMnemonic(messy), '');
  const b = await mnemonicKeys(normalizeMnemonic(EXAMPLE), '');
  assert.deepEqual(a, b);
});

test('invalid mnemonics give the reason', async () => {
  assert.deepEqual(await mnemonicKeys(['foo', 'voice', 'qux'], ''), { valid: false, reason: 'Not in the word list: foo, qux' });
  // A standard BIP-39 test phrase (all words valid) fails TON's checksum rule.
  const bip39 = normalizeMnemonic('abandon '.repeat(23) + 'art');
  const r = await mnemonicKeys(bip39, '');
  assert.equal(r.valid, false);
  assert.match(r.reason, /Not a valid TON mnemonic \(checksum rule fails\)/);
  // The Example was not created with a password.
  assert.deepEqual(await mnemonicKeys(normalizeMnemonic(EXAMPLE), 'secret'), { valid: false, reason: 'This mnemonic was not created with a password' });
});
