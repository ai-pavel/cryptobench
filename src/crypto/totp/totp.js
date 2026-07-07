// TOTP / HOTP: one-time codes from a base32 secret or otpauth:// URI, and new secrets with a QR code.
import { kvTable, wireCopy, showError, KEY_NOTE, randomBytes, loadScript } from '../lib/common.js';
import { hmac } from '../../assets/vendor/@noble/hashes@2.4.0/hmac.esm.js';
import { sha1 } from '../../assets/vendor/@noble/hashes@2.4.0/legacy.esm.js';
import { sha256, sha512 } from '../../assets/vendor/@noble/hashes@2.4.0/sha2.esm.js';
import { base32 } from '../../assets/vendor/@scure/base@2.4.0/index.esm.js';

const QR_URL = new URL('../../assets/vendor/qrcode-generator@1.4.4/qrcode.js', import.meta.url).href;
export const H = { 'SHA-1': sha1, 'SHA-256': sha256, 'SHA-512': sha512 };

// RFC 4226 HOTP with dynamic truncation.
export function hotp(key, counter, digits = 6, algo = 'SHA-1') {
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
  const mac = hmac(H[algo], key, msg);
  const o = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

// RFC 6238 TOTP at a time (seconds): the time step, seconds left in it, and the codes around it.
export function totpAt(key, nowSec, period = 30, digits = 6, algo = 'SHA-1') {
  const step = Math.floor(nowSec / period);
  const left = period - (nowSec % period);
  return { step, left, previous: hotp(key, step - 1, digits, algo), current: hotp(key, step, digits, algo), next: hotp(key, step + 1, digits, algo) };
}

export function decodeSecret(s) {
  const t = s.replace(/[\s-]+/g, '').toUpperCase().replace(/=+$/, '');
  if (!t) throw new Error('Enter a secret.');
  if (!/^[A-Z2-7]+$/.test(t)) throw new Error('The secret is not base32 (letters A–Z and digits 2–7).');
  try { return base32.decode(t.padEnd(Math.ceil(t.length / 8) * 8, '=')); } catch { throw new Error('The secret is not valid base32.'); }
}

/**
 * Parse an otpauth:// URI into the form's values. type is checked first; algo is null when the
 * algorithm is unsupported (algoError then holds the message), so the caller can fill the type before failing.
 */
export function parseOtpUri(u) {
  let url;
  try { url = new URL(u); } catch { throw new Error('Not a valid otpauth:// URI.'); }
  if (url.protocol !== 'otpauth:') throw new Error('URI must start with otpauth://');
  const type = url.host || url.hostname;
  if (!['totp', 'hotp'].includes(type)) throw new Error(`Unknown OTP type “${type}”.`);
  const p = url.searchParams;
  if (!p.get('secret')) throw new Error('The URI has no secret parameter.');
  const algo = (p.get('algorithm') || 'SHA1').toUpperCase().replace(/^SHA(\d)/, 'SHA-$1');
  const label = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return {
    type,
    algo: H[algo] ? algo : null,
    algoError: H[algo] ? null : `Unsupported algorithm ${p.get('algorithm')}.`,
    digits: p.get('digits') || '6',
    period: p.get('period') || '30',
    counter: type === 'hotp' ? p.get('counter') || '0' : null,
    label: `${p.get('issuer') ? `Issuer: ${p.get('issuer')} · ` : ''}Account: ${label}`,
    secret: p.get('secret'),
  };
}

// A new TOTP secret (base32, no padding) and its otpauth:// URI.
export function newSecret(bytes, issuer, account) {
  const secret = base32.encode(bytes).replace(/=+$/, '');
  const label = encodeURIComponent(issuer ? `${issuer}:${account}` : account);
  const uri = `otpauth://totp/${label}?secret=${secret}${issuer ? `&issuer=${encodeURIComponent(issuer)}` : ''}&algorithm=SHA1&digits=6&period=30`;
  return { secret, uri };
}

export function checkCounter(c) {
  if (!Number.isInteger(c) || c < 0) throw new Error('Counter must be a non-negative whole number.');
  return c;
}
export function checkPeriod(period) {
  if (!Number.isInteger(period) || period < 1) throw new Error('Period must be a positive whole number.');
  return period;
}

function mount() {
  const $ = id => document.getElementById(id);
  $('keynote').textContent = KEY_NOTE;

  // Fill the form from an otpauth:// URI.
  function applyUri(u) {
    const r = parseOtpUri(u);
    $('type').value = r.type;
    if (!r.algo) throw new Error(r.algoError);
    $('algo').value = r.algo;
    $('digits').value = r.digits;
    $('period').value = r.period;
    if (r.type === 'hotp') $('counter').value = r.counter;
    $('label').textContent = r.label;
    $('secret').value = r.secret;
  }

  let timer;
  function render() {
    showError($('err'), '');
    clearInterval(timer);
    try {
      const v = $('secret').value.trim();
      if (v.toLowerCase().startsWith('otpauth://')) { applyUri(v); }
      $('periodField').hidden = $('type').value !== 'totp';
      $('counterField').hidden = $('type').value !== 'hotp';
      const key = decodeSecret($('secret').value);
      const digits = Number($('digits').value), algo = $('algo').value;
      if ($('type').value === 'hotp') {
        const c = checkCounter(Number($('counter').value));
        $('codes').innerHTML = `<div class="otp">${hotp(key, c, digits, algo)}</div>` + kvTable([[`Counter ${c + 1}`, hotp(key, c + 1, digits, algo)], [`Counter ${c + 2}`, hotp(key, c + 2, digits, algo)]]);
        return;
      }
      const period = checkPeriod(Number($('period').value));
      const tick = () => {
        const t = totpAt(key, Date.now() / 1000, period, digits, algo);
        $('codes').innerHTML = `<div class="otp" id="current">${t.current}</div>
          <progress max="${period}" value="${t.left.toFixed(1)}" style="width:100%"></progress>
          <p class="muted">${Math.ceil(t.left)} s left · time step ${t.step}</p>` +
          kvTable([['Previous', t.previous], ['Current', t.current], ['Next', t.next]]);
      };
      tick();
      timer = setInterval(tick, 500);
    } catch (e) { $('codes').innerHTML = ''; showError($('err'), e.message); }
  }

  $('gen').onclick = async () => {
    const issuer = $('issuer').value.trim(), account = $('account').value.trim() || 'user';
    const { secret, uri } = newSecret(randomBytes(20), issuer, account);
    let qr = '';
    try {
      await loadScript(QR_URL);
      const q = qrcode(0, 'M'); q.addData(uri); q.make();
      qr = `<div style="background:#fff;display:inline-block;padding:8px;border-radius:8px;margin-top:12px">${q.createSvgTag({ cellSize: 4, margin: 2 })}</div>`;
    } catch {}
    $('newOut').innerHTML = kvTable([['Secret (base32)', secret], ['otpauth URI', uri]]) + qr;
    $('secret').value = secret; $('type').value = 'totp'; $('algo').value = 'SHA-1'; $('digits').value = '6'; $('period').value = '30';
    $('label').textContent = `Issuer: ${issuer} · Account: ${account}`;
    render();
  };
  for (const id of ['secret', 'type', 'algo', 'digits', 'period', 'counter']) $(id).addEventListener('input', render);
  wireCopy();
  render();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // RFC 6238 test secret ("12345678901234567890"), SHA-1, 8 digits.
  $('example').onclick = () => {
    exSet('secret', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'); exSet('type', 'totp'); exSet('algo', 'SHA-1');
    exSet('digits', '8'); exSet('period', 30); render();
  };
}

if (globalThis.document) mount();
