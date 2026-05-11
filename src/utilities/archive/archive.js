// Archive: create ZIP archives and extract ZIP, TAR, TAR.GZ and GZ files.
// fflate is loaded as a classic script (global `fflate`) before this module.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
async function filesFromDrop(dt) {
  const entries = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) return [...dt.files].map(f => ({ file: f, path: f.name }));
  const out = [];
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const f = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ file: f, path: prefix + f.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e, prefix + entry.name + '/');
      } while (batch.length);
    }
  }
  for (const e of entries) await walk(e, '');
  return out;
}
const td = new TextDecoder();
export const baseName = p => p.split('/').pop();
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// --- Create ---

/** Make a path unique among `taken` by adding " (2)", " (3)", … before the extension; adds it to `taken`. */
export function uniquePath(path, taken) {
  let p = path, n = 2;
  while (taken.has(p)) p = path.replace(/(\.[^./]*)?$/, m => ` (${n})` + m), n++;
  taken.add(p);
  return p;
}
/** ZIP timestamps only cover 1980–2099. */
export const zipTime = ms => Math.min(Math.max(ms || Date.now(), Date.UTC(1980, 0, 2)), Date.UTC(2099, 11, 30));
/** The download name for the archive: "archive" by default, always ending in .zip. */
export function zipName(raw) {
  let name = raw.trim() || 'archive';
  if (!/\.zip$/i.test(name)) name += '.zip';
  return name;
}

