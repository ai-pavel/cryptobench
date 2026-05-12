// Encrypt Files: password-protect files with PBKDF2-SHA256 and AES-256-GCM.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';

export const MAGIC = new TextEncoder().encode('TBXENC'), VERSION = 1, ITERATIONS = 600000, HEADER = 6 + 1 + 4 + 16 + 12;
const enc = new TextEncoder(), dec = new TextDecoder();

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export function isEncrypted(head) { return head.length >= HEADER && MAGIC.every((b, i) => head[i] === b); }

/** Encrypt a File (or Blob with a name) into { blob, name } in the .enc format. */
export async function encryptFile(file, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const header = new Uint8Array(HEADER);
  header.set(MAGIC, 0); header[6] = VERSION;
  new DataView(header.buffer).setUint32(7, ITERATIONS);
  header.set(salt, 11); header.set(iv, 27);
  const name = enc.encode(file.name).subarray(0, 65535), body = new Uint8Array(await file.arrayBuffer());
  const plain = new Uint8Array(2 + name.length + body.length);
  new DataView(plain.buffer).setUint16(0, name.length); plain.set(name, 2); plain.set(body, 2 + name.length);
  const key = await deriveKey(password, salt, ITERATIONS);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, plain);
  return { blob: new Blob([header, cipher], { type: 'application/octet-stream' }), name: file.name + '.enc' };
}
/** Decrypt an .enc File back into { blob, name }; throws on a foreign file or a wrong password. */
export async function decryptFile(file, password) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!isEncrypted(buf)) throw new Error('Not a file encrypted with this tool.');
  if (buf[6] !== VERSION) throw new Error(`Unsupported format version ${buf[6]}.`);
  const header = buf.subarray(0, HEADER), view = new DataView(buf.buffer, buf.byteOffset);
  const key = await deriveKey(password, buf.slice(11, 27), view.getUint32(7));
  let plain;
  try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(27, 39), additionalData: header }, key, buf.subarray(HEADER))); }
  catch { throw new Error('Wrong password, or the file is damaged.'); }
  const n = new DataView(plain.buffer).getUint16(0);
  const name = dec.decode(plain.subarray(2, 2 + n)) || file.name.replace(/\.enc$/i, '');
  return { blob: new Blob([plain.subarray(2 + n)]), name };
}

/** Password strength as [score 0–4, label]. */
export function strength(pw) {
  if (!pw) return [0, ''];
  let score = Math.min(4, Math.floor(pw.length / 4));
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  score = Math.max(0, Math.min(4, score + classes - 2));
  if (pw.length < 8) score = Math.min(score, 1);
  return [score, ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score]];
}
const COLORS = ['#c0392b', '#e67e22', '#f1c40f', '#7cb342', '#1e8e3e'];

/** The summary shown after a run. */
export function resultMessage(ok, total, mode) {
  return `${ok} of ${total} file${total === 1 ? '' : 's'} ${mode === 'encrypt' ? 'encrypted' : 'decrypted'}.`;
}

function mount() {
  const $ = id => document.getElementById(id);

  let mode = 'encrypt', queue = [];
  function setMode(m) {
    mode = m;
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === m));
    $('confirm-wrap').hidden = m === 'decrypt';
    $('drop-label').textContent = m === 'encrypt' ? 'Drop files to encrypt' : 'Drop .enc files to decrypt';
    $('pw').autocomplete = m === 'encrypt' ? 'new-password' : 'current-password';
    update();
  }
  function renderQueue() {
    $('queue').innerHTML = queue.map((f, i) => `
    <div class="item"><div class="name">${esc(f.name)} <span class="muted">· ${fmtSize(f.size)}</span></div>
    <button class="icon-btn" data-remove="${i}" title="Remove">✕</button></div>`).join('');
    update();
  }
  function update() {
    const pw = $('pw').value, [score, label] = strength(pw);
    $('bar').style.width = pw ? (score + 1) * 20 + '%' : '0';
    $('bar').style.background = COLORS[score];
    $('hint').textContent = mode === 'encrypt' && pw ? label : '';
    const mismatch = mode === 'encrypt' && $('pw2').value && $('pw2').value !== pw;
    $('msg').className = mismatch ? 'error' : 'muted';
    $('msg').textContent = mismatch ? 'Passwords do not match.' : '';
    const ready = queue.length && pw && (mode === 'decrypt' || $('pw2').value === pw);
    $('go').disabled = !ready;
    $('go').textContent = (mode === 'encrypt' ? 'Encrypt' : 'Decrypt') + (queue.length > 1 ? ` ${queue.length} files` : '');
  }
  async function addFiles(files) {
    queue.push(...files);
    // Switch to Decrypt automatically if everything added is in our format.
    const heads = await Promise.all(queue.map(f => f.slice(0, HEADER).arrayBuffer().then(b => new Uint8Array(b))));
    if (heads.length && heads.every(isEncrypted) && mode === 'encrypt') setMode('decrypt');
    renderQueue();
  }

  async function run() {
    const pw = $('pw').value, files = [...queue];
    $('go').disabled = true; $('results').innerHTML = '';
    let ok = 0;
    for (const [i, f] of files.entries()) {
      $('msg').className = 'muted';
      $('msg').textContent = `${mode === 'encrypt' ? 'Encrypting' : 'Decrypting'} ${i + 1} of ${files.length}…`;
      const row = document.createElement('div'); row.className = 'item';
      try {
        const out = await (mode === 'encrypt' ? encryptFile(f, pw) : decryptFile(f, pw));
        const url = URL.createObjectURL(out.blob);
        row.innerHTML = `<div class="name"><span class="ok">✓</span> ${esc(out.name)} <span class="muted">· ${fmtSize(out.blob.size)}</span></div>
        <a class="dl" href="${url}" download="${esc(out.name)}">Download</a>`;
        ok++;
      } catch (e) {
        row.innerHTML = `<div class="name"><span class="error">✕ ${esc(f.name)}: ${esc(e.message)}</span></div>`;
      }
      $('results').append(row);
    }
    $('msg').className = ok === files.length ? 'ok' : 'error';
    $('msg').textContent = resultMessage(ok, files.length, mode);
    $('go').disabled = false;
  }

  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  const drop = $('drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  $('pick').onclick = () => $('files').click();
  $('files').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('queue').onclick = e => { const i = e.target.dataset.remove; if (i !== undefined) { queue.splice(+i, 1); renderQueue(); } };
  $('pw').oninput = $('pw2').oninput = update;
  $('show').onclick = () => {
    const t = $('pw').type === 'password' ? 'text' : 'password';
    $('pw').type = $('pw2').type = t; $('show').textContent = t === 'password' ? 'Show' : 'Hide';
  };
  $('go').onclick = run;
  setMode('encrypt');
}

if (globalThis.document) mount();
