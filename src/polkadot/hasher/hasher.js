// Hasher: hash text or hex with the hash functions Substrate uses.
import { $, kv, showError } from '../lib/ui.js';
import { utf8, fromHex, toHex, blake2, twox, keccak_256, sha256, concat, blake2b } from '../lib/dot.js';
import { blake2s } from '../../assets/vendor/@noble/hashes@2.4.0/blake2.esm.js';

// Input text + encoding ('text' or 'hex') → kv rows of every hash.
export function hashRows(input, enc) {
  const data = enc === 'hex' ? fromHex(input, 'input') : utf8(input);
  return [
    ['Bytes', toHex(data), { note: `${data.length} bytes` }],
    ['Blake2b-128', toHex(blake2(data, 128))],
    ['Blake2b-256', toHex(blake2(data, 256)), { note: 'blake2_256: account ids, multisig, hashing in runtimes' }],
    ['Blake2b-512', toHex(blake2(data, 512))],
    ['Blake2s-256', toHex(blake2s(data))],
    ['Twox64', toHex(twox(data, 64))],
    ['Twox128', toHex(twox(data, 128)), { note: 'used for pallet and storage item names' }],
    ['Twox256', toHex(twox(data, 256))],
    ['Blake2_128Concat', toHex(concat(blake2(data, 128), data)), { note: 'Blake2b-128 followed by the input' }],
    ['Twox64Concat', toHex(concat(twox(data, 64), data)), { note: 'Twox64 followed by the input' }],
    ['Keccak-256', toHex(keccak_256(data))],
    ['SHA-256', toHex(sha256(data))],
  ];
}

function mount() {
  function render() {
    try {
      const enc = document.querySelector('input[name=enc]:checked').value;
      const rows = hashRows($('in').value, enc);
      showError($('err'), null);
      $('out').innerHTML = kv(rows);
    } catch (e) { showError($('err'), e); $('out').innerHTML = ''; }
  }
  $('in').addEventListener('input', render);
  document.querySelectorAll('input[name=enc]').forEach(r => r.addEventListener('input', render));
  render();
  // Example button(s)
  $('example').onclick = () => { document.querySelector('input[name=enc][value=text]').checked = true; $('in').value = 'System'; render(); };
}

if (globalThis.document) mount();