// --- ZIP ---
export function zipFlags(buf) {
  // Read the central directory to detect encrypted entries before extracting.
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This ZIP file is damaged (no central directory).');
  let p = v.getUint32(eocd + 16, true), n = v.getUint16(eocd + 10, true), encrypted = false;
  for (let i = 0; i < n && p + 46 <= buf.length && v.getUint32(p, true) === 0x02014b50; i++) {
    if (v.getUint16(p + 8, true) & 1 || v.getUint16(p + 10, true) === 99) encrypted = true;
    p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return { encrypted };
}
export function readZip(buf) {
  if (zipFlags(buf).encrypted) throw new Error('This ZIP is password-protected. Encrypted archives are not supported.');
  return new Promise((resolve, reject) => fflate.unzip(buf, (err, files) => {
    if (err) return reject(new Error('Could not read the ZIP: ' + err.message));
    resolve(Object.entries(files).filter(([p]) => !p.endsWith('/')).map(([path, data]) => ({ path, data })));
  }));
}

// --- TAR (ustar, GNU long names, pax paths) ---
export const isTar = b => b.length >= 512 && td.decode(b.subarray(257, 262)) === 'ustar';
export function readTar(buf) {
  const out = [], str = (o, l) => { const s = buf.subarray(o, o + l); const z = s.indexOf(0); return td.decode(z < 0 ? s : s.subarray(0, z)); };
  const num = (o, l) => {
    if (buf[o] & 0x80) { let n = 0; for (let i = 1; i < l; i++) n = n * 256 + buf[o + i]; return n; }
    return parseInt(str(o, l).trim() || '0', 8);
  };
  let off = 0, longName = null, paxPath = null;
  while (off + 512 <= buf.length) {
    if (buf.subarray(off, off + 512).every(b => b === 0)) break;
    const size = num(off + 124, 12), type = String.fromCharCode(buf[off + 156] || 48);
    let name = str(off, 100);
    if (str(off + 257, 5) === 'ustar') { const prefix = str(off + 345, 155); if (prefix) name = prefix + '/' + name; }
    const data = buf.subarray(off + 512, off + 512 + size);
    if (data.length < size) throw new Error('This TAR file is truncated.');
    if (type === 'L') longName = td.decode(data).replace(/\0+$/, '');
    else if (type === 'x') {
      for (const rec of td.decode(data).split('\n')) { const m = rec.match(/^\d+ path=(.*)$/); if (m) paxPath = m[1]; }
    } else {
      const path = paxPath || longName || name;
      if (type === '0' || type === '7') out.push({ path, data });
      longName = paxPath = null;
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

/** Detect the format from the magic bytes and list the archive's files as { path, data }. */
export async function readArchive(buf, fileName) {
  let entries;
  if (buf[0] === 0x50 && buf[1] === 0x4b) entries = await readZip(buf);
  else if (buf[0] === 0x1f && buf[1] === 0x8b) {
    let raw;
    try { raw = fflate.gunzipSync(buf); } catch { throw new Error('This GZIP file is damaged.'); }
    if (isTar(raw)) entries = readTar(raw);
    else entries = [{ path: fileName.replace(/\.(gz|tgz)$/i, m => m.toLowerCase() === '.tgz' ? '.tar' : '') || 'file', data: raw }];
  } else if (isTar(buf)) entries = readTar(buf);
  else if (buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72) throw new Error('RAR archives are not supported. Supported: ZIP, TAR, TAR.GZ, GZ.');
  else if (buf[0] === 0x37 && buf[1] === 0x7a) throw new Error('7-Zip archives are not supported. Supported: ZIP, TAR, TAR.GZ, GZ.');
  else throw new Error('This file is not a supported archive. Supported: ZIP, TAR, TAR.GZ, GZ.');
  return entries;
}

/** The archive name without its extension, used for "Download all as ZIP". */
export const archiveBase = name => name.replace(/\.(zip|tar\.gz|tgz|tar|gz)$/i, '') || 'archive';

/** The message shown after opening an archive. */
export function openedMessage(fileName, entries) {
  const total = entries.reduce((s, e) => s + e.data.length, 0);
  return `${fileName}: ${plural(entries.length, 'file')}, ${fmtSize(total)} unpacked.`;
}

/** Indexes of the entries whose path contains the filter text (case-insensitive). */
export function filterEntries(entries, filter) {
  const q = filter.trim().toLowerCase();
  return entries.map((e, i) => [e, i]).filter(([e]) => !q || e.path.toLowerCase().includes(q)).map(([, i]) => i);
}

/** The fflate.zip tree for re-packing extracted entries (stored, leading slashes removed). */
export function repackTree(entries) {
  const tree = {};
  for (const e of entries) tree[e.path.replace(/^\/+/, '')] = [e.data, { level: 0 }];
  return tree;
}

function mountTabs() {
  // Tabs: ?mode=<tab> selects one; switching keeps the rest of the URL.
  const tabs = [...document.querySelectorAll('.mode-tabs [data-tab]')];
  const show = (mode, push) => {
    if (!tabs.some(t => t.dataset.tab === mode)) mode = tabs[0].dataset.tab;
    for (const t of tabs) {
      const on = t.dataset.tab === mode;
      t.setAttribute('aria-selected', String(on));
      document.getElementById('tab-' + t.dataset.tab).hidden = !on;
    }
    if (push) {
      const u = new URL(location.href);
      u.searchParams.set('mode', mode);
      history.replaceState(null, '', u);
    }
    document.dispatchEvent(new CustomEvent('tabchange', { detail: mode }));
  };
  tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.tab, true)));
  show(new URLSearchParams(location.search).get('mode'), false);
}

function mountCreate() {
  const $ = id => document.getElementById('c-' + id);

  let items = [];
  function add(list) {
    const taken = new Set(items.map(i => i.path));
    for (const it of list) items.push({ file: it.file, path: uniquePath(it.path, taken) });
    render();
  }
  function render() {
    $('table').hidden = !items.length;
    $('create').disabled = $('clear').disabled = !items.length;
    $('table').tBodies[0].innerHTML = items.map((it, i) =>
      `<tr><td>${esc(it.path)}</td><td class="mono">${fmtSize(it.file.size)}</td><td><button class="icon-btn" data-remove="${i}" title="Remove">✕</button></td></tr>`).join('');
    $('count').textContent = plural(items.length, 'file');
    $('total').textContent = fmtSize(items.reduce((s, it) => s + it.file.size, 0));
  }

  async function createZip() {
    const level = +$('level').value;
    const total = items.reduce((s, it) => s + it.file.size, 0) || 1;
    let done = 0;
    $('progress').hidden = false; $('progress').value = 0;
    $('create').disabled = true; $('msg').textContent = 'Packing…';
    const blob = await new Promise(async (resolve, reject) => {
      const chunks = [];
      const zip = new fflate.Zip((err, data, final) => {
        if (err) return reject(err);
        chunks.push(data);
        if (final) resolve(new Blob(chunks, { type: 'application/zip' }));
      });
      try {
        for (const it of items) {
          const entry = level ? new fflate.ZipDeflate(it.path, { level }) : new fflate.ZipPassThrough(it.path);
          entry.mtime = zipTime(it.file.lastModified);
          zip.add(entry);
          const reader = it.file.stream().getReader();
          for (;;) {
            const { value, done: end } = await reader.read();
            if (end) break;
            entry.push(value, false);
            done += value.length; $('progress').value = done / total;
          }
          entry.push(new Uint8Array(0), true);
        }
        zip.end();
      } catch (e) { reject(e); }
    });
    const name = zipName($('name').value);
    download(blob, name);
    $('msg').textContent = `Created ${name} (${fmtSize(blob.size)}).`;
    $('create').disabled = false; $('progress').hidden = true;
  }

  const drop = $('drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async e => { e.preventDefault(); drop.classList.remove('over'); add(await filesFromDrop(e.dataTransfer)); });
  $('pick-files').onclick = () => $('files').click();
  $('pick-folder').onclick = () => $('folder').click();
  for (const id of ['files', 'folder']) $(id).onchange = e => {
    add([...e.target.files].map(f => ({ file: f, path: f.webkitRelativePath || f.name }))); e.target.value = '';
  };
  $('table').onclick = e => { const i = e.target.dataset.remove; if (i !== undefined) { items.splice(+i, 1); render(); } };
  $('clear').onclick = () => { items = []; $('msg').textContent = ''; render(); };
  $('create').onclick = () => createZip().catch(e => {
    $('msg').textContent = 'Could not create the archive: ' + e.message;
    $('create').disabled = false; $('progress').hidden = true;
  });
}

function mountExtract() {
  const $ = id => document.getElementById('x-' + id);

  async function open(file) {
    $('result').hidden = true; $('msg').className = 'muted'; $('msg').textContent = `Reading ${file.name}…`;
    const buf = new Uint8Array(await file.arrayBuffer());
    return readArchive(buf, file.name);
  }

  let entries = [], archiveName = 'archive';
  function render() {
    const rows = filterEntries(entries, $('filter').value);
    $('table').tBodies[0].innerHTML = rows.map(i =>
      `<tr><td>${esc(entries[i].path)}</td><td class="mono">${fmtSize(entries[i].data.length)}</td><td><button class="icon-btn" data-get="${i}" title="Download">⬇</button></td></tr>`).join('')
      || '<tr><td colspan="3" class="muted">No matching files.</td></tr>';
  }
  async function handle(file) {
    if (!file) return;
    try {
      entries = await open(file);
      archiveName = archiveBase(file.name);
      $('msg').textContent = openedMessage(file.name, entries);
      $('result').hidden = !entries.length; $('filter').value = ''; render();
    } catch (e) {
      entries = []; $('msg').className = 'error'; $('msg').textContent = e.message;
    }
  }

  const drop = $('drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); handle(e.dataTransfer.files[0]); });
  $('pick').onclick = () => $('file').click();
  $('file').onchange = e => { handle(e.target.files[0]); e.target.value = ''; };
  $('filter').oninput = render;
  $('table').onclick = e => {
    const i = e.target.dataset.get;
    if (i !== undefined) download(new Blob([entries[+i].data]), baseName(entries[+i].path));
  };
  $('all').onclick = () => {
    fflate.zip(repackTree(entries), (err, data) => {
      if (err) { $('msg').textContent = 'Could not build the ZIP: ' + err.message; return; }
      download(new Blob([data], { type: 'application/zip' }), archiveName + '.zip');
    });
  };
}

function mount() {
  mountTabs();
  mountCreate();
  mountExtract();
}

if (globalThis.document) mount();
