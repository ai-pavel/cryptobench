// Key Derivation: derive keys with PBKDF2 (WebCrypto) and HKDF.
import { parseBytes, encodeBytes, kvTable, wireCopy, showError, setPressed, ENCODING_OPTIONS, KEY_NOTE, utf8, debounce } from '../lib/common.js';
import { extract, expand } from '../../assets/vendor/@noble/hashes@2.4.0/hkdf.esm.js';
import { sha256, sha384, sha512 } from '../../assets/vendor/@noble/hashes@2.4.0/sha2.esm.js';
import { sha1 } from '../../assets/vendor/@noble/hashes@2.4.0/legacy.esm.js';

export const NOBLE = { 'SHA-256': sha256, 'SHA-384': sha384, 'SHA-512': sha512, 'SHA-1': sha1 };

export function parseLen(value) {
  const len = Number(value);
  if (!Number.isInteger(len) || len < 1 || len > 1024) throw new Error('Output length must be 1–1024 bytes.');
  return len;
}

export function parseIter(value) {
  const iter = Number(value);
  if (!Number.isInteger(iter) || iter < 1 || iter > 100000000) throw new Error('Iterations must be a whole number from 1 to 100,000,000.');
  return iter;
}

// PBKDF2 with WebCrypto; hash is a WebCrypto name like 'SHA-256'.
export async function pbkdf2(pw, salt, hash, iter, len) {
  const base = await crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash, salt, iterations: iter }, base, len * 8));
}

export const pbkdf2Rows = out => [['Derived key (hex)', encodeBytes(out, 'hex')], ['Derived key (base64)', encodeBytes(out, 'base64')]];

// HKDF (RFC 5869): the extracted PRK and the expanded output key.
export function hkdf(hash, ikm, salt, info, len) {
  const H = NOBLE[hash];
  const maxLen = 255 * H.outputLen;
  if (len > maxLen) throw new Error(`HKDF-${hash} can output at most ${maxLen} bytes.`);
  const prk = extract(H, ikm, salt);
  const okm = expand(H, prk, info, len);
  return { prk, okm };
}

export const hkdfRows = ({ prk, okm }) => [['PRK (extract)', encodeBytes(prk, 'hex'), 'HMAC(salt, input key material)'], ['Output key (hex)', encodeBytes(okm, 'hex')], ['Output key (base64)', encodeBytes(okm, 'base64')]];

export const BIP39_DEFAULT = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// The BIP39 button keeps a mnemonic already typed (12+ words), else uses the standard test mnemonic.
export const bip39Words = pw => pw.trim().split(/\s+/).length >= 12 ? pw : BIP39_DEFAULT;

function mount() {
  const $ = id => document.getElementById(id);
  $('keynote').textContent = KEY_NOTE;
  $('pwEnc').innerHTML = $('saltEnc').innerHTML = $('infoEnc').innerHTML = ENCODING_OPTIONS;
  let kdf = 'pbkdf2', run = 0;

  async function compute() {
    const my = ++run;
    showError($('err'), ''); $('out').innerHTML = '';
    try {
      const pw = parseBytes($('pw').value.normalize('NFKD'), $('pwEnc').value, kdf === 'hkdf' ? 'Input key material' : 'Password');
      const salt = parseBytes($('salt').value.normalize('NFKD'), $('saltEnc').value, 'Salt');
      const len = parseLen($('len').value);
      const hash = $('hash').value;
      if (kdf === 'pbkdf2') {
        const iter = parseIter($('iter').value);
        $('status').textContent = 'Deriving…';
        const t0 = performance.now();
        const out = await pbkdf2(pw, salt, hash, iter, len);
        if (my !== run) return;
        $('status').textContent = `Took ${(performance.now() - t0).toFixed(0)} ms.`;
        $('out').innerHTML = kvTable(pbkdf2Rows(out));
      } else {
        const info = parseBytes($('info').value, $('infoEnc').value, 'Info');
        const r = hkdf(hash, pw, salt, info, len);
        $('status').textContent = '';
        $('out').innerHTML = kvTable(hkdfRows(r));
      }
    } catch (e) { if (my === run) { $('status').textContent = ''; showError($('err'), e.message); } }
  }
  const later = debounce(compute, 250);
  for (const id of ['pw', 'pwEnc', 'salt', 'saltEnc', 'info', 'infoEnc', 'hash', 'iter', 'len']) $(id).addEventListener('input', later);
  function setKdf(v) {
    kdf = v; setPressed($('kdf'), v);
    $('infoRow').hidden = v !== 'hkdf'; $('iterField').hidden = v !== 'pbkdf2';
    $('pwLabel').textContent = v === 'hkdf' ? 'Input key material' : 'Password';
  }
  $('kdf').onclick = e => { const b = e.target.closest('button'); if (!b) return; setKdf(b.dataset.v); compute(); };
  $('bip39').onclick = async () => {
    setKdf('pbkdf2');
    const words = bip39Words($('pw').value);
    $('pw').value = words; $('pwEnc').value = 'utf8';
    // Salt is "mnemonic" followed by the optional passphrase; type the passphrase after it.
    $('salt').value = 'mnemonic'; $('saltEnc').value = 'utf8';
    $('hash').value = 'SHA-512'; $('iter').value = 2048; $('len').value = 64;
    await compute();
    $('status').textContent += ' BIP39: if you use a passphrase, type it right after “mnemonic” in the salt.';
  };
  wireCopy();
  compute();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // PBKDF2: RFC 6070 (SHA-1, 4096 iterations). HKDF: RFC 5869 test case 1.
  $('example').onclick = () => {
    if (kdf === 'pbkdf2') {
      exSet('pw', 'password'); exSet('pwEnc', 'utf8'); exSet('salt', 'salt'); exSet('saltEnc', 'utf8');
      exSet('hash', 'SHA-1'); exSet('iter', 4096); exSet('len', 20);
    } else {
      exSet('pw', '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'); exSet('pwEnc', 'hex');
      exSet('salt', '000102030405060708090a0b0c'); exSet('saltEnc', 'hex');
      exSet('info', 'f0f1f2f3f4f5f6f7f8f9'); exSet('infoEnc', 'hex'); exSet('hash', 'SHA-256'); exSet('len', 42);
    }
    compute();
  };
}

if (globalThis.document) mount();
