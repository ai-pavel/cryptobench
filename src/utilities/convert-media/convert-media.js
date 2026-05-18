// Convert Media: convert video and audio between formats with ffmpeg.wasm, trimming optionally.
import { Converter, CancelledError, parseTime, formatBytes, escapeHTML } from '../vendor/ffmpeg/loader.js';

export const CRF = { x264: { high: 20, medium: 26, low: 32 }, vp8: { high: 8, medium: 16, low: 30 } };
export const MIME = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg' };

export const CODECS = {
  mp3: { args: ['-c:a', 'libmp3lame'], bitrate: true, mime: 'audio/mpeg' },
  m4a: { args: ['-c:a', 'aac'], bitrate: true, mime: 'audio/mp4' },
  ogg: { args: ['-c:a', 'libvorbis'], bitrate: true, mime: 'audio/ogg' },
  opus: { args: ['-c:a', 'libopus'], bitrate: true, mime: 'audio/ogg' },
  flac: { args: ['-c:a', 'flac'], bitrate: false, mime: 'audio/flac' },
  wav: { args: ['-c:a', 'pcm_s16le'], bitrate: false, mime: 'audio/wav' },
};

/**
 * Parse the trim fields. Returns { start, end } in seconds (null when empty);
 * throws with the message shown to the user when they are invalid.
 */
export function parseTrim(startText, endText) {
  const start = parseTime(startText), end = parseTime(endText);
  if (startText.trim() && start === null || endText.trim() && end === null) throw new Error('Check the trim times.');
  if (start !== null && end !== null && end <= start) throw new Error('Trim end must be after the start.');
  return { start, end };
}

// Length of the output for the progress bar; 0 when unknown.
export function clipLength(start, end, duration) {
  const length = (end ?? duration) - (start ?? 0);
  return length > 0 ? length : 0;
}

// Input-side -ss seeks quickly; -t then limits the length.
export function trimArgs(start, end, input) {
  return [
    ...(start !== null ? ['-ss', String(start)] : []),
    '-i', input,
    ...(end !== null ? ['-t', String(end - (start ?? 0))] : []),
  ];
}

// Video tab: codec args for a format, max height (0 = original) and quality.
export function codecArgs(fmt, res, quality) {
  if (fmt === 'mp3') return ['-vn', '-c:a', 'libmp3lame', '-b:a', '192k'];
  const h = +res, q = quality;
  // Even dimensions are required by yuv420p; -2 keeps the aspect ratio.
  const scale = h ? `scale=-2:'trunc(min(ih,${h})/2)*2'` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const maps = ['-map', '0:v:0', '-map', '0:a:0?'];
  if (fmt === 'webm') return [...maps, '-vf', scale, '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8',
    '-crf', String(CRF.vp8[q]), '-b:v', '4M', '-c:a', 'libopus', '-b:a', '96k'];
  return [...maps, '-vf', scale, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(CRF.x264[q]),
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'];
}

export function videoArgs({ input, start, end, fmt, res, quality }) {
  return [...trimArgs(start, end, input), ...codecArgs(fmt, res, quality), 'output.' + fmt];
}

export function audioArgs({ input, start, end, fmt, bitrate }) {
  const codec = CODECS[fmt];
  return [
    ...trimArgs(start, end, input),
    '-vn', '-map_metadata', '0',
    ...codec.args,
    ...(codec.bitrate ? ['-b:a', bitrate + 'k'] : []),
    'output.' + fmt,
  ];
}

const baseName = name => name.replace(/\.[^.]+$/, '');
export const videoFileName = (name, fmt) => baseName(name) + (fmt === 'mp3' ? '' : '-converted') + '.' + fmt;
export const audioFileName = (name, fmt) => baseName(name) + '.' + fmt;

export function resultInfo(name, size, fmt) {
  return `${escapeHTML(name)} · ${formatBytes(size)}` + (fmt === 'mov' ? ' · MOV may not preview in every browser' : '');
}

export const stageText = s => s === 'loading' ? 'Loading converter (~32 MB, only once)…' : 'Converting…';
export const errorText = err => err instanceof CancelledError ? 'Cancelled.' : 'Failed: ' + err.message;

// Fallback when the browser can't read the file's metadata: guess from its type and name.
export function looksLikeVideo(file) {
  return file.type.startsWith('video/') || /\.(mkv|avi|flv|wmv|m4v|3gp|ts|mov|mp4|webm)$/i.test(file.name);
}

// Tabs: ?mode=<tab> selects one; switching keeps the rest of the URL.
function mountTabs() {
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

// Shared by both tabs: the file picker and drop zone of one tab.
function mountFile($, onFile) {
  $('file').onchange = e => { onFile(e.target.files[0]); e.target.value = ''; };
  const drop = $('drop');
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); onFile(e.dataTransfer.files[0]); };
  document.addEventListener('mediafile', e => onFile(e.detail));
}

