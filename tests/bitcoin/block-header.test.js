import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headerFromHex, headerFromFields, describeHeader, SAMPLES } from '../../src/bitcoin/block-header/block-header.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;

test('empty input gives no result', () => {
  assert.equal(headerFromHex(' \n'), null);
});

test('genesis block header', () => {
  const { bytes, fields } = headerFromHex(SAMPLES.genesis);
  assert.deepEqual(fields, {
    version: '1', time: '1231006505', bits: '0x1d00ffff', nonce: '2083236893',
    prev: '0'.repeat(64), merkle: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
  });
  const d = describeHeader(bytes);
  assert.equal(d.status, 'ok');
  assert.equal(d.message, '✓ Valid proof of work for these bits');
  assert.equal(value(d.hashRows, 'Block hash'), '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f');
  assert.equal(value(d.hashRows, 'Target (from bits)'), '00000000ffff' + '0'.repeat(52));
  assert.equal(value(d.rows, 'Time'), '2009-01-03 18:15:05 UTC');
  assert.equal(value(d.rows, 'Difficulty'), '1');
  assert.equal(d.rows.find(r => r.label === 'Version').note, '');
});

test('block 100,000 header', () => {
  const { bytes, fields } = headerFromHex(SAMPLES.b100k);
  assert.equal(fields.prev, '000000000002d01c1fccc21636b607dfd930d31d01c3a62104612a1719011250');
  assert.equal(fields.merkle, 'f3e94742aca4b5ef85488dc37c06c3282295ffec960994b2c0d5ac2a25a95766');
  assert.equal(fields.bits, '0x1b04864c');
  assert.equal(fields.nonce, '274148111');
  const d = describeHeader(bytes);
  assert.equal(value(d.hashRows, 'Block hash'), '000000000003ba27aa200b1cecaad478d2b00432346c3f1f3986da1afd33e506');
  assert.equal(value(d.rows, 'Time'), '2010-12-29 11:57:43 UTC');
  assert.match(value(d.rows, 'Difficulty'), /^14,484\.1623612/);
  assert.deepEqual(d.layout.map(f => f.range), ['0–3', '4–35', '36–67', '68–71', '72–75', '76–79']);
  assert.equal(d.layout.find(f => f.name === 'Bits').hex, '4c86041b');
});

test('fields round-trip to the same header bytes', () => {
  for (const hex of Object.values(SAMPLES)) {
    const { bytes, fields } = headerFromHex(hex);
    assert.deepEqual(headerFromFields(fields), bytes);
  }
});

test('editing the nonce breaks proof of work', () => {
  const { fields } = headerFromHex(SAMPLES.genesis);
  const d = describeHeader(headerFromFields({ ...fields, nonce: '0' }));
  assert.equal(d.status, 'warn');
  assert.match(d.message, /above the target/);
});

test('BIP9 version bits are listed', () => {
  const { fields } = headerFromHex(SAMPLES.genesis);
  const d = describeHeader(headerFromFields({ ...fields, version: '0x20000005' }));
  const v = d.rows.find(r => r.label === 'Version');
  assert.equal(v.value, '536870917 (0x20000005)');
  assert.equal(v.note, 'BIP9 version bits set: 0, 2');
  // A negative version (top bit set) is accepted and shown signed.
  const n = describeHeader(headerFromFields({ ...fields, version: '0xffffffff' })).rows[0];
  assert.equal(n.value, '-1 (0xffffffff)');
});

test('bad input throws', () => {
  assert.throws(() => headerFromHex('00'), /exactly 80 bytes/);
  assert.throws(() => headerFromHex('zz'));
  const { fields } = headerFromHex(SAMPLES.genesis);
  assert.throws(() => headerFromFields({ ...fields, prev: 'abcd' }), /32 bytes/);
  assert.throws(() => headerFromFields({ ...fields, nonce: '4294967296' }));
  assert.throws(() => headerFromFields({ ...fields, time: 'soon' }));
});
