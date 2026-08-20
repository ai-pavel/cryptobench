// Shared helpers for the Solana tools. Pinned, audited libraries only.
import { ed25519 } from '../../assets/vendor/@noble/curves@2.4.0/ed25519.esm.js';
import { sha256, sha512 } from '../../assets/vendor/@noble/hashes@2.4.0/sha2.esm.js';
import { hmac } from '../../assets/vendor/@noble/hashes@2.4.0/hmac.esm.js';
import { base58, base64, hex } from '../../assets/vendor/@scure/base@2.4.0/index.esm.js';

export { ed25519, sha256, sha512, hmac, base58, base64, hex };

export const utf8 = new TextEncoder();
export const utf8d = new TextDecoder('utf-8', { fatal: true });

export const PROGRAMS = {
  '11111111111111111111111111111111': 'System Program',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token Program',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': 'Token-2022 Program',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token Account Program',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo Program',
  'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo': 'Memo Program (v1)',
  'ComputeBudget111111111111111111111111111111': 'Compute Budget Program',
  'Stake11111111111111111111111111111111111111': 'Stake Program',
  'Vote111111111111111111111111111111111111111': 'Vote Program',
  'AddressLookupTab1e1111111111111111111111111': 'Address Lookup Table Program',
  'BPFLoaderUpgradeab1e11111111111111111111111': 'BPF Upgradeable Loader',
  'BPFLoader2111111111111111111111111111111111': 'BPF Loader 2',
  'Config1111111111111111111111111111111111111': 'Config Program',
  'Ed25519SigVerify111111111111111111111111111': 'Ed25519 SigVerify Program',
  'KeccakSecp256k11111111111111111111111111111': 'Secp256k1 SigVerify Program',
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s': 'Metaplex Token Metadata',
  'So11111111111111111111111111111111111111112': 'Wrapped SOL mint',
  'SysvarRent111111111111111111111111111111111': 'Sysvar: Rent',
  'SysvarC1ock11111111111111111111111111111111': 'Sysvar: Clock',
  'Sysvar1nstructions1111111111111111111111111': 'Sysvar: Instructions',
  'SysvarRecentB1ockHashes11111111111111111111': 'Sysvar: Recent Blockhashes',
  'SysvarS1otHashes111111111111111111111111111': 'Sysvar: Slot Hashes',
  'SysvarStakeHistory1111111111111111111111111': 'Sysvar: Stake History',
  'SysvarEpochSchedu1e111111111111111111111111': 'Sysvar: Epoch Schedule',
};
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

export const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Decode a base58 public key; throws a readable error.
export function decodePubkey(s, label = 'Address') {
  const t = String(s).trim();
  if (!t) throw new Error(`${label} is empty.`);
  let b;
  try { b = base58.decode(t); } catch { throw new Error(`${label} is not valid base58.`); }
  if (b.length !== 32) throw new Error(`${label} must decode to 32 bytes (got ${b.length}).`);
  return b;
}

export function isOnCurve(bytes) {
  try { ed25519.Point.fromBytes(bytes); return true; } catch { return false; }
}

const PDA_MARKER = utf8.encode('ProgramDerivedAddress');

export function createProgramAddress(seeds, programId) {
  if (seeds.length > 16) throw new Error('At most 16 seeds are allowed (including the bump).');
  seeds.forEach((s, i) => { if (s.length > 32) throw new Error(`Seed ${i + 1} is ${s.length} bytes; the maximum is 32.`); });
  const h = sha256(concat(...seeds, programId, PDA_MARKER));
  if (isOnCurve(h)) throw new Error('Result is on the ed25519 curve, so it is not a valid PDA. Try another bump.');
  return h;
}

export function findProgramAddress(seeds, programId) {
  if (seeds.length > 15) throw new Error('At most 15 seeds are allowed (one slot is used by the bump).');
  for (let bump = 255; bump >= 0; bump--) {
    try { return { address: createProgramAddress([...seeds, Uint8Array.of(bump)], programId), bump }; } catch (e) {
      if (!/on the ed25519 curve/.test(e.message)) throw e;
    }
  }
  throw new Error('No valid bump found.');
}

