import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derive, EXAMPLE } from '../../src/bitcoin/derivation-paths/derivation-paths.js';
import { seedFromInput } from '../../src/bitcoin/lib/hd.js';

const value = (rows, label) => rows.find(r => r.label === label)?.value;
const seed = seedFromInput(EXAMPLE.secret, EXAMPLE.passphrase);
const opts = (over = {}) => ({ net: EXAMPLE.net, preset: EXAMPLE.preset, account: String(EXAMPLE.account), change: EXAMPLE.change, start: String(EXAMPLE.start), count: String(EXAMPLE.count), custom: "m/84'/0'/0'/0/{i}", type: 'p2wpkh', ...over });

test('Example: BIP84 test vectors', () => {
  const { info, rows } = derive(seed, opts());
  assert.equal(value(info, 'Seed from'), 'Mnemonic (BIP39)');
  assert.equal(value(info, 'Root fingerprint'), '73c5da0a');
  assert.equal(value(info, "Account zpub (m/84'/0'/0')"), 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs');
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], {
    path: "m/84'/0'/0'/0/0",
    address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    pub: '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c',
    wif: 'KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d',
  });
  assert.equal(rows[1].address, 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
  // First change address.
  assert.equal(derive(seed, opts({ change: '1', count: '1' })).rows[0].address, 'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
});

test('BIP86: first taproot address and descriptor', () => {
  const { info, rows } = derive(seed, opts({ preset: '86', count: '1' }));
  assert.equal(rows[0].address, 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
  const xpub = value(info, "Account xpub (m/86'/0'/0')");
  assert.equal(xpub, 'xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ');
  assert.equal(value(info, 'Descriptor'), `tr([73c5da0a/86'/0'/0']${xpub}/0/*)`);
});

test('BIP44 / BIP49 and testnet', () => {
  assert.equal(derive(seed, opts({ preset: '44', count: '1' })).rows[0].address, '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA');
  assert.equal(derive(seed, opts({ preset: '49', count: '1' })).rows[0].address, '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf');
  const t = derive(seed, opts({ net: 'testnet', count: '1' }));
  assert.equal(t.rows[0].path, "m/84'/1'/0'/0/0");
  assert.match(t.rows[0].address, /^tb1q/);
  assert.match(t.rows[0].wif, /^c/);
  assert.ok(t.info.some(r => r.label === "Account vpub (m/84'/1'/0')"));
  assert.match(derive(seed, opts({ net: 'regtest', count: '1' })).rows[0].address, /^bcrt1q/);
});

test('raw seed and custom paths (BIP32 test vector 1)', () => {
  const raw = seedFromInput('000102030405060708090a0b0c0d0e0f');
  const { info, rows } = derive(raw, opts({ preset: 'custom', custom: "m/0'/{i}", type: 'p2pkh', start: '1', count: '1' }));
  assert.equal(value(info, 'Seed from'), 'Raw seed');
  assert.equal(value(info, 'Root fingerprint'), '3442193e');
  assert.equal(info.length, 2);
  assert.equal(rows[0].path, "m/0'/1");
  assert.equal(rows[0].pub, '03501e454bf00751f24b1b489aa925215d66af2234e3891c3b21a52bedb3cd711c');
  // h / H mark hardened indexes too.
  assert.equal(derive(raw, opts({ preset: 'custom', custom: 'm/0h/{i}', start: '1', count: '1' })).rows[0].path, "m/0'/1");
});

test('bad options throw', () => {
  assert.throws(() => derive(seed, opts({ count: '0' })));
  assert.throws(() => derive(seed, opts({ count: '201' })));
  assert.throws(() => derive(seed, opts({ start: '-1' })));
  assert.throws(() => derive(seed, opts({ account: 'x' })));
  assert.throws(() => derive(seed, opts({ preset: 'custom', custom: "m/84'/0'/0'/0/0" })), /must contain \{i\}/);
  assert.throws(() => derive(seed, opts({ preset: 'custom', custom: 'm/x/{i}' })), /Invalid derivation path/);
});
