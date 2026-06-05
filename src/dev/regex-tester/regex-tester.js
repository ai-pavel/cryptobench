// Regex Tester: test a regular expression, see its matches and groups, and try a replacement.
import { $, esc, showError } from '../lib/ui.js';

const TIMEOUT = 1500;

/** Error message for invalid flags, or null. */
export function flagsError(flags) {
  if (!/^[dgimsuvy]*$/.test(flags) || new Set(flags).size !== flags.length) return 'Flags can be d, g, i, m, s, u, v, y, each at most once.';
  return null;
}

export const timeoutMessage = () => `Stopped after ${TIMEOUT / 1000} s: the pattern takes too long on this text (catastrophic backtracking?).`;

/** Status line for the matches found: { cls, text }. */
export function matchStatus(matches, truncated) {
  return {
    cls: 'status ' + (matches.length ? 'ok' : 'warn'),
    text: matches.length ? `${matches.length}${truncated ? '+' : ''} match${matches.length === 1 ? '' : 'es'}` : 'No matches',
  };
}

/** The text as HTML with each (non-overlapping) match wrapped in <mark>; empty matches get a zero-width space. */
export function highlightHtml(text, matches) {
  let html = '', at = 0;
  for (const m of matches) { if (m.index < at) continue; html += esc(text.slice(at, m.index)) + `<mark>${esc(m.text) || '​'}</mark>`; at = m.index + m.text.length; }
  return html + esc(text.slice(at));
}

/** HTML rows of the matches table (first 500 matches), with a column per capturing group. */
export function groupsTableHtml(matches, names) {
  const nGroups = Math.max(0, ...matches.map(m => m.groups.length));
  const head = `<tr><th>#</th><th>Index</th><th>Match</th>${Array.from({ length: nGroups }, (_, i) => `<th>${i + 1}${names[i] ? ' &lt;' + esc(names[i]) + '&gt;' : ''}</th>`).join('')}</tr>`;
  return matches.length ? head + matches.slice(0, 500).map((m, i) => `<tr><td>${i + 1}</td><td>${m.index}</td><td class="mono">${esc(m.text)}</td>${Array.from({ length: nGroups }, (_, g) => `<td class="mono">${m.groups[g] === undefined || m.groups[g] === null ? '<span class="muted">—</span>' : esc(m.groups[g])}</td>`).join('')}</tr>`).join('') : '';
}

function mount() {
  let worker = null, seq = 0, timer = null;
  function newWorker() {
    worker = new Worker('worker.js');
    worker.onmessage = ({ data }) => { if (data.id === seq) { clearTimeout(timer); show(data); } };
  }
  function run() {
    const id = ++seq;
    clearTimeout(timer);
    if (!worker) newWorker();
    const flags = $('flags').value.trim();
    const bad = flagsError(flags);
    if (bad) { fail(bad); return; }
    worker.postMessage({ id, pattern: $('pattern').value, flags, text: $('text').value, replacement: $('repl').value });
    timer = setTimeout(() => {
      worker.terminate(); worker = null;
      fail(timeoutMessage());
    }, TIMEOUT);
  }
  function fail(msg) {
    showError($('err'), { message: msg });
    $('err').textContent = msg;
    $('status').textContent = ''; $('hl').textContent = $('text').value; $('groups').innerHTML = ''; $('replOut').textContent = '';
  }
  function show(d) {
    if (d.error) { fail('Invalid pattern: ' + d.error); return; }
    showError($('err'), null);
    const text = $('text').value, ms = d.matches;
    const status = matchStatus(ms, d.truncated);
    $('status').className = status.cls;
    $('status').textContent = status.text;
    $('hl').innerHTML = highlightHtml(text, ms);
    $('groups').innerHTML = groupsTableHtml(ms, d.groupNames);
    $('replOut').textContent = d.replaced ?? '';
  }
  for (const id of ['pattern', 'flags', 'text', 'repl']) $(id).addEventListener('input', run);
  $('presets').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; $('pattern').value = b.dataset.p; $('flags').value = b.dataset.f || 'g'; run(); });
  run();
}

if (globalThis.document) mount();
