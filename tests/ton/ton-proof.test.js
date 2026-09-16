import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign as nodeSign } from 'node:crypto';
import { findProof, proofHashes, checkHtml, verifyProof, exampleProof, tamperProof } from '../../src/ton/ton-proof/ton-proof.js';
import { parseAddress } from '../../src/ton/lib/ton.js';

const SEED = Buffer.from('09'.repeat(32), 'hex');
const TS = 1700000000, DOMAIN = 'example.com', PAYLOAD = 'deadbeef';
const sha256 = b => createHash('sha256').update(b).digest();
const priv = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), SEED]), format: 'der', type: 'pkcs8' });
const PUB = createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');

// TON Connect ton_proof, built independently from the spec:
// message = "ton-proof-item-v2/" ++ workchain (int32 BE) ++ hash ++ domain length (uint32 LE) ++ domain ++ timestamp (uint64 LE) ++ payload
// signed = sha256(0xffff ++ "ton-connect" ++ sha256(message))
function reference(wc, hash, domain, ts, payload) {
  const w = Buffer.alloc(4); w.writeInt32BE(wc);
  const l = Buffer.alloc(4); l.writeUInt32LE(Buffer.byteLength(domain));
  const t = Buffer.alloc(8); t.writeBigUInt64LE(BigInt(ts));
  const message = Buffer.concat([Buffer.from('ton-proof-item-v2/'), w, Buffer.from(hash), l, Buffer.from(domain), t, Buffer.from(payload)]);
  return { message, signed: sha256(Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from('ton-connect'), sha256(message)])) };
}
const form = (over = {}) => ({ proof: '', addr: '', domain: '', maxage: '', pub: '', ...over });

test('proof hashes follow the TON Connect spec', () => {
  const hash = new Uint8Array(32).fill(0xab);
  for (const wc of [0, -1]) {
    const ours = proofHashes(wc, hash, 'ton.org', TS, 'abc');
    const ref = reference(wc, hash, 'ton.org', TS, 'abc');
    assert.equal(Buffer.from(ours.message).toString('hex'), ref.message.toString('hex'));
    assert.equal(Buffer.from(ours.msgHash).toString('hex'), sha256(ref.message).toString('hex'));
    assert.equal(Buffer.from(ours.signed).toString('hex'), ref.signed.toString('hex'));
  }
});

test('findProof locates the proof inside a connect response', () => {
  const proof = { timestamp: 1, domain: {}, signature: '' };
  assert.equal(findProof({ connectItems: { tonProof: { proof } } }), proof);
  assert.equal(findProof({ a: 1 }), null);
  assert.equal(findProof(null), null);
});

test('Example proof (state_init, no public key) verifies; checks list each step', () => {
  const ex = exampleProof(SEED, TS, DOMAIN, PAYLOAD);
  const checks = [], f = form({ proof: ex.proof, addr: ex.addr, domain: DOMAIN, maxage: '900' });
  const r = verifyProof(f, checks, TS + 10);
  assert.equal(r.valid, true);
  assert.equal(Buffer.from(r.pub).toString('hex'), PUB);
  assert.equal(r.source, 'from state_init (wallet v4r2)');
  assert.deepEqual(checks, [
    checkHtml(true, 'Domain <span class="mono">example.com</span> · length matches'),
    checkHtml(true, 'Domain is the expected one (example.com)'),
    checkHtml(true, 'Signed at 2023-11-14T22:13:20Z (10 s ago)'),
    checkHtml(true, 'state_init hashes to this address'),
    checkHtml(true, '<strong>Signature is valid</strong>'),
  ]);
  // The signature is a real ed25519 signature over the spec's signed hash.
  const a = parseAddress(ex.addr);
  const sig = nodeSign(null, reference(a.workchain, a.hash, DOMAIN, TS, PAYLOAD).signed, priv).toString('base64');
  assert.equal(JSON.parse(ex.proof).signature, sig);
});

