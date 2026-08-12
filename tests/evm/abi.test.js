import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSig, paramValue, encodeCall, candidates, show, decodeCalldata } from '../../src/evm/abi/abi.js';

const encode = (sig, raws) => encodeCall(parseSig(sig), raws);
const w = hex => hex.padStart(64, '0');
const wr = hex => hex.padEnd(64, '0');
const row = (rows, label) => rows.find(r => r && r.label === label);

const TRANSFER_25_USDC = '0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb9226600000000000000000000000000000000000000000000000000000000017d7840';

test('signature field: function signatures and bare parameter lists', () => {
  const f = parseSig('  transfer(address to, uint256 amount) ');
  assert.equal(f.canonical, 'transfer(address,uint256)');
  assert.deepEqual(f.inputs.map(p => p.name), ['to', 'amount']);
  assert.equal(parseSig('address, uint256').name, parseSig('(address,uint256)').name);
  assert.throws(() => parseSig('  '), /Enter a signature/);
});

test('encode: Solidity ABI spec example baz(uint32,bool)', () => {
  const r = encode('baz(uint32 x, bool y)', ['69', 'true']);
  assert.equal(r.calldata, '0xcdcd77c0' + w('45') + w('1'));
  assert.equal(row(r.rows, 'Selector').value, '0xcdcd77c0');
  assert.equal(row(r.rows, 'Size').value, '68 bytes');
  assert.deepEqual(r.words, [w('45'), w('1')]);
});

test('encode: Solidity ABI spec example bar(bytes3[2])', () => {
  const r = encode('bar(bytes3[2])', ['["0x616263", "0x646566"]']);
  assert.equal(r.calldata, '0xfce353f6' + wr('616263') + wr('646566'));
});

test('encode: Solidity ABI spec example sam(bytes,bool,uint256[])', () => {
  const r = encode('sam(bytes,bool,uint256[])', ['0x64617665', 'true', '[1, 2, 3]']);
  assert.equal(r.calldata, '0xa5643bf2' + [w('60'), w('1'), w('a0'), w('4'), wr('64617665'), w('3'), w('1'), w('2'), w('3')].join(''));
});

test('encode: Solidity ABI spec example f(uint256,uint32[],bytes10,bytes)', () => {
  const r = encode('f(uint256,uint32[],bytes10,bytes)', ['0x123', '["0x456", "0x789"]', '0x31323334353637383930', '0x48656c6c6f2c20776f726c6421']);
  assert.equal(r.calldata, '0x8be65246' + [w('123'), w('80'), wr('31323334353637383930'), w('e0'), w('2'), w('456'), w('789'), w('d'), wr('48656c6c6f2c20776f726c6421')].join(''));
});

test('encode: the page example and its decode link', () => {
  const r = encode('transfer(address to, uint256 amount)', ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '25000000']);
  assert.equal(r.calldata, TRANSFER_25_USDC);
  assert.equal(row(r.rows, 'Calldata').cls, 'ok');
  assert.equal(row(r.rows, 'Signature').value, 'transfer(address,uint256)');
  assert.equal(r.link, `?mode=decode&data=${TRANSFER_25_USDC}&sig=transfer(address%2Cuint256)`);
});

test('encode: parameter list without a name has no selector', () => {
  const r = encode('uint256', ['1']);
  assert.equal(r.calldata, '0x' + w('1'));
  assert.equal(r.rows[0].label, 'Encoded');
  assert.equal(r.link, null);
  assert.equal(row(r.rows, 'Selector'), undefined);
});

