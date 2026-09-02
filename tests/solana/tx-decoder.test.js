import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Reader, decodeInput, parse, accountList, label, fmtAmount, decodeSystem, decodeToken, decodeAta, decodeCompute, decodeIx, priorityFee, overviewRows, signatureRows } from '../../src/solana/tx-decoder/tx-decoder.js';
import { ed25519, base58, base64, PROGRAMS } from '../../src/solana/lib/sol.js';

const EXAMPLE = 'AVPA4nBoi5Me4M/NDK8h9BEPZk9P/mfgXByRvu4LJn2vqjZUzuixMHG70aMoRP+M/6phePcenjBoCrQ9KnDV1gcBAAcMebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQuporZK9DwEMFFlyF5b6W6RJHDb10Imi8d/U8hdh3Y6mcwLkkYlNdJLqa+T5FOpPRfoULmRYZ8kWSidtXddvB22tNJXI8XCeAY4cFGpjC1+A6VreWp0gZMmvZZ4h/xa1HqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+FkDBkZv5SEXMv/srbpyw5vnvIzlu8X3EmssQ5s6QAAAAMb6evO+2606PWXzaqvJdDGxu+TC0vbg5HymAgNFL11hBUpTWpkpIQZNJOhxYNo4fHw1td28kruB5B+oQEEFRI0GodgXkTdUKpg0N73+KnqyVX9TXIp4citopJ3AAAAAAAbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpxJrndgN4IFTxep3s6kO0ROug7bEsbx0xxuDkqEvwUusHBwAFAuCTBAAHAAkDqGEAAAAAAAAFAgAEDAIAAAAAL2hZAAAAAAYGAAIECAULAQELBAMIAgAKDIfWEgAAAAAABgkACWdtIOKYgO+4jwoBAQmvr20fDZib7QE=';
const bytes = h => Uint8Array.from(Buffer.from(h, 'hex'));
const u64le = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b.toString('hex'); };
const SYSTEM = '11111111111111111111111111111111';
const COMPUTE = 'ComputeBudget111111111111111111111111111111';

test('compact-u16 matches the encodings in the Solana docs', () => {
  for (const [h, n] of [['00', 0], ['7f', 0x7f], ['8001', 0x80], ['ff7f', 0x3fff], ['808001', 0x4000], ['ffff03', 0xffff]]) {
    const r = new Reader(bytes(h));
    assert.equal(r.compact(), n);
    assert.equal(r.left(), 0);
  }
  assert.throws(() => new Reader(bytes('808080')).compact(), /Invalid compact-u16 length at offset 3/);
  assert.throws(() => new Reader(bytes('80')).compact(), /Unexpected end of data while reading length at offset 1/);
});

