import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashRows } from '../../src/polkadot/hasher/hasher.js';

const hashes = (input, enc = 'text') => Object.fromEntries(hashRows(input, enc).map(([k, v]) => [k, v]));

test('example: "System" — the well-known Twox128 pallet prefix', () => {
  const h = hashes('System');
  assert.equal(h.Bytes, '0x53797374656d');
  assert.equal(h.Twox128, '0x26aa394eea5630e07c48ae0c9558cef7');
  assert.equal(h.Twox64, '0x26aa394eea5630e0');
  assert.equal(h.Twox64Concat, '0x26aa394eea5630e0' + '53797374656d');
  assert.equal(h.Blake2_128Concat, h['Blake2b-128'] + '53797374656d');
});

test('default input "Balances" and storage item "Account" prefixes', () => {
  assert.equal(hashes('Balances').Twox128, '0xc2261276cc9d1f8598ea4b6a74b15c2f');
  assert.equal(hashes('Account').Twox128, '0xb99d880ec681799c0cf30e8886371da9');
});

test('empty input: published digests of the empty string', () => {
  const h = hashes('');
  assert.equal(h.Bytes, '0x');
  assert.equal(h['Blake2b-256'], '0x0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8');
  assert.equal(h['Blake2b-512'], '0x786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce');
  assert.equal(h['Blake2s-256'], '0x69217a3079908094e11121d042354a7c1f55b6482ca1a51e1b250dfd1ed0eef9');
  assert.equal(h.Twox64, '0x99e9d85137db46ef'); // xxHash64(seed 0) = 0xef46db3751d8e999, little-endian
  assert.equal(h['Keccak-256'], '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(h['SHA-256'], '0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('"abc": RFC 7693 (BLAKE2), FIPS 180-2 and Keccak vectors', () => {
  const h = hashes('abc');
  assert.equal(h['Blake2b-512'], '0xba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923');
  assert.equal(h['Blake2s-256'], '0x508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982');
  assert.equal(h['SHA-256'], '0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(h['Keccak-256'], '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
});

test('hex input hashes the bytes; text is UTF-8', () => {
  assert.deepEqual(hashes('0x616263', 'hex'), hashes('abc'));
  assert.deepEqual(hashes('616263', 'hex'), hashes('abc'));
  assert.equal(hashes('€').Bytes, '0xe282ac');
  assert.equal(hashRows('abc', 'text')[0][2].note, '3 bytes');
});

test('invalid hex throws', () => {
  assert.throws(() => hashRows('0xabc', 'hex'));
  assert.throws(() => hashRows('xyz', 'hex'));
});
