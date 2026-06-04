// UUID / ULID: generate UUIDs (v4, v7) and ULIDs, and inspect one.
import { $, renderRows, live, InputError } from '../lib/ui.js';

const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
export const fmt = h => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function v4() { return crypto.randomUUID(); }
let lastMs = 0, seq = 0;
export function v7(now = Date.now()) {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let ms = now;
  // Keep v7 values from the same millisecond sorted by bumping a 12-bit counter (RFC 9562 method 1).
  if (ms <= lastMs) { seq++; if (seq > 0xfff) { lastMs++; seq = 0; } ms = lastMs; } else { lastMs = ms; seq = b[6] & 0x07; }
  for (let i = 0; i < 6; i++) b[i] = Number((BigInt(ms) >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = 0x70 | (seq >> 8); b[7] = seq & 0xff;
  b[8] = (b[8] & 0x3f) | 0x80;
  return fmt(hex(b));
}
export function ulid(now = Date.now()) {
  let ms = now, t = '';
  for (let i = 0; i < 10; i++) { t = CROCKFORD[ms % 32] + t; ms = Math.floor(ms / 32); }
  const r = crypto.getRandomValues(new Uint8Array(16));
  let rnd = '';
  for (let i = 0; i < 16; i++) rnd += CROCKFORD[r[i] & 31];
  return t + rnd;
}

/** Generate `count` IDs (clamped to 1 … 1000) of a type ('v4', 'v7', 'ulid'); UUIDs can be uppercase and dashless. */
export function generate(count, type, { upper = false, nodash = false } = {}) {
  const n = Math.max(1, Math.min(1000, +count || 1));
  const out = [];
  for (let i = 0; i < n; i++) {
    let s = type === 'v4' ? v4() : type === 'v7' ? v7() : ulid();
    if (type !== 'ulid') { if (nodash) s = s.replace(/-/g, ''); if (upper) s = s.toUpperCase(); }
    out.push(s);
  }
  return out;
}

const VARIANTS = b => (b & 0x80) === 0 ? 'NCS (reserved)' : (b & 0xc0) === 0x80 ? 'RFC 9562 (standard)' : (b & 0xe0) === 0xc0 ? 'Microsoft (reserved)' : 'Future (reserved)';
const iso = ms => { const d = new Date(ms); return isNaN(d) ? '(out of range)' : d.toISOString(); };
// UUID v1/v6 time: 100-ns intervals since 1582-10-15.
const GREG = 122192928000000000n;

/** Inspect a UUID or ULID: null for empty input, else the rows shown. */
export function inspect(text) {
  const s = text.trim();
  if (!s) return null;
  if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(s)) {
    const up = s.toUpperCase();
    if (CROCKFORD.indexOf(up[0]) > 7) throw new InputError('Not a valid ULID: the first character must be 0-7.');
    let ms = 0; for (const c of up.slice(0, 10)) ms = ms * 32 + CROCKFORD.indexOf(c);
    return [
      { label: 'Type', value: 'ULID', copy: false },
      { label: 'Timestamp', value: iso(ms), note: `${ms} ms since the epoch` },
      { label: 'Randomness', value: up.slice(10) },
    ];
  }
  const h = s.replace(/^urn:uuid:/i, '').replace(/[{}-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(h)) throw new InputError('Not a UUID (32 hex digits, optionally with dashes) or a ULID (26 characters).');
  const b = h.match(/../g).map(x => parseInt(x, 16));
  const version = b[6] >> 4;
  const rows = [
    { label: 'Canonical', value: fmt(h) },
    { label: 'Version', value: h === '0'.repeat(32) ? 'Nil UUID' : h === 'f'.repeat(32) ? 'Max UUID' : `${version} (${['', 'time-based', 'DCE security', 'name-based MD5', 'random', 'name-based SHA-1', 'reordered time', 'Unix time-ordered', 'custom'][version] || 'unknown'})`, copy: false },
    { label: 'Variant', value: VARIANTS(b[8]), copy: false },
  ];
  const big = BigInt('0x' + h);
  if (version === 7) {
    const ms = Number(big >> 80n);
    rows.push({ label: 'Timestamp', value: iso(ms), note: `${ms} ms since the epoch` });
  } else if (version === 1 || version === 6) {
    const tl = BigInt('0x' + h.slice(0, 8)), tm = BigInt('0x' + h.slice(8, 12)), th = BigInt('0x' + h.slice(13, 16));
    const t = version === 1 ? (th << 48n) | (tm << 32n) | tl : (BigInt('0x' + h.slice(0, 12)) << 12n) | th;
    const ms = Number((t - GREG) / 10000n);
    rows.push({ label: 'Timestamp', value: iso(ms) }, { label: 'Node', value: h.slice(20).match(/../g).join(':'), note: 'Often a MAC address (or random)' });
  }
  rows.push({ label: 'As integer', value: big.toString() }, { label: 'URN', value: 'urn:uuid:' + fmt(h) });
  return rows;
}

function mount() {
  function generateList() {
    $('list').value = generate($('count').value, $('type').value, { upper: $('upper').checked, nodash: $('nodash').checked }).join('\n');
  }
  $('gen').onclick = generateList;
  for (const id of ['type', 'count', 'upper', 'nodash']) $(id).addEventListener('input', generateList);

  live([$('inspect')], () => {
    const rows = inspect($('inspect').value);
    if (!rows) { $('out').innerHTML = ''; return; }
    renderRows($('out'), rows);
  }, { errEl: $('err'), outEl: $('out') });
  $('nil').onclick = () => { $('inspect').value = '00000000-0000-0000-0000-000000000000'; $('inspect').dispatchEvent(new Event('input')); };
  $('max').onclick = () => { $('inspect').value = 'ffffffff-ffff-ffff-ffff-ffffffffffff'; $('inspect').dispatchEvent(new Event('input')); };
  generateList();
}

if (globalThis.document) mount();
