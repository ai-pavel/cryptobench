// Time zone helpers built on Intl (no libraries): wall-clock parts, offsets and formatting.

const formatters = new Map();
function partsFormatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
    }));
  }
  return formatters.get(tz);
}
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of a UTC instant in a time zone. Years outside 1..9999 aren't supported by Intl in all browsers. */
export function wallParts(ms, tz) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(ms))) p[type] = value;
  return {
    year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second,
    weekday: WEEKDAYS[p.weekday], ms: ((ms % 1000) + 1000) % 1000,
  };
}

/** Offset of the zone from UTC at an instant, in minutes. */
export function offsetMinutes(ms, tz) {
  const w = wallParts(ms, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, w.ms);
  // Date.UTC treats years 0-99 as 1900+; fix them up.
  const fixed = w.year < 100 ? new Date(asUtc).setUTCFullYear(w.year) : asUtc;
  return Math.round((fixed - ms) / 60000);
}

export function formatOffset(min) {
  const sign = min < 0 ? '-' : '+', a = Math.abs(min);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/**
 * UTC instant of a wall-clock time in a zone. Returns null when the time doesn't exist
 * (skipped by a DST change); for repeated times returns the earlier instant.
 */
export function wallToInstant(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const candidates = new Set();
  for (const probe of [guess - 36e5 * 14, guess, guess + 36e5 * 14]) candidates.add(guess - offsetMinutes(probe, tz) * 60000);
  const hits = [...candidates].filter(t => {
    const w = wallParts(t, tz);
    return w.year === y && w.month === mo && w.day === d && w.hour === h && w.minute === mi && w.second === s;
  }).sort((a, b) => a - b);
  return hits.length ? hits[0] : null;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** "2024-05-01 13:45:00 +02:00" style string for an instant in a zone. */
export function formatInZone(ms, tz, { seconds = true, millis = false } = {}) {
  const w = wallParts(ms, tz);
  const year = w.year < 0 ? '-' + pad(-w.year, 4) : pad(w.year, 4);
  let s = `${year}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}`;
  if (seconds) s += ':' + pad(w.second);
  if (millis) s += '.' + pad(w.ms, 3);
  return s + ' ' + formatOffset(offsetMinutes(ms, tz));
}

export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Browsers often list legacy IANA names; show the current ones instead.
const RENAMED = { 'Asia/Calcutta': 'Asia/Kolkata', 'Europe/Kiev': 'Europe/Kyiv', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon', 'America/Godthab': 'America/Nuuk', 'Atlantic/Faeroe': 'Atlantic/Faroe' };
const valid = z => { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; } };

export function zoneOptions(selected) {
  const zones = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [localZone(), 'UTC'])
    .map(z => RENAMED[z] && valid(RENAMED[z]) ? RENAMED[z] : z);
  const list = [...new Set(['UTC', localZone(), ...zones])];
  return list.map(z => `<option value="${z}"${z === selected ? ' selected' : ''}>${z === localZone() ? z + ' (local)' : z}</option>`).join('');
}

/** "3 hours ago" / "in 2 days" relative to now. */
export function relative(ms, now = Date.now()) {
  const diff = ms - now, a = Math.abs(diff);
  const units = [['year', 365.2425 * 864e5], ['month', 30.436875 * 864e5], ['week', 7 * 864e5], ['day', 864e5], ['hour', 36e5], ['minute', 6e4], ['second', 1e3]];
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [u, size] of units) if (a >= size || u === 'second') return rtf.format(Math.round(diff / size), u);
}
