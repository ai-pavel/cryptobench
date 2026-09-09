// Mnemonic Keys: validate a TON mnemonic and derive its key pair.
import { validateMnemonic, mnemonicToKeyPair, generateMnemonic, normalizeMnemonic, bytesToHex, concat } from '../lib/ton.js';
import { $, row, showError } from '../lib/ui.js';

/** Note shown when the word count isn't the 24 TON wallets use ('' otherwise). */
export const wordCountNote = words => words.length !== 24 ? `${words.length} words. TON wallets use 24.` : '';

/**
 * Validate a mnemonic (word list) with an optional password and derive its keys.
 * Returns { valid: false, reason } or { valid: true, rows: [[label, hex]] }.
 */
export async function mnemonicKeys(words, password) {
  const v = await validateMnemonic(words, password);
  if (!v.valid) return { valid: false, reason: v.reason };
  const kp = await mnemonicToKeyPair(words, password);
  return {
    valid: true,
    rows: [
      ['Public key', bytesToHex(kp.publicKey)],
      ['Private key (32-byte seed)', bytesToHex(kp.seed)],
      ['Secret key (64 bytes: seed + public key)', bytesToHex(concat(kp.seed, kp.publicKey))],
    ],
  };
}

function mount() {
  async function check() {
    showError($('err')); $('out').innerHTML = ''; $('result').innerHTML = '';
    const words = normalizeMnemonic($('mn').value);
    if (!words.length) { showError($('err'), new Error('Enter a mnemonic or generate one')); return; }
    const note = wordCountNote(words);
    if (note) $('result').innerHTML = `<p class="muted">${note}</p>`;
    $('status').textContent = 'Checking…';
    try {
      const r = await mnemonicKeys(words, $('pw').value);
      if (!r.valid) { $('status').textContent = ''; $('result').innerHTML += '<p class="bad">✗ Invalid</p>'; showError($('err'), new Error(r.reason)); return; }
      $('result').innerHTML += '<p class="ok">✓ Valid TON mnemonic</p>';
      $('out').innerHTML = r.rows.map(([label, value]) => row(label, value)).join('');
    } catch (e) { showError($('err'), e); }
    $('status').textContent = '';
  }
  $('check').onclick = check;
  // Example: a valid 24-word TON test mnemonic without a password (generated for testing; never funded).
  $('example').onclick = () => { $('mn').value = 'voice fortune fox tiny force rookie give wear promote depth dawn whip life october supreme excite green unveil hunt unable struggle dream wool wrap'; $('pw').value = ''; check(); };
  $('gen').onclick = async () => {
    $('status').textContent = 'Generating…'; $('gen').disabled = true;
    try { $('mn').value = (await generateMnemonic(24, $('pw').value)).join(' '); await check(); }
    catch (e) { showError($('err'), e); }
    $('gen').disabled = false; $('status').textContent = '';
  };
}

if (globalThis.document) mount();