// The browser may know the duration; it only improves the progress bar.
function probeDuration(f, onDuration) {
  const probe = document.createElement('video'), url = URL.createObjectURL(f);
  probe.preload = 'metadata';
  probe.onloadedmetadata = () => { if (isFinite(probe.duration)) onDuration(probe.duration); URL.revokeObjectURL(url); };
  probe.onerror = () => URL.revokeObjectURL(url);
  probe.src = url;
}

function mountVideo() {
  const $ = id => document.getElementById('v-' + id);
  const __sec = document.getElementById('tab-video');
  const converter = new Converter();
  let file = null, duration = 0, resultURL = null, busy = false;

  function setFile(f) {
    if (!f) return;
    file = f; duration = 0;
    $('dropTitle').textContent = f.name;
    $('dropInfo').textContent = formatBytes(f.size) + ' · click to choose another file';
    $('sizeWarn').hidden = f.size < 300 * 1024 * 1024;
    probeDuration(f, d => duration = d);
    $('convert').disabled = busy;
    $('status').textContent = '';
  }
  mountFile($, setFile);

  const syncFormat = () => __sec.querySelectorAll('[data-video]').forEach(l => l.hidden = $('format').value === 'mp3');
  $('format').onchange = syncFormat;

  $('convert').onclick = async () => {
    const fmt = $('format').value;
    let start, end;
    try { ({ start, end } = parseTrim($('start').value, $('end').value)); } catch (err) { $('status').textContent = err.message; return; }
    const outName = 'output.' + fmt;

    busy = true; $('convert').disabled = true; $('cancel').hidden = false; $('progress').hidden = false; $('result').hidden = true;
    try {
      const data = await converter.run({
        file, outName, duration: clipLength(start, end, duration),
        buildArgs: input => videoArgs({ input, start, end, fmt, res: $('res').value, quality: $('quality').value }),
        onStage: s => $('status').textContent = stageText(s),
        onProgress: p => { $('progress').value = p; if ($('status').textContent.startsWith('Converting')) $('status').textContent = `Converting… ${Math.round(p * 100)}%`; },
      });
      if (resultURL) URL.revokeObjectURL(resultURL);
      const blob = new Blob([data], { type: MIME[fmt] });
      resultURL = URL.createObjectURL(blob);
      const name = videoFileName(file.name, fmt);
      const isAudio = fmt === 'mp3';
      $('player').hidden = isAudio; $('audioPlayer').hidden = !isAudio;
      (isAudio ? $('audioPlayer') : $('player')).src = resultURL;
      $('download').href = resultURL; $('download').download = name;
      $('resultInfo').innerHTML = resultInfo(name, blob.size, fmt);
      $('result').hidden = false; $('status').textContent = 'Done.';
    } catch (err) {
      $('status').textContent = errorText(err);
    } finally {
      busy = false; $('convert').disabled = !file; $('cancel').hidden = true; $('progress').hidden = true;
    }
  };
  $('cancel').onclick = () => converter.cancel();
  syncFormat();
}

