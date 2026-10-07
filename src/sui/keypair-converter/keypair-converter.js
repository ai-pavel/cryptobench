// Keypair Converter: convert a private key between suiprivkey and hex, and see its public key and address.
import { parsePrivateKey, keyInfo, randomSecret, schemeName, base64, hex, concat, equal, kvTable, wireCopy, showError, KEY_NOTE } from '../lib/sui.js';
const $ = id => document.getElementById(id);

// Reads a private key (raw keys use the given scheme flag) and returns its rows,
// plus whether the second half of a 64-byte key doesn't match its public key.
export function convertKey(input, scheme) {
  const p = parsePrivateKey(input, scheme);
  const k = keyInfo(p.flag, p.secret);
  return {
    mismatch: !!(p.pubPart && !equal(p.pubPart, k.publicKey)),
    rows: [
      ['Read as', p.format],
      ['Scheme', `${schemeName(p.flag)} (flag 0x0${p.flag})`],
      ['Address', k.address],
      ['suiprivkey', k.suiprivkey],
      ['Private key (hex)', hex.encode(p.secret)],
      ['Private key (base64)', base64.encode(p.secret)],
      ['Legacy keystore (base64)', base64.encode(concat(Uint8Array.of(p.flag), p.secret)), 'flag ‖ key'],
      ['Sui public key', k.suiPublicKey, 'base64 of flag ‖ public key'],
      ['Public key (hex)', hex.encode(k.publicKey)],
    ],
  };
}

function mount() {
  $('keynote').textContent = KEY_NOTE;

  function render() {
    showError($('err'), '');
    $('out').innerHTML = '';
    if (!$('key').value.trim()) return;
    try {
      const r = convertKey($('key').value, Number($('scheme').value));
      const warn = r.mismatch ? '<p class="note">The last 32 bytes of this 64-byte key don’t match its public key; only the first 32 bytes were used.</p>' : '';
      $('out').innerHTML = warn + kvTable(r.rows);
    } catch (e) { showError($('err'), e.message); }
  }
  $('key').oninput = render; $('scheme').oninput = render;
  $('gen').onclick = () => { const f = Number($('scheme').value); $('key').value = keyInfo(f, randomSecret(f)).suiprivkey; render(); };
  wireCopy();
  render();
  // Example button(s)
  $('example').onclick = () => { $('key').value = "suiprivkey1qrwsjvr6gwaxmsvxk4cfun99ra8uwxg3c9pl0nhle7xxpe4s80y05ctazer"; $('scheme').value = '0'; render(); };
}

if (globalThis.document) mount();
