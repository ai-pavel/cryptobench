import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { merkleTree, SAMPLE } from '../../src/bitcoin/merkle-root/merkle-root.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;
const sha = b => createHash('sha256').update(b).digest();
const h256 = (a, b) => sha(sha(Buffer.concat([a, b])));
const internal = hex => Buffer.from(hex, 'hex').reverse();
const display = buf => Buffer.from(buf).reverse().toString('hex');

test('no TXIDs gives no result', () => {
  assert.equal(merkleTree(' \n ,', false), null);
});

test('Example: block 100,000 merkle root', () => {
  const r = merkleTree(SAMPLE.join('\n'), false);
  // The merkle root in block 100,000's header.
  assert.equal(value(r.rows, 'Merkle root'), 'f3e94742aca4b5ef85488dc37c06c3282295ffec960994b2c0d5ac2a25a95766');
  assert.equal(value(r.rows, 'As stored in the header'), '6657a9252aacd5c0b2940996ecff952228c3067cc38d4885efb5a4ac4247e9f3');
  assert.equal(value(r.rows, 'Levels'), '3');
  assert.deepEqual(r.levels.map(l => l.length), [4, 2, 1]);
});

test('internal byte order input gives the same root', () => {
  const flipped = SAMPLE.map(t => internal(t).toString('hex')).join(', ');
  assert.equal(value(merkleTree(flipped, true).rows, 'Merkle root'), 'f3e94742aca4b5ef85488dc37c06c3282295ffec960994b2c0d5ac2a25a95766');
});

test('a single TXID is its own root (genesis block)', () => {
  const r = merkleTree('4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b', false);
  assert.equal(value(r.rows, 'Merkle root'), '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b');
  assert.equal(value(r.rows, 'Levels'), '1');
});

test('an odd last node is paired with itself', () => {
  const [a, b, c] = SAMPLE.slice(0, 3).map(internal);
  const expected = display(h256(h256(a, b), h256(c, c)));
  const r = merkleTree(SAMPLE.slice(0, 3).join(' '), false);
  assert.equal(value(r.rows, 'Merkle root'), expected);
  assert.deepEqual(r.levels.map(l => l.length), [3, 2, 1]);
});

test('bad TXIDs throw', () => {
  assert.throws(() => merkleTree('abcd', false), /TXID 1 is 2 bytes; TXIDs are 32 bytes/);
  assert.throws(() => merkleTree(SAMPLE[0] + '\nnothex', false), /TXID 2/);
});
