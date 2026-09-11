import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeComment, decodeBody, countCells } from '../../src/ton/comment-payload/comment-payload.js';
import { beginCell, serializeBoc, bytesToBase64, commentCell, OP_ENCRYPTED_COMMENT } from '../../src/ton/lib/ton.js';

const EXAMPLE_TEXT = 'Hello, TON! \u{1F44B}';
const EXAMPLE_BOC = 'te6cckEBAQEAFgAAKAAAAABIZWxsbywgVE9OISDwn5GL+K/u8w==';
const boc = cell => bytesToBase64(serializeBoc(cell));

test('empty input gives no result', () => {
  assert.equal(encodeComment(''), null);
  assert.equal(decodeBody('  '), null);
});

test('Example comment encodes to the Example BOC: op 0 then UTF-8', () => {
  const r = encodeComment(EXAMPLE_TEXT);
  const m = Object.fromEntries(r.rows);
  assert.equal(r.info, '16 bytes of UTF-8 in 1 cell.');
  assert.equal(m['Body BOC (base64)'], EXAMPLE_BOC);
  assert.equal(m['Body BOC (base64url)'], EXAMPLE_BOC.replace(/\+/g, '-').replace(/\//g, '_'));
  // The cell data: 32 zero bits (op 0, text comment) followed by the UTF-8 bytes.
  assert.ok(m['Body BOC (hex)'].includes('00000000' + Buffer.from(EXAMPLE_TEXT).toString('hex')));
});

test('Example BOC decodes to the Example comment', () => {
  const r = decodeBody(EXAMPLE_BOC);
  assert.equal(r.kind, 'text');
  assert.equal(r.text, EXAMPLE_TEXT);
  assert.equal(r.validUtf8, true);
  assert.match(r.html, /^<p class="ok">Text comment \(op 0\)<\/p>/);
});

test('long comments snake across cells and round-trip', () => {
  // A root cell holds 1023 bits: 4 bytes of op + 123 bytes of text, then 127 bytes per cell.
  const text = 'x'.repeat(123 + 127 + 1);
  const r = encodeComment(text);
  assert.equal(r.info, '251 bytes of UTF-8 in 3 cells.');
  assert.equal(countCells(commentCell('x'.repeat(123))), 1);
  assert.equal(countCells(commentCell('x'.repeat(124))), 2);
  assert.equal(decodeBody(Object.fromEntries(r.rows)['Body BOC (hex)']).text, text);
});

test('other bodies: empty, encrypted, unknown op, invalid UTF-8', () => {
  assert.match(decodeBody(boc(beginCell().endCell())).html, /Empty body: a plain transfer with no comment/);
  const enc = decodeBody(boc(beginCell().storeUint(OP_ENCRYPTED_COMMENT, 32).storeBytes(new Uint8Array(48)).endCell()));
  assert.equal(enc.kind, 'encrypted');
  assert.equal(enc.html, '<p>Encrypted comment (op 0x2167da4b), 48 bytes. It can only be read with the recipient\'s private key.</p>');
  // TEP-74 jetton transfer op.
  const other = decodeBody(boc(beginCell().storeUint(0x0f8a7ea5, 32).storeUint(0, 64).endCell()));
  assert.match(other.html, /Not a comment: op code 0x0f8a7ea5\./);
  const bad = decodeBody(boc(beginCell().storeUint(0, 32).storeBytes(new Uint8Array([0xff, 0xfe])).endCell()));
  assert.equal(bad.validUtf8, false);
  assert.match(bad.html, /not valid UTF-8/);
});

test('malformed bodies throw', () => {
  assert.throws(() => decodeBody(boc(beginCell().storeUint(1, 8).endCell())), /Body is shorter than a 32-bit op code/);
  assert.throws(() => decodeBody('not a boc'));
});
