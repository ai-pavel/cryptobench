// Sign & Verify: sign a message with a Substrate key and verify signatures like polkadot.js signatureVerify.
import { $, kv, esc, showError } from '../lib/ui.js';
import { utf8, fromHex, toHex, keypairFromSuri, accountIdOf, ss58Encode, ss58Decode, sign, verifyAny, wrapBytes, isWrapped, blake2 } from '../lib/dot.js';

export const EX_DEV = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
export const msgBytes = (enc, v) => enc === 'hex' ? fromHex(v, 'message') : utf8(v);

// Sign a message → { rows, addr, sig } (sig as hex).
export function signMessage({ phrase, path, type, enc, msg, wrap }) {
  phrase = phrase.trim().split(/\s+/).join(' ');
  path = path.trim();
  if (path && !/^(\/\/?[^/]+)+(\/\/\/.*)?$/.test(path)) throw new Error('A path is a list of junctions like //hard or /soft.');
  const kp = keypairFromSuri(type, phrase + path);
  const raw = msgBytes(enc, msg);
  const signed = wrap && !isWrapped(raw) ? wrapBytes(raw) : raw;
  const sig = sign(kp, signed);
  const id = accountIdOf(type, kp.publicKey);
  const addr = ss58Encode(id, 42);
  const rows = [
    ['Signature', toHex(sig), { note: `${sig.length} bytes, ${type}` }],
    ['Signer', addr, { note: 'generic Substrate format (prefix 42)' }],
    ['Public key', toHex(kp.publicKey)],
    ['Signed bytes', toHex(signed), { note: signed === raw ? 'the message as is' : 'the message wrapped in <Bytes>…</Bytes>' }],
    type === 'ecdsa' ? ['Signed hash', toHex(blake2(signed, 256)), { note: 'Blake2b-256 of the signed bytes' }] : null,
  ];
  return { rows, addr, sig: toHex(sig) };
}

// Verify a signature → { result, id }; result is verifyAny's match or null.
export function verifyMessage({ addr: a, enc, msg, sig: s }) {
  let id;
  if (/^0x/i.test(a)) { id = fromHex(a, 'public key'); if (id.length === 33) id = blake2(id, 256); if (id.length !== 32) throw new Error('A public key must be 32 bytes (or 33 for ECDSA).'); }
  else id = ss58Decode(a).payload;
  if (id.length !== 32) throw new Error('Expected a 32-byte account.');
  const m = msgBytes(enc, msg);
  const sig = fromHex(s, 'signature');
  if (![64, 65, 66].includes(sig.length)) throw new Error(`Signatures are 64 bytes (Sr25519/Ed25519) or 65 bytes (ECDSA, or with a type byte); got ${sig.length}.`);
  return { result: verifyAny(m, sig, id), id };
}

// The verification verdict shown under the form.
export const verifyHtml = (r, id) => r
  ? `<p class="status ok">✅ Valid signature</p>` + kv([['Key type', r.type, { copy: false }], ['Message', r.wrapped === true ? 'signed wrapped in <Bytes>…</Bytes>' : r.wrapped === 'unwrapped' ? 'signed without the <Bytes> wrapper you entered' : 'signed as entered', { copy: false }], r.multi ? ['Format', 'MultiSignature with a type byte', { copy: false }] : null, ['Signer', ss58Encode(id, 42)]])
  : `<p class="status bad">❌ Not a valid signature</p><p class="muted">No combination of key type and &lt;Bytes&gt; wrapping matches this signer and message.</p>`;

// Example for the Verify tab: a fresh //Alice signature of "Hello Polkadot".
export function exampleVerify() {
  const kp = keypairFromSuri('sr25519', EX_DEV + '//Alice'), msg = 'Hello Polkadot';
  return { addr: ss58Encode(accountIdOf('sr25519', kp.publicKey), 42), msg, sig: toHex(sign(kp, wrapBytes(utf8(msg)))) };
}

function mount() {
  const tabs = [...document.querySelectorAll('.mode-tabs [data-tab]')];
  function show(mode) {
    if (!tabs.some(t => t.dataset.tab === mode)) mode = 'sign';
    for (const t of tabs) { const on = t.dataset.tab === mode; t.setAttribute('aria-selected', String(on)); $('tab-' + t.dataset.tab).hidden = !on; }
    const u = new URL(location.href); u.searchParams.set('mode', mode); history.replaceState(null, '', u);
  }
  tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.tab)));
  let lastSig = null;
  function renderSign() {
    try {
      const { rows, addr, sig } = signMessage({ phrase: $('s-phrase').value, path: $('s-path').value, type: $('s-type').value, enc: $('s-enc').value, msg: $('s-msg').value, wrap: $('s-wrap').checked });
      lastSig = { addr, sig };
      showError($('s-err'), null);
      $('s-out').innerHTML = kv(rows) + '<p class="row"><button type="button" id="toVerify">Verify this signature →</button></p>';
      $('toVerify').onclick = () => { $('v-addr').value = lastSig.addr; $('v-enc').value = $('s-enc').value; $('v-msg').value = $('s-msg').value; $('v-sig').value = lastSig.sig; show('verify'); renderVerify(); };
    } catch (e) { showError($('s-err'), e); $('s-out').innerHTML = ''; }
  }
  function renderVerify() {
    const a = $('v-addr').value.trim(), s = $('v-sig').value.trim();
    if (!a || !s) { showError($('v-err'), null); $('v-out').innerHTML = '<p class="muted">Enter the signer, the message and the signature.</p>'; return; }
    try {
      const { result: r, id } = verifyMessage({ addr: a, enc: $('v-enc').value, msg: $('v-msg').value, sig: s });
      showError($('v-err'), null);
      $('v-out').innerHTML = verifyHtml(r, id);
    } catch (e) { showError($('v-err'), e); $('v-out').innerHTML = ''; }
  }
  ['s-phrase', 's-path', 's-type', 's-enc', 's-msg', 's-wrap'].forEach(id => $(id).addEventListener('input', renderSign));
  ['v-addr', 'v-enc', 'v-msg', 'v-sig'].forEach(id => $(id).addEventListener('input', renderVerify));
  const q = new URLSearchParams(location.search);
  for (const [k, id] of [['address', 'v-addr'], ['message', 'v-msg'], ['signature', 'v-sig']]) if (q.get(k)) $(id).value = q.get(k);
  show(q.get('mode') || 'sign');
  renderSign(); renderVerify();
  // Example button(s)
  $('example-sign').onclick = () => { $('s-phrase').value = EX_DEV; $('s-path').value = '//Alice'; $('s-type').value = 'sr25519'; $('s-enc').value = 'text'; $('s-msg').value = 'Hello Polkadot'; $('s-wrap').checked = true; renderSign(); };
  $('example-verify').onclick = () => {
    const { addr, msg, sig } = exampleVerify();
    $('v-addr').value = addr; $('v-enc').value = 'text'; $('v-msg').value = msg;
    $('v-sig').value = sig; renderVerify();
  };
}

if (globalThis.document) mount();
