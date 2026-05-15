// Make GIF: turn a video clip or a set of images into an animated GIF.
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtBytes = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
export const MAX_FRAMES = 300;

// Encoding runs in a worker so the page stays responsive. The worker is a blob, so it
// needs an absolute URL for its import.
export const workerSource = gifencURL => `
import { GIFEncoder, quantize, applyPalette } from '${gifencURL}';
let gif;
onmessage = ({ data }) => {
  if (data.type === 'start') { gif = GIFEncoder(); return; }
  if (data.type === 'frame') {
    const rgba = new Uint8ClampedArray(data.buffer);
    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);
    gif.writeFrame(index, data.width, data.height, { palette, delay: data.delay, repeat: data.repeat });
    postMessage({ type: 'progress', i: data.i });
    return;
  }
  if (data.type === 'finish') {
    gif.finish();
    const bytes = gif.bytes();
    postMessage({ type: 'done', bytes }, [bytes.buffer]);
  }
};`;

// The clip to capture from the Start/End/FPS fields, clamped to the video's duration.
export function videoRange(startValue, endValue, fpsValue, duration) {
  const start = Math.max(0, +startValue || 0), end = Math.min(duration || 0, +endValue || 0);
  const fps = +fpsValue;
  return { start, end, fps, count: Math.max(0, Math.floor((end - start) * fps)) };
}

export function videoHint(count) {
  return count > MAX_FRAMES
    ? `That's ${count} frames — the limit is ${MAX_FRAMES}. Shorten the clip or lower the frame rate.`
    : `${count} frames. Longer clips and larger widths make bigger files.`;
}

// Output width from the Width field (default 480, at most 1920) and the height keeping the aspect ratio.
export const gifWidth = value => Math.min(+value || 480, 1920);
export const gifHeight = (width, srcWidth, srcHeight) => Math.max(1, Math.round(width * srcHeight / srcWidth));

// A frame delay in ms from an input; at least 20.
export const frameDelay = value => Math.max(20, +value || 20);

