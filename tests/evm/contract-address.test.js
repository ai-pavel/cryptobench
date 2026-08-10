import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAddress, create2Address, parseSalt } from '../../src/evm/contract-address/contract-address.js';
import { bytesToHex } from '../../src/evm/lib/evm.js';

test('CREATE: well-known addresses for deployer 0x6ac7…dbf0', () => {
  const deployer = '0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0';
  const expected = [
    '0xcd234a471b72ba2f1ccf0a70fcaba648a5eecd8d',
    '0x343c43a37d37dff08ae8c4a11544c718abb4fcf8', // the page's example (nonce 1)
    '0xf778b86fa74e846c4f0a1fbd1335fe81c00a0c91',
    '0xfffd933a0bc612844eaf0c6fe3e5b8e9b6c1d19c',
  ];
  expected.forEach((addr, nonce) => assert.equal(createAddress(deployer, String(nonce)).address.toLowerCase(), addr));
});

test('CREATE: Hardhat account #0 first deployment', () => {
  assert.equal(createAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0').address, '0x5FbDB2315678afecb367f032d93F642f64180aa3');
  assert.equal(createAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0x0').address, '0x5FbDB2315678afecb367f032d93F642f64180aa3');
});

test('CREATE2: EIP-1014 examples', () => {
  const zero = '0x' + '00'.repeat(32);
  const cases = [
    ['0x0000000000000000000000000000000000000000', zero, '0x00', '0x4D1A2e2bB4F88F0250f26Ffff098B0b30B26BF38'],
    ['0xdeadbeef00000000000000000000000000000000', zero, '0x00', '0xB928f69Bb1D91Cd65274e3c79d8986362984fDA3'],
    // The page's CREATE2 example.
    ['0xdeadbeef00000000000000000000000000000000', '0x000000000000000000000000feed000000000000000000000000000000000000', '0x00', '0xD04116cDd17beBE565EB2422F2497E06cC1C9833'],
    ['0x0000000000000000000000000000000000000000', zero, '0xdeadbeef', '0x70f2b2914A2a4b783FaEFb75f459A580616Fcb5e'],
    ['0x00000000000000000000000000000000deadbeef', '0x00000000000000000000000000000000000000000000000000000000cafebabe', '0xdeadbeef', '0x60f3f640a8508fC6a86d45DF051962668E1e8AC7'],
    ['0x00000000000000000000000000000000deadbeef', '0x00000000000000000000000000000000000000000000000000000000cafebabe', '0x' + 'deadbeef'.repeat(11), '0x1d8bfDC5D46DC4f61D6b6115972536eBE6A8854C'],
    ['0x0000000000000000000000000000000000000000', zero, '0x', '0xE33C0C7F7df4809055C3ebA6c09CFe4BaF1BD9e0'],
  ];
  for (const [deployer, salt, code, addr] of cases) {
    const r = create2Address(deployer, salt, code, 'code');
    assert.equal(r.address, addr);
    // The same result from the init code hash.
    assert.equal(create2Address(deployer, salt, r.codeHash, 'hash').address, addr);
  }
});

test('CREATE2 reports the padded salt and code hash', () => {
  const r = create2Address('0x00000000000000000000000000000000deadbeef', '0xcafebabe', '0xdeadbeef', 'code');
  assert.equal(r.address, '0x60f3f640a8508fC6a86d45DF051962668E1e8AC7');
  assert.equal(r.salt, '0x' + '00'.repeat(28) + 'cafebabe');
  assert.equal(r.codeHash, '0xd4fd4e189132273036449fc9e11198c739161b4c0116a9a2dccdfa1c492006f1');
});

test('salt as a decimal number or short hex', () => {
  assert.equal(bytesToHex(parseSalt('1')), '0x' + '00'.repeat(31) + '01');
  assert.equal(bytesToHex(parseSalt(' 0x01 ')), '0x' + '00'.repeat(31) + '01');
  assert.throws(() => parseSalt('0x' + '00'.repeat(33)), /Salt must be at most 32 bytes/);
});

test('bad input throws', () => {
  assert.throws(() => createAddress('0x1234', '0'), /Deployer must be 20 bytes/);
  assert.throws(() => createAddress('0x6aC7ea33f8831ea9dcc53393aaa88b25a785dbf0', '0'), /Deployer has an invalid EIP-55 checksum/);
  assert.throws(() => createAddress('0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0', '-1'), /Nonce cannot be negative/);
  assert.throws(() => createAddress('0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0', 'x'), /Nonce must be/);
  assert.throws(() => create2Address('0x' + '00'.repeat(20), '0', '0x00', 'hash'), /Init code hash must be 32 bytes/);
  assert.throws(() => create2Address('0x' + '00'.repeat(20), '0', 'zz', 'code'), /Init code/);
});
