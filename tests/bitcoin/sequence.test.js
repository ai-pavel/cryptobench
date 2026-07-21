import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeRows, parseSequence, buildBlocks, buildTime, buildRows, EXAMPLE } from '../../src/bitcoin/sequence/sequence.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;

test('empty input gives no result', () => {
  assert.equal(parseSequence('  ', false), null);
});

test('parse decimal, hex and raw little-endian bytes', () => {
  assert.equal(parseSequence(EXAMPLE.seq, EXAMPLE.le), 0xfffffffd);
  assert.equal(parseSequence('4294967293', false), 0xfffffffd);
  assert.equal(parseSequence('fdffffff', true), 0xfffffffd);
});

test('Example: 0xfffffffd signals RBF, relative locktime disabled', () => {
  const rows = decodeRows(parseSequence(EXAMPLE.seq, EXAMPLE.le));
  assert.equal(value(rows, 'Value'), '4294967293 = 0xfffffffd');
  assert.equal(value(rows, 'Raw bytes (little-endian)'), 'fdffffff');
  assert.equal(value(rows, 'Bits (31 … 0)'), '11111111 11111111 11111111 11111101');
  assert.match(value(rows, 'Signals RBF (BIP125)'), /^Yes/);
  assert.equal(value(rows, 'Final (0xffffffff)'), 'No');
  assert.equal(value(rows, 'Relative locktime (BIP68)'), 'Disabled (bit 31 set)');
});

test('final sequence', () => {
  const rows = decodeRows(0xffffffff);
  assert.match(value(rows, 'Final (0xffffffff)'), /^Yes/);
  assert.equal(value(rows, 'Signals RBF (BIP125)'), 'No');
});

test('BIP68 block and time based values decode', () => {
  assert.equal(value(decodeRows(144), 'Relative locktime (BIP68)'), '144 blocks (about 1 d)');
  assert.equal(value(decodeRows(0x00400001), 'Relative locktime (BIP68)'), '1 × 512 s = 512 seconds (8 min)');
});

test('Example: build 144 blocks', () => {
  const rows = buildRows(buildBlocks(String(EXAMPLE.blocks)));
  assert.equal(value(rows, 'nSequence'), '0x00000090');
  assert.equal(rows[0].note, '144 blocks, about 1 d');
  assert.equal(value(rows, 'Decimal'), '144');
  assert.equal(value(rows, 'Raw bytes (little-endian)'), '90000000');
  // <144> OP_CHECKSEQUENCEVERIFY OP_DROP: 144 needs a sign byte as a script number.
  assert.equal(value(rows, 'CSV script'), '029000b275');
  assert.equal(buildBlocks('1').note, '1 block, about 10 min');
});

test('Example: build 1 day, rounded up to 512 s units', () => {
  const b = buildTime({ days: '1', hours: '0', minutes: '0', seconds: '0' });
  // ceil(86400 / 512) = 169 units with the type flag (bit 22) set.
  assert.equal(b.seq, 0x004000a9);
  assert.equal(b.note, '169 × 512 s = 86,528 s (1 d 2 min), rounded up from 86,400 s');
  const rows = buildRows(b);
  assert.equal(value(rows, 'CSV script'), '03a90040b275');
  assert.equal(value(rows, 'Raw bytes (little-endian)'), 'a9004000');
  // Exact multiple: no rounding note; empty fields count as 0.
  assert.equal(buildTime({ days: '', hours: '', minutes: '', seconds: '1024' }).note, '2 × 512 s = 1,024 s (17 min)');
});

test('bad input throws', () => {
  assert.throws(() => parseSequence('fdffff', true), /exactly 4 bytes/);
  assert.throws(() => parseSequence('4294967296', false));
  assert.throws(() => parseSequence('abc', false));
  assert.throws(() => buildBlocks('65536'));
  assert.throws(() => buildTime({ days: '389', hours: '0', minutes: '0', seconds: '0' }), /maximum is 65535/);
  assert.doesNotThrow(() => buildTime({ days: '388', hours: '0', minutes: '0', seconds: '0' }));
});
