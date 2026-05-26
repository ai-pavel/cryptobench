// Cron Explainer: explain a cron expression and its next runs.
import { $, live, esc } from '../lib/ui.js';
import { parseCron, nextRuns, describe } from '../lib/cron.js';
import { formatInZone, localZone, zoneOptions, relative } from '../lib/time.js';

const NAMES = { second: 'Second', minute: 'Minute', hour: 'Hour', dom: 'Day of month', month: 'Month', dow: 'Day of week' };

/**
 * Explain a cron expression: its description, each field with its name, and the next
 * runs after `now` in time zone tz (time, weekday, relative). Bad expressions throw.
 */
export function explain(expr, tz, now = Date.now()) {
  const c = parseCron(expr);
  const keys = c.hasSeconds ? ['second', 'minute', 'hour', 'dom', 'month', 'dow'] : ['minute', 'hour', 'dom', 'month', 'dow'];
  return {
    description: describe(c),
    fields: keys.map(k => ({ text: c[k].text, name: NAMES[k] })),
    runs: nextRuns(c, tz, now).map(t => ({
      time: formatInZone(t, tz),
      weekday: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(t),
      relative: relative(t, now),
    })),
  };
}

function mount() {
  $('tz').innerHTML = zoneOptions(localZone());
  live([$('in'), $('tz')], () => {
    $('out').hidden = true;
    const r = explain($('in').value, $('tz').value);
    $('desc').textContent = r.description;
    $('fields').innerHTML = r.fields.map(f => `<div><b>${esc(f.text)}</b><span>${f.name}</span></div>`).join('');
    $('runs').innerHTML = r.runs.length
      ? r.runs.map(t => `<li>${esc(t.time)} <span>· ${esc(t.weekday)} · ${esc(t.relative)}</span></li>`).join('')
      : '<li>No run in the next 30 years (for example, February 30th).</li>';
    $('out').hidden = false;
  }, { errEl: $('err') });
  $('presets').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { $('in').value = b.textContent; $('in').dispatchEvent(new Event('input')); } });
}

if (globalThis.document) mount();
