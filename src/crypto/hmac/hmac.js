// HMAC: compute an HMAC with any hash and check it against an expected MAC.
import { parseBytes, encodeBytes, kvTable, wireCopy, showError, ENCODING_OPTIONS, KEY_NOTE, hex, base64 } from '../lib/common.js';
import { hmac } from '../../assets/vendor/@noble/hashes@2.4.0/hmac.esm.js';
import { sha1 } from '../../assets/vendor/@noble/hashes@2.4.0/legacy.esm.js';
import { sha224, sha256, sha384, sha512, sha512_256 } from '../../assets/vendor/@noble/hashes@2.4.0/sha2.esm.js';
import { sha3_256, sha3_384, sha3_512 } from '../../assets/vendor/@noble/hashes@2.4.0/sha3.esm.js';
import { blake2b, blake2s } from '../../assets/vendor/@noble/hashes@2.4.0/blake2.esm.js';

export const HASHES = { 'SHA-256': sha256, 'SHA-384': sha384, 'SHA-512': sha512, 'SHA-224': sha224, 'SHA-512/256': sha512_256, 'SHA-1': sha1,
  'SHA3-256': sha3_256, 'SHA3-384': sha3_384, 'SHA3-512': sha3_512, 'BLAKE2b-512': blake2b, 'BLAKE2s-256': blake2s };

export const computeHmac = (algo, key, msg) => hmac(HASHES[algo], key, msg);

// Compare a MAC with the expected one (hex or base64, possibly truncated): null if none given, else { ok, text }.
export function checkMac(mac, expected) {
  const exp = expected.trim();
  if (!exp) return null;
  let e;
  const h = exp.replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase();
  if (/^[0-9a-f]+$/.test(h) && h.length % 2 === 0) e = h;
  else { try { e = hex.encode(base64.decode(exp)); } catch { e = null; } }
  if (e === null) return { ok: false, text: 'The expected MAC is not hex or base64.' };
  if (e === hex.encode(mac)) return { ok: true, text: '✅ Valid: the MAC matches.' };
  if (mac.length * 2 > e.length && hex.encode(mac).startsWith(e)) return { ok: true, text: `✅ Matches the first ${e.length / 2} bytes (truncated MAC).` };
  return { ok: false, text: '❌ Invalid: the MAC does not match.' };
}

function mount() {
  const $ = id => document.getElementById(id);
  $('keynote').textContent = KEY_NOTE;
  $('algo').innerHTML = Object.keys(HASHES).map(k => `<option>${k}</option>`).join('');
  $('keyEnc').innerHTML = $('msgEnc').innerHTML = ENCODING_OPTIONS;

  function render() {
    showError($('err'), ''); $('out').innerHTML = ''; $('match').hidden = true;
    try {
      const key = parseBytes($('key').value, $('keyEnc').value, 'Key');
      const msg = parseBytes($('msg').value, $('msgEnc').value, 'Message');
      const mac = computeHmac($('algo').value, key, msg);
      const v = encodeBytes(mac, $('outEnc').value);
      $('out').innerHTML = kvTable([[`HMAC-${$('algo').value}`, v, `${mac.length * 8} bits`]]);
      const r = checkMac(mac, $('expected').value);
      if (r) {
        const m = $('match'); m.hidden = false;
        m.className = `big-result ${r.ok ? 'ok' : 'bad'}`; m.textContent = r.text;
      }
    } catch (e) { showError($('err'), e.message); }
  }
  for (const id of ['algo', 'outEnc', 'key', 'keyEnc', 'msg', 'msgEnc', 'expected']) $(id).addEventListener('input', render);
  wireCopy();
  render();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  const exFire = id => document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
  // RFC 4231 test case 1.
  $('example').onclick = () => {
    exSet('algo', 'SHA-256'); exSet('outEnc', 'hex');
    exSet('key', '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'); exSet('keyEnc', 'hex');
    exSet('msg', 'Hi There'); exSet('msgEnc', 'utf8');
    exSet('expected', 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'); exFire('msg');
  };
}

if (globalThis.document) mount();
