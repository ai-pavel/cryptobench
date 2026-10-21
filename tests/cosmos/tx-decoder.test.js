import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EXAMPLE, decodeTx, txHtml, readInput, coins, fmt, findPrefix, signerAddress, messageCard } from '../../src/cosmos/tx-decoder/tx-decoder.js';
import { decodeBech32 } from '../../src/cosmos/lib/cosmos.js';

const ADDR = 'cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4';
const PUB = 'Ak9OKtmcNNYLm6YoPJQxqEGK+GcyEpYfl6d7Y3f80Fti';

test('empty input gives no result', () => {
  assert.equal(decodeTx(' \n'), null);
});

test('Example: a multi-message transaction', () => {
  const t = decodeTx(EXAMPLE);
  // The transaction hash is the uppercase SHA-256 of the raw bytes.
  assert.equal(t.hash, createHash('sha256').update(Buffer.from(EXAMPLE, 'base64')).digest('hex').toUpperCase());
  assert.equal(t.bytes.length, Buffer.from(EXAMPLE, 'base64').length);
  assert.deepEqual(t.msgs.map(m => m['@type']), [
    '/cosmos.bank.v1beta1.MsgSend', '/cosmos.staking.v1beta1.MsgDelegate', '/ibc.applications.transfer.v1.MsgTransfer',
    '/cosmos.authz.v1beta1.MsgExec', '/cosmwasm.wasm.v1.MsgExecuteContract',
  ]);
  assert.deepEqual(t.msgs[0].amount, [{ denom: 'uatom', amount: '1234567' }]);
  assert.equal(t.msgs[0].from_address, ADDR);
  assert.deepEqual(t.msgs[2].timeout_height, { revision_number: '1', revision_height: '9999999' });
  assert.deepEqual(t.msgs[3].msgs[0].amount, [{ denom: 'uosmo', amount: '42' }]);
  assert.deepEqual(t.msgs[4].msg, { swap: { min_out: '10' } });
  assert.equal(t.body.memo, 'hello from cosmjs');
  assert.deepEqual(t.auth.fee, { amount: [{ denom: 'uatom', amount: '5000' }], gas_limit: '250000' });
  const s = t.auth.signer_infos[0];
  assert.equal(Buffer.from(s.public_key.key).toString('base64'), PUB);
  assert.equal(s.mode_info.single.mode, 'DIRECT');
  assert.equal(s.sequence, '7');
  assert.equal(t.sigs.length, 1);
  assert.equal(t.sigs[0].length, 64);
  assert.equal(t.prefix, 'cosmos');
});

test('Example HTML shows the summary, messages and signer', () => {
  const html = txHtml(decodeTx(EXAMPLE));
  assert.ok(html.includes(decodeTx(EXAMPLE).hash));
  assert.ok(html.includes('Send, Delegate, IBC transfer, Authz exec, Execute contract'));
  assert.ok(html.includes('5000uatom'));
  assert.ok(html.includes('Gas limit 250000'));
  assert.ok(html.includes('4.1. Send'));
  // The signer address is derived from the secp256k1 public key.
  assert.ok(html.includes(ADDR));
  assert.ok(html.includes('Derived from the public key with prefix &quot;cosmos&quot;'));
  assert.ok(html.includes('2030-01-01T00:00:00.000Z (nanoseconds since epoch)'));
  assert.ok(!html.includes('signer infos'));
});

test('input formats: base64, hex, and tx_bytes JSON', () => {
  const b = Buffer.from(EXAMPLE, 'base64');
  assert.deepEqual(readInput(b.toString('hex')), Uint8Array.from(b));
  assert.deepEqual(readInput(JSON.stringify({ tx_bytes: EXAMPLE, mode: 'BROADCAST_MODE_SYNC' })), Uint8Array.from(b));
  assert.deepEqual(readInput(JSON.stringify({ txBytes: EXAMPLE })), Uint8Array.from(b));
});

test('a minimal TxRaw with an empty body and no auth info', () => {
  const t = decodeTx('0a00'); // field 1 (body_bytes), length 0
  assert.deepEqual(t.msgs, []);
  assert.deepEqual(t.auth, {});
  const html = txHtml(t);
  assert.ok(html.includes('No messages.'));
  assert.ok(html.includes('No signer info.'));
});

test('more signatures than signer infos is flagged', () => {
  const t = decodeTx('0a001a0101'); // empty body plus one 1-byte signature
  assert.ok(txHtml(t).includes('1 signatures but 0 signer infos.'));
});

test('malformed input throws', () => {
  assert.throws(() => decodeTx('{"tx_bytes":'), /looks like JSON but isn't valid JSON/);
  assert.throws(() => decodeTx('{"body":{}}'), /needs a "tx_bytes" field/);
  assert.throws(() => decodeTx('1200'), /No transaction body found/);
  assert.throws(() => decodeTx('0a05'), /needs 5 bytes but only 0 are left/);
  assert.throws(() => decodeTx('!!!'), /Transaction is not valid base64/);
});

test('value formatting', () => {
  assert.equal(coins([{ amount: '1', denom: 'uatom' }, { amount: '2', denom: 'uosmo' }]), '1uatom, 2uosmo');
  assert.equal(coins([]), '—');
  assert.equal(coins(undefined), '—');
  assert.equal(fmt(Uint8Array.of(1, 2, 3)), 'AQID');
  assert.equal(fmt({ denom: 'uatom', amount: '5' }), '5uatom');
  assert.equal(fmt({ revision_height: '10' }), 'revision 0, height 10');
  assert.equal(fmt(true), 'true');
  assert.equal(fmt({ a: 1n }), '{\n  "a": "1"\n}');
});

test('address prefix detection', () => {
  assert.equal(findPrefix([{ sender: 'osmo1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu' }]), 'osmo');
  assert.equal(findPrefix([{ validator: 'cosmosvaloper1sjllsnramtg3ewxqwwrwjxfgc4n4ef9u2lcnj0' }]), 'cosmos');
  assert.equal(findPrefix([]), 'cosmos');
});

test('signer address by key type', () => {
  const key = Uint8Array.from(Buffer.from(PUB, 'base64'));
  assert.equal(signerAddress({ '@type': '/cosmos.crypto.secp256k1.PubKey', key }, 'cosmos'), ADDR);
  assert.match(signerAddress({ '@type': '/injective.crypto.v1beta1.ethsecp256k1.PubKey', key }, 'inj'), /^inj1/);
  // ed25519: first 20 bytes of SHA-256(key).
  const ed = new Uint8Array(32).fill(7);
  const edAddr = signerAddress({ '@type': '/cosmos.crypto.ed25519.PubKey', key: ed }, 'cosmos');
  assert.match(edAddr, /^cosmos1/);
  assert.deepEqual(decodeBech32(edAddr).bytes, Uint8Array.from(createHash('sha256').update(ed).digest().subarray(0, 20)));
  assert.equal(signerAddress({ '@type': '/unknown.PubKey', key }, 'cosmos'), '');
  assert.equal(signerAddress({ '@type': '/cosmos.crypto.secp256k1.PubKey' }, 'cosmos'), '');
});

test('unknown messages are shown as a field tree', () => {
  const html = messageCard({ '@type': '/x.y.MsgFoo', '@unknown': true, fields: [{ field: 1, string: 'hi' }] }, 0);
  assert.ok(html.includes('1. Unknown message'));
  assert.ok(html.includes('/x.y.MsgFoo'));
  assert.ok(html.includes('&quot;string&quot;: &quot;hi&quot;'));
});
