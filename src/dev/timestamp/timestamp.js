// Timestamp Converter: convert Unix timestamps and dates.
import { $, renderRows, live, InputError } from '../lib/ui.js';
import { wallParts, formatInZone, localZone, zoneOptions, relative } from '../lib/time.js';

export const NS = { s: 1000000000n, ms: 1000000n, us: 1000n, ns: 1n };
const NAMES = { s: 'seconds', ms: 'milliseconds', us: 'microseconds', ns: 'nanoseconds' };

/** Parse input to an exact BigInt of nanoseconds since the epoch. */
export function parse(text, unit) {
  const s = text.trim().replace(/[_,\s]/g, '');
  if (!s) throw new InputError('Enter a timestamp or a date.');
  const num = /^-?\d+(\.\d+)?$/.test(s);
  if (!num) {
    const ms = Date.parse(text.trim());
    if (isNaN(ms)) throw new InputError('Not a number or a date this browser can read. Try ISO 8601, e.g. 2024-05-01T12:00:00Z.');
    return { ns: BigInt(ms) * 1000000n, unit: 'date' };
  }
  const [int, frac = ''] = s.replace('-', '').split('.');
  const neg = s.startsWith('-');
  let u = unit;
  if (u === 'auto') {
    const digits = int.replace(/^0+/, '').length;
    u = digits <= 11 ? 's' : digits <= 14 ? 'ms' : digits <= 17 ? 'us' : 'ns';
  }
  const f = NS[u];
  const fracDigits = String(f).length - 1;
  let ns = BigInt(int || '0') * f + BigInt((frac + '0'.repeat(fracDigits)).slice(0, fracDigits) || '0');
  return { ns: neg ? -ns : ns, unit: u };
}
export const fmtDiv = (ns, f) => {
  const neg = ns < 0n, a = neg ? -ns : ns;
  const int = a / f, rem = a % f;
  const fracDigits = String(f).length - 1;
  const frac = rem ? '.' + rem.toString().padStart(fracDigits, '0').replace(/0+$/, '') : '';
  return (neg ? '-' : '') + int + frac;
};
export function isoWeek(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return { year: date.getUTCFullYear(), week: 1 + Math.round(((date - firstThursday) / 864e5 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7) };
}

/** Whole milliseconds (rounded down) of a nanosecond timestamp; throws outside the JavaScript date range. */
export function toMillis(ns) {
  const ms = Number(ns / 1000000n) + (ns < 0n && ns % 1000000n ? -1 : 0);
  if (!isFinite(ms) || Math.abs(ms) > 8.64e15) throw new InputError('That date is outside the range JavaScript dates support (±273,790 years).');
  return ms;
}

/** The note saying how the input was read. */
export const detectedText = (unit, auto) =>
  unit === 'date' ? 'Read as a date.' : `Read as ${NAMES[unit]}${auto ? ' (detected from the number of digits)' : ''}.`;

/** The result rows for a nanosecond timestamp shown in time zone tz. */
export function timestampRows(ns, tz, now = Date.now()) {
  const ms = toMillis(ns);
  const w = wallParts(ms, tz);
  const doy = Math.round((Date.UTC(w.year, w.month - 1, w.day) - Date.UTC(w.year, 0, 1)) / 864e5) + 1;
  const wk = isoWeek(w.year, w.month, w.day);
  const date = new Date(ms);
  return [
    { label: 'Unix seconds', value: fmtDiv(ns, NS.s) },
    { label: 'Milliseconds', value: fmtDiv(ns, NS.ms) },
    { label: 'Microseconds', value: fmtDiv(ns, NS.us) },
    { label: 'Nanoseconds', value: ns.toString() },
    { label: 'ISO 8601 (UTC)', value: date.toISOString() },
    { label: 'RFC 2822 / HTTP date', value: date.toUTCString() },
    { label: tz, value: formatInZone(ms, tz, { millis: ms % 1000 !== 0 }) },
    { label: 'Readable', value: new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }).format(date) },
    { label: 'Relative', value: relative(ms, now), copy: false },
    { label: 'Day of year / ISO week', value: `Day ${doy} · Week ${wk.week} of ${wk.year}`, copy: false },
  ];
}

function mount() {
  $('tz').innerHTML = zoneOptions(localZone());
  const run = live([$('in'), $('unit'), $('tz')], () => {
    const { ns, unit } = parse($('in').value, $('unit').value);
    toMillis(ns);
    $('detected').textContent = detectedText(unit, $('unit').value === 'auto');
    renderRows($('out'), timestampRows(ns, $('tz').value));
  }, { errEl: $('err'), outEl: $('out') });
  $('now').onclick = () => { $('in').value = String(Math.floor(Date.now() / 1000)); $('unit').value = 'auto'; run(); };
  $('in').value = String(Math.floor(Date.now() / 1000)); run();
}

if (globalThis.document) mount();
