// Wallet Address: derive TON wallet addresses (v3, v4, v5) from a public key or a mnemonic.
import { parseBytes, bytesToHex, walletAddress, formatFriendly, formatRaw, validateMnemonic, mnemonicToKeyPair, DEFAULT_WALLET_ID, WALLET_VERSIONS } from '../lib/ton.js';
import { $, row, esc, showError } from '../lib/ui.js';

export const NAMES = { v3r1: 'Wallet v3r1', v3r2: 'Wallet v3r2', v4r2: 'Wallet v4r2', v5r1: 'Wallet v5r1 (W5)' };

/** Public key field (hex or base64) → 32 bytes. */
export function parsePublicKey(text) {
  if (!text.trim()) throw new Error('Enter a public key');
  const pub = parseBytes(text);
  if (pub.length !== 32) throw new Error(`Public key must be 32 bytes, got ${pub.length}`);
  return pub;
}

/** Public key of a mnemonic (with optional password); throws if the mnemonic is invalid. */
export async function mnemonicPublicKey(mnemonic, password) {
  const v = await validateMnemonic(mnemonic, password);
  if (!v.valid) throw new Error(v.reason);
  return (await mnemonicToKeyPair(mnemonic, password)).publicKey;
}

/** Settings fields (strings) → wallet options; wallet ID left empty means the default. */
export function walletOptions({ wc, net, wid, sub }) {
  const workchain = Number(wc), testnet = net === 'test';
  const walletId = wid.trim() === '' ? undefined : Number(wid);
  if (walletId !== undefined && (!Number.isInteger(walletId) || walletId < 0 || walletId > 0xffffffff)) throw new Error('Wallet ID must be a whole number from 0 to 4294967295');
  const subwallet = Number(sub || 0);
  if (!Number.isInteger(subwallet) || subwallet < 0 || subwallet > 32767) throw new Error('Subwallet must be from 0 to 32767');
  return { workchain, walletId, subwallet, testnet };
}

/** Addresses of every wallet version for a public key, newest first. */
export function walletAddresses(pub, { workchain, walletId, subwallet, testnet }) {
  return [...WALLET_VERSIONS].reverse().map(ver => {
    const a = walletAddress(ver, pub, { workchain, walletId, subwallet, networkGlobalId: testnet ? -3 : -239 });
    return {
      version: ver,
      name: NAMES[ver],
      nonBounceable: formatFriendly(a.workchain, a.hash, { bounceable: false, testnet }),
      bounceable: formatFriendly(a.workchain, a.hash, { bounceable: true, testnet }),
      raw: formatRaw(a.workchain, a.hash),
    };
  });
}

/** Wallet ID placeholder for a workchain: the default ID plus the workchain. */
export const defaultWalletId = wc => String(DEFAULT_WALLET_ID + Number(wc));

function mount() {
  let mode = 'pub';
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    mode = b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('pub-box').hidden = mode !== 'pub'; $('mn-box').hidden = mode !== 'mn';
    $('out').innerHTML = ''; showError($('err'));
  });
  $('wc').onchange = () => { $('wid').placeholder = defaultWalletId($('wc').value); };

  async function derive() {
    showError($('err')); $('out').innerHTML = ''; $('status').textContent = '';
    try {
      let pub, extra = '';
      if (mode === 'pub') {
        pub = parsePublicKey($('pub').value);
      } else {
        $('status').textContent = 'Deriving keys…';
        pub = await mnemonicPublicKey($('mn').value, $('pw').value);
        extra = row('Public key', bytesToHex(pub));
        $('status').textContent = '';
      }
      const opts = walletOptions({ wc: $('wc').value, net: $('net').value, wid: $('wid').value, sub: $('sub').value });
      let html = extra ? `<div class="kv">${extra}</div>` : '';
      for (const w of walletAddresses(pub, opts)) {
        html += `<h2>${esc(w.name)}</h2><div class="kv">` +
          row('Non-bounceable (as wallets show it)', w.nonBounceable) +
          row('Bounceable', w.bounceable) +
          row('Raw', w.raw) + '</div>';
      }
      $('out').innerHTML = html;
    } catch (e) { $('status').textContent = ''; showError($('err'), e); }
  }
  $('go').onclick = derive;
  // Example: the public key of a TON test mnemonic (generated for testing; never funded), default settings.
  $('example').onclick = () => {
    document.querySelector('[data-mode="pub"]').click();
    $('pub').value = '4ccc0f23905323a49b2b64efe0ec35e8497a49f3532a4736b1f265f85280fb6d';
    $('net').value = 'main'; $('wc').value = '0'; $('wc').onchange(); $('wid').value = ''; $('sub').value = '0';
    derive();
  };
  $('pub').addEventListener('keydown', e => { if (e.key === 'Enter') derive(); });
}

if (globalThis.document) mount();
