// Secret Sharing: split a secret into Shamir shares over GF(2^8) and recover it from any K of them.
import { parseBytes, wireCopy, showError, setPressed, randomBytes, ENCODING_OPTIONS, KEY_NOTE, hex, esc, utf8d } from '../lib/common.js';

// GF(2^8) with the AES polynomial x^8 + x^4 + x^3 + x + 1 and generator 0xe5 (as Vault and shamir-secret-sharing).
const EXP = new Uint8Array(256), LOG = new Uint8Array(256);
{
  const slowMul = (a, b) => { let p = 0; while (b) { if (b & 1) p ^= a; a = (a << 1) ^ (a & 0x80 ? 0x11b : 0); b >>= 1; } return p & 0xff; };
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x = slowMul(x, 0xe5); }
  EXP[255] = EXP[0];
}
export const mul = (a, b) => (a && b) ? EXP[(LOG[a] + LOG[b]) % 255] : 0;
export const div = (a, b) => { if (!b) throw new Error('Duplicate share x-coordinates.'); return a ? EXP[(LOG[a] - LOG[b] + 255) % 255] : 0; };

// Each share is the secret's bytes evaluated on a random polynomial, followed by its x-coordinate byte.
export function split(secret, n, k) {
  // Distinct random x-coordinates in 1..255.
  const xs = new Set();
  while (xs.size < n) { const r = randomBytes(1)[0]; if (r) xs.add(r); }
  const xList = [...xs];
  const shares = xList.map(x => { const s = new Uint8Array(secret.length + 1); s[secret.length] = x; return s; });
  for (let i = 0; i < secret.length; i++) {
    const coeffs = randomBytes(k); coeffs[0] = secret[i];
    for (let j = 0; j < n; j++) {
      let y = coeffs[k - 1];
      for (let d = k - 2; d >= 0; d--) y = mul(y, xList[j]) ^ coeffs[d];
      shares[j][i] = y;
    }
  }
  return shares;
}

// Lagrange interpolation at x = 0.
export function combine(shares) {
  const len = shares[0].length;
  if (shares.some(s => s.length !== len)) throw new Error('All shares must have the same length.');
  if (len < 2) throw new Error('Shares are too short.');
  const xs = shares.map(s => s[len - 1]);
  if (new Set(xs).size !== xs.length) throw new Error('Two shares have the same x-coordinate (the same share pasted twice?).');
  if (xs.includes(0)) throw new Error('A share has x = 0, which is invalid.');
  const out = new Uint8Array(len - 1);
  for (let i = 0; i < len - 1; i++) {
    let r = 0;
    for (let a = 0; a < shares.length; a++) {
      let basis = 1;
      for (let b = 0; b < shares.length; b++) if (a !== b) basis = mul(basis, div(xs[b], xs[a] ^ xs[b]));
      r ^= mul(shares[a][i], basis);
    }
    out[i] = r;
  }
  return out;
}

export const checkInt = (value, lo, hi, label) => { const v = Number(value); if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${label} must be ${lo}–${hi}.`); return v; };

// Split the secret typed in the chosen encoding; returns the shares as hex.
export function splitSecret(input, encoding, nValue, kValue) {
  const secret = parseBytes(input, encoding, 'Secret');
  if (!secret.length) throw new Error('The secret is empty.');
  const n = checkInt(nValue, 2, 255, 'Shares'), k = checkInt(kValue, 2, 255, 'Threshold');
  if (k > n) throw new Error('The threshold cannot be larger than the number of shares.');
  return { n, k, shares: split(secret, n, k).map(s => hex.encode(s)) };
}

// Parse hex shares, one per line.
export function parseShares(text) {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('Paste at least two shares, one per line.');
  return lines.map((l, i) => { const h = l.replace(/^0x/i, '').replace(/\s+/g, ''); if (!/^([0-9a-fA-F]{2})+$/.test(h)) throw new Error(`Share ${i + 1} is not hex.`); return hex.decode(h.toLowerCase()); });
}

// Recover the secret from pasted shares: { count, secret, text } where text is null unless it is printable UTF-8.
export function recover(text) {
  const shares = parseShares(text);
  const secret = combine(shares);
  let t = null;
  try { t = utf8d.decode(secret); } catch {}
  const show = t !== null && /^[\P{C}\n\t]*$/u.test(t);
  return { count: shares.length, secret, text: show ? t : null };
}

function mount() {
  const $ = id => document.getElementById(id);
  $('keynote').textContent = KEY_NOTE;
  $('secretEnc').innerHTML = ENCODING_OPTIONS;

  $('split').onclick = () => {
    showError($('err'), ''); $('out').innerHTML = '';
    try {
      const { n, k, shares } = splitSecret($('secret').value, $('secretEnc').value, $('n').value, $('k').value);
      $('out').innerHTML = `<p class="section-title">${n} shares — any ${k} recover the secret</p><div class="pw-list">${shares.map((s, i) => `<div class="pw-item"><span class="muted">#${i + 1}</span><span class="mono">${s}</span><button class="icon-btn" data-copy="${s}">Copy</button></div>`).join('')}</div>`;
      $('shares').value = shares.slice(0, k).join('\n');
    } catch (e) { showError($('err'), e.message); }
  };

  $('combine').onclick = () => {
    showError($('err'), ''); $('out').innerHTML = '';
    try {
      const { count, secret, text } = recover($('shares').value);
      $('out').innerHTML = `<p class="section-title">Recovered from ${count} shares</p><table class="kv"><tbody>
        ${text !== null ? `<tr><th>Secret (text)</th><td class="mono">${esc(text)}</td><td><button class="icon-btn" data-copy="${esc(text)}">Copy</button></td></tr>` : ''}
        <tr><th>Secret (hex)</th><td class="mono">${hex.encode(secret)}</td><td><button class="icon-btn" data-copy="${hex.encode(secret)}">Copy</button></td></tr></tbody></table>
        <p class="muted">If fewer shares than the threshold were used, this is random-looking garbage — there is no way to tell from the shares alone.</p>`;
    } catch (e) { showError($('err'), e.message); }
  };

  $('mode').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    setPressed($('mode'), b.dataset.v);
    $('splitUi').hidden = b.dataset.v !== 'split'; $('combineUi').hidden = b.dataset.v !== 'combine';
    $('out').innerHTML = ''; showError($('err'), '');
  };
  wireCopy();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // Split "hello" into 3 shares with threshold 2; combine shares #1 and #3.
  $('example').onclick = () => {
    if (!$('splitUi').hidden) {
      exSet('secret', 'hello'); exSet('secretEnc', 'utf8'); exSet('n', 3); exSet('k', 2); $('split').click();
    } else {
      const shares = split(new TextEncoder().encode('hello'), 3, 2).map(s => hex.encode(s));
      exSet('shares', [shares[0], shares[2]].join('\n')); $('combine').click();
    }
  };
}

if (globalThis.document) mount();
