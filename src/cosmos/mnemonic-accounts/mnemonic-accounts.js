// Mnemonic Accounts: derive a chain's BIP44 accounts from a BIP39 mnemonic.
import { generateMnemonic, validateMnemonic, mnemonicToSeedSync } from '../../assets/vendor/@scure/bip39@2.4.0/index.esm.js';
import { wordlist } from '../../assets/vendor/@scure/bip39@2.4.0/wordlists/english.esm.js';
import { HDKey } from '../../assets/vendor/@scure/bip32@2.4.0/index.esm.js';
import { secp256k1, cosmosAddressBytes, ethAddressBytes, ethChecksum, encodeBech32, chainOptions, CHAINS, toHex, esc, wireCopy, showError, KEY_NOTE } from '../lib/cosmos.js';

// Lowercase and collapse whitespace.
export const normalizeMnemonic = s => s.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');

// Returns why a normalized mnemonic is invalid, or '' if it's valid.
export function checkWords(m) {
  const words = m.split(' ');
  if (![12, 15, 18, 21, 24].includes(words.length)) return `A mnemonic has 12, 15, 18, 21 or 24 words; this one has ${words.length}.`;
  const unknown = words.filter(w => !wordlist.includes(w));
  if (unknown.length) return `Not in the BIP39 English word list: ${unknown.join(', ')}.`;
  if (!validateMnemonic(m, wordlist)) return 'The words are all valid, but the checksum doesn\'t match — a word is probably wrong or out of order.';
  return '';
}

// A whole number in [lo, hi] from a form value.
export function parseIntField(value, lo, hi, label) {
  const v = Number(value);
  if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${label} must be a whole number from ${lo} to ${hi}.`);
  return v;
}

let seedCache = { key: '', seed: null };

/**
 * Derive accounts m/44'/coin'/account'/0/i for i in [start, start + count).
 * Each has its path, bech32 address, EIP-55 address (coin type 60 only), private and
 * public key (hex). Throws on an invalid mnemonic.
 */
export function deriveAccounts({ mnemonic, passphrase = '', coin, prefix, account = 0, start = 0, count }) {
  const m = normalizeMnemonic(mnemonic);
  const bad = checkWords(m);
  if (bad) throw new Error(bad);
  const eth = coin === 60;
  const key = m + '\u0000' + passphrase;
  if (seedCache.key !== key) seedCache = { key, seed: mnemonicToSeedSync(m, passphrase) };
  const root = HDKey.fromMasterSeed(seedCache.seed);
  const out = [];
  for (let i = start; i < start + count; i++) {
    const path = `m/44'/${coin}'/${account}'/0/${i}`;
    const k = root.derive(path);
    const pub = k.publicKey;
    const bytes = eth ? ethAddressBytes(secp256k1.Point.fromBytes(pub).toBytes(false)) : cosmosAddressBytes(pub);
    out.push({ path, address: encodeBech32(prefix, bytes), ethAddress: eth ? ethChecksum(bytes) : '', privateKey: toHex(k.privateKey), publicKey: toHex(pub) });
  }
  return out;
}

// A warning when the coin type isn't the one the chain's wallets use, else ''.
export function coinMismatch(prefix, coin) {
  const chain = CHAINS.find(c => c.prefix === prefix);
  return chain && chain.coin !== coin ? `${chain.name} wallets normally use coin type ${chain.coin}, not ${coin}. The addresses below are valid but won't match what a wallet shows for this mnemonic.` : '';
}

function mount() {
  const $ = id => document.getElementById(id);
  $('keynote').textContent = KEY_NOTE;
  $('chain').innerHTML = chainOptions('cosmos');

  function render() {
    showError($('err'), ''); $('out').innerHTML = ''; $('status').textContent = '';
    const m = normalizeMnemonic($('mn').value);
    if (!m) return;
    try {
      const bad = checkWords(m);
      if (bad) throw new Error(bad);
      const account = parseIntField($('account').value, 0, 2 ** 31 - 1, 'Account'), start = parseIntField($('start').value, 0, 2 ** 31 - 1, 'Start index'), count = parseIntField($('count').value, 1, 50, 'Count');
      const coin = Number($('coin').value), prefix = $('chain').value;
      const reveal = $('reveal').checked;
      const rows = deriveAccounts({ mnemonic: m, passphrase: $('pass').value, coin, prefix, account, start, count }).map(a =>
        `<tr><td class="mono"><div class="muted">${esc(a.path)}</div>${esc(a.address)}${a.ethAddress ? `<div class="muted">${esc(a.ethAddress)}</div>` : ''}${reveal ? `<div class="muted">Private key: ${esc(a.privateKey)}</div>` : ''}<div class="muted">Public key: ${esc(a.publicKey)}</div></td><td><button class="icon-btn copy" data-copy="${esc(a.address)}">Copy</button></td></tr>`);
      const note = coinMismatch(prefix, coin);
      const mismatch = note ? `<p class="note">${esc(note)}</p>` : '';
      $('status').innerHTML = '<span class="ok">✅ Valid mnemonic</span>';
      $('out').innerHTML = mismatch + `<table class="kv"><tbody>${rows.join('')}</tbody></table>`;
    } catch (e) { showError($('err'), e.message); }
  }
  $('gen12').onclick = () => { $('mn').value = generateMnemonic(wordlist, 128); render(); };
  $('gen24').onclick = () => { $('mn').value = generateMnemonic(wordlist, 256); render(); };
  $('chain').oninput = () => { const c = CHAINS.find(x => x.prefix === $('chain').value); if (c) $('coin').value = String(c.coin); render(); };
  for (const id of ['mn', 'pass', 'coin', 'account', 'start', 'count', 'reveal']) $(id).oninput = render;
  wireCopy(); render();
  // Example button(s)
  $('example').onclick = () => { $('mn').value = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"; $('pass').value = ''; $('chain').value = 'cosmos'; $('coin').value = '118'; $('account').value = '0'; $('start').value = '0'; $('count').value = '3'; $('reveal').checked = false; render(); };
}

if (globalThis.document) mount();
