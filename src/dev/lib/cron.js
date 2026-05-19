// Cron expression parser, English description and next-run calculation (Vixie cron semantics).
import { InputError } from './ui.js';
import { wallParts, wallToInstant } from './time.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const MACROS = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *',
};

const FIELDS = {
  second: { min: 0, max: 59, name: 'second' },
  minute: { min: 0, max: 59, name: 'minute' },
  hour: { min: 0, max: 23, name: 'hour' },
  dom: { min: 1, max: 31, name: 'day of month' },
  month: { min: 1, max: 12, name: 'month', names: MONTHS, offset: 1 },
  dow: { min: 0, max: 7, name: 'day of week', names: DAYS, offset: 0 },
};

function value(tok, f) {
  const up = tok.toUpperCase();
  if (f.names) {
    const i = f.names.indexOf(up);
    if (i >= 0) return i + f.offset;
  }
  if (!/^\d+$/.test(tok)) throw new InputError(`"${tok}" isn't valid in the ${f.name} field.`);
  const v = +tok;
  if (v < f.min || v > f.max) throw new InputError(`${v} is out of range for the ${f.name} field (${f.min}–${f.max}).`);
  return v;
}

/** Parse one field into { values: sorted array, any: bool, text: original }. */
function parseField(text, key) {
  const f = FIELDS[key];
  const set = new Set();
  let any = false;
  for (const part of text.split(',')) {
    if (!part) throw new InputError(`Empty item in the ${f.name} field.`);
    let [range, stepText] = part.split('/');
    if (part.split('/').length > 2) throw new InputError(`"${part}" has more than one "/".`);
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || +stepText === 0) throw new InputError(`Step "${stepText}" in the ${f.name} field must be a positive number.`);
      step = +stepText;
    }
    let lo, hi;
    if (range === '*' || range === '?') {
      if (range === '?' && key !== 'dom' && key !== 'dow') throw new InputError('"?" is only allowed in the day-of-month and day-of-week fields.');
      lo = f.min; hi = key === 'dow' ? 6 : f.max;
      if (stepText === undefined) any = true;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      lo = value(a, f); hi = value(b, f);
      if (key === 'dow' && hi === 0) hi = 7;
      if (lo > hi) throw new InputError(`Range "${range}" in the ${f.name} field goes backwards.`);
    } else {
      lo = value(range, f);
      hi = stepText !== undefined ? (key === 'dow' ? 6 : f.max) : lo;
    }
    for (let v = lo; v <= hi; v += step) set.add(key === 'dow' && v === 7 ? 0 : v);
  }
  return { values: [...set].sort((a, b) => a - b), any, text };
}

/** Parse a 5-field (or 6-field, with seconds first) cron expression or an @macro. */
export function parseCron(expr) {
  let s = expr.trim().replace(/\s+/g, ' ');
  if (!s) throw new InputError('Enter a cron expression, e.g. */15 9-17 * * MON-FRI');
  if (s.startsWith('@')) {
    if (s === '@reboot') throw new InputError('@reboot runs once at startup; it has no schedule.');
    if (!MACROS[s.toLowerCase()]) throw new InputError(`Unknown macro "${s}". Use one of ${Object.keys(MACROS).join(', ')}.`);
    s = MACROS[s.toLowerCase()];
  }
  const parts = s.split(' ');
  if (parts.length !== 5 && parts.length !== 6) throw new InputError(`Expected 5 fields (minute hour day month weekday) or 6 with seconds first, got ${parts.length}.`);
  const keys = parts.length === 6 ? ['second', 'minute', 'hour', 'dom', 'month', 'dow'] : ['minute', 'hour', 'dom', 'month', 'dow'];
  const c = { hasSeconds: parts.length === 6, expanded: s };
  keys.forEach((k, i) => { c[k] = parseField(parts[i], k); });
  if (!c.second) c.second = { values: [0], any: false, text: '0' };
  return c;
}

function dayMatches(c, y, m, d, weekday) {
  if (!c.month.values.includes(m)) return false;
  const domOk = c.dom.values.includes(d), dowOk = c.dow.values.includes(weekday);
  // Vixie cron: if both fields are restricted, a day matches when either one matches.
  if (!c.dom.any && !c.dow.any) return domOk || dowOk;
  if (!c.dom.any) return domOk;
  if (!c.dow.any) return dowOk;
  return true;
}

