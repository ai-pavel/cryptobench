// Small UI helpers shared by the Polkadot tool pages.
export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Rows: [label, value, {copy: true (default), note}] → key/value table with copy buttons.
export function kv(rows) {
  return `<table class="kv"><tbody>${rows.filter(Boolean).map(([k, v, o = {}]) => `
    <tr><th>${esc(k)}</th><td class="mono">${esc(v)}${o.note ? `<div class="muted">${esc(o.note)}</div>` : ''}</td>
    <td>${o.copy === false || v === '' ? '' : `<button type="button" class="icon-btn copy" data-copy="${esc(v)}">Copy</button>`}</td></tr>`).join('')}</tbody></table>`;
}

export function showError(el, err) {
  if (!err) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false; el.textContent = err.message || String(err);
}

// One delegated handler for every copy button on the page.
globalThis.document?.addEventListener('click', async e => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const label = b.dataset.label || b.textContent;
  b.dataset.label = label;
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; }
  catch { b.textContent = 'Press ⌘C'; }
  setTimeout(() => { b.textContent = label; }, 1200);
});

// Parse message input as text or hex.
export function bytesFromInput(value, encoding, utf8, fromHex) {
  return encoding === 'hex' ? fromHex(value, 'message') : utf8(value);
}

// Select for SS58 networks; returns the <select> element filled with options.
export function fillNetworks(select, networks, def = 0) {
  select.innerHTML = networks.map((n, i) => `<option value="${i}">${esc(n.name)} (${n.prefix})</option>`).join('') + '<option value="custom">Custom prefix…</option>';
  select.value = String(def);
}
