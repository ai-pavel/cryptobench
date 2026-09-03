// Sign & Verify: sign a message with an ed25519 key the way wallets do for signMessage, or verify a signature.
import { ed25519, parseSecret, parseBytes, keypairFromSeed, decodePubkey, base58, base64, hex, kvTable, wireCopy, showError } from '../lib/sol.js';

export const MISMATCH_WARNING = 'Warning: the public-key half of this 64-byte key does not match its seed. Signing uses the seed.';

/** Sign a message (typed in the given encoding) with a secret key; returns the warning ('' if none) and table rows. Throws on bad input. */
export function signMessage(secret, message, encoding) {
  const kp = parseSecret(secret);
  const msg = parseBytes(message, encoding);
  const sig = ed25519.sign(msg, kp.seed);
  return {
    warning: kp.mismatch ? MISMATCH_WARNING : '',
    rows: [
      ['Public key', base58.encode(kp.publicKey)],
      ['Signature (base58)', base58.encode(sig)],
      ['Signature (hex)', hex.encode(sig)],
      ['Signature (base64)', base64.encode(sig)],
      ['Message bytes', `${msg.length} bytes`],
    ],
  };
}

export function parseSig(s) {
  const t = s.trim().replace(/\s+/g, '');
  const tries = [
    () => /^(0x)?[0-9a-fA-F]{128}$/.test(t) ? hex.decode(t.replace(/^0x/, '').toLowerCase()) : null,
    () => base58.decode(t),
    () => base64.decode(t),
  ];
  for (const f of tries) { try { const b = f(); if (b && b.length === 64) return b; } catch {} }
  throw new Error('Signature must be 64 bytes, as base58, hex or base64.');
}

/** Verify a signature over a message (typed in the given encoding); true if valid. Throws on malformed input. */
export function verifyMessage(pubkey, message, encoding, signature) {
  const pub = decodePubkey(pubkey, 'Public key');
  const msg = parseBytes(message, encoding);
  const sig = parseSig(signature);
  let ok = false;
  try { ok = ed25519.verify(sig, msg, pub); } catch { ok = false; }
  return ok;
}

/** The verdict shown under the verify form. */
export const verdictHtml = ok => ok
  ? '<p class="verdict ok">✅ Valid: this address signed this message.</p>'
  : '<p class="verdict bad">❌ Invalid: the signature does not match this address and message.</p><p class="muted">Check the message encoding and that the message is byte-for-byte identical, including spaces and line breaks.</p>';

// The Examples' test key: its seed is the bytes 1…32 (never use it for funds).
export const exampleSeed = () => Uint8Array.from({ length: 32 }, (_, i) => i + 1);

function mount() {
  // Tabs: ?mode=<tab> selects one; switching keeps the rest of the URL.
  (() => {
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
  })();

  // ---------- sign ----------
  {
    const $ = id => document.getElementById('s-' + id);

    function render() {
      $('out').innerHTML = '';
      if (!$('secret').value.trim()) return showError($('err'));
      try {
        const r = signMessage($('secret').value, $('msg').value, $('enc').value);
        showError($('err'), r.warning);
        $('out').innerHTML = kvTable(r.rows);
      } catch (e) { showError($('err'), e.message); }
    }
    ['secret', 'msg'].forEach(id => $(id).oninput = render);
    $('enc').onchange = render;
    $('gen').onclick = () => { $('secret').value = base58.encode(keypairFromSeed(crypto.getRandomValues(new Uint8Array(32))).secretKey); render(); };
    // Example: a test key whose seed is the bytes 1…32 (never use it for funds).
    $('example').onclick = () => {
      $('secret').value = base58.encode(keypairFromSeed(exampleSeed()).secretKey);
      $('msg').value = 'Hello, Solana!'; $('enc').value = 'utf8';
      render();
    };
    wireCopy();
  }

  // ---------- verify ----------
  {
    const $ = id => document.getElementById('v-' + id);

    function render() {
      $('out').innerHTML = '';
      if (!$('pub').value.trim() || !$('sig').value.trim()) return showError($('err'));
      try {
        const ok = verifyMessage($('pub').value, $('msg').value, $('enc').value, $('sig').value);
        showError($('err'));
        $('out').innerHTML = verdictHtml(ok);
      } catch (e) { showError($('err'), e.message); }
    }
    ['pub', 'msg', 'sig'].forEach(id => $(id).oninput = render);
    // Example: "Hello, Solana!" signed by the test key with seed 1…32 (Ed25519 signatures are deterministic).
    $('example').onclick = () => {
      const seed = exampleSeed(), msg = 'Hello, Solana!';
      $('pub').value = base58.encode(keypairFromSeed(seed).publicKey);
      $('msg').value = msg; $('enc').value = 'utf8';
      $('sig').value = base58.encode(ed25519.sign(new TextEncoder().encode(msg), seed));
      render();
    };
    $('enc').onchange = render;
  }
}

if (globalThis.document) mount();
