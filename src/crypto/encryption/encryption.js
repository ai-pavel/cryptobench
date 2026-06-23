// Encryption: encrypt and decrypt with AES (GCM, CBC, CTR) and (X)ChaCha20-Poly1305, with a raw key or a password.
import { parseHex, parseBytes, parseBase64, encodeBytes, kvTable, wireCopy, showError, setPressed, randomBytes, ENCODING_OPTIONS, KEY_NOTE, hex, base64, concat, utf8d } from '../lib/common.js';
import { gcm, cbc, ctr } from '../../assets/vendor/@noble/ciphers@2.4.0/aes.esm.js';
import { chacha20poly1305, xchacha20poly1305 } from '../../assets/vendor/@noble/ciphers@2.4.0/chacha.esm.js';

export const C = {
  'aes-gcm': { iv: 12, aead: true, make: (k, n, aad) => gcm(k, n, aad) },
  'aes-cbc': { iv: 16, make: (k, n) => cbc(k, n) },
  'aes-ctr': { iv: 16, make: (k, n) => ctr(k, n) },
  'chacha': { iv: 12, aead: true, key: 32, make: (k, n, aad) => chacha20poly1305(k, n, aad) },
  'xchacha': { iv: 24, aead: true, key: 32, make: (k, n, aad) => xchacha20poly1305(k, n, aad) },
};

export const ivLabel = cipher => `${C[cipher].aead && cipher !== 'aes-gcm' ? 'Nonce' : 'IV'} (hex, ${C[cipher].iv} bytes)`;
export const inLabel = (dir, cipher) => dir === 'enc' ? 'Plaintext' : `Ciphertext${C[cipher].aead ? ' with tag' : ''}`;
// Key length in bytes: fixed for ChaCha, else the chosen AES size.
export const keyLenFor = (cipher, size) => C[cipher].key || Number(size);

// A key typed as hex or base64, which must have the right length.
export function parseKey(text, len) {
  const t = text.trim();
  const k = /^(0x)?[0-9a-fA-F\s]+$/.test(t) ? parseHex(t, 'Key') : parseBase64(t, 'Key');
  if (k.length !== len) throw new Error(`Key must be ${len} bytes (${len * 8}-bit); got ${k.length}.`);
  return k;
}

export function parseIterations(value) {
  const iterations = Number(value);
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('Iterations must be a positive whole number.');
  return iterations;
}

// PBKDF2-SHA256 key from a password, with the output row describing it.
export async function deriveKey(password, salt, iterations, len) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const key = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, len * 8));
  return { key, derived: [['Derived key (PBKDF2-SHA256)', hex.encode(key), `salt ${hex.encode(salt)}, ${iterations.toLocaleString()} iterations`]] };
}

export function checkIv(cipher, iv) {
  const c = C[cipher];
  if (iv.length !== c.iv) throw new Error(`IV/nonce must be ${c.iv} bytes; got ${iv.length}.`);
}

// Encrypt and return the output rows (after any derived-key rows).
export function encryptRows(cipher, key, iv, pt, aad) {
  const c = C[cipher];
  const ct = c.make(key, iv, aad).encrypt(pt);
  const body = c.aead ? ct.subarray(0, ct.length - 16) : ct;
  const tag = c.aead ? ct.subarray(ct.length - 16) : null;
  return [
    ['IV / nonce', hex.encode(iv)],
    ['Ciphertext' + (c.aead ? ' + tag' : '') + ' (base64)', base64.encode(ct)],
    ['Ciphertext' + (c.aead ? ' + tag' : '') + ' (hex)', hex.encode(ct)],
    c.aead && ['Ciphertext only (hex)', hex.encode(body)],
    c.aead && ['Tag (hex)', hex.encode(tag), '16-byte authentication tag'],
    ['IV ‖ ciphertext' + (c.aead ? ' ‖ tag' : '') + ' (base64)', base64.encode(concat(iv, ct)), 'Single string to store or send'],
  ];
}

// Decrypt: { error } with the failure verdict, or { pt, rows, verdict } (verdict only for AEAD ciphers).
export function decrypt(cipher, key, iv, ct, aad) {
  const c = C[cipher];
  if (c.aead && ct.length < 16) throw new Error('Ciphertext is shorter than the 16-byte tag.');
  let pt;
  try { pt = c.make(key, iv, aad).decrypt(ct); }
  catch (e) {
    return { error: c.aead ? '❌ Authentication failed: wrong key, IV, associated data, or the data was modified.' : `❌ Decryption failed: ${e.message.includes('padding') || /pkcs|invalid/i.test(e.message) ? 'bad padding — likely a wrong key or IV' : e.message}.` };
  }
  let text = null;
  try { text = utf8d.decode(pt); } catch {}
  return { pt, verdict: c.aead ? '✅ Authenticated and decrypted.' : null, rows: [text !== null && ['Plaintext (text)', text], ['Plaintext (hex)', hex.encode(pt)]] };
}

