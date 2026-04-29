// Date Countdown: count down to (or up from) saved dates.
const KEY = 'toolbox.dateCountdown';

export const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function span(ms) {
  const t = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}
// Time left until `at`, or time since it with " ago" once it has passed.
export const countdownLabel = (at, now) => at - now >= 0 ? span(at - now) : span(at - now) + ' ago';

function mount() {
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {} }
  let items = load();

  function render() {
    const now = Date.now();
    items.sort((a, b) => a.at - b.at);
    document.getElementById('empty').hidden = items.length > 0;
    document.getElementById('list').innerHTML = items.map((it, i) => {
      return `
    <div class="item stack">
      <div>
        <div><strong>${esc(it.name)}</strong></div>
        <div class="muted">${new Date(it.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
      </div>
      <div class="row">
        <span class="big mono">${countdownLabel(it.at, now)}</span>
        <button class="icon-btn" data-remove="${i}" title="Remove">✕</button>
      </div>
    </div>`;
    }).join('');
  }

  document.getElementById('list').onclick = e => {
    const i = e.target.dataset.remove;
    if (i !== undefined) { items.splice(+i, 1); save(); render(); }
  };
  document.getElementById('add').onsubmit = e => {
    e.preventDefault();
    const at = new Date(document.getElementById('when').value).getTime();
    if (isNaN(at)) return;
    items.push({ name: document.getElementById('name').value.trim(), at });
    save(); e.target.reset(); render();
  };
  render();
  setInterval(render, 1000);
}

if (globalThis.document) mount();
