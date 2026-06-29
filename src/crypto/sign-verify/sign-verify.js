// Sign & Verify: sign and verify messages with ECDSA, Ed25519, Schnorr (BIP340) and RSA.
import { parseBytes, kvTable, wireCopy, showError, setPressed, ENCODING_OPTIONS, KEY_NOTE, hex, base64, debounce } from '../lib/common.js';
import { parseAnyKey, generate, generateRsa, TYPES, pkcs8, spki, toPem } from '../lib/keys.js';
import { schnorr } from '../../assets/vendor/@noble/curves@2.4.0/secp256k1.esm.js';

export const A = {
  'ecdsa-p256': { type: 'P-256', ecdsa: true, digest: 32 },
  'ecdsa-p384': { type: 'P-384', ecdsa: true, digest: 48 },
  'ecdsa-k1': { type: 'secp256k1', ecdsa: true, digest: 32 },
  'ed25519': { type: 'Ed25519' },
  'schnorr': { type: 'secp256k1', schnorr: true },
  'rsa-pss': { type: 'RSA', rsa: { name: 'RSA-PSS', saltLength: 32 } },
  'rsa-pkcs1': { type: 'RSA', rsa: { name: 'RSASSA-PKCS1-v1_5' } },
};

// RFC 8032 Ed25519 test 2 (message 0x72).
export const EXAMPLE = {
  msg: '72',
  priv: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
  pub: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  sig: '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00',
};

export function readSig(t) {
  const s = t.trim().replace(/^0x/i, '');
  if (!s) throw new Error('Paste a signature.');
  const compact = s.replace(/\s+/g, '');
  if (/^[0-9a-fA-F]+$/.test(compact) && compact.length % 2 === 0) return hex.decode(compact.toLowerCase());
  try { return base64.decode(compact.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '').padEnd(Math.ceil(compact.replace(/=+$/, '').length / 4) * 4, '=')); }
  catch { throw new Error('Signature is not hex or base64.'); }
}

async function rsaKey(a, key, usage) {
  const algo = { name: a.rsa.name, hash: 'SHA-256' };
  if (usage === 'sign') return crypto.subtle.importKey('pkcs8', pkcs8(key), algo, false, ['sign']);
  return crypto.subtle.importKey('spki', spki(key), algo, false, ['verify']);
}

export function pubInfo(a, key) {
  if (a.schnorr) return ['Public key (x-only)', hex.encode(schnorr.getPublicKey(key.priv))];
  if (a.type === 'RSA') return ['Public key (SPKI PEM)', toPem('PUBLIC KEY', spki(key))];
  if (a.type === 'Ed25519') return ['Public key', hex.encode(key.pub)];
  return ['Public key (compressed)', hex.encode(TYPES[a.type].lib.Point.fromBytes(key.pub).toBytes(true))];
}

/**
 * Sign or verify. opts: { algo, label (the algorithm's display name), mode ('sign' | 'verify'),
 * key, msg, msgEnc, prehashed, lowS, sig }.
 * Returns null while the key (or, to verify, the signature) is empty; { rows } after signing;
 * { verdict: { cls, text } } after verifying. Input errors throw.
 */
export async function signOrVerify({ algo, label, mode, key: keyText, msg: msgText, msgEnc, prehashed, lowS, sig: sigText }) {
  const a = A[algo];
  if (!keyText.trim()) return null;
  const msg = parseBytes(msgText, msgEnc, 'Message');
  const pre = a.ecdsa && prehashed;
  if (pre && msg.length !== a.digest) throw new Error(`A ${a.type} digest must be ${a.digest} bytes; got ${msg.length}.`);
  let key;
  if (a.schnorr && mode === 'verify' && /^(0x)?[0-9a-fA-F]{64}$/.test(keyText.trim())) key = { xonly: hex.decode(keyText.trim().replace(/^0x/i, '')) };
  else {
    key = await parseAnyKey(keyText, a.type, mode === 'sign' ? 'private' : 'public');
    if (key.type !== a.type) throw new Error(`That is a ${key.type} key; ${label} needs ${a.type}.`);
  }
  if (mode === 'sign') {
    if (!key.priv) throw new Error('Signing needs a private key.');
    let rows = [];
    if (a.ecdsa) {
      const lib = TYPES[a.type].lib;
      const opts = { prehash: !pre, lowS };
      const compact = lib.sign(msg, key.priv, { ...opts, format: 'compact' });
      const der = lib.sign(msg, key.priv, { ...opts, format: 'der' });
      const S = lib.Signature.fromBytes(compact, 'compact');
      rows = [['Signature r‖s (hex)', hex.encode(compact)], ['Signature DER (hex)', hex.encode(der)], ['Signature DER (base64)', base64.encode(der)],
        ['r', S.r.toString(16).padStart(a.digest * 2, '0')], ['s', S.s.toString(16).padStart(a.digest * 2, '0'), S.hasHighS() ? 'high-S' : 'low-S']];
    } else if (a.type === 'Ed25519') {
      const s = TYPES.Ed25519.lib.sign(msg, key.priv);
      rows = [['Signature (hex)', hex.encode(s)], ['Signature (base64)', base64.encode(s)]];
    } else if (a.schnorr) {
      const s = schnorr.sign(msg, key.priv);
      rows = [['Signature (hex)', hex.encode(s)], ['Signature (base64)', base64.encode(s)]];
    } else {
      const s = new Uint8Array(await crypto.subtle.sign(a.rsa, await rsaKey(a, key, 'sign'), msg));
      rows = [['Signature (hex)', hex.encode(s)], ['Signature (base64)', base64.encode(s)]];
    }
    return { rows: [pubInfo(a, key), ...rows] };
  }
  if (!sigText.trim()) return null;
  const sig = readSig(sigText);
  let ok;
  if (a.ecdsa) {
    const lib = TYPES[a.type].lib;
    const format = sig[0] === 0x30 && sig.length !== a.digest * 2 ? 'der' : 'compact';
    if (format === 'compact' && sig.length !== a.digest * 2) throw new Error(`A raw ${a.type} signature is ${a.digest * 2} bytes; got ${sig.length}.`);
    try { ok = lib.verify(sig, msg, key.pub, { prehash: !pre, lowS, format }); } catch (e) { throw new Error('Malformed signature: ' + e.message); }
    if (!ok && lowS) {
      try { if (lib.verify(sig, msg, key.pub, { prehash: !pre, lowS: false, format })) ok = 'high'; } catch {}
    }
  } else if (a.type === 'Ed25519') {
    if (sig.length !== 64) throw new Error(`An Ed25519 signature is 64 bytes; got ${sig.length}.`);
    ok = TYPES.Ed25519.lib.verify(sig, msg, key.pub);
  } else if (a.schnorr) {
    if (sig.length !== 64) throw new Error(`A BIP340 signature is 64 bytes; got ${sig.length}.`);
    const xonly = key.xonly || (key.priv ? schnorr.getPublicKey(key.priv) : key.pub.subarray(1, 33));
    ok = schnorr.verify(sig, msg, xonly);
  } else {
    ok = await crypto.subtle.verify(a.rsa, await rsaKey(a, key, 'verify'), sig, msg);
  }
  if (ok === 'high') return { verdict: { cls: 'big-result bad', text: '⚠️ Mathematically valid, but high-S: rejected because low-S is required.' } };
  return { verdict: { cls: 'big-result ' + (ok ? 'ok' : 'bad'), text: ok ? '✅ Valid signature.' : '❌ Invalid signature.' } };
}

