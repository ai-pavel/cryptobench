// JWT Decoder: decode and inspect JSON Web Tokens, and verify their signatures.
import { $, renderRows, esc, showError, InputError } from '../lib/ui.js';
import { fromBase64, toHex, utf8, utf8OrNull } from '../lib/bytes.js';
import { relative } from '../lib/time.js';

export const SAMPLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const TIME_CLAIMS = { exp: 'Expires', iat: 'Issued at', nbf: 'Not before', auth_time: 'Authenticated at' };
const CLAIM_NAMES = { iss: 'Issuer', sub: 'Subject', aud: 'Audience', jti: 'JWT ID', azp: 'Authorized party', scope: 'Scope', nonce: 'Nonce' };

export function decodeJson(seg, name) {
  let bytes;
  try { bytes = fromBase64(seg); } catch { throw new InputError(`The ${name} isn't valid base64url.`); }
  const text = utf8OrNull(bytes);
  if (text === null) throw new InputError(`The ${name} isn't valid UTF-8.`);
  try { return JSON.parse(text); } catch (e) { throw new InputError(`The ${name} isn't valid JSON: ${e.message}`); }
}

/** Split and decode a token ("Bearer " prefix allowed): null when empty, else { segs, header, payload, sig }. */
export function decodeToken(text) {
  const t = text.trim().replace(/^Bearer\s+/i, '');
  if (!t) return null;
  const segs = t.split('.');
  if (segs.length === 5) throw new InputError('This looks like an encrypted token (JWE, 5 parts). Only signed tokens (JWS, 3 parts) can be decoded without the key.');
  if (segs.length !== 3) throw new InputError(`A JWT has 3 parts separated by dots; this has ${segs.length}.`);
  const header = decodeJson(segs[0], 'header'), payload = decodeJson(segs[1], 'payload');
  const sig = segs[2] ? fromBase64(segs[2]) : new Uint8Array();
  return { segs, header, payload, sig };
}

/** Rows for the registered claims present in the payload; time claims are shown as dates. */
export function claimRows(payload, now = Date.now()) {
  const rows = [];
  for (const [k, label] of Object.entries(CLAIM_NAMES)) if (payload[k] !== undefined) rows.push({ label: `${label} (${k})`, value: typeof payload[k] === 'string' ? payload[k] : JSON.stringify(payload[k]) });
  for (const [k, label] of Object.entries(TIME_CLAIMS)) if (typeof payload[k] === 'number') {
    const ms = payload[k] * 1000;
    rows.push({ label: `${label} (${k})`, value: new Date(ms).toISOString(), note: `${new Date(ms).toString()} · ${relative(ms, now)}` });
  }
  return rows;
}

/** Expiry status line: { cls, text } from the exp and nbf claims at time `now` (ms). */
export function expiryStatus(payload, nowMs = Date.now()) {
  const now = nowMs / 1000;
  if (typeof payload.exp === 'number' && payload.exp < now) return { cls: 'status bad', text: `Expired ${relative(payload.exp * 1000, nowMs)}.` };
  if (typeof payload.nbf === 'number' && payload.nbf > now) return { cls: 'status warn', text: `Not valid yet: becomes valid ${relative(payload.nbf * 1000, nowMs)}.` };
  if (typeof payload.exp === 'number') return { cls: 'status ok', text: `Not expired: expires ${relative(payload.exp * 1000, nowMs)}.` };
  return { cls: 'status warn', text: 'No expiry (exp) claim.' };
}

export function signatureRows(header, sig) {
  return [
    { label: 'Algorithm', value: String(header.alg), copy: false },
    { label: 'Signature (hex)', value: toHex(sig) || '(empty)' },
    { label: 'Length', value: `${sig.length} bytes`, copy: false },
  ];
}

/** Label of the key field for an algorithm. */
export const keyLabel = alg => alg.startsWith('HS') ? 'Secret' : alg === 'none' ? 'No key needed (alg "none")' : 'Public key: PEM ("-----BEGIN PUBLIC KEY-----") or JWK JSON';