test('Example: a signed legacy transaction', () => {
  const t = decodeInput(EXAMPLE, 'auto');
  const m = t.message;
  assert.equal(t.encoding, 'base64');
  assert.equal(t.length, 575);
  assert.equal(m.version, 'legacy');
  assert.deepEqual(m.header, { numRequiredSignatures: 1, numReadonlySigned: 0, numReadonlyUnsigned: 7 });
  assert.equal(m.keys.length, 12);
  // The fee payer is the test key with seed 1…32, and its signature over the message bytes verifies.
  const seed = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  assert.equal(m.keys[0], base58.encode(ed25519.getPublicKey(seed)));
  assert.equal(ed25519.verify(t.signatures[0], t.messageBytes, base58.decode(m.keys[0])), true);

  const fee = priorityFee(m);
  assert.deepEqual(fee, { limit: 300000n, price: 25000n, fee: 7500n, defaulted: false });
  const ov = Object.fromEntries(overviewRows(t, fee).map(([k, ...v]) => [k, v]));
  assert.deepEqual(ov['Type'], ['Transaction · legacy · 575 bytes · base64']);
  assert.deepEqual(ov['Priority fee'], ['7500 lamports', '300000 CU × 25000 micro-lamports']);
  assert.deepEqual(ov['Required signatures'], ['1 (0 read-only signed, 7 read-only unsigned)']);
  assert.deepEqual(ov['Message (base64)'], [base64.encode(t.messageBytes)]);
  assert.equal(signatureRows(t)[0][0], '#1 · 9C6h…Jtpj');

  const accts = accountList(m);
  assert.deepEqual(accts[0], { address: m.keys[0], signer: true, writable: true, source: 'Fee payer' });
  assert.equal(accts.filter(a => a.writable).length, 5);
  const ixs = m.instructions.map(ix => {
    const p = accts[ix.programIdIndex].address;
    return [PROGRAMS[p], decodeIx(p, ix.data)?.name ?? null];
  });
  assert.deepEqual(ixs, [
    ['Compute Budget Program', 'Set Compute Unit Limit'],
    ['Compute Budget Program', 'Set Compute Unit Price'],
    ['System Program', 'Transfer'],
    ['Associated Token Account Program', 'Create Idempotent'],
    ['Token Program', 'Transfer Checked'],
    ['Memo Program', 'Memo'],
    ['Stake Program', null],
  ]);
  const ix = n => { const i = m.instructions[n]; return decodeIx(accts[i.programIdIndex].address, i.data); };
  assert.deepEqual(ix(2).params, [['Amount', '1500000000 lamports (1.5 SOL)']]);
  assert.deepEqual(ix(4).params, [['Amount', '1.234567 (raw 1234567)'], ['Decimals', 6]]);
  assert.deepEqual(ix(5).params, [['Text', 'gm ☀️']]);
});

test('the same transaction decodes from hex and base58, and as a bare message', () => {
  const raw = base64.decode(EXAMPLE);
  const hex = Buffer.from(raw).toString('hex');
  assert.equal(decodeInput(hex, 'auto').encoding, 'hex');
  assert.equal(decodeInput(base58.encode(raw), 'base58').message.recentBlockhash, decodeInput(EXAMPLE, 'base64').message.recentBlockhash);
  const msgOnly = decodeInput(base64.encode(decodeInput(EXAMPLE, 'auto').messageBytes), 'auto');
  assert.equal(msgOnly.signatures, null);
  assert.equal(overviewRows(msgOnly, null)[0][1], 'Message only · legacy · 510 bytes · base64');
  // An unsigned transaction shows empty signatures as not signed yet.
  const unsigned = Uint8Array.from(raw); unsigned.fill(0, 1, 65);
  assert.deepEqual(signatureRows(parse(unsigned)).map(r => r[1]), ['(not signed yet)']);
});

test('v0 message with an address lookup table', () => {
  const payer = new Uint8Array(32).fill(7);
  const table = new Uint8Array(32).fill(9);
  const msg = Buffer.concat([
    bytes('80' + '010001' + '02'), payer, base58.decode(SYSTEM), new Uint8Array(32).fill(1),
    bytes('01' + '01' + '02' + '0002' + '0c' + '02000000' + u64le(1)),
    bytes('01'), table, bytes('0105' + '0107'),
  ]);
  const t = parse(Uint8Array.from(msg));
  assert.equal(t.signatures, null);
  assert.equal(t.message.version, 0);
  const accts = accountList(t.message);
  assert.equal(accts.length, 4);
  assert.deepEqual(accts.slice(2).map(a => [a.index, a.writable]), [[5, true], [7, false]]);
  const t58 = base58.encode(table);
  assert.equal(label(accts[2]), `Lookup ${t58.slice(0, 4)}…${t58.slice(-4)} #5`);
  assert.equal(label(accts[0]), base58.encode(payer));
  assert.equal(priorityFee(t.message), null);
});

