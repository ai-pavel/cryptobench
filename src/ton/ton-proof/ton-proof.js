// TON Proof: verify a TON Connect ton_proof signature for a wallet address.
import { ed25519, sha256, utf8, concat, parseAddress, parseBytes, base64ToBytes, bytesToHex, bytesToBase64, bocFromString, walletFromStateInit, walletAddress, formatFriendly, serializeBoc, bytesEqual } from '../lib/ton.js';
import { $, row, esc, showError } from '../lib/ui.js';

export function findProof(o) {
  if (!o || typeof o !== 'object') return null;
  if ('signature' in o && 'domain' in o && 'timestamp' in o) return o;
  for (const v of Object.values(o)) { const r = findProof(v); if (r) return r; }
  return null;
}
function u32le(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; }
function i32be(n) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, n, false); return b; }
function u64le(n) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; }

export function proofHashes(wc, hash, domain, timestamp, payload) {
  const d = utf8(domain);
  const message = concat(utf8('ton-proof-item-v2/'), i32be(wc), hash, u32le(d.length), d, u64le(timestamp), utf8(payload));
  const msgHash = sha256(message);
  const signed = sha256(concat(new Uint8Array([0xff, 0xff]), utf8('ton-connect'), msgHash));
  return { message, msgHash, signed };
}

/** One check list item: ok is true, false or null (informational). */
export const checkHtml = (ok, text) => `<li>${ok === null ? '•' : ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'} ${text}</li>`;

/**
 * Verify a ton_proof. f holds the form fields: proof (JSON text), addr, domain
 * (expected, optional), maxage (seconds, optional) and pub (optional). An empty
 * addr is filled in from the connect response's account. Checks are pushed to
 * `checks` as HTML list items as they are made (so they survive a thrown error);
 * now is the current time in seconds.
 * Returns the public key and its source, the payload, the hashes and whether the signature is valid.
 */
export function verifyProof(f, checks = [], now = Math.floor(Date.now() / 1000)) {
  const add = (ok, text) => checks.push(checkHtml(ok, text));
  if (!f.proof.trim()) throw new Error('Paste the proof JSON');
  let json;
  try { json = JSON.parse(f.proof); } catch { throw new Error('Proof is not valid JSON'); }
  const p = findProof(json);
  if (!p) throw new Error('No proof found: expected an object with timestamp, domain, signature and payload');
  const account = json.account || json;
  if (!f.addr.trim() && account.address) f.addr = account.address;
  if (!f.addr.trim()) throw new Error('Enter the wallet address');
  const addr = parseAddress(f.addr);
  const domain = p.domain?.value ?? '', len = p.domain?.lengthBytes;
  const ts = Number(p.timestamp), payload = p.payload ?? '';
  if (!Number.isFinite(ts)) throw new Error('timestamp must be a number');
  const sig = base64ToBytes(String(p.signature));
  if (sig.length !== 64) throw new Error(`Signature must be 64 bytes, got ${sig.length}`);

  add(len === undefined ? null : len === utf8(domain).length, `Domain <span class="mono">${esc(domain)}</span>${len === undefined ? ' (no lengthBytes given)' : len === utf8(domain).length ? ' · length matches' : ` · lengthBytes says ${esc(len)}, actual ${utf8(domain).length}`}`);
  if (f.domain.trim()) add(domain === f.domain.trim(), `Domain is the expected one (${esc(f.domain.trim())})`);
  const age = now - ts;
  const when = new Date(ts * 1000).toISOString().replace('.000Z', 'Z');
  const maxAge = Number(f.maxage);
  add(f.maxage ? age <= maxAge && age >= -60 : null, `Signed at ${when} (${age >= 0 ? age + ' s ago' : -age + ' s in the future'})`);

  // Public key: given, or from a standard wallet's state_init.
  let pub = null, source = '';
  const si = p.state_init || p.stateInit || account.walletStateInit;
  if (si) {
    const cell = bocFromString(String(si)).roots[0];
    const matches = bytesEqual(cell.hash(), addr.hash);
    add(matches, matches ? 'state_init hashes to this address' : 'state_init does not hash to this address');
    try { const w = walletFromStateInit(cell); pub = w.publicKey; source = `from state_init (wallet ${w.version})`; }
    catch (e) { add(null, esc(e.message)); }
  }
  if (f.pub.trim() || (!pub && account.publicKey)) {
    const given = parseBytes(f.pub.trim() || account.publicKey);
    if (given.length !== 32) throw new Error(`Public key must be 32 bytes, got ${given.length}`);
    if (pub && !bytesEqual(pub, given)) add(false, 'The public key you entered differs from the one in state_init');
    pub = given; source = f.pub.trim() ? 'entered' : 'from the connect response';
  }
  if (!pub) throw new Error('No public key: enter it, or include a state_init of a standard wallet in the proof');

  const { message, msgHash, signed } = proofHashes(addr.workchain, addr.hash, domain, ts, payload);
  let ok = false;
  try { ok = ed25519.verify(sig, signed, pub); } catch {}
  add(ok, ok ? '<strong>Signature is valid</strong>' : '<strong>Signature is invalid</strong>');
  return { valid: ok, pub, source, payload, message, msgHash, signed };
}

