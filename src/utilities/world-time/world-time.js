// World Time: the current time in several time zones, compared with local time.
const KEY = 'toolbox.worldTime';
export const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
// Browsers often list legacy IANA names; offer the current ones instead.
export const RENAMED = { 'Asia/Calcutta': 'Asia/Kolkata', 'Europe/Kiev': 'Europe/Kyiv', 'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Rangoon': 'Asia/Yangon', 'America/Godthab': 'America/Nuuk',
  'Atlantic/Faeroe': 'Atlantic/Faroe', 'Pacific/Truk': 'Pacific/Chuuk', 'Pacific/Ponape': 'Pacific/Pohnpei' };
export const validZone = z => { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; } };
export const allZones = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [])
  .map(z => RENAMED[z] && validZone(RENAMED[z]) ? RENAMED[z] : z);
export const DEFAULTS = ['America/New_York', 'Europe/London', 'Asia/Tokyo'];

export const city = z => z.split('/').pop().replace(/_/g, ' ');

export function offsetMinutes(zone, date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'
  }).formatToParts(date).map(p => [p.type, p.value]));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((asUtc - date.getTime()) / 60000);
}
export function diffLabel(zone, date, local = localZone) {
  const d = offsetMinutes(zone, date) - offsetMinutes(local, date);
  if (!d) return 'Same as local';
  const h = Math.floor(Math.abs(d) / 60), m = Math.abs(d) % 60;
  return (d > 0 ? '+' : '−') + h + 'h' + (m ? ' ' + m + 'm' : '') + ' from local';
}
// The zone a typed name refers to: a listed zone or city name (any case), or any valid Area/City zone; null if none.
export function findZone(text, zones = allZones) {
  const q = text.trim().toLowerCase();
  const raw = text.trim().replace(/ /g, '_');
  return zones.find(z => z.toLowerCase() === q) || zones.find(z => city(z).toLowerCase() === q)
    || (raw.includes('/') && validZone(raw) ? raw : null);
}

function mount() {
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || DEFAULTS; } catch { return DEFAULTS; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(zones)); } catch {} }
  let zones = load();

  document.getElementById('zones').innerHTML = allZones.map(z => `<option value="${z}">${city(z)}</option>`).join('');

  function render() {
    const now = new Date();
    const rows = [localZone, ...zones.filter(z => z !== localZone)];
    document.getElementById('list').innerHTML = rows.map(z => `
    <div class="item">
      <div>
        <div><strong>${city(z)}</strong>${z === localZone ? ' <span class="muted">· local</span>' : ''}</div>
        <div class="muted">${now.toLocaleDateString('en-US', { timeZone: z, weekday: 'short', month: 'short', day: 'numeric' })} · ${diffLabel(z, now)}</div>
      </div>
      <div class="row">
        <span class="big mono">${now.toLocaleTimeString('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit' })}</span>
        ${z === localZone ? '' : `<button class="icon-btn" data-remove="${z}" title="Remove">✕</button>`}
      </div>
    </div>`).join('');
  }

  document.getElementById('list').onclick = e => {
    const z = e.target.dataset.remove;
    if (z) { zones = zones.filter(x => x !== z); save(); render(); }
  };
  document.getElementById('add').onsubmit = e => {
    e.preventDefault();
    const input = document.getElementById('zone');
    const match = findZone(input.value);
    document.getElementById('error').hidden = !!match;
    if (!match) return;
    if (!zones.includes(match)) { zones.push(match); save(); }
    input.value = ''; render();
  };
  render();
  setInterval(render, 1000);
}

if (globalThis.document) mount();
