import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertKey } from '../../src/sui/keypair-converter/keypair-converter.js';
import { ed25519, hex } from '../../src/sui/lib/sui.js';

const row = (r, k) => r.rows.find(x => x[0] === k)[1];

// The Example key belongs to the first Ed25519 vector of the Sui TypeScript SDK
// (ed25519-keypair.test.ts): public key ImR/7u82… → address 0xa2d14fad….
const EXAMPLE = 'suiprivkey1qrwsjvr6gwaxmsvxk4cfun99ra8uwxg3c9pl0nhle7xxpe4s80y05ctazer';
const SECRET = 'dd09307a43ba6dc186b5709e4ca51f4fc71911c143f7ceffcf8c60e6b03bc8fa';
const ADDRESS = '0xa2d14fad60c56049ecf75246a481934691214ce413e6a8ae2fe6834c173a6133';

test('Example suiprivkey', () => {
  const r = convertKey(EXAMPLE, 0);
  assert.equal(r.mismatch, false);
  assert.equal(row(r, 'Read as'), 'suiprivkey');
  assert.equal(row(r, 'Scheme'), 'Ed25519 (flag 0x00)');
  assert.equal(row(r, 'Address'), ADDRESS);
  assert.equal(row(r, 'Sui public key'), 'ACJkf+7vNjBgvUIFoWcaFfEKEjZ2WRixtfY42C8zz8Rp');
  assert.equal(row(r, 'Private key (hex)'), SECRET);
  assert.equal(row(r, 'suiprivkey'), EXAMPLE);
  assert.equal(row(r, 'Legacy keystore (base64)'), 'AN0JMHpDum3BhrVwnkylH0/HGRHBQ/fO/8+MYOawO8j6');
});

test('raw hex, legacy keystore and 64-byte forms round-trip to the same suiprivkey', () => {
  const raw = convertKey(SECRET, 0);
  assert.equal(row(raw, 'Read as'), 'raw 32 bytes');
  assert.equal(row(raw, 'suiprivkey'), EXAMPLE);
  const legacy = convertKey('AN0JMHpDum3BhrVwnkylH0/HGRHBQ/fO/8+MYOawO8j6', 1); // flag in the bytes wins
  assert.equal(row(legacy, 'Read as'), 'flag + key (legacy keystore)');
  assert.equal(row(legacy, 'Address'), ADDRESS);
  const pub = hex.encode(ed25519.getPublicKey(hex.decode(SECRET)));
  const full = convertKey(SECRET + pub, 0);
  assert.equal(full.mismatch, false);
  assert.equal(row(full, 'Address'), ADDRESS);
  const bad = convertKey(SECRET + '00'.repeat(32), 0);
  assert.equal(bad.mismatch, true);
  assert.equal(row(bad, 'Address'), ADDRESS);
});

test('raw key with another scheme', () => {
  const r = convertKey(SECRET, 1);
  assert.equal(row(r, 'Scheme'), 'Secp256k1 (flag 0x01)');
  assert.match(row(r, 'suiprivkey'), /^suiprivkey1/);
  assert.notEqual(row(r, 'Address'), ADDRESS);
  // And it reads back as the same scheme.
  assert.equal(row(convertKey(row(r, 'suiprivkey'), 0), 'Address'), row(r, 'Address'));
});

test('errors', () => {
  assert.throws(() => convertKey('  ', 0), /Private key is empty/);
  assert.throws(() => convertKey('00'.repeat(31), 0), /must be 32 bytes \(got 31\)/);
  assert.throws(() => convertKey(EXAMPLE.slice(0, -1) + 'q', 0), /bad Bech32 or checksum/);
});