/** Next `count` run instants (ms) strictly after `from`, evaluated as wall-clock times in `tz`. */
export function nextRuns(c, tz, from = Date.now(), count = 10) {
  const out = [];
  const start = wallParts(from, tz);
  let date = new Date(Date.UTC(start.year, start.month - 1, start.day));
  for (let i = 0; i < 366 * 30 && out.length < count; i++, date.setUTCDate(date.getUTCDate() + 1)) {
    const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate(), wd = date.getUTCDay();
    if (!dayMatches(c, y, m, d, wd)) continue;
    for (const h of c.hour.values) for (const mi of c.minute.values) for (const s of c.second.values) {
      const t = wallToInstant(y, m, d, h, mi, s, tz);
      if (t !== null && t > from) { out.push(t); if (out.length >= count) return out; }
    }
  }
  return out;
}

// ---------- English description ----------
const pad = n => String(n).padStart(2, '0');
const ordinal = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

function list(items) {
  if (items.length <= 2) return items.join(' and ');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}
/** Compress sorted numbers into runs: [1,2,3,5] -> [[1,3],[5,5]]. */
function runs(values) {
  const r = [];
  for (const v of values) {
    const last = r[r.length - 1];
    if (last && v === last[1] + 1) last[1] = v; else r.push([v, v]);
  }
  return r;
}
function describeSet(values, fmt, through = 'through') {
  return list(runs(values).map(([a, b]) => a === b ? fmt(a) : b === a + 1 ? `${fmt(a)} and ${fmt(b)}` : `${fmt(a)} ${through} ${fmt(b)}`));
}
/** "every 15 minutes" when the field is a clean step from the start of its range. */
function stepOf(field, min, max) {
  const m = field.text.match(/^(\*|\d+)\/(\d+)$/);
  if (!m) return null;
  const start = m[1] === '*' ? min : +m[1];
  return { step: +m[2], start, full: start === min && (max + 1 - min) % +m[2] === 0 };
}

export function describe(c) {
  const parts = [];
  const single = f => f.values.length === 1 && !f.any;
  const sec = c.second, min = c.minute, hr = c.hour;

  if (single(sec) && single(min) && single(hr)) {
    parts.push(`At ${pad(hr.values[0])}:${pad(min.values[0])}${c.hasSeconds && sec.values[0] ? ':' + pad(sec.values[0]) : ''}`);
  } else if (single(sec) && single(min) && !hr.any && hr.values.length <= 6 && !stepOf(hr, 0, 23)) {
    parts.push('At ' + list(hr.values.map(h => `${pad(h)}:${pad(min.values[0])}`)));
  } else {
    const bits = [];
    if (c.hasSeconds) {
      if (sec.any) bits.push('every second');
      else { const st = stepOf(sec, 0, 59); bits.push(st ? `every ${st.step} seconds${st.start ? ` starting at second ${st.start}` : ''}` : `at second ${describeSet(sec.values, String)}`); }
    }
    if (min.any) bits.push(c.hasSeconds && !sec.any ? 'of every minute' : 'every minute');
    else {
      const st = stepOf(min, 0, 59);
      bits.push(st ? `every ${st.step} minutes${st.start ? ` starting at minute ${st.start}` : ''}` : `at minute ${describeSet(min.values, String)}`);
    }
    if (!hr.any) {
      const st = stepOf(hr, 0, 23);
      if (st) bits.push(`past every ${st.step === 1 ? '' : ordinal(st.step) + ' '}hour${st.start ? ` from ${pad(st.start)}:00` : ''}`);
      else {
        const r = runs(hr.values);
        bits.push(r.length === 1 ? `between ${pad(r[0][0])}:00 and ${pad(r[0][1])}:59` : `during hours ${describeSet(hr.values, String, '–')}`);
      }
    }
    parts.push(bits.join(' ').replace(/^./, ch => ch.toUpperCase()));
  }

  const domR = !c.dom.any, dowR = !c.dow.any;
  if (domR) {
    const st = stepOf(c.dom, 1, 31);
    parts.push(st ? `every ${st.step} days of the month${st.start > 1 ? ` starting on the ${ordinal(st.start)}` : ''}` : `on the ${describeSet(c.dom.values, ordinal)} of the month`);
  }
  if (dowR) parts.push(`${domR ? 'or ' : ''}on ${describeSet(c.dow.values, d => DAY_NAMES[d])}`);
  if (!c.month.any) parts.push(`in ${describeSet(c.month.values, m => MONTH_NAMES[m - 1])}`);
  return parts.join(', ') + '.';
}
