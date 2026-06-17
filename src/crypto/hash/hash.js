// Hash: hash text, hex, base64 or files with many algorithms, and check a published checksum.
import { parseBytes, encodeBytes, esc, wireCopy, showError, getHashWasm, setPressed, hex, base64 } from '../lib/common.js';
import { sha512_256 } from '../../assets/vendor/@noble/hashes@2.4.0/sha2.esm.js';

export const ALGOS = [
  ['md5', 'MD5', h => h.createMD5()],
  ['sha1', 'SHA-1', h => h.createSHA1()],
  ['sha224', 'SHA-224', h => h.createSHA224()],
  ['sha256', 'SHA-256', h => h.createSHA256()],
  ['sha384', 'SHA-384', h => h.createSHA384()],
  ['sha512', 'SHA-512', h => h.createSHA512()],
  ['sha512_256', 'SHA-512/256', () => { const s = sha512_256.create(); return { init() {}, update(d) { s.update(d); }, digest() { return s.digest(); } }; }],
  ['sha3_256', 'SHA3-256', h => h.createSHA3(256)],
  ['sha3_512', 'SHA3-512', h => h.createSHA3(512)],
  ['keccak256', 'Keccak-256', h => h.createKeccak(256)],
  ['keccak512', 'Keccak-512', h => h.createKeccak(512)],
  ['blake2b', 'BLAKE2b-512', h => h.createBLAKE2b(512)],
  ['blake2s', 'BLAKE2s-256', h => h.createBLAKE2s(256)],
  ['blake3', 'BLAKE3-256', h => h.createBLAKE3(256)],
  ['ripemd160', 'RIPEMD-160', h => h.createRIPEMD160()],
];
// Files default to the usual checksum algorithms.
export const FILE_ALGOS = ['md5', 'sha1', 'sha256', 'sha512'];

// Fresh hashers for the enabled algorithm ids; hw is the hash-wasm namespace.
export async function makeHashers(hw, enabled) {
  const list = [];
  for (const [id, name, make] of ALGOS) {
    if (!enabled.has(id)) continue;
    const h = await make(hw);
    h.init?.();
    list.push({ id, name, h });
  }
  return list;
}
export const digestBytes = h => { const d = h.digest('binary'); return d instanceof Uint8Array ? d : new Uint8Array(d); };
export const finish = hashers => hashers.map(x => ({ id: x.id, name: x.name, bytes: digestBytes(x.h) }));

// Hash bytes with every enabled algorithm: [{ id, name, bytes }].
export async function hashBytes(hw, data, enabled) {
  const hashers = await makeHashers(hw, enabled);
  for (const x of hashers) x.h.update(data);
  return finish(hashers);
}

// Accepts a bare hash, "hash  filename" (sha256sum/md5sum) or "SHA256 (file) = hash" (BSD/shasum --tag).
export function normExpected(text) {
  let t = text.trim();
  if (!t) return null;
  const bsd = t.match(/=\s*([0-9a-fA-F]+)\s*$/);
  if (bsd) t = bsd[1];
  else if (/\s/.test(t) && /^[0-9a-fA-F]{8,}\s/.test(t)) t = t.split(/\s+/)[0];
  const h = t.replace(/^0x/i, '').replace(/[\s:]+/g, '').toLowerCase();
  if (/^[0-9a-f]+$/.test(h) && h.length % 2 === 0) return { hex: h };
  try { return { hex: hex.encode(base64.decode(t.replace(/\s+/g, ''))) }; } catch { return { bad: true }; }
}

export const matchedResults = (results, exp) => exp && !exp.bad ? results.filter(r => hex.encode(r.bytes) === exp.hex) : [];

// Output table of digests in the chosen encoding, highlighting matches of the expected checksum.
export function resultsTable(results, outEnc, exp) {
  const matched = matchedResults(results, exp);
  return results.length ? `<table class="kv"><tbody>${results.map(r => {
    const v = encodeBytes(r.bytes, outEnc);
    const cls = exp && !exp.bad ? (matched.includes(r) ? 'hl-match' : '') : '';
    return `<tr class="${cls}"><th>${esc(r.name)}<div class="muted">${r.bytes.length * 8} bits</div></th><td class="mono">${esc(v)}</td><td><button class="icon-btn copy" data-copy="${esc(v)}">Copy</button></td></tr>`;
  }).join('')}</tbody></table>` : '';
}

