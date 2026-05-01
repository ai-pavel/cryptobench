// Break Time: alternate work and break phases with reminders.
const $ = id => document.getElementById(id);
const KEY = 'toolbox.breakTime';
export const PRESETS = {
  eyes: { work: 20 * 60, rest: 20, hint: 'Look at something about 20 feet (6 m) away.' },
  pomodoro: { work: 25 * 60, rest: 5 * 60, hint: 'Stand up, stretch, get some water.' },
  deep: { work: 50 * 60, rest: 10 * 60, hint: 'Take a walk and rest your eyes.' },
  custom: { hint: 'Time for a break.' },
};

// Work and break lengths in seconds; custom minutes are at least 1 (blank or invalid count as 1).
export function durations(preset, workMin, breakMin) {
  if (preset !== 'custom') return PRESETS[preset];
  return { work: Math.max(1, +workMin || 1) * 60, rest: Math.max(1, +breakMin || 1) * 60 };
}

export const pad = n => String(n).padStart(2, '0');
export function fmt(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function mount() {
  function loadPrefs() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify({ preset, work: $('workMin').value, rest: $('breakMin').value })); } catch {} }

  const prefs = loadPrefs();
  let preset = PRESETS[prefs.preset] ? prefs.preset : 'eyes';
  if (prefs.work) $('workMin').value = prefs.work;
  if (prefs.rest) $('breakMin').value = prefs.rest;

  let phase = 'work', endAt = null, remaining = 0, tick = null, breaks = 0;

  const phaseLength = () => {
    const d = durations(preset, $('workMin').value, $('breakMin').value);
    return (phase === 'work' ? d.work : d.rest) * 1000;
  };

  function render() {
    const running = !!tick;
    $('phase').textContent = phase === 'work' ? '💻 Work' : '☕ Break';
    $('phase').className = 'phase' + (phase === 'break' ? ' break' : '');
    $('display').textContent = fmt(remaining);
    $('bar').style.width = (100 * (1 - remaining / phaseLength())) + '%';
    $('hint').textContent = phase === 'break' ? PRESETS[preset].hint : (running ? 'Focus. A break is coming.' : '');
    $('count').textContent = `Breaks taken: ${breaks}`;
    document.title = running ? `${fmt(remaining)} · ${phase === 'work' ? 'Work' : 'Break'}` : 'Break Time';
    document.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', b.dataset.preset === preset));
    $('custom').hidden = preset !== 'custom';
  }

  let audio = null;
  function beep(freqs) {
    try {
      audio = audio || new AudioContext();
      freqs.forEach((f, i) => {
        const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.3;
        o.frequency.value = f; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.start(t); o.stop(t + 0.25);
      });
    } catch {}
  }
  function notify(body) {
    if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('☕ Break Time', { body }); } catch {} }
  }

  function switchPhase(announce = true) {
    if (phase === 'work') { phase = 'break'; breaks++; } else phase = 'work';
    remaining = phaseLength();
    if (tick) endAt = Date.now() + remaining;
    if (announce) {
      if (phase === 'break') { beep([660, 880]); notify('Break time! ' + PRESETS[preset].hint); }
      else { beep([880, 660]); notify('Break is over. Back to work.'); }
    }
    render();
  }
  function onTick() {
    remaining = endAt - Date.now();
    // Catch up on phases that ended while the tab was throttled in the background.
    while (remaining <= 0) { const over = -remaining; switchPhase(); remaining -= over; endAt = Date.now() + remaining; }
    render();
  }
  function start() {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    try { audio = audio || new AudioContext(); audio.resume(); } catch {}
    endAt = Date.now() + remaining;
    tick = setInterval(onTick, 250);
    $('start').textContent = 'Pause';
    render();
  }
  function pause() {
    remaining = endAt - Date.now(); clearInterval(tick); tick = null;
    $('start').textContent = 'Resume'; render();
  }
  function reset() {
    clearInterval(tick); tick = null; phase = 'work'; breaks = 0; remaining = phaseLength();
    $('start').textContent = 'Start'; render();
  }

  $('start').onclick = () => (tick ? pause() : start());
  $('skip').onclick = () => switchPhase(false);
  $('reset').onclick = reset;
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { preset = b.dataset.preset; savePrefs(); reset(); });
  ['workMin', 'breakMin'].forEach(id => $(id).onchange = () => { savePrefs(); if (!tick) { remaining = phaseLength(); render(); } });
  reset();
}

if (globalThis.document) mount();
