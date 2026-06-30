// DER Signature: convert an ECDSA signature between strict DER and raw r, s, and check low-S.
import { parseHex, kvTable, wireCopy, showError, setPressed, hex, base64, bigToBytes, bytesToBig } from '../lib/common.js';
import { TYPES } from '../lib/keys.js';

export const SIGHASH = { 1: 'SIGHASH_ALL', 2: 'SIGHASH_NONE', 3: 'SIGHASH_SINGLE', 0x81: 'SIGHASH_ALL|ANYONECANPAY', 0x82: 'SIGHASH_NONE|ANYONECANPAY', 0x83: 'SIGHASH_SINGLE|ANYONECANPAY' };
export const EXAMPLE = {
  der: '3045022100c12a7d54972f26d14cb311339b5122f8c187417dde1e8efb6841f55c34220ae0022066632c5cd4161efa3a2837764eee9eb84975dd54c2de2865e9752585c53e7cce01',
  r: 'c12a7d54972f26d14cb311339b5122f8c187417dde1e8efb6841f55c34220ae0',
  s: '66632c5cd4161efa3a2837764eee9eb84975dd54c2de2865e9752585c53e7cce',
};
export const curveParams = name => { const t = TYPES[name]; return { n: t.lib.Point.Fn.ORDER, len: t.len }; };

export function readBytes(t) {
  const c = t.trim().replace(/^0x/i, '').replace(/\s+/g, '');
  if (!c) throw new Error('Paste a signature.');
  if (/^[0-9a-fA-F]+$/.test(c) && c.length % 2 === 0) return hex.decode(c.toLowerCase());
  try { return base64.decode(c); } catch { throw new Error('Not hex or base64.'); }
}

// Strict-DER parse; returns { r, s, issues[] } or throws for structural errors.
export function parseStrict(b) {
  const issues = [];
  if (b.length < 8) throw new Error(`Too short for a DER signature (${b.length} bytes).`);
  if (b[0] !== 0x30) throw new Error(`Must start with 0x30 (SEQUENCE); found 0x${b[0].toString(16).padStart(2, '0')}.`);
  if (b[1] & 0x80) issues.push('Long-form length is not allowed for signatures.');
  if (b[1] !== b.length - 2) throw new Error(`Sequence length byte says ${b[1]}, but ${b.length - 2} bytes follow.`);
  let p = 2;
  const readInt = name => {
    if (b[p] !== 0x02) throw new Error(`Expected INTEGER (0x02) for ${name} at byte ${p}.`);
    const len = b[p + 1];
    if (!len) throw new Error(`${name} has zero length.`);
    if (p + 2 + len > b.length) throw new Error(`${name} length ${len} runs past the end.`);
    const v = b.subarray(p + 2, p + 2 + len);
    if (v[0] & 0x80) issues.push(`${name} is negative (high bit set without a 0x00 prefix).`);
    if (len > 1 && v[0] === 0 && !(v[1] & 0x80)) issues.push(`${name} has an unnecessary leading zero byte.`);
    p += 2 + len;
    return { v, len };
  };
  const r = readInt('r'), s = readInt('s');
  if (p !== b.length) throw new Error(`${b.length - p} extra bytes after s.`);
  return { r: bytesToBig(r.v), s: bytesToBig(s.v), issues };
}

export function encodeDer(r, s) {
  const intBytes = n => { let b = bigToBytes(n); if (!b.length) b = Uint8Array.of(0); if (b[0] & 0x80) b = Uint8Array.of(0, ...b); return b; };
  const R = intBytes(r), S = intBytes(s);
  return Uint8Array.of(0x30, 4 + R.length + S.length, 2, R.length, ...R, 2, S.length, ...S);
}

export function describe(r, s, der, hashType, curveName) {
  const { n, len } = curveParams(curveName);
  const issues = [];
  if (r <= 0n || r >= n) issues.push('r is out of range (must be 1 … n−1).');
  if (s <= 0n || s >= n) issues.push('s is out of range (must be 1 … n−1).');
  const high = s > n / 2n;
  const lowS = high ? n - s : s;
  const rows = [
    ['r', r.toString(16).padStart(len * 2, '0')],
    ['s', s.toString(16).padStart(len * 2, '0'), high ? 'high-S' : 'low-S'],
    ['r‖s (hex)', r.toString(16).padStart(len * 2, '0') + s.toString(16).padStart(len * 2, '0'), `${len * 2}-byte raw signature`],
    ['DER (hex)', hex.encode(der) + (hashType !== undefined ? hashType.toString(16).padStart(2, '0') : ''), hashType !== undefined ? `with sighash byte` : `${der.length} bytes`],
    ['DER (base64)', base64.encode(der)],
  ];
  if (high) rows.push(['Low-S DER', hex.encode(encodeDer(r, lowS)) + (hashType !== undefined ? hashType.toString(16).padStart(2, '0') : ''), 'Normalized: s replaced with n − s']);
  if (hashType !== undefined) rows.push(['Sighash', `0x${hashType.toString(16).padStart(2, '0')} ${SIGHASH[hashType] || '(non-standard)'}`]);
  return { rows, issues, high };
}