// Labels that depend on the mode and algorithm.
export const lowSLabel = mode => mode === 'sign' ? 'Low-S (normalize s ≤ n/2)' : 'Require low-S';
export const keyLabel = (mode, a) => mode === 'sign' ? 'Private key (hex, PEM or JWK)' : `Public key (${a.schnorr ? '32-byte x-only hex, ' : ''}hex, PEM or JWK; a private key also works)`;

function mount() {
  const $ = id => document.getElementById(id);
  $('keynote').textContent = KEY_NOTE;
  $('msgEnc').innerHTML = ENCODING_OPTIONS;
  let mode = 'sign', run = 0;

  async function render() {
    const my = ++run;
    showError($('err'), ''); $('out').innerHTML = ''; $('verdict').hidden = true;
    try {
      const res = await signOrVerify({
        algo: $('algo').value, label: $('algo').selectedOptions[0].text, mode,
        key: $('key').value, msg: $('msg').value, msgEnc: $('msgEnc').value,
        prehashed: $('prehashed').checked, lowS: $('lowS').checked, sig: $('sig').value,
      });
      if (!res || my !== run) return;
      if (res.rows) { $('out').innerHTML = kvTable(res.rows); return; }
      const v = $('verdict'); v.hidden = false;
      v.className = res.verdict.cls; v.textContent = res.verdict.text;
    } catch (e) { if (my === run) showError($('err'), e.message); }
  }

  function syncAlgo() {
    const a = A[$('algo').value];
    $('ecdsaOpts').hidden = !a.ecdsa;
    $('lowS').checked = a.type === 'secp256k1';
    $('lowSLabel').textContent = lowSLabel(mode);
    $('keyLabel').textContent = keyLabel(mode, a);
    $('sigField').hidden = mode !== 'verify';
  }

  $('gen').onclick = async () => {
    const a = A[$('algo').value];
    showError($('err'), '');
    try {
      if (a.type === 'RSA') { $('key').value = '…'; const k = await generateRsa(2048); $('key').value = toPem('PRIVATE KEY', pkcs8(k)); }
      else $('key').value = hex.encode(generate(a.type).priv);
      if (mode === 'verify') setMode('sign');
      render();
    } catch (e) { showError($('err'), e.message); }
  };
  function setMode(m) {
    // Moving from Sign to Verify carries the signature over.
    if (m === 'verify' && mode === 'sign') {
      const rows = [...$('out').querySelectorAll('tr')];
      const val = prefix => rows.find(r => r.querySelector('th').textContent.startsWith(prefix))?.querySelector('[data-copy]')?.dataset.copy;
      const sig = val('Signature'), pub = val('Public key');
      if (sig) $('sig').value = sig;
      if (pub) $('key').value = pub;
    }
    mode = m; setPressed($('mode'), m); syncAlgo();
  }
  $('mode').onclick = e => { const b = e.target.closest('button'); if (!b) return; setMode(b.dataset.v); render(); };
  $('algo').addEventListener('input', () => { syncAlgo(); $('key').value = ''; $('sig').value = ''; $('gen').click(); });
  const later = debounce(render, 120);
  for (const id of ['key', 'msg', 'msgEnc', 'prehashed', 'lowS', 'sig']) $(id).addEventListener('input', later);
  syncAlgo();
  wireCopy();
  $('gen').click();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  $('example').onclick = () => {
    exSet('algo', 'ed25519'); syncAlgo();
    exSet('msg', EXAMPLE.msg); exSet('msgEnc', 'hex'); exSet('prehashed', false);
    if (mode === 'sign') exSet('key', EXAMPLE.priv);
    else {
      exSet('key', EXAMPLE.pub);
      exSet('sig', EXAMPLE.sig);
    }
    render();
  };
}

if (globalThis.document) mount();