export function ataAddress(wallet, mint, tokenProgram) {
  return findProgramAddress([wallet, tokenProgram, mint], base58.decode(ATA_PROGRAM));
}

// SLIP-0010 for ed25519 (hardened derivation only).
const HARDENED = 0x80000000;
export function slip10Derive(seed, path) {
  const parts = parsePath(path);
  let I = hmac(sha512, utf8.encode('ed25519 seed'), seed);
  let key = I.slice(0, 32), chain = I.slice(32);
  for (const idx of parts) {
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, idx + HARDENED);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32); chain = I.slice(32);
  }
  return { key, chain };
}

export function parsePath(path) {
  const p = String(path).trim();
  if (!/^m(\/\d+'?)*$/.test(p)) throw new Error(`Invalid derivation path "${p}".`);
  return p.split('/').slice(1).map(s => {
    if (!s.endsWith("'")) throw new Error('ed25519 (SLIP-0010) supports hardened indexes only; add \' to every index.');
    const n = Number(s.slice(0, -1));
    if (n >= HARDENED) throw new Error(`Index ${n} is too large.`);
    return n;
  });
}

export function keypairFromSeed(seed32) {
  const pub = ed25519.getPublicKey(seed32);
  return { seed: seed32, publicKey: pub, secretKey: concat(seed32, pub) };
}

// Parse a secret key typed as a JSON byte array, base58 or hex (32-byte seed or 64-byte keypair).
export function parseSecret(input) {
  const t = String(input).trim();
  if (!t) throw new Error('Secret key is empty.');
  let bytes;
  if (t.startsWith('[')) {
    let arr;
    try { arr = JSON.parse(t); } catch { throw new Error('Secret key looks like JSON but does not parse.'); }
    if (!Array.isArray(arr) || !arr.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error('JSON secret key must be an array of numbers 0–255.');
    bytes = Uint8Array.from(arr);
  } else if (/^(0x)?[0-9a-fA-F]+$/.test(t) && (t.replace(/^0x/, '').length === 64 || t.replace(/^0x/, '').length === 128)) {
    bytes = hex.decode(t.replace(/^0x/, '').toLowerCase());
  } else {
    try { bytes = base58.decode(t); } catch { throw new Error('Secret key is not a JSON array, hex or base58.'); }
  }
  if (bytes.length !== 32 && bytes.length !== 64) throw new Error(`Secret key must be 32 or 64 bytes (got ${bytes.length}).`);
  const kp = keypairFromSeed(bytes.slice(0, 32));
  const mismatch = bytes.length === 64 && !equal(bytes.slice(32), kp.publicKey);
  return { ...kp, inputLength: bytes.length, mismatch };
}

export const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Message input: text (UTF-8), hex, base58 or base64.
export function parseBytes(input, encoding) {
  const t = String(input);
  try {
    if (encoding === 'utf8') return utf8.encode(t);
    const s = t.trim();
    if (encoding === 'hex') { const h = s.replace(/^0x/, '').replace(/\s+/g, ''); if (h.length % 2) throw 0; return hex.decode(h.toLowerCase()); }
    if (encoding === 'base58') return base58.decode(s);
    if (encoding === 'base64') return base64.decode(s);
  } catch { throw new Error(`Input is not valid ${encoding}.`); }
  throw new Error('Unknown encoding.');
}

// UI: rows of label / value / copy button.
export function kvTable(rows) {
  return `<table class="kv"><tbody>${rows.map(([k, v, note]) => `
    <tr><th>${esc(k)}</th><td class="mono">${esc(v)}${note ? `<div class="muted">${esc(note)}</div>` : ''}</td>
    <td><button class="icon-btn copy" data-copy="${esc(v)}" title="Copy">Copy</button></td></tr>`).join('')}</tbody></table>`;
}

export function wireCopy(root = document) {
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; }
    catch { b.textContent = 'Press ⌘C'; }
    setTimeout(() => { b.textContent = 'Copy'; }, 1200);
  });
}

export function showError(el, msg) {
  el.textContent = msg || '';
  el.hidden = !msg;
}