test('malformed input reports why', () => {
  assert.throws(() => decodeInput('!!!', 'auto'), /not valid base64, base58 or hex/);
  assert.throws(() => decodeInput('zz', 'hex'), /^Error: Input is not valid hex\.$/);
  assert.throws(() => parse(bytes('81')), /Unsupported message version 1/);
  assert.throws(() => parse(bytes('010000')), /Unexpected end of data while reading account count/);
  // 2 required signatures but only 1 account.
  assert.throws(() => parse(Uint8Array.from(Buffer.concat([bytes('020000' + '01'), new Uint8Array(64), bytes('00')]))), /header does not match/);
  const msg = decodeInput(EXAMPLE, 'auto').messageBytes;
  assert.throws(() => parse(Uint8Array.from([...msg, 0])), /^Error: 1 trailing bytes after the message\.$/);
});

test('System program instructions', () => {
  assert.deepEqual(decodeSystem(bytes('02000000' + u64le(1000000001))).params, [['Amount', '1000000001 lamports (1.000000001 SOL)']]);
  const create = decodeSystem(bytes('00000000' + u64le(2039280) + u64le(165) + '00'.repeat(32)));
  assert.equal(create.name, 'Create Account');
  assert.deepEqual(create.params, [['Lamports', '2039280 lamports (0.00203928 SOL)'], ['Space', '165 bytes'], ['Owner', SYSTEM]]);
  const seeded = decodeSystem(bytes('03000000' + '00'.repeat(32) + u64le(3) + '616263' + u64le(1) + u64le(0) + '00'.repeat(32)));
  assert.deepEqual(seeded.params[1], ['Seed', 'abc']);
  assert.equal(decodeSystem(bytes('0c000000')).name, 'Upgrade Nonce Account');
  assert.equal(decodeSystem(bytes('63000000')), null);
});

test('Token program instructions', () => {
  assert.deepEqual(decodeToken(bytes('03' + u64le(42))).params, [['Amount (raw)', '42']]);
  assert.deepEqual(decodeToken(bytes('0c' + u64le(1500000) + '06')).params, [['Amount', '1.5 (raw 1500000)'], ['Decimals', 6]]);
  assert.deepEqual(decodeToken(bytes('0601' + '00')).params, [['Authority type', 'Freeze account'], ['New authority', 'None']]);
  assert.deepEqual(decodeToken(bytes('0609' + '01' + '00'.repeat(32))).params, [['Authority type', 'Type 9'], ['New authority', SYSTEM]]);
  assert.equal(decodeToken(bytes('ff')).name, 'Token instruction 255');
  assert.equal(decodeAta(new Uint8Array(0)).name, 'Create');
  assert.equal(decodeAta(bytes('02')).accountNames.length, 7);
  assert.equal(decodeAta(bytes('05')), null);
  assert.deepEqual(decodeCompute(bytes('02' + 'c0270900')).params, [['Units', 600000]]);
  assert.equal(decodeCompute(bytes('09')), null);
  // Truncated data is reported, not thrown.
  assert.deepEqual(decodeIx(SYSTEM, bytes('02000000')), { name: 'Could not decode', params: [['Error', 'Unexpected end of data while reading u64 at offset 4.']], accountNames: [] });
  assert.deepEqual(decodeIx('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', bytes('ff')).params, [['Bytes', 'ff']]);
  assert.equal(decodeIx(COMPUTE.replace('C', 'D'), bytes('00')), null);
});

test('amount formatting', () => {
  assert.equal(fmtAmount(1234567n, 6), '1.234567');
  assert.equal(fmtAmount(5n, 9), '0.000000005');
  assert.equal(fmtAmount(1000n, 3), '1');
  assert.equal(fmtAmount(0n, 0), '0');
  assert.equal(fmtAmount(77n), '77');
});

test('priority fee without a limit uses 200,000 CU per non-budget instruction', () => {
  const m = { keys: [SYSTEM, COMPUTE], instructions: [
    { programIdIndex: 1, data: bytes('03' + u64le(1000000)) },
    { programIdIndex: 0, data: new Uint8Array(0) },
    { programIdIndex: 0, data: new Uint8Array(0) },
  ] };
  assert.deepEqual(priorityFee(m), { limit: 400000n, price: 1000000n, fee: 400000n, defaulted: true });
});
