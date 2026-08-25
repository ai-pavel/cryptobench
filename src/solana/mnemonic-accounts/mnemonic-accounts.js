// Mnemonic Accounts: validate or generate a BIP-39 mnemonic and derive Solana accounts along common paths.
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '../../assets/vendor/@scure/bip39@2.4.0/index.esm.js';
import { wordlist } from '../../assets/vendor/@scure/bip39@2.4.0/wordlists/english.esm.js';
import { slip10Derive, parsePath, keypairFromSeed, base58, esc, wireCopy, showError } from '../lib/sol.js';

export function normalize(m) { return m.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' '); }

/** Check a normalized mnemonic's words, length and checksum; returns its words or throws. */
export function checkMnemonic(m) {
  const words = m.split(' ');
  const unknown = words.filter(w => !wordlist.includes(w));
  if (unknown.length) throw new Error(`Not in the BIP-39 English word list: ${unknown.slice(0, 5).join(', ')}`);
  if (![12, 15, 18, 21, 24].includes(words.length)) throw new Error(`A mnemonic has 12, 15, 18, 21 or 24 words (got ${words.length}).`);
  if (!validateMnemonic(m, wordlist)) throw new Error('Checksum is invalid: one of the words is wrong or out of order.');
  return words;
}

/**
 * Which accounts to derive: the start index and count (from the typed values, clamped), and whether the
 * scheme yields a single account. Throws if the path is invalid.
 */
export function accountRange(scheme, startValue, countValue) {
  const start = Math.max(0, parseInt(startValue) || 0);
  let count = Math.min(100, Math.max(1, parseInt(countValue) || 1));
  const single = scheme === 'cli' || !scheme.includes('{i}');
  if (single) count = 1;
  if (scheme !== 'cli') parsePath(scheme.replace('{i}', '0'));
  return { start, count, single };
}

/** Derive count accounts from a BIP-39 seed: index, path, address and secret key (base58). */
export function deriveAccounts(seed, scheme, start, count) {
  const accounts = [];
  for (let i = start; i < start + count; i++) {
    const path = scheme === 'cli' ? '(no derivation)' : scheme.replace('{i}', i);
    const key = scheme === 'cli' ? seed.slice(0, 32) : slip10Derive(seed, path).key;
    const kp = keypairFromSeed(key);
    accounts.push({ index: i, path, address: base58.encode(kp.publicKey), secret: base58.encode(kp.secretKey) });
  }
  return accounts;
}

export { mnemonicToSeedSync };

function mount() {
  const $ = id => document.getElementById(id);
  let timer;

  function render() {
    $('out').innerHTML = ''; $('status').textContent = '';
    const m = normalize($('mnemonic').value);
    if (!m) { showError($('err')); return; }
    const scheme = $('scheme').value === 'custom' ? $('custom').value.trim() : $('scheme').value;
    let words, range;
    try {
      words = checkMnemonic(m);
      range = accountRange(scheme, $('start').value, $('count').value);
    } catch (e) { return showError($('err'), e.message); }
    showError($('err'));
    const seed = mnemonicToSeedSync(m, $('pass').value);
    const reveal = $('reveal').checked;
    const rows = deriveAccounts(seed, scheme, range.start, range.count).map(({ index: i, path, address: addr, secret }) =>
      `<tr><td>${range.single ? '' : i}</td><td class="mono">${addr}<div class="path">${esc(path)}</div>${reveal ? `<div class="path" style="margin-top:4px">Secret: <span class="mono">${secret}</span> <button class="icon-btn copy" data-copy="${secret}">Copy</button></div>` : ''}</td>
      <td><button class="icon-btn copy" data-copy="${addr}">Copy</button></td></tr>`);
    $('out').innerHTML = `<table class="accts"><thead><tr><th>#</th><th>Address</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    $('status').textContent = `${words.length}-word mnemonic, checksum valid.`;
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(render, 150); };
  ['mnemonic', 'pass', 'custom', 'start', 'count'].forEach(id => $(id).oninput = later);
  $('reveal').onchange = render;
  $('scheme').onchange = () => { $('custom-wrap').hidden = $('scheme').value !== 'custom'; render(); };
  // Example: the standard BIP-39 test mnemonic with the Phantom/Solflare path.
  $('example').onclick = () => {
    $('mnemonic').value = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    $('pass').value = '';
    $('scheme').value = "m/44'/501'/{i}'/0'"; $('custom-wrap').hidden = true;
    $('start').value = '0'; $('count').value = '3';
    render();
  };
  $('gen12').onclick = () => { $('mnemonic').value = generateMnemonic(wordlist, 128); render(); };
  $('gen24').onclick = () => { $('mnemonic').value = generateMnemonic(wordlist, 256); render(); };
  wireCopy();
}

if (globalThis.document) mount();
