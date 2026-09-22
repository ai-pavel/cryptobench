// Mnemonic Accounts: derive CIP-1852 keys and addresses from a recovery phrase.
import { generateMnemonic, validateMnemonic, mnemonicToEntropy } from '../../assets/vendor/@scure/bip39@1.6.0/index.esm.js';
import { wordlist } from '../../assets/vendor/@scure/bip39@1.6.0/wordlists/english.esm.js';
import { icarusRoot, derivePath, derivePrivate, HARDENED, blake2b224, bech32Encode, buildAddress, xprvBytes, xpubBytes, toHex } from '../lib/cardano.js';
import { $, row, showError, debounce } from '../lib/ui.js';

export const EXAMPLE = 'test walk nut penalty hip pave soap entry language right filter choice';
export const newPhrase = bits => generateMnemonic(wordlist, bits);

function words(s) { return s.trim().toLowerCase().split(/\s+/).filter(Boolean); }
export function checkPhrase(s) {
  const w = words(s);
  if (![12, 15, 18, 21, 24].includes(w.length)) throw new Error(`A recovery phrase has 12, 15, 18, 21 or 24 words; this one has ${w.length}.`);
  const unknown = w.filter(x => !wordlist.includes(x));
  if (unknown.length) throw new Error('Not in the BIP-39 English word list: ' + unknown.join(', '));
  if (!validateMnemonic(w.join(' '), wordlist)) throw new Error('The checksum doesn\'t match: one of the words is probably wrong or out of order.');
  return w.join(' ');
}

/**
 * Derive the account from the form's values (strings, as typed): phrase, passphrase,
 * account, count, role, network. Returns null for an empty phrase; throws on invalid input.
 * Private keys are included; the page shows them only when asked to.
 */
export function deriveAccount({ phrase, passphrase = '', account, count, role, network }) {
  if (!phrase.trim()) return null;
  phrase = checkPhrase(phrase);
  account = Number(account); count = Number(count); role = Number(role); network = Number(network);
  if (!Number.isInteger(account) || account < 0 || account >= HARDENED) throw new Error('Account must be a whole number from 0.');
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Show between 1 and 100 addresses.');
  const root = icarusRoot(mnemonicToEntropy(phrase, wordlist), passphrase);
  const acct = derivePath(root, [1852 + HARDENED, 1815 + HARDENED, account + HARDENED]);
  const stakeKey = derivePath(acct, [2, 0]);
  const stakeHash = blake2b224(stakeKey.pub);
  const stake = { type: 'key', hash: stakeHash };
  const reward = buildAddress({ kind: 'reward', network, stake });
  const chain = derivePrivate(acct, role);
  const addresses = [];
  for (let i = 0; i < count; i++) {
    const k = derivePrivate(chain, i), h = blake2b224(k.pub);
    const a = buildAddress({ kind: 'base', network, payment: { type: 'key', hash: h }, stake });
    addresses.push({ path: `m/1852'/1815'/${account}'/${role}/${i}`, address: a.bech32, keyHash: toHex(h), xsk: bech32Encode('addr_xsk', xprvBytes(k)) });
  }
  return {
    account,
    rootXsk: bech32Encode('root_xsk', xprvBytes(root)),
    acctXvk: bech32Encode('acct_xvk', xpubBytes(acct)),
    stakeAddress: reward.bech32,
    stakeKeyHash: toHex(stakeHash),
    stakeXsk: bech32Encode('stake_xsk', xprvBytes(stakeKey)),
    addresses,
  };
}

function mount() {
  function render() {
    $('out').innerHTML = ''; $('addrs').innerHTML = '';
    try {
      const r = deriveAccount({ phrase: $('phrase').value, passphrase: $('pass').value, account: $('acct').value, count: $('count').value, role: $('role').value, network: $('net').value });
      showError($('err'));
      if (!r) return;
      const { account } = r;
      const keys = $('showKeys').checked;
      $('out').innerHTML = [
        keys ? row('Root private key (root_xsk)', r.rootXsk) : '',
        row(`Account public key (acct_xvk) · m/1852'/1815'/${account}'`, r.acctXvk, 'Wallets import this to watch the account without spending.'),
        row('Stake address', r.stakeAddress, `Stake key m/1852'/1815'/${account}'/2/0 · key hash ${r.stakeKeyHash}`),
        keys ? row('Stake private key (stake_xsk)', r.stakeXsk) : '',
      ].join('');
      $('addrs').innerHTML = r.addresses.map(a => `<div class="item stack" style="display:block">
        <div class="muted" style="font-size:13px">${a.path}</div>
        <div class="kv" style="margin-top:6px">${row('Base address', a.address)}${row('Payment key hash', a.keyHash)}${keys ? row('Payment private key (addr_xsk)', a.xsk) : ''}</div>
      </div>`).join('');
    } catch (e) { showError($('err'), e); }
  }
  const later = debounce(render, 150);
  for (const id of ['phrase', 'pass', 'acct', 'count']) $(id).addEventListener('input', later);
  for (const id of ['net', 'role', 'showKeys']) $(id).addEventListener('input', render);
  $('gen15').onclick = () => { $('phrase').value = newPhrase(160); render(); };
  $('gen24').onclick = () => { $('phrase').value = newPhrase(256); render(); };
  $('example').onclick = () => { $('phrase').value = EXAMPLE; $('pass').value = ''; render(); };
}

if (globalThis.document) mount();
