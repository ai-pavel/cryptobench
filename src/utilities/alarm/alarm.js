// Alarm: set one-off or daily alarms that ring in the browser.
const KEY = 'toolbox.alarms';
const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = n => String(n).padStart(2, '0');
export const MISSED_GRACE = 10 * 60 * 1000; // ring alarms missed by less than this when the page reopens

// Next timestamp (ms) at which HH:MM occurs strictly after `after`.
export function nextAt(time, after = Date.now()) {
  const [h, m] = time.split(':').map(Number), d = new Date(after);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= after) d.setDate(d.getDate() + 1);
  return d.getTime();
}
export function untilLabel(ms) {
  const mins = Math.max(0, Math.ceil(ms / 60000)), h = Math.floor(mins / 60), m = mins % 60;
  return 'in ' + (h ? `${h}h ${m}m` : `${m}m`);
}

// The line under an alarm's time: label, repeat and time left.
export function alarmDetails(a, now = Date.now()) {
  return `${a.label ? esc(a.label) + ' · ' : ''}${a.daily ? 'Daily' : 'Once'}${a.enabled ? ' · ' + (a.snoozed ? 'snoozed, ' : '') + untilLabel(a.next - now) : ''}`;
}

// The notification body for a ringing alarm.
export const notificationBody = a => `${a.time}${a.label ? ' · ' + a.label : ''}`;

// A new enabled alarm, or null if the time isn't HH:MM.
export function newAlarm(time, label, daily, now = Date.now()) {
  if (!/^\d\d:\d\d$/.test(time)) return null;
  return { id: now.toString(36) + Math.random().toString(36).slice(2, 6), time, label: label.trim(),
    daily, enabled: true, next: nextAt(time, now) };
}

// On load: recently missed alarms stay due (and ring), older ones are rescheduled or switched off.
export function catchUp(alarms, now = Date.now()) {
  alarms.forEach(a => {
    if (!a.enabled || a.next > now - MISSED_GRACE) return;
    if (a.daily) a.next = nextAt(a.time, now); else a.enabled = false;
  });
  return alarms;
}

function mount() {
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(alarms)); } catch {} }
  let alarms = load(), ringingId = null, audio = null, beepLoop = null;

  // Sound: browsers only allow audio after a user gesture, so unlock on first interaction.
  function unlockAudio() {
    try { audio = audio || new AudioContext(); if (audio.state === 'suspended') audio.resume(); } catch {}
  }
  document.addEventListener('pointerdown', unlockAudio);
  document.addEventListener('keydown', unlockAudio);
  function beep() {
    if (!audio) return;
    try {
      [0, 0.25, 0.5].forEach(t => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 960; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.3, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + t + 0.2);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
      });
    } catch {}
  }

  function ring(a) {
    ringingId = a.id;
    $('ringTime').textContent = a.time;
    $('ringLabel').textContent = a.label || 'Alarm';
    $('ringing').hidden = false;
    document.title = (a.label || 'Alarm') + '!';
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('⏰ Alarm', { body: notificationBody(a), requireInteraction: true }); } catch {}
    }
    beep(); clearInterval(beepLoop); beepLoop = setInterval(beep, 1500);
  }
  function stopRinging() {
    clearInterval(beepLoop); beepLoop = null; ringingId = null;
    $('ringing').hidden = true; document.title = 'Alarm';
  }

  $('dismiss').onclick = () => {
    const a = alarms.find(x => x.id === ringingId);
    if (a) { if (a.daily) a.next = nextAt(a.time); else a.enabled = false; save(); }
    stopRinging(); render();
  };
  $('snooze').onclick = () => {
    const a = alarms.find(x => x.id === ringingId);
    if (a) { a.next = Date.now() + 5 * 60 * 1000; a.snoozed = true; save(); }
    stopRinging(); render();
  };

  function check() {
    const now = Date.now();
    $('clock').textContent = new Date(now).toLocaleTimeString('en-GB');
    if (ringingId) return;
    const due = alarms.find(a => a.enabled && a.next <= now);
    if (due) { due.snoozed = false; save(); ring(due); render(); }
  }

  function render() {
    const now = Date.now();
    alarms.sort((a, b) => a.time.localeCompare(b.time));
    $('empty').hidden = alarms.length > 0;
    $('list').innerHTML = alarms.map(a => `
    <div class="item${a.enabled ? '' : ' off'}">
      <div>
        <div class="big mono">${esc(a.time)}</div>
        <div class="muted">${alarmDetails(a, now)}</div>
      </div>
      <div class="row">
        <label class="switch" title="On/off"><input type="checkbox" data-toggle="${a.id}" ${a.enabled ? 'checked' : ''}> On</label>
        <button class="icon-btn" data-remove="${a.id}" title="Remove">✕</button>
      </div>
    </div>`).join('');
  }

  $('list').onclick = e => {
    const id = e.target.dataset.remove;
    if (id) { if (id === ringingId) stopRinging(); alarms = alarms.filter(a => a.id !== id); save(); render(); }
  };
  $('list').onchange = e => {
    const a = alarms.find(x => x.id === e.target.dataset.toggle);
    if (!a) return;
    a.enabled = e.target.checked; a.snoozed = false;
    if (a.enabled) a.next = nextAt(a.time);
    save(); render();
  };
  $('add').onsubmit = e => {
    e.preventDefault();
    const a = newAlarm($('time').value, $('label').value, $('daily').checked);
    if (!a) return;
    alarms.push(a);
    save(); $('label').value = ''; render();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  };

  catchUp(alarms);
  save();
  const d = new Date(Date.now() + 60000);
  $('time').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  render(); check();
  setInterval(check, 1000);
  setInterval(render, 30000);
}

if (globalThis.document) mount();