// Where to draw an image of bw×bh into a width×height frame: contain, centered.
export function containRect(width, height, bw, bh) {
  const s = Math.min(width / bw, height / bh);
  const w = bw * s, h = bh * s;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

// gifenc's repeat: 0 loops forever, -1 plays once.
export const repeatFor = loop => loop ? 0 : -1;

export const resultInfo = (width, height, frames, size) => `${width}×${height} · ${frames} frames · ${fmtBytes(size)}`;

function mount() {
  const $ = id => document.getElementById(id);
  const GIFENC_URL = new URL('../../assets/vendor/gifenc@1.0.3/dist/gifenc.esm.js', location.href).href;
  const workerURL = URL.createObjectURL(new Blob([workerSource(GIFENC_URL)], { type: 'text/javascript' }));

  let tab = 'video', frames = [], nextId = 1, job = null, resultURL = null, videoURL = null;

  // ---------- tabs ----------
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    tab = b.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
    $('tab-video').hidden = tab !== 'video'; $('tab-images').hidden = tab !== 'images';
    updateMake();
  });

  // ---------- drop zones ----------
  document.querySelectorAll('[data-drop]').forEach(zone => {
    zone.ondragover = e => { e.preventDefault(); zone.classList.add('over'); };
    zone.ondragleave = () => zone.classList.remove('over');
    zone.ondrop = e => {
      e.preventDefault(); zone.classList.remove('over');
      const files = [...e.dataTransfer.files];
      zone.dataset.drop === 'video' ? loadVideo(files[0]) : addImages(files);
    };
  });
  $('videoFile').onchange = e => { loadVideo(e.target.files[0]); e.target.value = ''; };
  $('imageFiles').onchange = e => { addImages([...e.target.files]); e.target.value = ''; };

  // ---------- video ----------
  const video = $('video');
  function loadVideo(file) {
    if (!file) return;
    if (videoURL) URL.revokeObjectURL(videoURL);
    videoURL = URL.createObjectURL(file);
    video.src = videoURL;
    video.onloadedmetadata = () => {
      $('videoOpts').hidden = false;
      $('start').value = 0;
      $('end').value = Math.min(video.duration, 3).toFixed(1);
      $('start').max = $('end').max = video.duration.toFixed(1);
      $('vwidth').value = Math.min(video.videoWidth, 480);
      showVideoHint(); updateMake();
    };
    video.onerror = () => alert("This video can't be played by your browser. Try converting it to MP4 first.");
  }
  const range = () => videoRange($('start').value, $('end').value, $('fps').value, video.duration);
  const showVideoHint = () => { $('videoHint').textContent = videoHint(range().count); };
  ['start', 'end', 'fps', 'vwidth'].forEach(id => $(id).addEventListener('input', () => { showVideoHint(); updateMake(); }));
  $('useCurrentStart').onclick = () => { $('start').value = video.currentTime.toFixed(1); showVideoHint(); updateMake(); };
  $('useCurrentEnd').onclick = () => { $('end').value = video.currentTime.toFixed(1); showVideoHint(); updateMake(); };

  const seek = t => new Promise((resolve, reject) => {
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done);
    video.currentTime = t;
    setTimeout(() => reject(new Error('Seeking timed out')), 10000);
  });

  async function* videoFrames(signal) {
    const { start, fps, count } = range();
    const width = gifWidth($('vwidth').value);
    const height = gifHeight(width, video.videoWidth, video.videoHeight);
    const c = new OffscreenCanvas(width, height), ctx = c.getContext('2d', { willReadFrequently: true });
    video.pause();
    for (let i = 0; i < count; i++) {
      if (signal.aborted) return;
      await seek(start + i / fps + 0.0001);
      ctx.drawImage(video, 0, 0, width, height);
      yield { width, height, rgba: ctx.getImageData(0, 0, width, height).data, delay: 1000 / fps, total: count };
    }
  }

  // ---------- images ----------
  async function addImages(files) {
    for (const file of files) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        frames.push({ id: nextId++, name: file.name, bitmap, url: URL.createObjectURL(file), delay: +$('allDelay').value || 500 });
      } catch { alert(`"${file.name}" couldn't be opened as an image.`); }
    }
    if (frames.length) $('imageOpts').hidden = false;
    if (frames.length && !$('iwidth').dataset.touched) $('iwidth').value = Math.min(frames[0].bitmap.width, 480);
    renderFrames(); updateMake();
  }
  function renderFrames() {
    $('frames').innerHTML = frames.map((f, i) => `
    <div class="item frame stack" data-id="${f.id}">
      <div class="thumb">
        <img src="${f.url}" alt="">
        <div class="info">
          <div class="name" title="${esc(f.name)}">${i + 1}. ${esc(f.name)}</div>
          <div class="muted">${f.bitmap.width}×${f.bitmap.height}</div>
        </div>
      </div>
      <div class="row">
        <input type="number" min="20" step="10" value="${f.delay}" data-delay="${f.id}" title="Delay (ms)" aria-label="Delay in milliseconds">
        <button class="icon-btn" data-move="-1" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
        <button class="icon-btn" data-move="1" ${i === frames.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
        <button class="icon-btn" data-remove title="Remove">✕</button>
      </div>
    </div>`).join('');
  }
  $('frames').onclick = e => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    const i = frames.findIndex(f => f.id === +row.dataset.id);
    if (e.target.dataset.move) {
      const j = i + +e.target.dataset.move;
      [frames[i], frames[j]] = [frames[j], frames[i]];
    } else if (e.target.hasAttribute('data-remove')) {
      URL.revokeObjectURL(frames[i].url); frames[i].bitmap.close(); frames.splice(i, 1);
    } else return;
    renderFrames(); updateMake();
  };
  $('frames').oninput = e => {
    const id = +e.target.dataset.delay;
    if (id) frames.find(f => f.id === id).delay = frameDelay(e.target.value);
  };
  $('allDelay').oninput = () => { const d = frameDelay($('allDelay').value); frames.forEach(f => f.delay = d); renderFrames(); };
  $('iwidth').oninput = () => { $('iwidth').dataset.touched = 1; };

  async function* imageFrames(signal) {
    const width = gifWidth($('iwidth').value);
    const first = frames[0].bitmap, height = gifHeight(width, first.width, first.height);
    const c = new OffscreenCanvas(width, height), ctx = c.getContext('2d', { willReadFrequently: true });
    for (const f of frames) {
      if (signal.aborted) return;
      ctx.fillStyle = $('bg').value; ctx.fillRect(0, 0, width, height);
      const r = containRect(width, height, f.bitmap.width, f.bitmap.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(f.bitmap, r.x, r.y, r.w, r.h);
      yield { width, height, rgba: ctx.getImageData(0, 0, width, height).data, delay: f.delay, total: frames.length };
    }
  }

  // ---------- encode ----------
  function updateMake() {
    const ready = tab === 'video'
      ? !$('videoOpts').hidden && range().count >= 1 && range().count <= MAX_FRAMES
      : frames.length >= 1;
    $('make').disabled = !ready || !!job;
  }

  $('make').onclick = async () => {
    const abort = new AbortController(), worker = new Worker(workerURL, { type: 'module' });
    job = { abort, worker };
    $('make').disabled = true; $('cancel').hidden = false; $('progress').hidden = false; $('progress').value = 0;
    $('status').textContent = 'Reading frames…';
    let total = 1, encoded = 0, sent = 0, width = 0, height = 0;
    const finished = new Promise((resolve, reject) => {
      job.reject = reject;
      worker.onerror = e => reject(new Error(e.message || 'The GIF encoder failed to start'));
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') { encoded = data.i + 1; $('progress').value = (sent + encoded) / (2 * total); }
        if (data.type === 'done') resolve(data.bytes);
      };
    });
    finished.catch(() => {}); // a cancel before encoding finishes must not surface as an unhandled rejection
    try {
      worker.postMessage({ type: 'start' });
      const repeat = repeatFor($('loop').checked);
      const source = tab === 'video' ? videoFrames(abort.signal) : imageFrames(abort.signal);
      for await (const f of source) {
        total = f.total; width = f.width; height = f.height;
        worker.postMessage({ type: 'frame', i: sent, width: f.width, height: f.height, delay: Math.round(f.delay), repeat, buffer: f.rgba.buffer }, [f.rgba.buffer]);
        sent++;
        $('status').textContent = `Frame ${sent} of ${total}…`;
        $('progress').value = (sent + encoded) / (2 * total);
      }
      if (abort.signal.aborted) return;
      $('status').textContent = 'Encoding…';
      worker.postMessage({ type: 'finish' });
      const bytes = await finished;
      if (resultURL) URL.revokeObjectURL(resultURL);
      const blob = new Blob([bytes], { type: 'image/gif' });
      resultURL = URL.createObjectURL(blob);
      $('gif').src = resultURL; $('download').href = resultURL;
      $('resultInfo').textContent = resultInfo(width, height, sent, blob.size);
      $('result').hidden = false; $('status').textContent = 'Done.';
    } catch (err) {
      if (!abort.signal.aborted) $('status').textContent = 'Failed: ' + err.message;
    } finally {
      worker.terminate(); job = null;
      if (abort.signal.aborted) $('status').textContent = 'Cancelled.';
      $('cancel').hidden = true; $('progress').hidden = true; updateMake();
    }
  };
  $('cancel').onclick = () => {
    if (!job) return;
    job.abort.abort(); job.worker.terminate(); job.reject(new Error('Cancelled'));
  };
}

if (globalThis.document) mount();
