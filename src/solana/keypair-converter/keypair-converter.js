// Keypair Converter: convert a Solana keypair between id.json, base58 secret key and 32-byte seed.
import { parseSecret, keypairFromSeed, base58, hex, kvTable, wireCopy, showError } from '../lib/sol.js';

export const MISMATCH_WARNING = 'Warning: the last 32 bytes of this 64-byte key do not match the public key derived from its seed. The outputs below use the correct public key.';

/** Parse a secret key (throws on bad input); returns the warning to show ('' if none) and the table rows. */
export function convertKeypair(input) {
  const kp = parseSecret(input);
  return {
    warning: kp.mismatch ? MISMATCH_WARNING : '',
    rows: [
      ['Public key (address)', base58.encode(kp.publicKey)],
      ['Secret key (base58, 64 bytes)', base58.encode(kp.secretKey), 'Format used by Phantom and Solflare import.'],
      ['Secret key (JSON array, 64 bytes)', JSON.stringify(Array.from(kp.secretKey)), 'Format of id.json used by the Solana CLI.'],
      ['Seed (hex, 32 bytes)', hex.encode(kp.seed)],
      ['Seed (base58, 32 bytes)', base58.encode(kp.seed)],
    ],
  };
}

/** A keypair's secret key in id.json form. */
export const toIdJson = seed32 => JSON.stringify(Array.from(keypairFromSeed(seed32).secretKey));

function mount() {
  const $ = id => document.getElementById(id);

  function render() {
    const v = $('input').value;
    $('out').innerHTML = '';
    if (!v.trim()) { showError($('err')); return; }
    try {
      const r = convertKeypair(v);
      showError($('err'), r.warning);
      $('out').innerHTML = kvTable(r.rows);
    } catch (e) { showError($('err'), e.message); }
  }
  $('input').oninput = render;
  $('gen').onclick = () => {
    $('input').value = toIdJson(crypto.getRandomValues(new Uint8Array(32)));
    render();
  };
  $('clear').onclick = () => { $('input').value = ''; render(); };
  // Example: a test keypair in id.json form whose seed is simply the bytes 1…32 (never use it for funds).
  $('example').onclick = () => { $('input').value = '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,121,181,86,46,143,230,84,249,64,120,177,18,232,169,139,167,144,31,133,58,230,149,190,215,224,227,145,11,173,4,150,100]'; render(); };
  wireCopy();
}

if (globalThis.document) mount();
