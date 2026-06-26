// ECDH: compute a shared secret with X25519, P-256, P-384 or secp256k1, optionally through HKDF.
import { parseHex, kvTable, wireCopy, showError, KEY_NOTE, hex, utf8, debounce } from '../lib/common.js';
import { parseAnyKey, generate, TYPES } from '../lib/keys.js';
import { extract, expand } from '../../assets/vendor/@noble/hashes@2.4.0/hkdf.esm.js';
import { sha256 } from '../../assets/vendor/@noble/hashes@2.4.0/sha2.esm.js';

// RFC 7748 section 6.1: Alice's private key and Bob's public key.
export const EXAMPLE = {
  priv: '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
  pub: 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f',
};

export function shared(type, priv, pub) {
  const t = TYPES[type];
  if (type === 'X25519') {
    const s = t.lib.getSharedSecret(priv, pub);
    if (s.every(b => b === 0)) throw new Error('The shared secret is all zeros: the peer key is a low-order point.');
    return s;
  }
  return t.lib.getSharedSecret(priv, pub).subarray(1);
}

// Public key as shown: raw for X25519, compressed for the EC curves.
export const pubHex = k => hex.encode(k.type === 'X25519' ? k.pub : TYPES[k.type].lib.Point.fromBytes(k.pub).toBytes(true));

export async function load(text, kind, type) {
  const k = await parseAnyKey(text, type, kind);
  if (k.type !== type) throw new Error(`That is a ${k.type} key, but the curve is ${type}.`);
  if (kind === 'private' && !k.priv) throw new Error('“Your private key” contains only a public key.');
  return k;
}

// HKDF-SHA256 over the shared secret; salt is hex (may be empty), info is text.
export function derive(secret, { useHkdf, salt, info, len }) {
  if (!useHkdf) return [];
  const saltBytes = salt.trim() ? parseHex(salt, 'Salt') : new Uint8Array();
  len = Number(len);
  if (!Number.isInteger(len) || len < 1 || len > 255 * 32) throw new Error('Length must be 1–8160 bytes.');
  const key = expand(sha256, extract(sha256, secret, saltBytes), utf8.encode(info), len);
  return [['Derived key (HKDF-SHA256)', hex.encode(key)]];
}

// Output rows for my private key and the peer's public key, or null when either is empty.
export async function compute(type, privText, pubText, hkdf) {
  if (!privText.trim() || !pubText.trim()) return null;
  const me = await load(privText, 'private', type);
  const peer = await load(pubText, 'public', type);
  const s = shared(me.type, me.priv, peer.pub);
  return [['Your public key', pubHex(me)], ['Shared secret', hex.encode(s)], ...derive(s, hkdf)];
}

function mount() {
  const $ = id => document.getElementById(id);
  $('keynote').textContent = KEY_NOTE;
  let run = 0;
  async function render() {
    const my = ++run;
    showError($('err'), ''); $('out').innerHTML = '';
    $('hkdfRow').hidden = !$('useHkdf').checked;
    if (!$('priv').value.trim() || !$('pub').value.trim()) return;
    try {
      const hkdf = { useHkdf: $('useHkdf').checked, salt: $('salt').value, info: $('info').value, len: $('len').value };
      const rows = await compute($('curve').value, $('priv').value, $('pub').value, hkdf);
      if (my !== run) return;
      $('out').innerHTML = kvTable(rows);
    } catch (e) { if (my === run) showError($('err'), e.message); }
  }

  $('demo').onclick = () => {
    const type = $('curve').value;
    const a = generate(type), b = generate(type);
    $('priv').value = hex.encode(a.priv);
    $('pub').value = pubHex(b);
    const sa = shared(type, a.priv, b.pub), sb = shared(type, b.priv, a.pub);
    $('demoOut').innerHTML = `<p class="section-title">Both sides</p>` + kvTable([
      ['Alice private', hex.encode(a.priv)], ['Alice public', pubHex(a)],
      ['Bob private', hex.encode(b.priv)], ['Bob public', pubHex(b)],
      ['Alice computes', hex.encode(sa), 'Alice private × Bob public'],
      ['Bob computes', hex.encode(sb), 'Bob private × Alice public'],
    ]) + `<p class="big-result ${hex.encode(sa) === hex.encode(sb) ? 'ok">✅ Same shared secret on both sides.' : 'bad">❌ Secrets differ.'}</p>`;
    render();
  };
  const later = debounce(render, 120);
  for (const id of ['curve', 'priv', 'pub', 'useHkdf', 'salt', 'info', 'len']) $(id).addEventListener('input', later);
  $('curve').addEventListener('input', () => { $('demoOut').innerHTML = ''; });
  wireCopy();
  $('demo').click();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  $('example').onclick = () => {
    exSet('curve', 'X25519'); $('demoOut').innerHTML = '';
    exSet('priv', EXAMPLE.priv);
    exSet('pub', EXAMPLE.pub);
    exSet('useHkdf', false); render();
  };
}

if (globalThis.document) mount();
