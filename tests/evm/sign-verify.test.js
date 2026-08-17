import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signMessage, verifyMessage } from '../../src/evm/sign-verify/sign-verify.js';

const HARDHAT0_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const HARDHAT0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const EXAMPLE_SIG = '0xf875be44b382147d14f23ae10a3cd544e54996013ea390cef46c215f063862760011cd83eee30440d9dd72aa4a0c401d8ef014efd1c34b983217616bef8fbd401b';

// EIP-2098 test vectors: key 0x1234…1234 signing "Hello World" with personal_sign (r and s as
// published; the signer is the key's address, recovered identically from both vectors).
const EIP2098_KEY = '0x1234567890123456789012345678901234567890123456789012345678901234';
const EIP2098_ADDR = '0x2e988A386a799F506693793c6A5AF6B54dfAaBfB';
const EIP2098_R = '0x68a020a209d3d56c46f38cc50a33f704f4a9a10a59377f8dd762ac66910e9b90';
const EIP2098_S = '0x7e865ad05c4035ab5792787d4a0297a43617ae897930a6fe4d822b8faea52064';

test('no key / no signature gives no result', () => {
  assert.equal(signMessage('  ', 'hi', false), null);
  assert.equal(verifyMessage('hi', false, ' ', ''), null);
});

test('EIP-191 message hash of "hello world"', () => {
  const r = signMessage(HARDHAT0_KEY, 'hello world', false);
  assert.equal(r.hash, '0xd9eba16ed0ecae432b71fe008c98cc872bb4cc214d3220a36f365326cf807d68');
});

test('sign: EIP-2098 vector', () => {
  const r = signMessage(EIP2098_KEY, 'Hello World', false);
  assert.equal(r.address, EIP2098_ADDR);
  assert.equal(r.r, EIP2098_R);
  assert.equal(r.s, EIP2098_S);
  assert.equal(r.v, '27');
  assert.equal(r.signature, EIP2098_R + EIP2098_S.slice(2) + '1b');
});

test('verify: EIP-2098 compact (64-byte) and full signatures', () => {
  const full = verifyMessage('Hello World', false, EIP2098_R + EIP2098_S.slice(2) + '1b', EIP2098_ADDR);
  assert.equal(full.signer, EIP2098_ADDR);
  assert.equal(full.status.match, true);
  const compact = verifyMessage('Hello World', false, EIP2098_R + EIP2098_S.slice(2), '');
  assert.equal(compact.signer, EIP2098_ADDR);
  assert.equal(compact.status, null);
  // Second EIP-2098 vector: v = 28, so the compact form sets the top bit of s.
  const compact2 = verifyMessage('It\'s a small(er) world', false,
    '0x9328da16089fcba9bececa81663203989f2df5fe1faa6291a45381c81bd17f76939c6d6b623b42da56557e5e734a43dc83345ddfadec52cbe24d0cc64f550793', '');
  assert.equal(compact2.signer, EIP2098_ADDR);
});

test('example: sign with Hardhat #0 and verify it', () => {
  const s = signMessage(HARDHAT0_KEY, 'Hello, Ethereum!', false);
  assert.equal(s.signature, EXAMPLE_SIG);
  assert.equal(s.address, HARDHAT0);
  assert.equal(s.query, new URLSearchParams({ msg: 'Hello, Ethereum!', sig: EXAMPLE_SIG, addr: HARDHAT0 }).toString());
  const v = verifyMessage('Hello, Ethereum!', false, EXAMPLE_SIG, HARDHAT0);
  assert.equal(v.signer, HARDHAT0);
  assert.deepEqual(v.status, { match: true, cls: 'ok', message: '✅ Signature is valid for this address' });
  assert.equal(v.hash, s.hash);
});

test('verify: a different expected address', () => {
  const v = verifyMessage('Hello, Ethereum!', false, EXAMPLE_SIG, EIP2098_ADDR.toLowerCase());
  assert.deepEqual(v.status, { match: false, cls: 'bad', message: '❌ Signed by a different address' });
  // A different message recovers a different signer.
  assert.notEqual(verifyMessage('Hello, Ethereum?', false, EXAMPLE_SIG, '').signer, HARDHAT0);
});

test('hex messages are signed as bytes', () => {
  const hex = signMessage(HARDHAT0_KEY, '0x48656c6c6f2c20457468657265756d21', true);
  assert.equal(hex.signature, EXAMPLE_SIG);
  assert.match(hex.query, /&hex=1$/);
  assert.equal(verifyMessage('0x48656c6c6f2c20457468657265756d21', true, EXAMPLE_SIG, '').signer, HARDHAT0);
});

test('errors', () => {
  assert.throws(() => signMessage('0x1234', 'x', false), /Private key must be 32 bytes/);
  assert.throws(() => signMessage(HARDHAT0_KEY, '0xzz', true), /Message/);
  assert.throws(() => verifyMessage('x', false, '0x1234', ''), /Signature must be 65 bytes \(r‖s‖v\) or 64 bytes \(EIP-2098\)/);
  assert.throws(() => verifyMessage('x', false, EXAMPLE_SIG.slice(0, -2) + '05', ''), /Signature v must be 27, 28, 0 or 1 \(got 5\)/);
  assert.throws(() => verifyMessage('Hello, Ethereum!', false, EXAMPLE_SIG, '0x1234'), /Expected signer must be 20 bytes/);
  assert.throws(() => verifyMessage('Hello, Ethereum!', false, EXAMPLE_SIG, '0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266'), /Expected signer has an invalid EIP-55 checksum/);
});
