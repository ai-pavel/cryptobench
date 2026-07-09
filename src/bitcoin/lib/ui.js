// Small UI helpers shared by the Bitcoin tool pages.
import { InputError } from './btc.js';

export const $ = id => document.getElementById(id);

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Message shown for an error: input errors as-is, anything else prefixed. */
export function errorText(e) {
  return e instanceof InputError ? e.message : `Unexpected error: ${e && e.message ? e.message : e}`;
}

/**
 * Render label/value rows with copy buttons.
 * rows: [{label, value, note?, copy? (default true), cls?}] — falsy rows are skipped.
 */
export function renderRows(el, rows) {
  el.innerHTML = rows.filter(Boolean).map(r => `
    <div class="kv${r.cls ? ' ' + r.cls : ''}">
      <div class="k">${esc(r.label)}</div>
      <div class="v">${esc(r.value)}${r.note ? `<span class="note-inline">${esc(r.note)}</span>` : ''}</div>
      ${r.copy === false ? '<span></span>' : `<button class="icon-btn copy" data-copy="${esc(r.value)}" title="Copy">Copy</button>`}
    </div>`).join('');
}

export function showError(el, e) {
  el.textContent = e ? errorText(e) : '';
  el.hidden = !e;
}

/** Run fn on input changes; route errors to errEl and clear output on error. */
export function live(inputs, fn, { errEl, outEl } = {}) {
  const run = () => {
    try {
      showError(errEl, null);
      fn();
    } catch (e) {
      if (outEl) outEl.innerHTML = '';
      showError(errEl, e);
    }
  };
  // Only 'input' (checkboxes and selects fire it too): re-rendering on 'change'
  // would replace a link the user is clicking right after editing a field.
  for (const el of inputs) el.addEventListener('input', run);
  run();
  return run;
}

// Copy buttons anywhere on the page: data-copy="text" or data-copy-from="elementId".
globalThis.document?.addEventListener('click', async e => {
  const btn = e.target.closest('[data-copy], [data-copy-from]');
  if (!btn) return;
  const text = btn.dataset.copyFrom
    ? ($(btn.dataset.copyFrom).value ?? $(btn.dataset.copyFrom).textContent)
    : btn.dataset.copy;
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied';
  } catch {
    btn.textContent = 'Press ⌘C';
  }
  setTimeout(() => { btn.textContent = label; }, 1200);
});

/** Segmented control: buttons with data-mode inside el; returns getter. */
export function segmented(el, onChange) {
  let value = el.querySelector('[aria-pressed="true"]')?.dataset.mode;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    el.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    value = b.dataset.mode;
    onChange && onChange(value);
  });
  return () => value;
}

/** Read ?key=value from the URL. */
export const param = k => new URLSearchParams(location.search).get(k);
