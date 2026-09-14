import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMON, normalize, hex8, opCode, opStatus } from '../../src/ton/op-code/op-code.js';

// TEP-74 jetton transfer: op 0x0f8a7ea5.
const JETTON_TRANSFER = 'transfer query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress response_destination:MsgAddress custom_payload:(Maybe ^Cell) forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody';

test('empty input gives no result', () => {
  assert.equal(opCode('  \n '), null);
});

test('Example: TEP-74 jetton transfer is 0x0f8a7ea5', () => {
  const r = opCode(JETTON_TRANSFER);
  assert.equal(hex8(r.op), '0f8a7ea5');
  assert.equal(r.op, 260734629);
  assert.equal(hex8(r.high), '8f8a7ea5');
  assert.equal(r.tag, null);
  assert.equal(r.norm, 'transfer query_id:uint64 amount:VarUInteger 16 destination:MsgAddress response_destination:MsgAddress custom_payload:Maybe ^Cell forward_ton_amount:VarUInteger 16 forward_payload:Either Cell ^Cell = InternalMsgBody');
});

test('normalization: tags, semicolons, whitespace and parentheses', () => {
  assert.equal(normalize('  excesses#d53276db   query_id:uint64\n= InternalMsgBody ; '), 'excesses query_id:uint64 = InternalMsgBody');
  assert.equal(normalize('bool_true$1 = Bool;'), 'bool_true = Bool');
  assert.equal(opCode('transfer#0f8a7ea5 ' + JETTON_TRANSFER.slice('transfer '.length) + ';').op, opCode(JETTON_TRANSFER).op);
});

test('explicit tags are reported and compared', () => {
  const r = opCode('transfer#0f8a7ea5 ' + JETTON_TRANSFER.slice('transfer '.length));
  assert.equal(r.tag, '0f8a7ea5');
  assert.equal(r.tagValue, r.op);
  // TEP-74 excesses: its published op is the high-bit form of the computed CRC.
  const ex = opCode('excesses#d53276db query_id:uint64 = InternalMsgBody');
  assert.equal(ex.tagValue, ex.high);
  assert.notEqual(ex.tagValue, ex.op);
});

test('published op codes of the common TEP-74 / TEP-62 messages', () => {
  const status = Object.fromEntries(COMMON.map(([op, , scheme]) => [op, opStatus(op, scheme)]));
  assert.deepEqual(status, {
    '0f8a7ea5': '✓ computed', '178d4519': '✓ computed', '7362d09c': '✓ computed', '595f07bc': '✓ computed',
    'd53276db': '✓ high bit set', '5fcc3d14': '✓ computed', '05138d91': '✓ computed', '2fcb26a2': '✓ computed',
  });
  assert.equal(opStatus('00000000', JETTON_TRANSFER), '✗');
});

test('a scheme without "= ResultType" throws', () => {
  assert.throws(() => opCode('transfer query_id:uint64'), /A TL-B constructor needs "= ResultType" at the end/);
});
