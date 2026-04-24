// Shared ffmpeg.wasm loader for convert-audio and convert-video.
import { FFmpeg } from './ffmpeg/index.js';

const CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/';
const WASM_SIZE = 32232419; // used when the CDN response has no Content-Length

let coreURLs = null; // blob URLs survive terminate(), so the core downloads once per page

async function blobURL(url, type, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const reader = res.body.getReader(), chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); onBytes(value.length);
  }
  return URL.createObjectURL(new Blob(chunks, { type }));
}

// onProgress(fraction 0..1) while downloading the core.
export async function loadFFmpeg(onProgress = () => {}) {
  if (!coreURLs) {
    let got = 0;
    const tick = n => { got += n; onProgress(Math.min(got / (WASM_SIZE + 112000), 1)); };
    const [coreURL, wasmURL] = await Promise.all([
      blobURL(CORE_BASE + 'ffmpeg-core.js', 'text/javascript', tick),
      blobURL(CORE_BASE + 'ffmpeg-core.wasm', 'application/wasm', tick),
    ]);
    coreURLs = { coreURL, wasmURL };
  }
  onProgress(1);
  const ffmpeg = new FFmpeg();
  await ffmpeg.load(coreURLs);
  return ffmpeg;
}

export const isCoreCached = () => !!coreURLs;

// Parses "HH:MM:SS.ms" or seconds into seconds; returns null when empty/invalid.
export function parseTime(s) {
  s = String(s || '').trim();
  if (!s) return null;
  const parts = s.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 ** 2) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB';
  return (n / 1024 ** 3).toFixed(2) + ' GB';
}

export const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Runs one ffmpeg job on a File without copying it into memory (WORKERFS mount).
// The loaded core is reused between jobs; cancel() terminates it.
export class Converter {
  #ffmpeg = null;
  #cancelled = false;

  // buildArgs(inputPath) → ffmpeg args ending with outName.
  // onStage('loading' | 'converting'), onProgress(0..1) for the current stage.
  async run({ file, outName, buildArgs, duration, onStage = () => {}, onProgress = () => {} }) {
    this.#cancelled = false;
    if (!this.#ffmpeg) {
      onStage('loading');
      this.#ffmpeg = await loadFFmpeg(onProgress);
      if (this.#cancelled) { this.#ffmpeg.terminate(); this.#ffmpeg = null; throw new CancelledError(); }
    }
    const ff = this.#ffmpeg, logs = [];
    const onLog = ({ message }) => { logs.push(message); if (logs.length > 80) logs.shift(); };
    const onProg = ({ progress, time }) => {
      const t = time / 1e6; // microseconds
      const frac = duration > 0 && t > 0 ? t / duration : progress;
      if (frac >= 0 && frac <= 1.5) onProgress(Math.min(frac, 1));
    };
    ff.on('log', onLog); ff.on('progress', onProg);
    let mounted = false;
    try {
      onStage('converting'); onProgress(0);
      await ff.createDir('/in').catch(() => {});
      await ff.mount('WORKERFS', { files: [file] }, '/in');
      mounted = true;
      const code = await ff.exec(buildArgs('/in/' + file.name));
      if (code !== 0) throw new Error(lastError(logs));
      const data = await ff.readFile(outName);
      await ff.deleteFile(outName).catch(() => {});
      return data;
    } catch (err) {
      if (this.#cancelled) throw new CancelledError();
      throw err;
    } finally {
      if (this.#ffmpeg === ff) {
        ff.off('log', onLog); ff.off('progress', onProg);
        if (mounted) await ff.unmount('/in').catch(() => {});
      }
    }
  }

  cancel() {
    this.#cancelled = true;
    if (this.#ffmpeg) { this.#ffmpeg.terminate(); this.#ffmpeg = null; }
  }
}

export class CancelledError extends Error {
  constructor() { super('Cancelled'); this.name = 'CancelledError'; }
}

function lastError(logs) {
  const line = [...logs].reverse().find(l => /error|invalid|unknown|not found|unsupported|could not|no such/i.test(l) && !/^\s*(built|configuration|lib)/.test(l));
  return line ? line.trim().replace(/\/in\//g, '') : 'ffmpeg could not convert this file.';
}
