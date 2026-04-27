// Timer: count down a set time and beep when it's up.
const $ = id => document.getElementById(id);

export const pad = n => String(n).padStart(2, '0');
export function fmt(ms) {
  const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
// Milliseconds from the hours, minutes and seconds fields (blank or invalid count as 0).
export function toMs(h, m, s) {
  return ((+h || 0) * 3600 + (+m || 0) * 60 + (+s || 0)) * 1000;
}
// A preset (in seconds) split into the hours, minutes and seconds fields.
export function splitSeconds(t) {
  return { h: Math.floor(t / 3600), m: Math.floor(t % 3600 / 60), s: t % 60 };
}

function mount() {
  const display = $('display'), startBtn = $('start');
  let endAt = null, remaining = 300000, tick = null;

  function fromInputs() {
    return toMs($('h').value, $('m').value, $('s').value);
  }
  function render() {
    display.textContent = fmt(remaining);
    document.title = endAt ? `${fmt(remaining)} · Timer` : 'Timer';
  }
  function setInputsDisabled(v) { document.querySelectorAll('#inputs input, [data-preset]').forEach(el => el.disabled = v); }

  function beep() {
    try {
      const ctx = new AudioContext();
      [0, 0.4, 0.8].forEach(t => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.3, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
      });
    } catch {}
  }
  function done() {
    stop(); remaining = 0; setInputsDisabled(false); render(); beep();
    document.title = 'Time is up!';
    if ('Notification' in window && Notification.permission === 'granted') new Notification('⏲️ Timer', { body: 'Time is up!' });
    startBtn.textContent = 'Start';
  }
  function stop() { clearInterval(tick); tick = null; endAt = null; }

  startBtn.onclick = () => {
    if (tick) { // pause
      remaining = endAt - Date.now(); stop(); startBtn.textContent = 'Resume'; render(); return;
    }
    if (remaining <= 0) remaining = fromInputs();
    if (remaining <= 0) return;
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    endAt = Date.now() + remaining; setInputsDisabled(true); startBtn.textContent = 'Pause';
    tick = setInterval(() => { remaining = endAt - Date.now(); remaining <= 0 ? done() : render(); }, 200);
    render();
  };
  $('reset').onclick = () => { stop(); remaining = fromInputs(); setInputsDisabled(false); startBtn.textContent = 'Start'; render(); };
  document.querySelectorAll('#inputs input').forEach(el => el.oninput = () => { remaining = fromInputs(); startBtn.textContent = 'Start'; render(); });
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    const t = +b.dataset.preset, p = splitSeconds(t); $('h').value = p.h; $('m').value = p.m; $('s').value = p.s;
    remaining = t * 1000; startBtn.textContent = 'Start'; render();
  });
  render();
}

if (globalThis.document) mount();
