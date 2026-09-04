// Shared UI helpers for the TON tools.
export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// One result row: label, monospace value and a Copy button.
export function row(label, value, note = '') {
  return `<div class="kv-row"><div class="kv-label">${esc(label)}</div>` +
    `<div class="kv-value">${esc(value)}</div>` +
    `<button class="icon-btn" data-copy="${esc(value)}" type="button">Copy</button>` +
    (note ? `<div class="kv-note">${esc(note)}</div>` : '') + `</div>`;
}

export function showError(el, err) {
  el.textContent = err ? (err.message || String(err)) : '';
  el.hidden = !err;
}

// Copy buttons anywhere on the page: <button data-copy="text">.
globalThis.document?.addEventListener('click', async e => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const text = b.dataset.copy;
  try { await navigator.clipboard.writeText(text); } catch {
    const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select();
    try { document.execCommand('copy'); } catch {} t.remove();
  }
  const old = b.textContent; b.textContent = 'Copied'; setTimeout(() => (b.textContent = old), 1200);
});

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
