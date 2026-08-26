// Vanity Address: search in worker threads for a keypair whose address starts or ends with chosen characters.
import { keypairFromSeed, base58, kvTable, wireCopy, showError } from '../lib/sol.js';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Probability that one random address character matches c (ignores the slightly skewed first character).
export function matches(c, cs) {
  if (cs) return ALPHABET.includes(c) ? 1 : 0;
  return [...ALPHABET].filter(a => a.toLowerCase() === c.toLowerCase()).length;
}
/** Check a prefix and suffix; returns { error } or the trimmed pattern and the expected number of keys to try. */
export function validate(prefix, suffix, cs) {
  const p = prefix.trim(), s = suffix.trim();
  for (const c of p + s) {
    if (!matches(c, cs)) return { error: `"${c}" can never appear in an address: base58 has no 0, O, I or l.` };
  }
  if (!p && !s) return { error: 'Enter a prefix, a suffix or both.' };
  let expected = 1;
  for (const c of p + s) expected *= 58 / matches(c, cs);
  return { p, s, cs, expected };
}
export const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));
export function dur(sec) {
  if (!isFinite(sec)) return '—';
  if (sec < 60) return Math.round(sec) + ' s';
  if (sec < 3600) return Math.round(sec / 60) + ' min';
  if (sec < 86400) return (sec / 3600).toFixed(1) + ' h';
  if (sec < 86400 * 365) return Math.round(sec / 86400) + ' days';
  return fmt(sec / 86400 / 365) + ' years';
}
/** The estimate line for a valid pattern, given the current speed (keys per second, 0 before a search). */
export const estimateText = (v, lastRate) => `About ${fmt(v.expected)} keys on average` + (lastRate ? ` · roughly ${dur(v.expected / lastRate)} at the current speed.` : '. Speed is shown once the search starts.') + (v.p.length + v.s.length > 6 ? ' Long patterns can take days or longer.' : '');
/** Default thread count: one less than the cores, between 1 and 16. */
export const defaultThreads = cores => Math.max(1, Math.min(16, (cores || 4) - 1));
/** Thread count from the typed value, between 1 and 32. */
export const threadCount = value => Math.max(1, Math.min(32, parseInt(value) || 1));
/** Result rows for a found 32-byte seed. */
export function resultRows(seed) {
  const kp = keypairFromSeed(seed);
  return [
    ['Address', base58.encode(kp.publicKey)],
    ['Secret key (base58)', base58.encode(kp.secretKey)],
    ['Secret key (JSON array)', JSON.stringify(Array.from(kp.secretKey))],
  ];
}

function mount() {
  const $ = id => document.getElementById(id);
  let workers = [], tried = 0, startedAt = 0, ticker;
  $('threads').value = defaultThreads(navigator.hardwareConcurrency);

  let lastRate = 0;
  function showEstimate() {
    const v = validate($('prefix').value, $('suffix').value, $('case').checked);
    if (v.error) { $('estimate').textContent = ''; if ($('prefix').value || $('suffix').value) showError($('err'), v.error); else showError($('err')); return v; }
    showError($('err'));
    $('estimate').textContent = estimateText(v, lastRate);
    return v;
  }
  ['prefix', 'suffix'].forEach(id => $(id).oninput = showEstimate);
  $('case').onchange = showEstimate;

  function stop() {
    workers.forEach(w => w.terminate()); workers = [];
    clearInterval(ticker);
    $('start').disabled = false; $('stop').disabled = true;
  }
  function tick() {
    const sec = (performance.now() - startedAt) / 1000;
    $('tried').textContent = fmt(tried);
    lastRate = tried / Math.max(sec, 0.001);
    $('rate').textContent = fmt(lastRate);
    $('elapsed').textContent = dur(sec);
  }
  $('start').onclick = () => {
    const v = showEstimate();
    if (v.error) return showError($('err'), v.error);
    stop();
    tried = 0; startedAt = performance.now(); $('out').innerHTML = ''; $('stats').hidden = false;
    $('start').disabled = true; $('stop').disabled = false;
    const n = threadCount($('threads').value);
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.onmessage = e => {
        if (e.data.type === 'progress') tried += e.data.tried;
        if (e.data.type === 'found') {
          tried += e.data.tried; tick(); stop();
          $('out').innerHTML = `<p class="ok" style="margin-top:16px">Found after ${fmt(tried)} keys.</p>` + kvTable(resultRows(Uint8Array.from(e.data.seed)));
        }
      };
      w.onerror = e => { stop(); showError($('err'), 'Worker failed: ' + (e.message || 'unknown error')); };
      w.postMessage({ type: 'start', prefix: v.p, suffix: v.s, caseSensitive: v.cs });
      workers.push(w);
    }
    ticker = setInterval(() => { tick(); showEstimate(); }, 500);
  };
  $('stop').onclick = () => { tick(); stop(); };
  // Example: a short two-letter prefix, found in well under a second.
  $('example').onclick = () => {
    $('prefix').value = 'ab'; $('suffix').value = ''; $('case').checked = false;
    showEstimate();
    $('start').click();
  };
  wireCopy();
}

if (globalThis.document) mount();
