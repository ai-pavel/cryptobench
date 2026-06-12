// CSV ↔ JSON: convert between CSV and JSON.
import { $, live, segmented, esc, InputError } from '../lib/ui.js';
import { parseJson } from '../lib/json.js';

/** RFC 4180 CSV parser: quoted fields, doubled quotes, CR/LF line breaks inside quotes. */
export function parseCsv(text, d) {
  const rows = []; let row = [], field = '', q = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { q = true; i++; continue; }
    if (c === d) { row.push(field); field = ''; i++; continue; }
    if (c === '\r' || c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += c === '\r' && text[i + 1] === '\n' ? 2 : 1; continue; }
    field += c; i++;
  }
  if (q) throw new InputError('A quoted field is never closed (missing ").');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
export function detect(text) {
  // Sample the first 10 lines, plus any more needed to close a quoted field (an odd number of quotes).
  const lines = text.split(/\r?\n/);
  let n = Math.min(10, lines.length);
  while (n < lines.length && (lines.slice(0, n).join('\n').split('"').length - 1) % 2) n++;
  const sample = lines.slice(0, n).join('\n');
  let best = ',', score = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = parseCsv(sample, d).slice(0, 5).map(r => r.length);
    const s = counts.length && counts.every(c => c === counts[0]) ? counts[0] : 0;
    if (s > score) { score = s; best = d; }
  }
  return best;
}
const NAMES = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' };
export function typed(s) {
  if (s === '') return null;
  if (s === 'true' || s === 'false') return s === 'true';
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(s) && Number.isFinite(+s) && (!/^-?\d+$/.test(s) || Number.isSafeInteger(+s))) return +s;
  return s;
}
export const quote = (v, d) => { const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /["\r\n]/.test(s) || s.includes(d) ? `"${s.replace(/"/g, '""')}"` : s; };

/**
 * CSV → JSON. delim is a delimiter or 'auto'; header uses the first row as keys; types converts
 * numbers, true/false and empty cells. Returns the JSON value, the note and the preview table.
 */
export function csvToJson(text, { delim = 'auto', header = true, types = true } = {}) {
  if (!text.trim()) throw new InputError('Paste some CSV.');
  const d = delim === 'auto' ? detect(text) : delim;
  const rows = parseCsv(text, d);
  const conv = types ? typed : s => s;
  let json, preview;
  if (header) {
    const [hdr, ...data] = rows;
    const keys = hdr.map((h, i) => h || `column${i + 1}`);
    json = data.map(r => Object.fromEntries(keys.map((k, i) => [k, conv(r[i] ?? '')])));
    preview = { rows: data, header: keys };
  } else { json = rows.map(r => r.map(conv)); preview = { rows }; }
  return { json, note: `${json.length} row${json.length === 1 ? '' : 's'} · delimiter: ${NAMES[d]}`, preview };
}

/** JSON (an array of objects or of arrays) → CSV text and the preview table. */
export function jsonToCsv(text, delim = 'auto') {
  const v = parseJson(text);
  if (!Array.isArray(v)) throw new InputError('JSON → CSV needs an array, e.g. [{"a": 1}, {"a": 2}].');
  const d = delim === 'auto' ? ',' : delim;
  let rows, header = null;
  if (v.every(x => Array.isArray(x))) rows = v;
  else {
    if (!v.every(x => x && typeof x === 'object' && !Array.isArray(x))) throw new InputError('Every item must be an object (or every item an array).');
    header = [...new Set(v.flatMap(Object.keys))];
    rows = v.map(o => header.map(k => o[k]));
  }
  return {
    csv: (header ? [header, ...rows] : rows).map(r => r.map(c => quote(c, d)).join(d)).join('\n'),
    preview: { rows: rows.map(r => r.map(c => c === null || c === undefined ? '' : typeof c === 'object' ? JSON.stringify(c) : String(c))), header },
  };
}

function mount() {
  const mode = segmented($('mode'), () => {
    const c2j = mode() === 'c2j';
    $('inLabel').textContent = c2j ? 'CSV' : 'JSON (array of objects or arrays)'; $('outLabel').textContent = c2j ? 'JSON' : 'CSV';
    $('typesWrap').hidden = !c2j; $('hdrWrap').hidden = !c2j;
    if (!c2j && !$('in').value.trim().startsWith('[')) $('in').value = JSON.stringify([{ name: 'Alice', age: 30, city: 'Lisbon' }, { name: 'Bob', age: 25, city: 'Porto', tags: ['a', 'b'] }], null, 2);
    run();
  });
  function table(rows, header) {
    const body = rows.slice(0, 50);
    $('preview').innerHTML = `<table class="data">${header ? `<tr>${header.map(h => `<th>${esc(h)}</th>`).join('')}</tr>` : ''}${body.map(r => `<tr>${r.map(c => `<td>${esc(c ?? '')}</td>`).join('')}</tr>`).join('')}</table>`;
  }
  const run = live([$('in'), $('delim'), $('header'), $('types')], () => {
    $('out').value = ''; $('preview').innerHTML = ''; $('note').textContent = '';
    if (mode() === 'c2j') {
      const r = csvToJson($('in').value, { delim: $('delim').value, header: $('header').checked, types: $('types').checked });
      table(r.preview.rows, r.preview.header);
      $('out').value = JSON.stringify(r.json, null, 2);
      $('note').textContent = r.note;
    } else {
      const r = jsonToCsv($('in').value, $('delim').value);
      $('out').value = r.csv;
      table(r.preview.rows, r.preview.header);
    }
  }, { errEl: $('err') });
  $('dl').onclick = () => {
    const csv = mode() === 'j2c';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([$('out').value], { type: csv ? 'text/csv' : 'application/json' }));
    a.download = csv ? 'data.csv' : 'data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}

if (globalThis.document) mount();
