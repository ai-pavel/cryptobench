// Mnemonic Accounts: derive EVM addresses (and optionally keys) from a BIP-39 mnemonic.
import { generateMnemonic, validateMnemonic, mnemonicToSeed } from '../../assets/vendor/@scure/bip39@1.6.0/index.esm.js';
import { wordlist } from '../../assets/vendor/@scure/bip39@1.6.0/wordlists/english.esm.js';
import { HDKey } from '../../assets/vendor/@scure/bip32@1.7.0/index.esm.js';
import { addressFromPrivateKey, bytesToHex, InputError } from '../lib/evm.js';
import { $, esc, showError } from '../lib/ui.js';

export const normalize = s => s.normalize('NFKD').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');

/** Problem with a normalized mnemonic, as the message shown; null when it is valid. */
export function checkMnemonic(m) {
  const words = m ? m.split(' ') : [];
  if (![12, 15, 18, 21, 24].includes(words.length)) return `A mnemonic has 12, 15, 18, 21 or 24 words; this one has ${words.length}`;
  const unknown = words.filter(w => !wordlist.includes(w));
  if (unknown.length) return `Not in the BIP-39 English word list: ${unknown.join(', ')}`;
  if (!validateMnemonic(m, wordlist)) return 'The checksum is wrong: one of the words is probably mistyped or out of order';
  return null;
}

/** Validate the path template, start index and account count; returns them parsed. */
export function parseOptions(template, start, count) {
  template = template.trim();
  if (!/^m(\/(\d+|\{i\})'?)+$/.test(template)) throw new InputError("Path must look like m/44'/60'/0'/0/{i}");
  start = Number(start); count = Number(count);
  if (!Number.isInteger(start) || start < 0 || start >= 2 ** 31) throw new InputError('Start index must be a whole number from 0');
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new InputError('Accounts must be between 1 and 100');
  return { template, start, count };
}

/** BIP-39 seed for a normalized mnemonic and passphrase. */
export const seedOf = (m, passphrase) => mnemonicToSeed(m, passphrase.normalize('NFKD'));

/** Derive accounts from a seed: [{ index, path, address, privateKey }]. */
export function deriveAccounts(seed, { template, start, count }) {
  const root = HDKey.fromMasterSeed(seed);
  const accounts = [];
  for (let i = start; i < start + count; i++) {
    const path = template.replaceAll('{i}', String(i));
    const node = root.derive(path);
    accounts.push({ index: i, path, address: addressFromPrivateKey(node.privateKey), privateKey: bytesToHex(node.privateKey) });
  }
  return accounts;
}

function mount() {
  let token = 0;

  function setStatus(cls, text) {
    $('status').className = 'status ' + cls;
    $('status').textContent = text;
    $('status').hidden = false;
  }

  async function render() {
    const my = ++token;
    showError($('err'), null);
    const m = normalize($('mnemonic').value);
    const problem = checkMnemonic(m);
    if (problem) {
      setStatus('bad', '❌ ' + problem);
      $('table').hidden = true;
      return;
    }
    setStatus('ok', `✅ Valid ${m.split(' ').length}-word mnemonic`);
    try {
      const opts = parseOptions($('path').value, $('start').value, $('count').value);
      const seed = await seedOf(m, $('passphrase').value);
      if (my !== token) return;
      const show = $('show-keys').checked;
      const rows = deriveAccounts(seed, opts).map(({ index, path, address, privateKey }) =>
        `<tr><td>${index}</td><td class="mono">${address}
        <span class="path">${esc(path)}</span>
        ${show ? `<span class="key">${privateKey}</span>` : ''}</td>
        <td><button class="icon-btn" data-copy="${address}">Copy</button></td></tr>`);
      $('table').tBodies[0].innerHTML = rows.join('');
      $('table').hidden = false;
    } catch (e) {
      $('table').hidden = true;
      showError($('err'), e);
    }
  }

  $('preset').addEventListener('change', () => {
    if ($('preset').value !== 'custom') $('path').value = $('preset').value;
    else $('path').focus();
    render();
  });
  $('path').addEventListener('input', () => {
    const match = [...$('preset').options].find(o => o.value === $('path').value.trim());
    $('preset').value = match ? match.value : 'custom';
    render();
  });
  for (const el of [$('mnemonic'), $('passphrase'), $('start'), $('count'), $('show-keys')]) el.addEventListener('input', render);
  // Example: the public Hardhat/Anvil test mnemonic with the standard path.
  $('example').onclick = () => {
    $('mnemonic').value = 'test test test test test test test test test test test junk';
    $('passphrase').value = '';
    $('preset').value = "m/44'/60'/0'/0/{i}";
    $('path').value = "m/44'/60'/0'/0/{i}";
    $('start').value = '0';
    $('count').value = '5';
    render();
  };
  $('gen12').onclick = () => { $('mnemonic').value = generateMnemonic(wordlist, 128); render(); };
  $('gen24').onclick = () => { $('mnemonic').value = generateMnemonic(wordlist, 256); render(); };
  render();
}

if (globalThis.document) mount();
