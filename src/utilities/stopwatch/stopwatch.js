// Stopwatch: measure elapsed time with laps.
const $ = id => document.getElementById(id);

export const pad = (n, w = 2) => String(n).padStart(w, '0');
export function fmt(ms) {
  const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000) % 60, h = Math.floor(ms / 3600000);
  return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s) + '.' + pad(cs);
}
// A lap row's cells: lap number, split since the previous lap, and total.
export function lapRow(laps, total) {
  const prev = laps.length ? laps[laps.length - 1] : 0;
  return { n: laps.length + 1, split: fmt(total - prev), total: fmt(total) };
}

function mount() {
  let startedAt = null, elapsed = 0, raf = null, laps = [];

  const now = () => elapsed + (startedAt ? performance.now() - startedAt : 0);
  function frame() { $('display').textContent = fmt(now()); raf = requestAnimationFrame(frame); }

  function toggle() {
    if (startedAt) {
      elapsed = now(); startedAt = null; cancelAnimationFrame(raf);
      $('start').textContent = 'Start'; $('lap').disabled = true;
      $('display').textContent = fmt(elapsed);
    } else {
      startedAt = performance.now(); frame();
      $('start').textContent = 'Stop'; $('lap').disabled = false;
    }
  }
  function lap() {
    if (!startedAt) return;
    const total = now(), row = lapRow(laps, total);
    laps.push(total);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.n}</td><td class="mono">${row.split}</td><td class="mono">${row.total}</td>`;
    $('laps').tBodies[0].prepend(tr); $('laps').hidden = false;
  }
  function reset() {
    cancelAnimationFrame(raf); startedAt = null; elapsed = 0; laps = [];
    $('display').textContent = fmt(0); $('start').textContent = 'Start'; $('lap').disabled = true;
    $('laps').tBodies[0].innerHTML = ''; $('laps').hidden = true;
  }
  $('start').onclick = toggle; $('lap').onclick = lap; $('reset').onclick = reset;
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey) return;
    if (e.target.tagName === 'BUTTON') e.target.blur();
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.key === 'l' || e.key === 'L') lap();
    else if (e.key === 'r' || e.key === 'R') reset();
  });
}

if (globalThis.document) mount();