function mountAudio() {
  const $ = id => document.getElementById('a-' + id);
  const converter = new Converter();
  let file = null, duration = 0, resultURL = null, busy = false;

  function setFile(f) {
    if (!f) return;
    file = f; duration = 0;
    $('dropTitle').textContent = f.name;
    $('dropInfo').textContent = formatBytes(f.size) + ' · click to choose another file';
    probeDuration(f, d => duration = d);
    $('convert').disabled = busy;
    $('status').textContent = '';
  }
  mountFile($, setFile);

  const syncBitrate = () => { const b = CODECS[$('format').value].bitrate; $('bitrate').disabled = !b; $('bitrateLabel').style.opacity = b ? 1 : 0.4; };
  $('format').onchange = syncBitrate;

  $('convert').onclick = async () => {
    const fmt = $('format').value, codec = CODECS[fmt];
    let start, end;
    try { ({ start, end } = parseTrim($('start').value, $('end').value)); } catch (err) { $('status').textContent = err.message; return; }
    const outName = 'output.' + fmt;

    busy = true; $('convert').disabled = true; $('cancel').hidden = false; $('progress').hidden = false; $('result').hidden = true;
    try {
      const data = await converter.run({
        file, outName, duration: clipLength(start, end, duration),
        buildArgs: input => audioArgs({ input, start, end, fmt, bitrate: $('bitrate').value }),
        onStage: s => $('status').textContent = stageText(s),
        onProgress: p => $('progress').value = p,
      });
      if (resultURL) URL.revokeObjectURL(resultURL);
      const blob = new Blob([data], { type: codec.mime });
      resultURL = URL.createObjectURL(blob);
      const name = audioFileName(file.name, fmt);
      $('player').src = resultURL;
      $('download').href = resultURL; $('download').download = name;
      $('resultInfo').innerHTML = resultInfo(name, blob.size, fmt);
      $('result').hidden = false; $('status').textContent = 'Done.';
    } catch (err) {
      $('status').textContent = errorText(err);
    } finally {
      busy = false; $('convert').disabled = !file; $('cancel').hidden = true; $('progress').hidden = true;
    }
  };
  $('cancel').onclick = () => converter.cancel();
  syncBitrate();
}

// One file input for both halves: detect whether the file has a video track,
// hand the file to both converters and open the matching tab.
function mountPicker() {
  const drop = document.getElementById('media-drop'), input = document.getElementById('media-file');
  const videoTab = document.querySelector('.mode-tabs [data-tab="video"]');
  const audioTab = document.querySelector('.mode-tabs [data-tab="audio"]');
  function hasVideo(file) {
    return new Promise(resolve => {
      const v = document.createElement('video'), url = URL.createObjectURL(file);
      const done = r => { clearTimeout(t); URL.revokeObjectURL(url); v.removeAttribute('src'); resolve(r); };
      const t = setTimeout(() => done(file.type.startsWith('video/')), 4000);
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = () => done(v.videoWidth > 0);
      v.onerror = () => done(looksLikeVideo(file));
      v.src = url;
    });
  }
  async function pick(file) {
    if (!file) return;
    document.getElementById('media-title').textContent = file.name;
    document.getElementById('media-info').textContent = formatBytes(file.size) + ' · checking…';
    const video = await hasVideo(file);
    document.getElementById('media-info').textContent = formatBytes(file.size) + (video ? ' · video' : ' · audio');
    document.dispatchEvent(new CustomEvent('mediafile', { detail: file }));
    videoTab.hidden = !video;
    (video ? videoTab : audioTab).click();
  }
  input.onchange = e => { pick(e.target.files[0]); e.target.value = ''; };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); };
}

function mount() {
  mountTabs();
  mountVideo();
  mountAudio();
  mountPicker();
}

if (globalThis.document) mount();
