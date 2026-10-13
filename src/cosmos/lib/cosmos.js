// Shared helpers for the Cosmos tools: hashing, keys, bech32 addresses, chains and UI.
import { sha256 } from '../../assets/vendor/@noble/hashes@2.4.0/sha2.esm.js';
import { keccak_256 } from '../../assets/vendor/@noble/hashes@2.4.0/sha3.esm.js';
import { ripemd160 } from '../../assets/vendor/@noble/hashes@2.4.0/legacy.esm.js';
import { secp256k1 } from '../../assets/vendor/@noble/curves@2.4.0/secp256k1.esm.js';
import { base64, hex, bech32 } from '../../assets/vendor/@scure/base@2.4.0/index.esm.js';

export { sha256, keccak_256, ripemd160, secp256k1, base64, hex, bech32 };

export const utf8 = new TextEncoder();
export const utf8d = new TextDecoder('utf-8', { fatal: true });
export const toHex = b => hex.encode(b);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let i = 0;
  for (const a of arrs) { out.set(a, i); i += a.length; }
  return out;
};
export const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ---------- input parsing ----------

export function parseHex(s, label = 'Value') {
  const h = s.trim().replace(/^0x/i, '').replace(/\s+/g, '');
  if (!h) throw new Error(`${label} is empty.`);
  if (!/^[0-9a-f]*$/i.test(h)) throw new Error(`${label} is not valid hex.`);
  if (h.length % 2) throw new Error(`${label} has an odd number of hex digits.`);
  return hex.decode(h.toLowerCase());
}

export function parseBase64(s, label = 'Value') {
  let b = s.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!b) throw new Error(`${label} is empty.`);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b)) throw new Error(`${label} is not valid base64.`);
  while (b.length % 4) b += '=';
  try { return base64.decode(b); } catch { throw new Error(`${label} is not valid base64.`); }
}

// Hex (with or without 0x) if it looks like hex, otherwise base64.
export function parseHexOrBase64(s, label = 'Value') {
  const t = s.trim().replace(/\s+/g, '');
  if (!t) throw new Error(`${label} is empty.`);
  if (/^0x/i.test(t) || (/^[0-9a-f]+$/i.test(t) && t.length % 2 === 0)) return parseHex(t, label);
  return parseBase64(t, label);
}

// ---------- chains ----------

// prefix, display name, BIP44 coin type, whether accounts use Ethereum-style (keccak) addresses
export const CHAINS = [
  { prefix: 'cosmos', name: 'Cosmos Hub', coin: 118 },
  { prefix: 'osmo', name: 'Osmosis', coin: 118 },
  { prefix: 'celestia', name: 'Celestia', coin: 118 },
  { prefix: 'juno', name: 'Juno', coin: 118 },
  { prefix: 'stars', name: 'Stargaze', coin: 118 },
  { prefix: 'akash', name: 'Akash', coin: 118 },
  { prefix: 'kava', name: 'Kava', coin: 459 },
  { prefix: 'inj', name: 'Injective', coin: 60, eth: true },
  { prefix: 'evmos', name: 'Evmos', coin: 60, eth: true },
  { prefix: 'dydx', name: 'dYdX', coin: 118 },
  { prefix: 'sei', name: 'Sei', coin: 118 },
  { prefix: 'noble', name: 'Noble', coin: 118 },
  { prefix: 'neutron', name: 'Neutron', coin: 118 },
  { prefix: 'stride', name: 'Stride', coin: 118 },
  { prefix: 'axelar', name: 'Axelar', coin: 118 },
  { prefix: 'cro', name: 'Cronos POS', coin: 394 },
  { prefix: 'terra', name: 'Terra', coin: 330 },
  { prefix: 'secret', name: 'Secret', coin: 529 },
  { prefix: 'persistence', name: 'Persistence', coin: 118 },
  { prefix: 'regen', name: 'Regen', coin: 118 },
  { prefix: 'umee', name: 'UX (Umee)', coin: 118 },
  { prefix: 'mantra', name: 'MANTRA', coin: 118 },
];