// The match verdict: null (hidden) or { ok, text }.
export function matchMessage(results, exp) {
  if (!exp || !results.length) return null;
  if (exp.bad) return { ok: false, text: 'The expected hash is not hex or base64.' };
  const matched = matchedResults(results, exp);
  if (matched.length) return { ok: true, text: `✅ Match: ${matched.map(r => r.name).join(', ')}` };
  const bits = exp.hex.length * 4;
  const same = ALGOS.filter(a => results.find(r => r.id === a[0] && r.bytes.length * 8 === bits)).map(a => a[1]);
  const hint = { 128: 'MD5', 160: 'SHA-1 or RIPEMD-160', 224: 'SHA-224', 256: 'SHA-256, SHA3-256, Keccak-256, BLAKE2s, BLAKE3 or SHA-512/256', 384: 'SHA-384', 512: 'SHA-512, SHA3-512, Keccak-512 or BLAKE2b' }[bits];
  return { ok: false, text: `❌ Mismatch.` + (same.length ? ` A ${bits}-bit checksum is ${same.join(' / ')} here, and it differs — the data is not the same.` : hint ? ` A ${bits}-bit checksum is usually ${hint}; turn it on under “Choose algorithms”.` : ` No common algorithm gives a ${bits}-bit hash.`) };
}

function mount() {
  const $ = id => document.getElementById(id);
  let mode = 'utf8', outEnc = 'hex', file = null, results = [], run = 0;
  // Text input shows every algorithm; files default to the usual checksum algorithms.
  const enabledFor = { text: new Set(ALGOS.map(a => a[0])), file: new Set(FILE_ALGOS) };
  const current = () => enabledFor[mode === 'file' ? 'file' : 'text'];
  function drawAlgos() {
    const en = current();
    $('algos').innerHTML = ALGOS.map(([id, name]) => `<label class="inline"><input type="checkbox" data-id="${id}"${en.has(id) ? ' checked' : ''}> ${name}</label>`).join('');
  }
  drawAlgos();

  async function compute() {
    const my = ++run;
    showError($('err'), '');
    try {
      let res;
      if (mode === 'file') {
        if (!file) { results = []; render(); return; }
        const hashers = await makeHashers(await getHashWasm(), current());
        const CHUNK = 4 << 20;
        $('progress').hidden = false;
        for (let off = 0; off < file.size || off === 0; off += CHUNK) {
          const chunk = new Uint8Array(await file.slice(off, off + CHUNK).arrayBuffer());
          if (my !== run) return;
          for (const x of hashers) x.h.update(chunk);
          $('progress').value = file.size ? Math.min(1, (off + CHUNK) / file.size) : 1;
          if (!file.size) break;
        }
        $('progress').hidden = true;
        if (my !== run) return;
        res = finish(hashers);
      } else {
        const data = parseBytes($('input').value, mode, 'Input');
        res = await hashBytes(await getHashWasm(), data, current());
      }
      if (my !== run) return;
      results = res;
      render();
    } catch (e) { if (my === run) { results = []; render(); showError($('err'), e.message); } }
  }

  function render() {
    const exp = normExpected($('expected').value);
    $('out').innerHTML = resultsTable(results, outEnc, exp);
    const m = $('match');
    const msg = matchMessage(results, exp);
    if (!msg) { m.hidden = true; return; }
    m.hidden = false;
    m.className = `big-result ${msg.ok ? 'ok' : 'bad'}`;
    m.textContent = msg.text;
  }

  const recompute = () => compute();
  $('input').oninput = recompute;
  $('expected').oninput = render;
  $('mode').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    mode = b.dataset.v; setPressed($('mode'), mode);
    $('textField').hidden = mode === 'file'; $('fileField').hidden = mode !== 'file';
    $('input').placeholder = { utf8: 'Type or paste text', hex: 'Hex bytes, e.g. 616263', base64: 'Base64 bytes' }[mode] || '';
    drawAlgos();
    recompute();
  };
  $('outEnc').onclick = e => { const b = e.target.closest('button'); if (!b) return; outEnc = b.dataset.v; setPressed($('outEnc'), outEnc); render(); };
  $('toggleAll').onclick = () => { $('algos').hidden = !$('algos').hidden; };
  $('algos').oninput = e => { const c = e.target; if (c.dataset.id) { c.checked ? current().add(c.dataset.id) : current().delete(c.dataset.id); recompute(); } };
  function setFile(f) { file = f; $('fileInfo').textContent = f ? `${f.name} · ${f.size.toLocaleString()} bytes` : ''; recompute(); }
  $('file').onchange = () => setFile($('file').files[0]);
  // A file dropped anywhere on the page switches to file mode.
  document.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (!e.dataTransfer.files[0]) return;
    e.preventDefault();
    if (mode !== 'file') $('mode').querySelector('[data-v="file"]').click();
    setFile(e.dataTransfer.files[0]);
  });
  wireCopy();
  compute();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // "abc" with its well-known SHA-256 as the expected checksum.
  $('example').onclick = () => {
    exSet('expected', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    if (mode === 'file') { setFile(new File(['abc'], 'example.txt', { type: 'text/plain' })); return; }
    exSet('input', { utf8: 'abc', hex: '616263', base64: 'YWJj' }[mode]); recompute();
  };
}

if (globalThis.document) mount();
