import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, password, randInt, checkInt, entropyText, SETS, wordlist } from '../../src/crypto/random-generator/random-generator.js';

const ALL = ['lower', 'upper', 'digits', 'symbols'];
const pw = (o = {}) => ({ len: '20', count: '5', classes: ALL, ambiguous: false, ...o });
const pp = (o = {}) => ({ words: '6', sep: '-', ppCount: '5', cap: false, num: false, ...o });

test('randInt stays in range and hits every value', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) { const v = randInt(7); assert.ok(Number.isInteger(v) && v >= 0 && v < 7); seen.add(v); }
  assert.equal(seen.size, 7);
  assert.equal(randInt(1), 0);
});

test('passwords: length, alphabet, one of each class', () => {
  const alphabet = new Set(Object.values(SETS).join(''));
  for (let i = 0; i < 200; i++) {
    const { value } = password(4, ALL, false);
    assert.equal(value.length, 4);
    for (const c of ALL) assert.ok([...value].some(ch => SETS[c].includes(ch)), `${value} lacks ${c}`);
    assert.ok([...value].every(ch => alphabet.has(ch)));
  }
});

test('avoiding look-alikes removes Il1O0o', () => {
  for (let i = 0; i < 50; i++) assert.doesNotMatch(password(64, ALL, true).value, /[Il1O0o]/);
  assert.equal(password(8, ['digits'], true).value.length, 8);
  assert.match(password(30, ['digits'], true).value, /^[2-9]+$/);
});

test('password entropy is length × log2(alphabet size)', () => {
  // 26 + 26 + 10 + 27 symbols = 89 characters.
  const r = generate('password', pw());
  assert.equal(r.items.length, 5);
  assert.ok(r.items.every(v => v.length === 20));
  assert.equal(r.bits, 20 * Math.log2(89));
  assert.equal(entropyText(r.bits), '≈ 129 bits of entropy each');
  // The Example avoids look-alikes: 24 + 24 + 8 + 27 = 83 characters.
  assert.equal(generate('password', pw({ ambiguous: true })).bits, 20 * Math.log2(83));
  assert.equal(generate('password', pw({ classes: ['digits'], len: '10' })).bits, 10 * Math.log2(10));
});

test('passphrases from the BIP-39 English list: 11 bits per word', () => {
  assert.equal(wordlist.length, 2048);
  const r = generate('passphrase', pp());
  assert.equal(r.bits, 66);
  assert.equal(entropyText(r.bits), '≈ 66 bits of entropy each');
  for (const p of r.items) {
    const words = p.split('-');
    assert.equal(words.length, 6);
    assert.ok(words.every(w => wordlist.includes(w)));
  }
  const capped = generate('passphrase', pp({ cap: true, num: true, sep: ' ', ppCount: '1' }));
  assert.equal(capped.bits, 66 + Math.log2(100));
  const parts = capped.items[0].split(' ');
  assert.equal(parts.length, 7);
  assert.match(parts[6], /^\d{1,2}$/);
  assert.ok(parts.slice(0, 6).every(w => /^[A-Z][a-z]+$/.test(w) && wordlist.includes(w.toLowerCase())));
  assert.doesNotMatch(generate('passphrase', pp({ sep: '' })).items[0], /[^a-z]/);
});

test('random bytes in each format', () => {
  assert.match(generate('bytes', { nbytes: '32', fmt: 'hex' }).items[0], /^[0-9a-f]{64}$/);
  assert.equal(generate('bytes', { nbytes: '32', fmt: 'hex' }).bits, 256);
  assert.match(generate('bytes', { nbytes: '3', fmt: 'base64' }).items[0], /^[A-Za-z0-9+/]{4}$/);
  assert.match(generate('bytes', { nbytes: '32', fmt: 'base64url' }).items[0], /^[A-Za-z0-9_-]{43}$/);
});

test('option errors', () => {
  assert.equal(checkInt('7', 1, 10, 'X'), 7);
  assert.throws(() => checkInt('1.5', 1, 10, 'X'), /^Error: X must be 1–10\.$/);
  assert.throws(() => generate('password', pw({ classes: [] })), /Choose at least one character set\./);
  assert.throws(() => generate('password', pw({ len: '3' })), /Length must be 4–256\./);
  assert.throws(() => generate('password', pw({ count: '51' })), /How many must be 1–50\./);
  assert.throws(() => generate('passphrase', pp({ words: '2' })), /Words must be 3–24\./);
  assert.throws(() => generate('passphrase', pp({ ppCount: '' })), /How many must be 1–50\./);
  assert.throws(() => generate('bytes', { nbytes: '4097', fmt: 'hex' }), /Bytes must be 1–4096\./);
});