const HASH = { 256: 'SHA-256', 384: 'SHA-384', 512: 'SHA-512' };
export function importParams(alg) {
  const bits = alg.slice(2);
  if (/^HS(256|384|512)$/.test(alg)) return { name: 'HMAC', hash: HASH[bits] };
  if (/^RS(256|384|512)$/.test(alg)) return { name: 'RSASSA-PKCS1-v1_5', hash: HASH[bits] };
  if (/^PS(256|384|512)$/.test(alg)) return { name: 'RSA-PSS', hash: HASH[bits], saltLength: +bits / 8 };
  if (/^ES(256|384|512)$/.test(alg)) return { name: 'ECDSA', namedCurve: { 256: 'P-256', 384: 'P-384', 512: 'P-521' }[bits], hash: HASH[bits] };
  if (alg === 'EdDSA' || alg === 'Ed25519') return { name: 'Ed25519' };
  throw new InputError(`Verifying "${alg}" isn't supported here.`);
}
export async function importKey(text, p, b64secret = false) {
  const t = text.trim();
  if (p.name === 'HMAC') {
    const raw = b64secret ? fromBase64(t) : utf8(text);
    return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: p.hash }, false, ['verify']);
  }
  const imp = p.name === 'ECDSA' ? { name: 'ECDSA', namedCurve: p.namedCurve } : p.name === 'Ed25519' ? { name: 'Ed25519' } : { name: p.name, hash: p.hash };
  if (t.startsWith('{')) {
    let jwk; try { jwk = JSON.parse(t); } catch (e) { throw new InputError('The JWK isn\'t valid JSON.'); }
    if (jwk.keys) throw new InputError('This is a JWK set; paste a single key from "keys".');
    delete jwk.alg; delete jwk.use; delete jwk.key_ops;
    return crypto.subtle.importKey('jwk', jwk, imp, false, ['verify']);
  }
  const m = t.match(/-----BEGIN ([A-Z ]+)-----([\s\S]+?)-----END \1-----/);
  if (!m) throw new InputError('Paste a PEM public key or a JWK.');
  if (m[1] !== 'PUBLIC KEY') throw new InputError(`"${m[1]}" PEM isn't supported; convert it to a SubjectPublicKeyInfo "PUBLIC KEY" (e.g. openssl pkey -pubout / openssl x509 -pubkey -noout).`);
  return crypto.subtle.importKey('spki', fromBase64(m[2]), imp, false, ['verify']);
}

/** Status shown before any verification: for alg "none" or a missing key; otherwise null. */
export function verifyNotice(alg, keyText) {
  if (alg === 'none') return { cls: 'status warn', text: 'Unsigned token (alg "none"): anyone could have made it.' };
  if (!keyText.trim()) return { cls: 'status', text: 'Paste the key to check the signature.' };
  return null;
}

/** Verify a decoded token's signature with a key; resolves to the status { cls, text } (never rejects). */
export async function verifySignature(parts, keyText, b64secret = false) {
  const alg = String(parts.header.alg || '');
  try {
    const p = importParams(alg);
    const key = await importKey(keyText, p, b64secret);
    const ok = await crypto.subtle.verify(p, key, parts.sig, utf8(parts.segs[0] + '.' + parts.segs[1]));
    return { cls: 'status ' + (ok ? 'ok' : 'bad'), text: ok ? '✅ Signature verified.' : '❌ Invalid signature for this key.' };
  } catch (e) {
    return { cls: 'status bad', text: e instanceof InputError ? e.message : `Couldn't use this key: ${e.message || e.name}` };
  }
}

function mount() {
  let parts = null;

  function decode() {
    showError($('err'), null);
    try {
      parts = decodeToken($('token').value);
      if (!parts) { $('out').hidden = true; return; }
      const { segs, header, payload, sig } = parts;
      $('colored').innerHTML = `<span class="h">${esc(segs[0])}</span>.<span class="p">${esc(segs[1])}</span>.<span class="s">${esc(segs[2])}</span>`;
      $('header').textContent = JSON.stringify(header, null, 2);
      $('payload').textContent = JSON.stringify(payload, null, 2);
      renderRows($('claims'), claimRows(payload));
      const exp = $('expiry'), status = expiryStatus(payload);
      exp.className = status.cls; exp.textContent = status.text;
      renderRows($('sig'), signatureRows(header, sig));
      const alg = String(header.alg || '');
      $('secretOpts').hidden = !alg.startsWith('HS');
      $('keyLabel').textContent = keyLabel(alg);
      $('out').hidden = false;
      verify();
    } catch (e) { $('out').hidden = true; parts = null; showError($('err'), e); }
  }

  let seq = 0;
  async function verify() {
    const el = $('verify'), my = ++seq;
    if (!parts) return;
    const notice = verifyNotice(String(parts.header.alg || ''), $('key').value);
    if (notice) { el.className = notice.cls; el.textContent = notice.text; return; }
    const r = await verifySignature(parts, $('key').value, $('b64secret').checked);
    if (my !== seq) return;
    el.className = r.cls;
    el.textContent = r.text;
  }
  $('token').addEventListener('input', decode);
  $('key').addEventListener('input', verify);
  $('b64secret').addEventListener('input', verify);
  $('token').value = SAMPLE; $('key').value = 'your-256-bit-secret';
  decode();
}

if (globalThis.document) mount();
