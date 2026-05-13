// Find Duplicates: group files with identical contents by size, then by SHA-256.
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

export const CHUNK = 4 * 1024 * 1024;

/** Same content needs the same size, so only files whose (non-zero) size is shared are candidates. */
export function sizeCandidates(items) {
  const bySize = new Map();
  for (const it of items) if (it.file.size > 0) {
    if (!bySize.has(it.file.size)) bySize.set(it.file.size, []);
    bySize.get(it.file.size).push(it);
  }
  return [...bySize.values()].filter(g => g.length > 1).flat();
}

/**
 * Hash the candidate items ({ file, path }) with a hash-wasm style hasher (init/update/digest)
 * and return the duplicate groups { hash, size, paths }, biggest waste first.
 * Hooks: onFile(i, n) before each file, onBytes(done, total) after each chunk,
 * cancelled() checked before each file (returns null when cancelled).
 */
export async function findDuplicates(candidates, hasher, { onFile, onBytes, cancelled } = {}) {
  const totalBytes = candidates.reduce((s, it) => s + it.file.size, 0) || 1;
  const byHash = new Map();
  let done = 0;
  for (const [i, it] of candidates.entries()) {
    if (cancelled && cancelled()) return null;
    if (onFile) onFile(i, candidates.length);
    hasher.init();
    for (let off = 0; off < it.file.size; off += CHUNK) {
      hasher.update(new Uint8Array(await it.file.slice(off, off + CHUNK).arrayBuffer()));
      done += Math.min(CHUNK, it.file.size - off); if (onBytes) onBytes(done, totalBytes);
    }
    const key = it.file.size + ':' + hasher.digest('hex');
    if (!byHash.has(key)) byHash.set(key, []);
    byHash.get(key).push(it);
  }
  return [...byHash.entries()].filter(([, g]) => g.length > 1).map(([key, g]) => ({
    hash: key.split(':')[1], size: g[0].file.size,
    paths: g.map(it => it.path).sort((a, b) => a.localeCompare(b)),
  })).sort((a, b) => b.size * (b.paths.length - 1) - a.size * (a.paths.length - 1));
}

/** The status line and summary shown after a scan. */
export function scanSummary(groups, scanned, empty) {
  const wasted = groups.reduce((s, g) => s + g.size * (g.paths.length - 1), 0);
  const dupFiles = groups.reduce((s, g) => s + g.paths.length - 1, 0);
  return {
    status: `Scanned ${scanned} file${scanned === 1 ? '' : 's'}.` + (empty ? ` ${empty} empty file${empty === 1 ? '' : 's'} skipped.` : ''),
    summary: groups.length
      ? `${groups.length} duplicate group${groups.length === 1 ? '' : 's'} · ${dupFiles} extra cop${dupFiles === 1 ? 'y' : 'ies'} · ${fmtSize(wasted)} wasted`
      : 'No duplicates found. 🎉',
  };
}

/** The exported CSV: one row per duplicate path. */
export function toCsv(groups) {
  const q = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  const lines = ['group,sha256,size_bytes,path'];
  groups.forEach((g, i) => g.paths.forEach(p => lines.push([i + 1, g.hash, g.size, q(p)].join(','))));
  return lines.join('\n') + '\n';
}

function mount() {
  const $ = id => document.getElementById(id);
  let groups = [], running = 0;

  async function scan(items) {
    const id = ++running;
    $('result').hidden = true;
    const candidates = sizeCandidates(items);
    $('progress').hidden = false; $('progress').value = 0;
    // hash-wasm is loaded as a classic script before this module.
    const hasher = await hashwasm.createSHA256();
    const found = await findDuplicates(candidates, hasher, {
      cancelled: () => id !== running,
      onFile: (i, n) => { $('status').textContent = `Comparing ${i + 1} of ${n} candidate files (${items.length} scanned)…`; },
      onBytes: (done, total) => { $('progress').value = done / total; },
    });
    if (!found) return;
    groups = found;
    $('progress').hidden = true;
    render(items.length, items.filter(it => it.file.size === 0).length);
  }

  function render(scanned, empty) {
    const s = scanSummary(groups, scanned, empty);
    $('status').textContent = s.status;
    $('result').hidden = false;
    $('csv').hidden = !groups.length;
    $('summary').textContent = s.summary;
    $('groups').innerHTML = groups.map(g => `
    <div class="group">
      <header><strong>${g.paths.length} × ${fmtSize(g.size)}</strong><span class="muted">${fmtSize(g.size * (g.paths.length - 1))} wasted</span></header>
      <ul>${g.paths.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      <div class="muted mono" style="font-size:12px;word-break:break-all;margin-top:6px">SHA-256 ${g.hash}</div>
    </div>`).join('');
  }

  function csv() {
    download(new Blob([toCsv(groups)], { type: 'text/csv' }), 'duplicates.csv');
  }

  const drop = $('drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async e => {
    e.preventDefault(); drop.classList.remove('over');
    $('status').textContent = 'Reading folder…';
    scan(await filesFromDrop(e.dataTransfer));
  });
  $('pick-folder').onclick = () => $('folder').click();
  $('pick-files').onclick = () => $('files').click();
  for (const id of ['folder', 'files']) $(id).onchange = e => {
    scan([...e.target.files].map(f => ({ file: f, path: f.webkitRelativePath || f.name }))); e.target.value = '';
  };
  $('csv').onclick = csv;
}

if (globalThis.document) mount();
