// Shared helpers for the Cryptography tools: byte parsing and encoding, output tables, copy buttons.
import { hex, base64, base64url, base64nopad } from '../../assets/vendor/@scure/base@2.4.0/index.esm.js';

export { hex, base64, base64url, base64nopad };

export const HASH_WASM_URL = new URL('../../assets/vendor/hash-wasm@4.12.0/dist/index.umd.min.js', import.meta.url).href;

export const KEY_NOTE = 'Runs locally in your browser. Don’t paste keys or secrets you use in production.';

export const utf8 = new TextEncoder();
export const utf8d = new TextDecoder('utf-8', { fatal: true });

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};
export const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
export const toHex = b => hex.encode(b);

export function parseHex(s, label = 'Value') {
  const h = String(s).trim().replace(/^0x/i, '').replace(/[\s:]+/g, '').toLowerCase();
  if (!/^[0-9a-f]*$/.test(h)) throw new Error(`${label} is not valid hex.`);
  if (h.length % 2) throw new Error(`${label} has an odd number of hex digits.`);
  return hex.decode(h);
}

export function parseBase64(s, label = 'Value') {
  const t = String(s).trim().replace(/\s+/g, '');
  if (!t) return new Uint8Array();
  if (!/^[A-Za-z0-9+/_-]*=*$/.test(t)) throw new Error(`${label} is not valid base64.`);
  try { return base64.decode(t.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '').padEnd(Math.ceil(t.replace(/=+$/, '').length / 4) * 4, '=')); }
  catch { throw new Error(`${label} is not valid base64.`); }
}

// Bytes typed in the chosen encoding: 'utf8', 'hex' or 'base64'.
export function parseBytes(input, encoding, label = 'Value') {
  if (encoding === 'utf8') return utf8.encode(String(input));
  if (encoding === 'hex') return parseHex(input, label);
  if (encoding === 'base64') return parseBase64(input, label);
  throw new Error('Unknown encoding.');
}

export function encodeBytes(bytes, encoding) {
  if (encoding === 'hex') return hex.encode(bytes);
  if (encoding === 'base64') return base64.encode(bytes);
  if (encoding === 'base64url') return base64url.encode(bytes).replace(/=+$/, '');
  if (encoding === 'utf8') return utf8d.decode(bytes);
  throw new Error('Unknown encoding.');
}

export const ENCODING_OPTIONS = `<option value="utf8">Text (UTF-8)</option><option value="hex">Hex</option><option value="base64">Base64</option>`;

export function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

// BigInt helpers
export const bytesToBig = b => b.length ? BigInt('0x' + hex.encode(b)) : 0n;
export function bigToBytes(n, len) {
  let h = n.toString(16);
  if (h.length % 2) h = '0' + h;
  if (len !== undefined) {
    if (h.length > len * 2) throw new Error('Number is too large.');
    h = h.padStart(len * 2, '0');
  }
  return hex.decode(h);
}

// Output table: rows of [label, value, note?]. Values get a copy button.
export function kvTable(rows) {
  return `<table class="kv"><tbody>${rows.filter(Boolean).map(([k, v, note, html]) => `
    <tr><th>${esc(k)}</th><td class="mono">${html ? v : esc(v)}${note ? `<div class="muted">${esc(note)}</div>` : ''}</td>
    <td>${html ? '' : `<button class="icon-btn copy" data-copy="${esc(v)}" title="Copy">Copy</button>`}</td></tr>`).join('')}</tbody></table>`;
}

export function wireCopy(root = document) {
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const label = b.dataset.label || (b.dataset.label = b.textContent);
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; }
    catch { b.textContent = 'Press ⌘C'; }
    setTimeout(() => { b.textContent = label; }, 1200);
  });
}

export function showError(el, msg) {
  el.textContent = msg || '';
  el.hidden = !msg;
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(s => s.src === src);
    if (existing && existing.dataset.loaded) return resolve();
    const s = existing || document.createElement('script');
    s.src = src;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = () => reject(new Error('Could not load ' + src));
    if (!existing) document.head.append(s);
  });
}

let hashWasm;
export async function getHashWasm() {
  if (!hashWasm) hashWasm = loadScript(HASH_WASM_URL).then(() => window.hashwasm);
  return hashWasm;
}

// Run fn after input settles, dropping stale results.
export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function setPressed(group, value) {
  group.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
}

export const fmtHexColons = b => hex.encode(b).toUpperCase().match(/.{2}/g)?.join(':') || '';