/**
 * Example proof: a v4r2 wallet of the given seed signs domain/payload at ts.
 * Returns the wallet's non-bounceable address and the proof JSON text.
 */
export function exampleProof(seed, ts, domain, payload) {
  const pub = ed25519.getPublicKey(seed);
  const w = walletAddress('v4r2', pub);
  const sig = ed25519.sign(proofHashes(0, w.hash, domain, ts, payload).signed, seed);
  return {
    addr: formatFriendly(0, w.hash, { bounceable: false }),
    proof: JSON.stringify({ timestamp: ts, domain: { lengthBytes: domain.length, value: domain }, signature: bytesToBase64(sig), payload,
      state_init: bytesToBase64(serializeBoc(w.stateInit)) }, null, 2),
  };
}

/** Tamper with a proof: append "x" to its payload. Throws if the text isn't JSON. */
export function tamperProof(text) {
  const j = JSON.parse(text); j.payload = (j.payload || '') + 'x'; return JSON.stringify(j, null, 2);
}

function mount() {
  function verify() {
    showError($('err')); $('checks').innerHTML = ''; $('out').innerHTML = '';
    const checks = [];
    const f = { proof: $('proof').value, addr: $('addr').value, domain: $('domain').value, maxage: $('maxage').value, pub: $('pub').value };
    // The address may have been filled in from the proof.
    const fill = () => { if (f.addr !== $('addr').value) $('addr').value = f.addr; };
    try {
      const r = verifyProof(f, checks);
      fill();
      $('checks').innerHTML = checks.join('');
      $('out').innerHTML = row(`Public key (${r.source})`, bytesToHex(r.pub)) + row('Payload', r.payload) +
        row('Message (hex)', bytesToHex(r.message)) + row('sha256(message)', bytesToHex(r.msgHash)) + row('Signed hash', bytesToHex(r.signed));
    } catch (e) { fill(); $('checks').innerHTML = checks.join(''); showError($('err'), e); }
  }

  $('go').onclick = verify;
  $('example').onclick = () => {
    const seed = crypto.getRandomValues(new Uint8Array(32));
    const ts = Math.floor(Date.now() / 1000), domain = 'example.com', payload = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    const ex = exampleProof(seed, ts, domain, payload);
    $('addr').value = ex.addr;
    $('pub').value = ''; $('domain').value = domain; $('maxage').value = '900';
    $('proof').value = ex.proof;
    $('tamper').hidden = false;
    verify();
  };
  $('tamper').onclick = () => {
    try { $('proof').value = tamperProof($('proof').value); verify(); } catch {}
  };
}

if (globalThis.document) mount();