function mount() {
  const $ = id => document.getElementById(id);
  $('keynote').textContent = KEY_NOTE;
  $('aadEnc').innerHTML = ENCODING_OPTIONS;
  let dir = 'enc';

  function sync() {
    const c = C[$('cipher').value];
    $('sizeField').hidden = !!c.key;
    $('aadRow').hidden = !c.aead;
    $('keyRow').hidden = $('keySrc').value !== 'key';
    $('pwRow').hidden = $('keySrc').value !== 'pw';
    $('ivLabel').textContent = ivLabel($('cipher').value);
    $('inLabel').textContent = inLabel(dir, $('cipher').value);
    $('prefixRow').hidden = dir !== 'dec';
    $('go').textContent = dir === 'enc' ? 'Encrypt' : 'Decrypt';
    const encs = dir === 'enc' ? ENCODING_OPTIONS : '<option value="base64">Base64</option><option value="hex">Hex</option>';
    if ($('inEnc').dataset.dir !== dir) { $('inEnc').innerHTML = encs; $('inEnc').dataset.dir = dir; }
  }
  const keyLen = () => keyLenFor($('cipher').value, $('size').value);

  async function getKey() {
    if ($('keySrc').value === 'key') return { key: parseKey($('key').value, keyLen()) };
    if (!$('pwSalt').value.trim()) $('pwSalt').value = hex.encode(randomBytes(16));
    const salt = parseHex($('pwSalt').value, 'Salt');
    const iterations = parseIterations($('pwIter').value);
    return deriveKey($('pw').value, salt, iterations, keyLen());
  }

  async function go() {
    showError($('err'), ''); $('out').innerHTML = ''; $('verdict').hidden = true;
    try {
      const cipher = $('cipher').value, c = C[cipher];
      $('status').textContent = $('keySrc').value === 'pw' ? 'Deriving key…' : '';
      const { key, derived = [] } = await getKey();
      $('status').textContent = '';
      const aad = c.aead && $('aad').value ? parseBytes($('aad').value, $('aadEnc').value, 'Associated data') : undefined;
      if (dir === 'enc') {
        if (!$('iv').value.trim()) $('iv').value = hex.encode(randomBytes(c.iv));
        const iv = parseHex($('iv').value, 'IV');
        checkIv(cipher, iv);
        const pt = parseBytes($('input').value, $('inEnc').value, 'Plaintext');
        $('out').innerHTML = kvTable([...derived, ...encryptRows(cipher, key, iv, pt, aad)]);
      } else {
        let ct = parseBytes($('input').value, $('inEnc').value, 'Ciphertext');
        let iv;
        if ($('prefixed').checked) { iv = ct.subarray(0, c.iv); ct = ct.subarray(c.iv); $('iv').value = hex.encode(iv); }
        else iv = parseHex($('iv').value, 'IV');
        checkIv(cipher, iv);
        const r = decrypt(cipher, key, iv, ct, aad);
        if (r.error) { const v = $('verdict'); v.hidden = false; v.className = 'big-result bad'; v.textContent = r.error; return; }
        if (r.verdict) { const v = $('verdict'); v.hidden = false; v.className = 'big-result ok'; v.textContent = r.verdict; }
        $('out').innerHTML = kvTable([...derived, ...r.rows]);
      }
    } catch (e) { $('status').textContent = ''; showError($('err'), e.message); }
  }

  $('dir').onclick = e => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === dir) return;
    dir = b.dataset.v; setPressed($('dir'), dir);
    // Move the last ciphertext into the input so a round trip is one click.
    const last = [...$('out').querySelectorAll('[data-copy]')].find(x => x.closest('tr').querySelector('th').textContent.startsWith('Ciphertext') && x.closest('tr').querySelector('th').textContent.includes('base64'));
    sync();
    if (dir === 'dec' && last) { $('input').value = last.dataset.copy; $('inEnc').value = 'base64'; }
    else if (dir === 'enc') { $('inEnc').value = 'utf8'; }
    $('out').innerHTML = ''; $('verdict').hidden = true;
  };
  $('genKey').onclick = () => { $('key').value = hex.encode(randomBytes(keyLen())); };
  $('genIv').onclick = () => { $('iv').value = hex.encode(randomBytes(C[$('cipher').value].iv)); };
  $('go').onclick = go;
  for (const id of ['cipher', 'size', 'keySrc']) $(id).addEventListener('input', () => { sync(); $('iv').value = ''; if ($('keySrc').value === 'key' && keyLen() * 2 !== $('key').value.trim().length) $('key').value = hex.encode(randomBytes(keyLen())); });
  $('key').value = hex.encode(randomBytes(32));
  sync();
  wireCopy();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // AES-256-GCM with a fixed demo key and IV.
  $('example').onclick = () => {
    exSet('cipher', 'aes-gcm'); exSet('size', '32'); exSet('keySrc', 'key'); sync();
    exSet('key', '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
    exSet('iv', '000102030405060708090a0b'); exSet('aad', '');
    if (dir === 'enc') { exSet('inEnc', 'utf8'); exSet('input', 'Hello, world!'); }
    else { exSet('prefixed', false); exSet('inEnc', 'hex'); exSet('input', '0f67ba77aac9e26ce233fbef906d905edce0598cef6674301f417d7a90'); }
    go();
  };
}

if (globalThis.document) mount();
