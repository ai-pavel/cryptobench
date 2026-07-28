// Mnemonic & Seed: check a BIP39 mnemonic and derive its entropy, seed and BIP32 root key.
import { sha256, bytesToHex, hexToBytes, InputError } from '../lib/btc.js';
import { bip39, wordlist, mnemonicProblem, normalizeMnemonic, HDKey } from '../lib/hd.js';
import { $, renderRows, showError } from '../lib/ui.js';

// BIP39 test vector (Trezor): "abandon … about" with passphrase TREZOR.
export const EXAMPLE = { mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', entropy: '', passphrase: 'TREZOR' };

/**
 * Check a mnemonic: null for no words; otherwise the normalized words, the problem
 * (null when valid) and the status class and message to show.
 */
export function checkMnemonic(text) {
  const words = normalizeMnemonic(text);
  if (!words) return null;
  const problem = mnemonicProblem(words);
  return { words, problem, status: problem ? 'bad' : 'ok', message: problem ? `✗ ${problem}` : `✓ Valid ${words.split(' ').length}-word BIP39 mnemonic` };
}

/** Rows for a valid normalized mnemonic: entropy, checksum bits, seed (with the passphrase), root key and word indexes. */
export async function mnemonicRows(words, passphrase) {
  const entropy = bip39.mnemonicToEntropy(words, wordlist);
  const bits = entropy.length * 8, csBits = bits / 32;
  const cs = (sha256(entropy)[0] >> (8 - csBits)).toString(2).padStart(csBits, '0');
  const seed = await bip39.mnemonicToSeed(words, passphrase.normalize('NFKD'));
  const root = HDKey.fromMasterSeed(seed);
  const list = words.split(' ').map((w, i) => `${i + 1}. ${w} (${wordlist.indexOf(w)})`).join('\n');
  return [
    { label: 'Entropy', value: bytesToHex(entropy), note: `${bits} bits` },
    { label: 'Checksum bits', value: cs, copy: false, note: `First ${csBits} bits of SHA-256(entropy)` },
    { label: 'Seed (BIP39)', value: bytesToHex(seed), note: passphrase ? 'With the passphrase' : 'No passphrase' },
    { label: 'BIP32 root key', value: root.privateExtendedKey },
    { label: 'Words (index)', value: list, copy: false },
  ];
}

/** Entropy in hex → mnemonic; null for empty input; throws InputError. */
export function mnemonicFromEntropy(hex) {
  const v = hex.trim();
  if (!v) return null;
  const e = hexToBytes(v, 'Entropy');
  if (![16, 20, 24, 28, 32].includes(e.length)) throw new InputError('Entropy must be 16, 20, 24, 28 or 32 bytes');
  return bip39.entropyToMnemonic(e, wordlist);
}

function mount() {
  let token = 0;
  async function run() {
    const my = ++token;
    showError($('err'), null);
    $('status').hidden = true;
    try {
      const c = checkMnemonic($('mnemonic').value);
      if (!c) { $('out').innerHTML = ''; return; }
      $('status').hidden = false;
      $('status').className = 'status ' + c.status;
      $('status').textContent = c.message;
      if (c.problem) { $('out').innerHTML = ''; return; }
      const rows = await mnemonicRows(c.words, $('passphrase').value);
      if (my !== token) return;
      renderRows($('out'), rows);
    } catch (e) {
      if (my !== token) return;
      $('out').innerHTML = '';
      showError($('err'), e);
    }
  }

  $('gen').onclick = () => { $('mnemonic').value = bip39.generateMnemonic(wordlist, Number($('len').value)); $('entropy').value = ''; run(); };
  $('entropy').addEventListener('input', () => {
    showError($('err'), null);
    try {
      const m = mnemonicFromEntropy($('entropy').value);
      if (m === null) return;
      $('mnemonic').value = m;
      run();
    } catch (e) { showError($('err'), e); }
  });
  $('mnemonic').addEventListener('input', run);
  $('passphrase').addEventListener('input', run);
  run();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // BIP39 test vector (Trezor): "abandon … about" with passphrase TREZOR.
  $('example').onclick = () => {
    exSet('mnemonic', EXAMPLE.mnemonic); exSet('entropy', EXAMPLE.entropy); exSet('passphrase', EXAMPLE.passphrase); run();
  };
}

if (globalThis.document) mount();