test('encode: strings may be empty; other values may not', () => {
  const r = encode('(string)', ['']);
  assert.deepEqual(r.words, [w('20'), w('0')]);
  assert.equal(encode('f()', []).words.length, 0);
  assert.throws(() => encode('transfer(address to, uint256 amount)', ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', ' ']), /Enter a value for amount/);
  assert.throws(() => encode('(uint256)', ['']), /Enter a value for parameter 1/);
  assert.throws(() => encode('(uint256[] xs)', ['[1,']), /xs: not valid JSON/);
  assert.throws(() => encode('(uint8)', ['256']));
});

test('paramValue trims scalars but not strings', () => {
  const [u, s] = parseSig('(uint256, string)').inputs;
  assert.equal(paramValue(u, ' 5 '), '5');
  assert.equal(paramValue(s, ' hi '), ' hi ');
});

test('decode: the page example with its signature', () => {
  const r = decodeCalldata(TRANSFER_25_USDC, 'transfer(address to, uint256 amount)', false);
  assert.equal(row(r.rows, 'Function').value, 'transfer(address,uint256)');
  assert.equal(row(r.rows, 'Function').note, '');
  assert.equal(row(r.rows, 'Selector').value, '0xa9059cbb');
  assert.equal(row(r.rows, 'to · address').value, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  assert.equal(row(r.rows, 'amount · uint256').value, '25000000');
  assert.deepEqual(JSON.parse(r.json), { to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', amount: '25000000' });
});

test('decode: common functions are recognized without a signature', () => {
  const r = decodeCalldata(TRANSFER_25_USDC, '', false);
  assert.equal(row(r.rows, 'Function').note, 'Recognized from the built-in list of common functions.');
  assert.equal(row(r.rows, '#1 · uint256').value, '25000000');
});

test('decode: unknown selector', () => {
  const data = '0xcdcd77c0' + w('45') + w('1');
  const r = decodeCalldata(data, '', false);
  assert.equal(r.json, null);
  assert.equal(row(r.rows, 'Function').value, 'Unknown');
  assert.equal(row(r.rows, 'Function').note, 'Paste the function signature or ABI above to decode the arguments.');
  assert.equal(row(r.rows, 'Arguments size').value, '64 bytes');
  const tried = decodeCalldata(data, 'baz(uint32,uint32)', false);
  assert.match(row(tried.rows, 'Function').note, /^No signature you entered matches\. Yours: baz\(uint32,uint32\) → 0x/);
  // With the right signature it decodes.
  const ok = decodeCalldata(data, 'baz(uint32 x, bool y)', false);
  assert.deepEqual(JSON.parse(ok.json), { x: '69', y: true });
});

test('decode: JSON ABI input', () => {
  const abi = JSON.stringify([
    { type: 'event', name: 'Transfer', inputs: [] },
    { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  ]);
  assert.equal(candidates(abi).length, 1);
  assert.equal(candidates(JSON.stringify({ abi: JSON.parse(abi) }))[0].canonical, 'transfer(address,uint256)');
  const r = decodeCalldata(TRANSFER_25_USDC, abi, false);
  assert.equal(row(r.rows, 'amount · uint256').value, '25000000');
  assert.throws(() => candidates('[nope'), /The ABI is not valid JSON/);
});

test('decode: data without a selector', () => {
  const r = decodeCalldata('0x' + w('45') + w('1'), '(uint32,bool)', true);
  assert.equal(row(r.rows, 'Selector'), undefined);
  assert.equal(row(r.rows, 'Function'), undefined);
  assert.deepEqual(JSON.parse(r.json), { 0: '69', 1: true });
  assert.throws(() => decodeCalldata('0x00', '', true), /Without a selector, enter exactly one signature/);
});

test('decode: arrays are shown on one line', () => {
  assert.equal(show([1n, [2n, 'x']]), '[ "1", [ "2", "x" ] ]');
  assert.equal(show(5n), '5');
  assert.equal(show(true), 'true');
});

test('decode errors', () => {
  assert.equal(decodeCalldata('  ', '', false), null);
  assert.throws(() => decodeCalldata('0xa9059c', '', false), /Calldata needs at least a 4-byte selector/);
  assert.throws(() => decodeCalldata('0x26121ff0ff', 'f()', false), /f\(\) takes no arguments, but there are 1 extra bytes/);
  assert.throws(() => decodeCalldata(TRANSFER_25_USDC.slice(0, 40), '', false));
  assert.throws(() => decodeCalldata('0xzz', '', false), /Calldata/);
});
