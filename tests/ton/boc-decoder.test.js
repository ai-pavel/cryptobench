import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bitsHex, decodeBoc, treeHtml, bocInfoText, exampleBoc } from '../../src/ton/boc-decoder/boc-decoder.js';
import { beginCell } from '../../src/ton/lib/ton.js';

// The empty cell; its representation hash is the well-known 96a296d2…cfc7.
const EMPTY_HASH = '96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7';

test('Fift-style bits hex', () => {
  assert.equal(bitsHex(beginCell().endCell()), '');
  assert.equal(bitsHex(beginCell().storeBit(1).endCell()), 'C_');
  assert.equal(bitsHex(beginCell().storeBit(0).endCell()), '4_');
  assert.equal(bitsHex(beginCell().storeUint(0xa, 4).endCell()), 'A');
  assert.equal(bitsHex(beginCell().storeUint(0xdeadbeef, 32).endCell()), 'DEADBEEF');
  assert.equal(bitsHex(beginCell().storeUint(0b101, 3).endCell()), 'B_');
});

test('empty cell, with and without CRC32C, base64 and hex', () => {
  for (const s of ['te6cckEBAQEAAgAAAEysuc0=', 'te6ccgEBAQEAAgAAAA==', 'b5ee9c72410101010002000000' + '4cacb9cd']) {
    const r = decodeBoc(s);
    assert.equal(r.rootHash, EMPTY_HASH);
    assert.equal(r.reencoded, 'te6cckEBAQEAAgAAAEysuc0=');
  }
  assert.equal(decodeBoc('te6ccgEBAQEAAgAAAA==').infoText, 'b5ee9c72 (generic) · 1 cell · 1 root · index no · CRC32C no');
  assert.equal(decodeBoc('te6cckEBAQEAAgAAAEysuc0=').infoText, 'b5ee9c72 (generic) · 1 cell · 1 root · index no · CRC32C yes, valid');
});

test('info text pluralization and legacy magic', () => {
  assert.equal(bocInfoText({ magic: '68ff65f3 (legacy indexed)', cells: 3, roots: 2, hasIdx: true, hasCrc32c: false }),
    '68ff65f3 (legacy indexed) · 3 cells · 2 roots · index yes · CRC32C no');
});

test('Example: a long comment spans two cells; tree shows both', () => {
  const r = decodeBoc(exampleBoc());
  assert.equal(r.infoText, 'b5ee9c72 (generic) · 2 cells · 1 root · index no · CRC32C yes, valid');
  assert.equal(r.reencoded, exampleBoc());
  const html = treeHtml(r.roots);
  assert.match(html, /root · 1016 bits · 1 ref/);
  assert.match(html, /root\.0 · \d+ bits · 0 refs/);
  assert.ok(html.includes(`<div class="kv-value">${r.rootHash}</div>`));
});

test('repeated cells are marked', () => {
  const leaf = beginCell().storeUint(1, 8).endCell();
  const root = beginCell().storeRef(leaf).storeRef(leaf).endCell();
  const html = treeHtml([root]);
  assert.equal(html.match(/\(same cell as above\)/g).length, 1);
});

test('bad BOCs throw', () => {
  assert.throws(() => decodeBoc('00000000000000000000'), /Not a BOC: unknown magic 00000000/);
  assert.throws(() => decodeBoc('te6cckEBAQEAAgAAAEysuc4='), /CRC32C checksum mismatch/);
  assert.throws(() => decodeBoc('b5ee'), /Too short to be a BOC/);
});