// DER → r, s. A trailing sighash byte is tried only when the strict parse fails and sighash is allowed.
export function fromDer(text, sighash, curveName) {
  let b = readBytes(text), hashType;
  let parsed;
  try { parsed = parseStrict(b); }
  catch (e) {
    if (!sighash || b.length < 9) throw e;
    try { parsed = parseStrict(b.subarray(0, -1)); hashType = b[b.length - 1]; b = b.subarray(0, -1); } catch { throw e; }
  }
  // Structural issues come first, then range issues.
  const res = describe(parsed.r, parsed.s, b, hashType, curveName);
  return { ...res, issues: [...parsed.issues, ...res.issues] };
}

// r, s → DER, from r‖s hex or separate r and s. Returns null while r or s is still empty.
export function fromRs({ rs, r: rText, s: sText, appendHash }, curveName) {
  const { len } = curveParams(curveName);
  let r, s;
  if (rs.trim()) {
    const b = parseHex(rs, 'r‖s');
    if (b.length !== len * 2) throw new Error(`r‖s must be ${len * 2} bytes for ${curveName}; got ${b.length}.`);
    r = bytesToBig(b.subarray(0, len)); s = bytesToBig(b.subarray(len));
  } else {
    if (!rText.trim() || !sText.trim()) return null;
    r = bytesToBig(parseHex(rText, 'r')); s = bytesToBig(parseHex(sText, 's'));
  }
  const ht = appendHash ? parseInt(appendHash, 16) : undefined;
  return describe(r, s, encodeDer(r, s), ht, curveName);
}

// The verdict line: { cls, text }.
export function verdict(res) {
  if (res.issues.length) return { cls: 'big-result bad', text: '❌ Not strict DER / not a valid signature encoding.' };
  if (res.high) return { cls: 'big-result', text: '⚠️ Valid strict DER, but s is high (not accepted by Bitcoin relay rules).' };
  return { cls: 'big-result ok', text: '✅ Valid strict DER with low-S.' };
}

function mount() {
  const $ = id => document.getElementById(id);
  let dir = 'toRaw';
  function render() {
    showError($('err'), ''); $('out').innerHTML = ''; $('issues').innerHTML = ''; $('verdict').hidden = true;
    try {
      const res = dir === 'toRaw'
        ? fromDer($('der').value, $('sighash').checked, $('curve').value)
        : fromRs({ rs: $('rs').value, r: $('r').value, s: $('s').value, appendHash: $('appendHash').value }, $('curve').value);
      if (!res) return;
      const v = $('verdict'); v.hidden = false;
      const { cls, text } = verdict(res);
      v.className = cls; v.textContent = text;
      $('issues').innerHTML = res.issues.map(i => `<li>${i.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</li>`).join('');
      $('out').innerHTML = kvTable(res.rows);
    } catch (e) { showError($('err'), e.message); }
  }
  $('dir').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    dir = b.dataset.v; setPressed($('dir'), dir);
    $('derIn').hidden = dir !== 'toRaw'; $('rsIn').hidden = dir !== 'toDer';
    render();
  };
  for (const id of ['der', 'sighash', 'curve', 'rs', 'r', 's', 'appendHash']) $(id).addEventListener('input', render);
  wireCopy();
  render();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  const exFire = id => document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
  $('example').onclick = () => {
    exSet('curve', 'secp256k1');
    if (dir === 'toRaw') {
      exSet('der', EXAMPLE.der);
      exSet('sighash', true); exFire('der');
    } else {
      exSet('rs', ''); exSet('r', EXAMPLE.r);
      exSet('s', EXAMPLE.s); exSet('appendHash', '01'); exFire('r');
    }
  };
}

if (globalThis.document) mount();
