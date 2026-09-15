// Sign & Verify: sign a message with an ed25519 key or a TON mnemonic, or verify a signature.
import { ed25519, seedFromSecret, mnemonicToKeyPair, validateMnemonic, parseBytes, bytesToHex, bytesToBase64, hexToBytes, utf8 } from '../lib/ton.js';
import { row, showError } from '../lib/ui.js';

/** Message field → bytes: UTF-8 text, or hex when fmt is 'hex'. */
export const messageBytes = (text, fmt) => fmt === 'hex' ? hexToBytes(text) : utf8(text);

/** Private key field (32-byte seed or 64-byte secret key, hex or base64) → seed. */
export function secretSeed(text) {
  if (!text.trim()) throw new Error('Enter a private key');
  return seedFromSecret(text);
}

/** Seed of a mnemonic (with optional password); throws if the mnemonic is invalid. */
export async function mnemonicSeed(mnemonic, password) {
  const v = await validateMnemonic(mnemonic, password);
  if (!v.valid) throw new Error(v.reason);
  return (await mnemonicToKeyPair(mnemonic, password)).seed;
}

/** Sign message bytes with a seed; returns [label, value] rows. */
export function signRows(msg, seed) {
  const sig = ed25519.sign(msg, seed);
  return [
    ['Signature (hex)', bytesToHex(sig)],
    ['Signature (base64)', bytesToBase64(sig)],
    ['Public key (hex)', bytesToHex(ed25519.getPublicKey(seed))],
    ['Message bytes (hex)', bytesToHex(msg)],
  ];
}

/** Verify a signature (key and signature as hex or base64); throws on malformed input. */
export function verifySignature(pubText, msgText, sigText, fmt) {
  const pub = parseBytes(pubText);
  if (pub.length !== 32) throw new Error(`Public key must be 32 bytes, got ${pub.length}`);
  const sig = parseBytes(sigText);
  if (sig.length !== 64) throw new Error(`Signature must be 64 bytes, got ${sig.length}`);
  const msg = messageBytes(msgText, fmt);
  let ok = false;
  try { ok = ed25519.verify(sig, msg, pub); } catch { ok = false; }
  return ok;
}

export const verifyHtml = ok => ok ? '<p class="ok">✓ Valid signature</p>' : '<p class="bad">✗ Invalid signature: the message, key or signature does not match</p>';

// Tabs: ?mode=<tab> selects one; switching keeps the rest of the URL.
function mountTabs() {
  const tabs = [...document.querySelectorAll('.mode-tabs [data-tab]')];
  const show = (mode, push) => {
    if (!tabs.some(t => t.dataset.tab === mode)) mode = tabs[0].dataset.tab;
    for (const t of tabs) {
      const on = t.dataset.tab === mode;
      t.setAttribute('aria-selected', String(on));
      document.getElementById('tab-' + t.dataset.tab).hidden = !on;
    }
    if (push) {
      const u = new URL(location.href);
      u.searchParams.set('mode', mode);
      history.replaceState(null, '', u);
    }
    document.dispatchEvent(new CustomEvent('tabchange', { detail: mode }));
  };
  tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.tab, true)));
  show(new URLSearchParams(location.search).get('mode'), false);
}

function mountSign() {
  const $ = id => document.getElementById('s-' + id);
  const __sec = document.getElementById('tab-sign');

  let key = 'secret', fmt = 'text';
  const seg = (attr, set) => __sec.querySelectorAll(`[data-${attr}]`).forEach(b => b.onclick = () => {
    __sec.querySelectorAll(`[data-${attr}]`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    set(b.dataset[attr]);
  });
  seg('key', v => { key = v; $('secret-box').hidden = v !== 'secret'; $('mn-box').hidden = v !== 'mn'; });
  seg('fmt', v => { fmt = v; });
  $('show').onchange = () => { $('secret').type = $('show').checked ? 'text' : 'password'; };
  $('random').onclick = () => { $('secret').value = bytesToHex(crypto.getRandomValues(new Uint8Array(32))); };

  $('go').onclick = async () => {
    showError($('err')); $('out').innerHTML = '';
    try {
      let seed;
      if (key === 'secret') {
        seed = secretSeed($('secret').value);
      } else {
        $('status').textContent = 'Deriving key…';
        seed = await mnemonicSeed($('mn').value, $('pw').value);
      }
      const msg = messageBytes($('msg').value, fmt);
      $('out').innerHTML = signRows(msg, seed).map(([label, value]) => row(label, value)).join('');
    } catch (e) { showError($('err'), e); }
    $('status').textContent = '';
  };
  // Example: a test key whose seed is 32 bytes of 0x09 (never use it for funds).
  $('example').onclick = () => {
    __sec.querySelector('[data-key="secret"]').click();
    __sec.querySelector('[data-fmt="text"]').click();
    $('secret').value = '0909090909090909090909090909090909090909090909090909090909090909';
    $('msg').value = "sign me ✍️";
    $('go').click();
  };
}

function mountVerify() {
  const $ = id => document.getElementById('v-' + id);
  const __sec = document.getElementById('tab-verify');

  let fmt = 'text';
  __sec.querySelectorAll('[data-fmt]').forEach(b => b.onclick = () => {
    __sec.querySelectorAll('[data-fmt]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    fmt = b.dataset.fmt;
  });
  $('go').onclick = () => {
    showError($('err')); $('out').innerHTML = '';
    try {
      $('out').innerHTML = verifyHtml(verifySignature($('pub').value, $('msg').value, $('sig').value, fmt));
    } catch (e) { showError($('err'), e); }
  };
  // Example: the Sign tab's example message, signed by the test key with seed 0x09…09.
  $('example').onclick = () => {
    __sec.querySelector('[data-fmt="text"]').click();
    $('pub').value = 'fd1724385aa0c75b64fb78cd602fa1d991fdebf76b13c58ed702eac835e9f618';
    $('msg').value = "sign me ✍️";
    $('sig').value = '40eda314158a4b728aee21d4db9fa4bca7b11dbe58b23bd21b3680b4afd082a3ba2bd0145a9ed54dd5025ed3769c0538cad6dd1c2f7789fb6fabaad71d73af0c';
    $('go').click();
  };
}

function mount() {
  mountTabs();
  mountSign();
  mountVerify();
}

if (globalThis.document) mount();