test('independently signed proof with a public key in the connect response', () => {
  const addr = '0:' + '11'.repeat(32), a = parseAddress(addr);
  const sig = nodeSign(null, reference(0, a.hash, DOMAIN, TS, PAYLOAD).signed, priv).toString('base64');
  const proof = JSON.stringify({ account: { address: addr, publicKey: PUB }, connectItems: { tonProof: { name: 'ton_proof', proof: { timestamp: TS, domain: { lengthBytes: 11, value: DOMAIN }, signature: sig, payload: PAYLOAD } } } });
  const checks = [], f = form({ proof });
  const r = verifyProof(f, checks, TS - 120);
  assert.equal(f.addr, addr); // filled in from the account
  assert.equal(r.valid, true);
  assert.equal(r.source, 'from the connect response');
  assert.equal(checks[1], checkHtml(null, 'Signed at 2023-11-14T22:13:20Z (120 s in the future)'));
});

test('tampered payload, wrong domain and stale timestamp are reported', () => {
  const ex = exampleProof(SEED, TS, DOMAIN, PAYLOAD);
  const checks = [];
  const r = verifyProof(form({ proof: tamperProof(ex.proof), addr: ex.addr, domain: 'evil.com', maxage: '60' }), checks, TS + 3600);
  assert.equal(r.valid, false);
  assert.equal(r.payload, PAYLOAD + 'x');
  assert.ok(checks.includes(checkHtml(false, 'Domain is the expected one (evil.com)')));
  assert.ok(checks.includes(checkHtml(false, 'Signed at 2023-11-14T22:13:20Z (3600 s ago)')));
  assert.equal(checks.at(-1), checkHtml(false, '<strong>Signature is invalid</strong>'));
});

test('state_init for another address and a different entered key are flagged', () => {
  const ex = exampleProof(SEED, TS, DOMAIN, PAYLOAD);
  const checks = [];
  const r = verifyProof(form({ proof: ex.proof, addr: '0:' + '22'.repeat(32), pub: 'aa'.repeat(32) }), checks, TS);
  assert.equal(r.valid, false);
  assert.equal(r.source, 'entered');
  assert.ok(checks.includes(checkHtml(false, 'state_init does not hash to this address')));
  assert.ok(checks.includes(checkHtml(false, 'The public key you entered differs from the one in state_init')));
});

test('input errors throw (checks so far are kept)', () => {
  const ex = exampleProof(SEED, TS, DOMAIN, PAYLOAD);
  const p = JSON.parse(ex.proof);
  assert.throws(() => verifyProof(form()), /Paste the proof JSON/);
  assert.throws(() => verifyProof(form({ proof: '{' })), /Proof is not valid JSON/);
  assert.throws(() => verifyProof(form({ proof: '{"a":1}' })), /No proof found/);
  assert.throws(() => verifyProof(form({ proof: ex.proof })), /Enter the wallet address/);
  assert.throws(() => verifyProof(form({ proof: JSON.stringify({ ...p, timestamp: 'soon' }), addr: ex.addr })), /timestamp must be a number/);
  assert.throws(() => verifyProof(form({ proof: JSON.stringify({ ...p, signature: 'AAAA' }), addr: ex.addr })), /Signature must be 64 bytes, got 3/);
  const checks = [];
  assert.throws(() => verifyProof(form({ proof: JSON.stringify({ ...p, state_init: undefined }), addr: ex.addr }), checks, TS), /No public key/);
  assert.equal(checks.length, 2);
  assert.throws(() => verifyProof(form({ proof: ex.proof, addr: ex.addr, pub: '00' }), [], TS), /Public key must be 32 bytes, got 1/);
});

test('tamperProof needs JSON', () => {
  assert.equal(JSON.parse(tamperProof('{"payload":"a"}')).payload, 'ax');
  assert.throws(() => tamperProof('nope'));
});
