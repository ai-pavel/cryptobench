// Resize Images: scale, convert and compress images on the device, and zip the results.
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtBytes = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
export const FORMATS = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP', 'image/avif': 'AVIF' };
export const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
export const HINTS = {
  fit: 'Images are scaled down to fit inside the box, keeping their proportions. Smaller images are not enlarged.',
  percent: 'Both sides are scaled by the same percentage.',
  exact: 'Images are stretched to exactly this size.',
  none: 'Only the format and quality change.',
};

/**
 * The output size of a w×h image for a resize mode (fit, percent, exact, none)
 * and the raw Width, Height and Percentage field values.
 */
export function targetSize(w, h, { mode, width, height, pct }) {
  if (mode === 'none') return [w, h];
  if (mode === 'percent') { const p = Math.max(+pct || 100, 1) / 100; return [Math.max(1, Math.round(w * p)), Math.max(1, Math.round(h * p))]; }
  const W = Math.max(+width || w, 1), H = Math.max(+height || h, 1);
  if (mode === 'exact') return [Math.round(W), Math.round(H)];
  const s = Math.min(W / w, H / h, 1);
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

// Halving steps keep downscaled images sharp instead of aliased: the intermediate sizes.
export function halvingSteps(sw, sh, tw, th) {
  const steps = [];
  while (sw / 2 >= tw && sh / 2 >= th) {
    sw = Math.round(sw / 2); sh = Math.round(sh / 2);
    steps.push([sw, sh]);
  }
  return steps;
}

export function outName(fileName, type) {
  return fileName.replace(/\.[^.]+$/, '') + '.' + EXT[type];
}

// Names inside the ZIP: a repeated name gets -2, -3, … before its extension.
export function uniqueName(name, used) {
  let unique = name, n = 1;
  while (used.has(unique)) unique = name.replace(/(\.[^.]+)$/, `-${++n}$1`);
  used.add(unique);
  return unique;
}

// Size change in whole percent, negative when the output is smaller.
export const sizeChange = (before, after) => Math.round((after / before - 1) * 100);

export function totalText(done) {
  const before = done.reduce((s, i) => s + i.before, 0), after = done.reduce((s, i) => s + i.after, 0);
  return done.length ? `${done.length} image${done.length > 1 ? 's' : ''} · ${fmtBytes(before)} → ${fmtBytes(after)}` : '';
}

// Whether a file is worth trying to open as an image.
export const isImageFile = file => file.type.startsWith('image/') || /\.(heic|heif|avif)$/i.test(file.name);

function mount() {
  const $ = id => document.getElementById(id);

  let items = []; // { id, file, bitmap, w, h, out: { blob, w, h, url } }
  let nextId = 1, generation = 0;

  // Formats the browser's canvas can actually encode.
  async function supportedFormats() {
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const ok = [];
    for (const type of Object.keys(FORMATS)) {
      const blob = await new Promise(r => c.toBlob(r, type));
      if (blob && blob.type === type) ok.push(type);
    }
    return ok;
  }

  const target = (w, h) => targetSize(w, h, { mode: $('mode').value, width: $('w').value, height: $('h').value, pct: $('pct').value });

  function draw(bitmap, tw, th, type) {
    let src = bitmap;
    for (const [sw, sh] of halvingSteps(bitmap.width, bitmap.height, tw, th)) {
      const c = new OffscreenCanvas(sw, sh), x = c.getContext('2d');
      x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
      src = c;
    }
    const out = document.createElement('canvas'); out.width = tw; out.height = th;
    const ctx = out.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, tw, th); } // JPEG has no transparency
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, tw, th);
    return out;
  }

  async function process(item, gen) {
    const type = $('format').value, q = +$('quality').value / 100;
    const [tw, th] = target(item.w, item.h);
    const canvas = draw(item.bitmap, tw, th, type);
    const blob = await new Promise(r => canvas.toBlob(r, type, q));
    if (gen !== generation) return;
    if (item.out) URL.revokeObjectURL(item.out.url);
    item.out = { blob, w: tw, h: th, url: URL.createObjectURL(blob) };
  }

  const itemName = item => outName(item.file.name, $('format').value);

  function render() {
    $('actions').hidden = !items.length;
    $('list').innerHTML = items.map(it => {
      const o = it.out;
      const change = o ? sizeChange(it.file.size, o.blob.size) : 0;
      return `
    <div class="item stack" data-id="${it.id}">
      <div class="thumb">
      <img src="${it.thumb}" alt="">
      <div class="info">
        <div class="name" title="${esc(it.file.name)}">${esc(it.file.name)}</div>
        <div class="muted">${it.w}×${it.h} · ${fmtBytes(it.file.size)}</div>
        <div class="muted">${o ? `→ ${o.w}×${o.h} · ${fmtBytes(o.blob.size)} <span class="${change <= 0 ? 'smaller' : 'bigger'}">(${change > 0 ? '+' : ''}${change}%)</span>` : 'Processing…'}</div>
      </div>
      </div>
      <div class="row">
        ${o ? `<a class="btn" download="${esc(itemName(it))}" href="${o.url}">Download</a>` : ''}
        <button class="icon-btn" data-remove="${it.id}" title="Remove">✕</button>
      </div>
    </div>`;
    }).join('');
    $('total').textContent = totalText(items.filter(i => i.out).map(i => ({ before: i.file.size, after: i.out.blob.size })));
  }

  async function processAll() {
    const gen = ++generation;
    items.forEach(i => i.out && (URL.revokeObjectURL(i.out.url), i.out = null));
    render();
    for (const it of items) {
      await process(it, gen);
      if (gen !== generation) return;
      render();
    }
  }

  async function addFiles(files) {
    const bad = [];
    for (const file of files) {
      if (!isImageFile(file)) { bad.push(file.name); continue; }
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const t = document.createElement('canvas'), s = 112 / Math.max(bitmap.width, bitmap.height);
        t.width = Math.max(1, Math.round(bitmap.width * s)); t.height = Math.max(1, Math.round(bitmap.height * s));
        t.getContext('2d').drawImage(bitmap, 0, 0, t.width, t.height);
        items.push({ id: nextId++, file, bitmap, w: bitmap.width, h: bitmap.height, thumb: t.toDataURL('image/png') });
      } catch { bad.push(file.name); }
    }
    if (bad.length) alert("These files couldn't be opened as images:\n" + bad.join('\n'));
    processAll();
  }

  function syncMode() {
    const mode = $('mode').value;
    document.querySelectorAll('[data-mode]').forEach(l => l.hidden = !l.dataset.mode.split(' ').includes(mode));
    $('modeHint').textContent = HINTS[mode];
  }
  function syncQuality() {
    $('qv').textContent = $('quality').value;
    $('qualityLabel').style.opacity = $('format').value === 'image/png' ? 0.4 : 1;
    $('quality').disabled = $('format').value === 'image/png';
  }

  let debounce;
  const onSettings = () => { syncMode(); syncQuality(); clearTimeout(debounce); debounce = setTimeout(processAll, 250); };
  ['mode', 'w', 'h', 'pct', 'format', 'quality'].forEach(id => $(id).addEventListener('input', onSettings));

  $('files').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  const drop = $('drop');
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); };

  $('list').onclick = e => {
    const id = +e.target.dataset.remove;
    if (!id) return;
    const it = items.find(i => i.id === id);
    if (it?.out) URL.revokeObjectURL(it.out.url);
    it?.bitmap.close();
    items = items.filter(i => i.id !== id); render();
  };
  $('clear').onclick = () => { generation++; items.forEach(i => { i.bitmap.close(); i.out && URL.revokeObjectURL(i.out.url); }); items = []; render(); };
  $('zip').onclick = async () => {
    const done = items.filter(i => i.out);
    if (!done.length) return;
    $('zip').disabled = true; $('zip').textContent = 'Zipping…';
    try {
      const { zipSync } = await import('../../assets/vendor/fflate@0.8.3/esm/browser.js');
      const files = {}, used = new Set();
      for (const it of done) {
        const name = uniqueName(itemName(it), used);
        files[name] = [new Uint8Array(await it.out.blob.arrayBuffer()), { level: 0 }]; // images are already compressed
      }
      const url = URL.createObjectURL(new Blob([zipSync(files)], { type: 'application/zip' }));
      const a = document.createElement('a'); a.href = url; a.download = 'resized-images.zip'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) { alert('Could not create the ZIP: ' + err.message); }
    $('zip').disabled = false; $('zip').textContent = 'Download all (ZIP)';
  };

  syncMode(); syncQuality();
  // JPEG, PNG and WebP are listed up front; drop any the canvas can't encode and add AVIF where it can.
  supportedFormats().then(ok => {
    const current = $('format').value;
    $('format').innerHTML = ok.map(t => `<option value="${t}">${FORMATS[t]}</option>`).join('');
    $('format').value = ok.includes(current) ? current : 'image/jpeg';
  });
}

if (globalThis.document) mount();