export function chainOptions(selected = 'cosmos') {
  return CHAINS.map(c => `<option value="${c.prefix}"${c.prefix === selected ? ' selected' : ''}>${esc(c.name)} (${c.prefix})</option>`).join('');
}

// ---------- bech32 ----------

export const BECH32_LIMIT = 200;

export function decodeBech32(s, label = 'Address') {
  const t = s.trim();
  if (!t) throw new Error(`${label} is empty.`);
  if (t !== t.toLowerCase() && t !== t.toUpperCase()) throw new Error(`${label} mixes upper and lower case, which bech32 doesn't allow.`);
  if (!t.includes('1')) throw new Error(`${label} has no "1" separator, so it isn't bech32.`);
  let dec;
  try { dec = bech32.decode(t.toLowerCase(), BECH32_LIMIT); }
  catch (e) {
    const m = String(e.message || e);
    if (/checksum/i.test(m)) throw new Error(`${label} has an invalid checksum — check for a typo.`);
    throw new Error(`${label} is not valid bech32 (${m}).`);
  }
  let bytes;
  try { bytes = bech32.fromWords(dec.words); } catch { throw new Error(`${label} has invalid padding in its data part.`); }
  return { prefix: dec.prefix, bytes };
}

export function encodeBech32(prefix, bytes) {
  if (!/^[a-z0-9]+$/.test(prefix)) throw new Error('Prefix must use lowercase letters and digits only.');
  return bech32.encode(prefix, bech32.toWords(bytes), BECH32_LIMIT);
}

// Splits a prefix like "cosmosvaloper" into its account prefix and validator suffix.
export function splitPrefix(prefix) {
  for (const s of ['valoperpub', 'valconspub', 'valoper', 'valcons', 'pub']) {
    if (prefix.length > s.length && prefix.endsWith(s)) return { base: prefix.slice(0, -s.length), kind: s };
  }
  return { base: prefix, kind: '' };
}

// ---------- keys and addresses ----------

export function parsePublicKey(input) {
  const t = input.trim();
  if (!t) throw new Error('Public key is empty.');
  let bytes;
  if (t.startsWith('{')) {
    let j;
    try { j = JSON.parse(t); } catch { throw new Error('Public key JSON is not valid JSON.'); }
    const v = j.key ?? j.value ?? j.pub_key?.value ?? j.pub_key?.key;
    if (typeof v !== 'string') throw new Error('Public key JSON has no "key" or "value" field.');
    bytes = parseBase64(v, 'Public key');
  } else bytes = parseHexOrBase64(t, 'Public key');
  if (bytes.length !== 33 && bytes.length !== 65) throw new Error(`Public key is ${bytes.length} bytes; secp256k1 keys are 33 bytes (compressed) or 65 bytes (uncompressed).`);
  let point;
  try { point = secp256k1.Point.fromBytes(bytes); } catch { throw new Error('Public key is not a valid point on secp256k1.'); }
  return { compressed: point.toBytes(true), uncompressed: point.toBytes(false) };
}

// Standard Cosmos account address: RIPEMD-160(SHA-256(compressed public key)).
export const cosmosAddressBytes = compressed => ripemd160(sha256(compressed));
// Ethereum-style (ethsecp256k1) address: last 20 bytes of Keccak-256(uncompressed key without 0x04).
export const ethAddressBytes = uncompressed => keccak_256(uncompressed.slice(1)).slice(12);

export function ethChecksum(bytes) {
  const h = toHex(bytes), k = toHex(keccak_256(utf8.encode(h)));
  return '0x' + [...h].map((c, i) => (parseInt(k[i], 16) >= 8 ? c.toUpperCase() : c)).join('');
}

// ---------- UI ----------

export function kvTable(rows) {
  return `<table class="kv"><tbody>${rows.map(([k, v, note]) => `
    <tr><th>${esc(k)}</th><td class="mono">${esc(v)}${note ? `<div class="muted">${esc(note)}</div>` : ''}</td>
    <td><button class="icon-btn copy" data-copy="${esc(v)}" title="Copy">Copy</button></td></tr>`).join('')}</tbody></table>`;
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

export const KEY_NOTE = 'Runs locally in your browser. Don’t paste keys that hold real funds.';
