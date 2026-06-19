// Password Hash: hash and verify passwords with Argon2, bcrypt and scrypt (the hashing runs in worker.js).
import { parseHex, kvTable, wireCopy, showError, setPressed, randomBytes, KEY_NOTE, hex, esc } from '../lib/common.js';

const int = (value, lo, hi, label) => {
  const v = Number(value);
  if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${label} must be a whole number from ${lo} to ${hi}.`);
  return v;
};

// Cost parameters for the worker; get(id) returns the value of a parameter field.
export function hashParams(algo, get) {
  if (algo.startsWith('argon2')) {
    const p = int(get('p'), 1, 16, 'Parallelism');
    return { m: int(get('m'), 8 * p, 4194304, 'Memory'), t: int(get('t'), 1, 100, 'Iterations'), p, len: int(get('len'), 4, 128, 'Hash length') };
  } else if (algo === 'bcrypt') return { cost: int(get('cost'), 4, 31, 'Cost') };
  return { ln: int(get('ln'), 1, 24, 'log₂ N'), r: int(get('r'), 1, 64, 'Block size'), p: int(get('sp'), 1, 16, 'Parallelism'), len: int(get('slen'), 16, 128, 'Hash length') };
}

// The salt typed as hex, or 16 random bytes when empty.
export function parseSalt(algo, text) {
  const saltLen = 16;
  let salt = text.trim() ? parseHex(text, 'Salt') : randomBytes(saltLen);
  if (algo === 'bcrypt' && salt.length !== 16) throw new Error('bcrypt needs a 16-byte salt.');
  if (algo.startsWith('argon2') && salt.length < 8) throw new Error('Argon2 needs a salt of at least 8 bytes.');
  return salt;
}

export const hashLabel = algo => algo === 'bcrypt' ? 'bcrypt hash' : algo === 'scrypt' ? 'scrypt hash (PHC)' : `${algo} hash (PHC)`;

export const UNRECOGNIZED = 'Unrecognized hash string. Supported: $argon2id/$argon2i/$argon2d (PHC), $2a/$2b/$2y (bcrypt) and $scrypt$ln=…';

export function detect(s) {
  let m;
  if ((m = s.match(/^\$(argon2(?:id|i|d))\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/)))
    return { kind: 'argon2', rows: [['Algorithm', m[1]], ['Version', m[2] === '19' ? '1.3 (19)' : m[2]], ['Memory', `${m[3]} KiB`], ['Iterations', m[4]], ['Parallelism', m[5]]] };
  if ((m = s.match(/^\$(2[abxy])\$(\d{2})\$([./A-Za-z0-9]{53})$/)))
    return { kind: 'bcrypt', rows: [['Algorithm', `bcrypt ($${m[1]}$)`], ['Cost', `${m[2]} (2^${m[2]} rounds)`]] };
  if ((m = s.match(/^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/)))
    return { kind: 'scrypt', rows: [['Algorithm', 'scrypt'], ['N', `2^${m[1]}`], ['r', m[2]], ['p', m[3]]] };
  return null;
}

export const verdictText = ok => ok ? '✅ The password matches this hash.' : '❌ The password does not match.';

function mount() {
  const $ = id => document.getElementById(id);
  $('keynote').textContent = KEY_NOTE;
  let mode = 'hash', seq = 0;
  const worker = new Worker('worker.js');
  const pending = new Map();
  worker.onmessage = ({ data }) => { const p = pending.get(data.id); if (p) { pending.delete(data.id); data.error ? p.reject(new Error(data.error)) : p.resolve(data); } };
  const call = msg => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); worker.postMessage({ ...msg, id }); });
  const spin = '<span class="spinner"></span> ';

  function syncAlgo() {
    const a = $('algo').value;
    $('argonParams').hidden = !a.startsWith('argon2');
    $('bcryptParams').hidden = a !== 'bcrypt';
    $('scryptParams').hidden = a !== 'scrypt';
  }

  $('go').onclick = async () => {
    showError($('err'), ''); $('out').innerHTML = '';
    try {
      const algo = $('algo').value;
      const params = hashParams(algo, id => $(id).value);
      const salt = parseSalt(algo, $('salt').value);
      $('go').disabled = true; $('status').innerHTML = spin + 'Hashing…';
      const r = await call({ op: 'hash', algo, password: $('password').value, salt, params });
      $('status').textContent = `Took ${r.ms.toFixed(0)} ms.`;
      $('out').innerHTML = kvTable([[hashLabel(algo), r.result], ['Salt (hex)', hex.encode(salt)]]);
      $('hash').value = r.result;
    } catch (e) { $('status').textContent = ''; showError($('err'), e.message); }
    finally { $('go').disabled = false; }
  };

  $('verify').onclick = async () => {
    showError($('err'), ''); $('out').innerHTML = ''; $('verdict').hidden = true;
    const s = $('hash').value.trim();
    const d = detect(s);
    if (!d) { showError($('err'), UNRECOGNIZED); return; }
    $('out').innerHTML = kvTable(d.rows);
    $('verify').disabled = true; $('vstatus').innerHTML = spin + 'Checking…';
    try {
      const r = await call({ op: 'verify', kind: d.kind, password: $('password').value, hash: s });
      $('vstatus').textContent = `Took ${r.ms.toFixed(0)} ms.`;
      const v = $('verdict'); v.hidden = false;
      v.className = 'big-result ' + (r.result ? 'ok' : 'bad');
      v.textContent = verdictText(r.result);
    } catch (e) { $('vstatus').textContent = ''; showError($('err'), e.message); }
    finally { $('verify').disabled = false; }
  };

  $('algo').oninput = syncAlgo;
  $('mode').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    mode = b.dataset.v; setPressed($('mode'), mode);
    $('hashUi').hidden = mode !== 'hash'; $('verifyUi').hidden = mode !== 'verify';
    $('out').innerHTML = ''; showError($('err'), ''); $('verdict').hidden = true;
  };
  syncAlgo();
  wireCopy();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // Argon2id with the OWASP-recommended parameters and a fixed salt.
  $('example').onclick = () => {
    exSet('password', 'correct horse battery staple');
    if (mode === 'hash') {
      exSet('algo', 'argon2id'); syncAlgo();
      exSet('m', 19456); exSet('t', 2); exSet('p', 1); exSet('len', 32); exSet('salt', '6578616d706c6573616c743132333435');
      $('go').click();
    } else {
      exSet('hash', '$argon2id$v=19$m=19456,t=2,p=1$ZXhhbXBsZXNhbHQxMjM0NQ$28IdljkIUO5ULliXQ4F53vIBk+Jzbs82ppnGNfykamY');
      $('verify').click();
    }
  };
}

if (globalThis.document) mount();
