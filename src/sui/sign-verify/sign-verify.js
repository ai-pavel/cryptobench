// Sign & Verify: sign a personal message or transaction bytes, or verify a signature and recover the signer.
import { parsePrivateKey, keyInfo, parseMessage, parseHexOrBase64, intentMessage, blake256, signDigest, serializeSignature, parseSerializedSignature, verifyDigest, addressFromPublicKey, normalizeAddress, schemeName, hex, base64, kvTable, wireCopy, showError, esc, KEY_NOTE } from '../lib/sui.js';

// The bytes being signed: transaction bytes (base64 or hex) or a message in the chosen encoding.
const signedBytes = (tx, msg, enc) => tx ? parseHexOrBase64(msg, 'Transaction bytes') : parseMessage(msg, enc);

// Signs as a personal message (tx false) or transaction bytes (tx true).
// Returns the result rows and the "Verify this signature" link.
export function signMessage({ key, scheme, tx, msg, enc }) {
  const p = parsePrivateKey(key, scheme);
  const k = keyInfo(p.flag, p.secret);
  const bytes = signedBytes(tx, msg, enc);
  const im = intentMessage(tx ? 0 : 3, bytes);
  const digest = blake256(im);
  const sig = signDigest(p.flag, p.secret, digest);
  const serialized = serializeSignature(p.flag, sig, k.publicKey);
  const link = `?mode=verify#` + new URLSearchParams({ m: base64.encode(bytes), s: serialized, t: tx ? '0' : '3' });
  return {
    serialized, link,
    rows: [
      ['Signature', serialized, 'base64 of flag ‖ signature ‖ public key — what wallets return'],
      ['Signer address', k.address],
      ['Scheme', schemeName(p.flag)],
      ['Raw signature (hex)', hex.encode(sig)],
      ['Signed digest', hex.encode(digest), 'BLAKE2b-256 of the intent message'],
      ['Intent message', hex.encode(im)],
    ],
  };
}

// Verifies a serialized signature. Returns { unsupported, scheme, length } for schemes that
// can't be checked here, otherwise { ok, address, match (null when no expected address), rows }.
export function verifySignature({ sig, tx, msg, enc, expect }) {
  const s = parseSerializedSignature(sig);
  if (s.unsupported) return { unsupported: true, scheme: schemeName(s.flag), length: s.bytes.length };
  const digest = blake256(intentMessage(tx ? 0 : 3, signedBytes(tx, msg, enc)));
  const ok = verifyDigest(s.flag, s.publicKey, digest, s.signature);
  const address = addressFromPublicKey(s.flag, s.publicKey);
  let match = null;
  if (expect.trim()) match = normalizeAddress(expect, 'Expected address') === address;
  return {
    ok, address, match,
    rows: [
      ['Signer address', address],
      ['Scheme', schemeName(s.flag)],
      ['Public key (hex)', hex.encode(s.publicKey)],
      ['Raw signature (hex)', hex.encode(s.signature)],
      ['Signed digest', hex.encode(digest)],
    ],
  };
}

// Reads a "Verify this signature" link hash: #m=<base64 bytes>&s=<signature>&t=<intent scope>.
// Returns null without a signature, otherwise the verify form values.
export function prefillFromHash(hash) {
  const h = new URLSearchParams(hash.slice(1));
  if (!h.get('s')) return null;
  const mode = h.get('t') === '0' ? '0' : '3';
  const m = h.get('m') || '';
  let enc = null, msg = m;
  if (mode !== '0') {
    let text = null;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(base64.decode(m)); } catch {}
    if (text !== null && !/[\u0000-\u0008\u000e-\u001f]/.test(text)) { enc = 'utf8'; msg = text; }
    else enc = 'base64';
  }
  return { mode, msg, enc, sig: h.get('s') };
}

function mountTabs() {
  // Tabs: ?mode=<tab> selects one; switching keeps the rest of the URL.
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

  $('keynote').textContent = KEY_NOTE;

  function render() {
    showError($('err'), ''); $('out').innerHTML = '';
    const tx = $('mode').value === '0';
    $('enc-wrap').hidden = tx;
    $('msg-label').textContent = tx ? 'Transaction bytes (base64 or hex)' : 'Message';
    if (!$('key').value.trim()) return;
    try {
      const r = signMessage({ key: $('key').value, scheme: Number($('scheme').value), tx, msg: $('msg').value, enc: $('enc').value });
      $('out').innerHTML = kvTable(r.rows) + `<p><a href="${r.link}">Verify this signature →</a></p>`;
    } catch (e) { showError($('err'), e.message); }
  }
  for (const id of ['key', 'scheme', 'mode', 'msg', 'enc']) $(id).addEventListener('input', render);
  wireCopy();
  render();
}

function mountVerify() {
  const $ = id => document.getElementById('v-' + id);

  function render() {
    showError($('err'), ''); $('out').innerHTML = '';
    const tx = $('mode').value === '0';
    $('enc-wrap').hidden = tx;
    $('msg-label').textContent = tx ? 'Transaction bytes (base64 or hex)' : 'Message';
    if (!$('sig').value.trim()) return;
    try {
      const r = verifySignature({ sig: $('sig').value, tx, msg: $('msg').value, enc: $('enc').value, expect: $('expect').value });
      if (r.unsupported) { $('out').innerHTML = `<p class="note">This is a ${esc(r.scheme)} signature (${r.length} bytes). It can’t be verified here.</p>`; return; }
      const match = r.match === null ? '' : r.match ? '<p class="ok">✓ Signed by the expected address.</p>' : `<p class="bad">✗ The signature’s key belongs to ${r.address}, not the expected address.</p>`;
      $('out').innerHTML = (r.ok ? '<p class="ok">✓ Valid signature.</p>' : `<p class="bad">✗ Invalid signature for this ${tx ? 'transaction' : 'message'}.</p>`) + match + kvTable(r.rows);
    } catch (e) { showError($('err'), e.message); }
  }
  // Prefill from "Verify this signature" links.
  const pre = prefillFromHash(location.hash);
  if (pre) {
    $('mode').value = pre.mode;
    if (pre.enc) $('enc').value = pre.enc;
    $('msg').value = pre.msg;
    $('sig').value = pre.sig;
  }
  for (const id of ['mode', 'msg', 'enc', 'sig', 'expect']) $(id).addEventListener('input', render);
  wireCopy();
  render();
}

function mount() {
  mountTabs();
  mountSign();
  mountVerify();
  // Example button(s)
  const exSet = vals => { for (const [id, v] of Object.entries(vals)) { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; } };
  const exFire = id => document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('example-sign').onclick = () => { exSet({ 's-key': "suiprivkey1qrwsjvr6gwaxmsvxk4cfun99ra8uwxg3c9pl0nhle7xxpe4s80y05ctazer", 's-scheme': '0', 's-mode': '3', 's-msg': 'hello sui', 's-enc': 'utf8' }); exFire('s-mode'); exFire('s-key'); };
  document.getElementById('example-verify').onclick = () => { exSet({ 'v-mode': '3', 'v-msg': 'hello sui', 'v-enc': 'utf8', 'v-sig': "AB25XGCSV3wyT/IUM8FlajNiTd31fKRYs6yhw2i+jHm9YZBVAvcCa7VqGmblJYUkKhuO8jdGhacRejZYckDtgw4iZH/u7zYwYL1CBaFnGhXxChI2dlkYsbX2ONgvM8/EaQ==", 'v-expect': "0xa2d14fad60c56049ecf75246a481934691214ce413e6a8ae2fe6834c173a6133" }); exFire('v-mode'); exFire('v-sig'); };
}

if (globalThis.document) mount();
