import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extendedKeyRows, EXAMPLE } from '../../src/bitcoin/extended-keys/extended-keys.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;

// BIP32 test vector 1.
const M_XPUB = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';
const M0H_XPUB = 'xpub68Gmy5EdvgibQVfPdqkBBCHxA5htiqg55crXYuXoQRKfDBFA1WEjWgP6LHhwBZeNK1VTsfTFUHCdrfp1bgwQ9xv5ski8PX9rL2dZXvgGDnw';
const M0H1_XPUB = 'xpub6ASuArnXKPbfEwhqN6e3mwBcDTgzisQN1wXN9BJcM47sSikHjJf3UFHKkNAWbWMiGj7Wf5uMash7SyYq527Hqck2AxYysAA7xmALppuCkwQ';
const M0H1_XPRV = 'xprv9wTYmMFdV23N2TdNG573QoEsfRrWKQgWeibmLntzniatZvR9BmLnvSxqu53Kw1UmYPxLgboyZQaXwTCg8MSY3H2EU4pWcQDnRnrVA1xe8fs';

test('empty input gives no result', () => {
  assert.equal(extendedKeyRows('  ', '', ''), null);
});

test('master key of BIP32 test vector 1', () => {
  const rows = extendedKeyRows(EXAMPLE.key, '', '');
  assert.equal(value(rows, 'Type'), 'Private extended key, version xprv (0x0488ade4)');
  assert.equal(value(rows, 'Extended private'), EXAMPLE.key);
  assert.equal(value(rows, 'Extended public'), M_XPUB);
  assert.equal(value(rows, 'Depth'), '0');
  assert.equal(value(rows, 'Child number'), '0 (master)');
  assert.equal(value(rows, 'Parent fingerprint'), '00000000');
  assert.equal(value(rows, 'Fingerprint'), '3442193e');
  assert.equal(value(rows, 'Private key'), 'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35');
  assert.equal(value(rows, 'Chain code'), '873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508');
});

test("Example: derive m/0'/1 (BIP32 test vector 1)", () => {
  const rows = extendedKeyRows(EXAMPLE.key, EXAMPLE.path, '');
  assert.equal(value(rows, "Extended private (child m/0'/1)"), M0H1_XPRV);
  assert.equal(value(rows, "Extended public (child m/0'/1)"), M0H1_XPUB);
  assert.equal(value(rows, 'Depth'), '2');
  assert.equal(value(rows, 'Child number'), '1');
  assert.equal(value(rows, 'Parent fingerprint'), '5c1bd648');
  assert.equal(value(rows, 'Fingerprint'), 'bef5a2f9');
  assert.match(value(rows, 'Address (P2PKH)'), /^1/);
});

test('public derivation of non-hardened children; path without m/', () => {
  const rows = extendedKeyRows(M0H_XPUB, '/1', '');
  assert.equal(value(rows, 'Type'), 'Public extended key, version xpub (0x0488b21e)');
  assert.equal(value(rows, 'Extended public (child m/1)'), M0H1_XPUB);
  assert.equal(rows.some(r => r.label.startsWith('Extended private')), false);
  assert.equal(value(rows, 'Private key'), undefined);
  assert.equal(value(rows, 'Child number'), '1');
});

test('SLIP-132 conversion (BIP84 account zpub)', () => {
  // BIP84 test vector account 0 keys.
  const zprv = 'zprvAdG4iTXWBoARxkkzNpNh8r6Qag3irQB8PzEMkAFeTRXxHpbF9z4QgEvBRmfvqWvGp42t42nvgGpNgYSJA9iefm1yYNZKEm7z6qUWCroSQnE';
  const zpub = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
  const rows = extendedKeyRows(zprv, '', '');
  assert.equal(value(rows, 'Extended public'), zpub);
  assert.equal(rows[0].note, 'Native segwit (BIP84)');
  const first = extendedKeyRows(zpub, 'm/0/0', '');
  assert.equal(value(first, 'Address (P2WPKH)'), 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
  // Shown as an xpub: same key, other version bytes and a P2PKH address.
  const asX = extendedKeyRows(zpub, '', 'xpub');
  assert.match(value(asX, 'Extended public'), /^xpub6/);
  assert.equal(value(extendedKeyRows(value(asX, 'Extended public'), '', 'zpub'), 'Extended public'), zpub);
  // Multisig prefixes have no single-key address.
  assert.equal(extendedKeyRows(zpub, '', 'Zpub').some(r => r.label.startsWith('Address')), false);
});

test('bad input throws', () => {
  assert.throws(() => extendedKeyRows(M0H_XPUB, "m/0'", ''), /Hardened children need the private key/);
  assert.throws(() => extendedKeyRows(EXAMPLE.key, 'm/x', ''), /Invalid derivation path/);
  assert.throws(() => extendedKeyRows(EXAMPLE.key.slice(0, -1) + 'j', '', ''), /Checksum does not match/);
  assert.throws(() => extendedKeyRows('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', '', ''), /Extended keys are 78 bytes; this one is 21/);
});
