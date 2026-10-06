// Mnemonic Accounts: derive Sui accounts from a BIP-39 mnemonic, the way Sui wallets and the CLI do.
import { generateMnemonic, validateMnemonic, mnemonicToSeedSync } from '../../assets/vendor/@scure/bip39@2.4.0/index.esm.js';
import { wordlist } from '../../assets/vendor/@scure/bip39@2.4.0/wordlists/english.esm.js';
import { HDKey } from '../../assets/vendor/@scure/bip32@2.4.0/index.esm.js';
import { keyInfo, slip10Ed25519, showError, esc, KEY_NOTE, wireCopy } from '../lib/sui.js';
const $ = id => document.getElementById(id);
export const DEFAULT_PATH = { 0: "m/44'/784'/{i}'/0'/0'", 1: "m/54'/784'/{i}'/0/0", 2: "m/74'/784'/{i}'/0/0" };
const PURPOSE = { 0: 44, 1: 54, 2: 74 };

// Lowercases and collapses whitespace.
export const normalizeMnemonic = s => s.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');

export function checkMnemonic(phrase) {
  const words = phrase.split(' ');
  if (![12, 15, 18, 21, 24].includes(words.length)) throw new Error(`A mnemonic has 12, 15, 18, 21 or 24 words (got ${words.length}).`);
  const unknown = words.filter(w => !wordlist.includes(w));
  if (unknown.length) throw new Error(`Not in the BIP-39 English word list: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}`);
  if (!validateMnemonic(phrase, wordlist)) throw new Error('The words are valid but the checksum is wrong; check the order and spelling.');
}

export function derive(seed, flag, path) {
  if (flag === 0) return slip10Ed25519(seed, path);
  if (!/^m\/\d+'\/\d+'\/\d+'\/\d+\/\d+$/.test(path)) throw new Error(`Path "${path}" must look like m/${PURPOSE[flag]}'/784'/0'/0/0 (three hardened indexes, then two normal ones).`);
  return HDKey.fromMasterSeed(seed).derive(path).privateKey;
}

// Checks the path template, start index and account count inputs.
export function checkRange(tpl, start, count) {
  if (!tpl.includes('{i}')) throw new Error('The path needs {i} where the account index goes.');
  if (!/^\d+$/.test(start) || +start > 2 ** 31 - 1) throw new Error('Start index must be a whole number below 2³¹.');
  if (!/^\d+$/.test(count) || +count < 1 || +count > 50) throw new Error('Accounts must be between 1 and 50.');
}

// Derives accounts start … start + count - 1 from a seed: [{ i, path, address, suiprivkey }].
export function deriveAccounts(seed, flag, tpl, start, count) {
  const out = [];
  for (let i = +start; i < +start + +count; i++) {
    const path = tpl.replaceAll('{i}', String(i));
    const k = keyInfo(flag, derive(seed, flag, path));
    out.push({ i, path, address: k.address, suiprivkey: k.suiprivkey });
  }
  return out;
}

export const mnemonicSeed = phrase => mnemonicToSeedSync(phrase);

function mount() {
  $('keynote').textContent = KEY_NOTE;
  $('path').value = DEFAULT_PATH[0];
  let seedCache = { phrase: null, seed: null };

  function render() {
    showError($('err'), '');
    $('out').innerHTML = ''; $('status').textContent = '';
    const phrase = normalizeMnemonic($('mn').value);
    if (!phrase) return;
    try {
      checkMnemonic(phrase);
      const flag = Number($('scheme').value), tpl = $('path').value.trim();
      const start = $('start').value.trim(), count = $('count').value.trim();
      checkRange(tpl, start, count);
      if (seedCache.phrase !== phrase) seedCache = { phrase, seed: mnemonicSeed(phrase) };
      const reveal = $('reveal').checked, rows = [];
      for (const k of deriveAccounts(seedCache.seed, flag, tpl, start, count)) {
        rows.push(`<tr><td>${k.i}</td><td><div class="mono">${k.address}</div><div class="muted mono">${esc(k.path)}</div>${reveal ? `<div class="mono" style="margin-top:4px">${k.suiprivkey}</div>` : ''}</td>
        <td><button class="icon-btn" data-copy="${k.address}">Copy</button>${reveal ? `<button class="icon-btn" data-copy="${k.suiprivkey}" style="margin-top:4px">Key</button>` : ''}</td></tr>`);
      }
      $('status').textContent = 'Valid mnemonic.';
      $('out').innerHTML = `<table class="acct"><thead><tr><th>#</th><th>Address${reveal ? ' / private key (suiprivkey)' : ''}</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    } catch (e) { showError($('err'), e.message); }
  }

  $('scheme').oninput = () => { $('path').value = DEFAULT_PATH[$('scheme').value]; render(); };
  for (const id of ['mn', 'path', 'start', 'count', 'reveal']) $(id).addEventListener('input', render);
  $('gen12').onclick = () => { $('mn').value = generateMnemonic(wordlist, 128); render(); };
  $('gen24').onclick = () => { $('mn').value = generateMnemonic(wordlist, 256); render(); };
  wireCopy();
  // Example button(s)
  $('example').onclick = () => { $('mn').value = "film crazy soon outside stand loop subway crumble thrive popular green nuclear struggle pistol arm wife phrase warfare march wheat nephew ask sunny firm"; $('scheme').value = '0'; $('start').value = '0'; $('count').value = '3'; $('scheme').oninput(); };
}

if (globalThis.document) mount();
