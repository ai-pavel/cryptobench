// Address from Key: derive a Sui address from an Ed25519, Secp256k1 or Secp256r1 public key.
import { parseHexOrBase64, checkPublicKey, addressFromPublicKey, schemeName, base64, hex, concat, kvTable, wireCopy, showError, esc } from '../lib/sui.js';
const $ = id => document.getElementById(id);

// Returns [{ flag, pub, how }] candidates for the input bytes.
export function candidates(bytes, scheme) {
  if (scheme !== 'auto') {
    const flag = Number(scheme);
    let pub = bytes;
    if (bytes.length === (flag === 0 ? 33 : 34) && bytes[0] === flag) pub = bytes.slice(1);
    return [{ flag, pub: checkPublicKey(flag, pub), how: pub === bytes ? 'raw key' : 'Sui public key (flag + key)' }];
  }
  if (bytes.length === 33 && bytes[0] === 0) return [{ flag: 0, pub: checkPublicKey(0, bytes.slice(1)), how: 'Sui public key (flag 0x00 + key)' }];
  if (bytes.length === 34 && (bytes[0] === 1 || bytes[0] === 2)) return [{ flag: bytes[0], pub: checkPublicKey(bytes[0], bytes.slice(1)), how: `Sui public key (flag 0x0${bytes[0]} + key)` }];
  if (bytes.length === 32) return [{ flag: 0, pub: checkPublicKey(0, bytes), how: 'raw 32-byte key → Ed25519' }];
  if (bytes.length === 33 || bytes.length === 65) {
    const out = [];
    for (const flag of [1, 2]) { try { out.push({ flag, pub: checkPublicKey(flag, bytes), how: bytes.length === 65 ? 'uncompressed key, compressed for the address' : 'raw compressed key' }); } catch {} }
    if (!out.length) throw new Error('This is not a valid point on either Secp256k1 or Secp256r1.');
    return out;
  }
  throw new Error(`Unrecognised key length ${bytes.length} bytes. Ed25519 keys are 32 bytes, Secp256k1/Secp256r1 keys 33 bytes; Sui public keys add a 1-byte flag.`);
}

// Parses the public key input and returns each candidate with its scheme name and result rows.
export function deriveAddresses(input, scheme) {
  return candidates(parseHexOrBase64(input, 'Public key'), scheme).map(c => ({
    ...c,
    name: schemeName(c.flag),
    rows: [
      ['Address', addressFromPublicKey(c.flag, c.pub)],
      ['Sui public key', base64.encode(concat(Uint8Array.of(c.flag), c.pub)), 'base64 of flag ‖ key'],
      ['Public key (hex)', hex.encode(c.pub)],
      ['Flag', `0x0${c.flag}`],
    ],
  }));
}

function mount() {
  function render() {
    showError($('err'), '');
    $('out').innerHTML = '';
    if (!$('pk').value.trim()) return;
    try {
      const list = deriveAddresses($('pk').value, $('scheme').value);
      $('out').innerHTML = (list.length > 1 ? '<p class="note">A bare compressed key is valid on both curves. Both possible addresses are shown; choose the scheme above if you know it.</p>' : '') +
        list.map(c => `<p class="section-title">${esc(c.name)} <span class="badge">${esc(c.how)}</span></p>` + kvTable(c.rows)).join('');
    } catch (e) { showError($('err'), e.message); }
  }
  $('pk').oninput = render; $('scheme').oninput = render;
  wireCopy();
  render();
  // Example button(s)
  $('example').onclick = () => { $('pk').value = "ACJkf+7vNjBgvUIFoWcaFfEKEjZ2WRixtfY42C8zz8Rp"; $('scheme').value = 'auto'; render(); };
}

if (globalThis.document) mount();
