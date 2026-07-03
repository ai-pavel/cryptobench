// Random Generator: random passwords, BIP-39 word passphrases and random bytes.
import { encodeBytes, wireCopy, showError, setPressed, randomBytes, esc } from '../lib/common.js';
import { wordlist } from '../../assets/vendor/@scure/bip39@2.4.0/wordlists/english.esm.js';

export const SETS = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.<>/?~' };
export const AMBIGUOUS = /[Il1O0o|`'"]/g;
export { wordlist };

// Uniform integer in [0, n) using rejection sampling over 32-bit values.
export function randInt(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}
export const checkInt = (value, lo, hi, label) => { const v = Number(value); if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${label} must be ${lo}–${hi}.`); return v; };

export function password(len, classes, avoid) {
  const sets = classes.map(c => avoid ? SETS[c].replace(AMBIGUOUS, '') : SETS[c]);
  const all = sets.join('');
  // Ensure one character from each chosen class, then shuffle.
  const chars = sets.map(s => s[randInt(s.length)]);
  while (chars.length < len) chars.push(all[randInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return { value: chars.slice(0, len).join(''), bits: len * Math.log2(all.length) };
}

/**
 * Generate items of one kind ('password', 'passphrase' or 'bytes') from the form's options
 * (raw input values: len, count, classes, ambiguous, words, sep, ppCount, cap, num, nbytes, fmt).
 * Returns { items, bits } where bits is the entropy of each item; throws on bad options.
 */
export function generate(kind, o) {
  const items = [];
  let bits = 0;
  if (kind === 'password') {
    const classes = o.classes;
    if (!classes.length) throw new Error('Choose at least one character set.');
    const len = checkInt(o.len, Math.max(4, classes.length), 256, 'Length'), n = checkInt(o.count, 1, 50, 'How many');
    for (let i = 0; i < n; i++) { const p = password(len, classes, o.ambiguous); items.push(p.value); bits = p.bits; }
  } else if (kind === 'passphrase') {
    const w = checkInt(o.words, 3, 24, 'Words'), n = checkInt(o.ppCount, 1, 50, 'How many');
    for (let i = 0; i < n; i++) {
      let words = Array.from({ length: w }, () => wordlist[randInt(wordlist.length)]);
      if (o.cap) words = words.map(x => x[0].toUpperCase() + x.slice(1));
      if (o.num) words.push(String(randInt(100)));
      items.push(words.join(o.sep));
    }
    bits = w * Math.log2(wordlist.length) + (o.num ? Math.log2(100) : 0);
  } else {
    const nb = checkInt(o.nbytes, 1, 4096, 'Bytes');
    items.push(encodeBytes(randomBytes(nb), o.fmt));
    bits = nb * 8;
  }
  return { items, bits };
}

export const entropyText = bits => `≈ ${Math.floor(bits)} bits of entropy each`;

function mount() {
  const $ = id => document.getElementById(id);
  let kind = 'password';
  const options = () => ({
    len: $('len').value, count: $('count').value, classes: Object.keys(SETS).filter(c => $(c).checked), ambiguous: $('ambiguous').checked,
    words: $('words').value, sep: $('sep').value, ppCount: $('ppCount').value, cap: $('cap').checked, num: $('num').checked,
    nbytes: $('nbytes').value, fmt: $('fmt').value,
  });
  function go() {
    showError($('err'), ''); $('out').innerHTML = ''; $('entropy').textContent = '';
    try {
      const { items, bits } = generate(kind, options());
      $('entropy').textContent = entropyText(bits);
      $('out').innerHTML = items.map(v => `<div class="pw-item"><span class="mono">${esc(v)}</span><button class="icon-btn" data-copy="${esc(v)}">Copy</button></div>`).join('');
    } catch (e) { showError($('err'), e.message); }
  }
  $('kind').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    kind = b.dataset.v; setPressed($('kind'), kind);
    $('pwOpts').hidden = kind !== 'password'; $('ppOpts').hidden = kind !== 'passphrase'; $('byteOpts').hidden = kind !== 'bytes';
    go();
  };
  $('go').onclick = go;
  for (const id of ['len', 'count', 'lower', 'upper', 'digits', 'symbols', 'ambiguous', 'words', 'sep', 'ppCount', 'cap', 'num', 'nbytes', 'fmt']) $(id).addEventListener('input', go);
  wireCopy();
  go();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  $('example').onclick = () => {
    if (kind === 'password') { exSet('len', 20); exSet('count', 5); for (const id of ['lower', 'upper', 'digits', 'symbols', 'ambiguous']) exSet(id, true); }
    else if (kind === 'passphrase') { exSet('words', 6); exSet('sep', '-'); exSet('ppCount', 5); exSet('cap', true); exSet('num', false); }
    else { exSet('nbytes', 32); exSet('fmt', 'hex'); }
    go();
  };
}

if (globalThis.document) mount();
