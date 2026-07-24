import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyRows, EXAMPLE } from '../../src/bitcoin/wif-private-key/wif-private-key.js';
import { base58check } from '../../src/bitcoin/lib/btc.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;
const mainnet = { net: 'mainnet', compressed: true };

test('empty input gives no result', () => {
  assert.equal(keyRows(' ', mainnet), null);
});

test('Example: the Bitcoin wiki WIF key, uncompressed', () => {
  const rows = keyRows(EXAMPLE.key, { net: EXAMPLE.net, compressed: EXAMPLE.compressed });
  assert.equal(value(rows, 'WIF'), '5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ');
  assert.equal(rows[1].note, 'Bitcoin mainnet, uncompressed');
  assert.equal(value(rows, 'WIF (compressed)'), 'KwdMAjGmerYanjeui5SHS7JkmpZvVipYvB2LJGU1ZxJwYvP98617');
  assert.equal(value(rows, 'Public key'), '04d0de0aaeaefad02b8bdc8a01a1b8b11c696bd3d66a2c5f10780d95b7df42645cd85228a6fb29940e858e7e55842ae2bd115d1ed7cc0e82d934e929c97648cb0a');
  assert.equal(value(rows, 'P2PKH (legacy)'), '1GAehh7TsJAHuUAeKZcXf5CnwuGuGgyX2S');
  // Uncompressed keys have no segwit addresses.
  assert.equal(value(rows, 'P2WPKH (native segwit)'), undefined);
});

test('WIF input: its own compression wins (BIP84 key)', () => {
  const rows = keyRows('KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d', { net: 'mainnet', compressed: false });
  assert.equal(rows[1].note, 'Bitcoin mainnet, compressed (read from the WIF)');
  assert.equal(value(rows, 'Public key'), '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c');
  assert.equal(value(rows, 'P2WPKH (native segwit)'), 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
  assert.match(value(rows, 'P2TR (taproot, BIP86 key path)'), /^bc1p/);
  assert.match(value(rows, 'P2SH-P2WPKH (nested segwit)'), /^3/);
  // The wiki WIF decodes back to the wiki hex key.
  assert.equal(value(keyRows('5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ', mainnet), 'Private key (hex)'), EXAMPLE.key);
});

test('WIF input: its network wins unless the chosen one shares the version byte', () => {
  const wif = value(keyRows(EXAMPLE.key, { net: 'testnet', compressed: true }), 'WIF');
  assert.match(wif, /^c/);
  assert.equal(keyRows(wif, { net: 'signet', compressed: true })[1].note, 'Bitcoin signet, compressed (read from the WIF)');
  assert.equal(keyRows(wif, { net: 'mainnet', compressed: true })[1].note, 'Bitcoin testnet, compressed (read from the WIF)');
});

test('bad keys throw', () => {
  assert.throws(() => keyRows('0'.repeat(64), mainnet), /out of range/);
  assert.throws(() => keyRows('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', mainnet), /out of range/);
  assert.throws(() => keyRows('5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTj', mainnet), /checksum does not match/);
  const unknown = base58check.encode(Uint8Array.of(0x01, ...new Uint8Array(31), 1));
  assert.throws(() => keyRows(unknown, mainnet), /Unknown WIF version byte 0x1/);
});
