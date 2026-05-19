// JSON helpers: parse with line/column errors, key sorting, and a collapsible tree view.
import { InputError, esc } from './ui.js';

/** JSON.parse with a friendly error that points at the line and column. */
export function parseJson(text, label = 'JSON') {
  if (!text.trim()) throw new InputError(`Paste some ${label}.`);
  try { return JSON.parse(text); } catch (e) {
    // Browsers word JSON errors differently and don't always give a position; find it ourselves.
    const found = locateError(text);
    let line, col, msg = found ? found.msg : e.message;
    if (found) { const before = text.slice(0, found.pos).split('\n'); line = before.length; col = before[before.length - 1].length + 1; }
    if (line) {
      const src = text.split('\n')[line - 1] ?? '';
      throw new InputError(`Invalid ${label} at line ${line}, column ${col}: ${msg}\n${src}\n${' '.repeat(Math.max(0, col - 1))}^`);
    }
    throw new InputError(`Invalid ${label}: ${msg}`);
  }
}

/** Strict JSON scanner that reports where and why parsing fails (null if the text is valid). */
export function locateError(t) {
  let i = 0;
  const fail = msg => { throw { pos: i, msg }; };
  const ws = () => { while (i < t.length && ' \t\n\r'.includes(t[i])) i++; };
  const desc = () => i >= t.length ? 'end of input' : `"${t[i]}"`;
  function value() {
    ws();
    const c = t[i];
    if (c === '{') {
      i++; ws();
      if (t[i] === '}') { i++; return; }
      for (;;) {
        ws(); if (t[i] !== '"') fail(`Expected a property name in double quotes, found ${desc()}`);
        string(); ws();
        if (t[i] !== ':') fail(`Expected ":" after the property name, found ${desc()}`);
        i++; value(); ws();
        if (t[i] === ',') { i++; ws(); if (t[i] === '}') fail('Trailing comma before "}"'); continue; }
        if (t[i] === '}') { i++; return; }
        fail(`Expected "," or "}", found ${desc()}`);
      }
    }
    if (c === '[') {
      i++; ws();
      if (t[i] === ']') { i++; return; }
      for (;;) {
        value(); ws();
        if (t[i] === ',') { i++; ws(); if (t[i] === ']') fail('Trailing comma before "]"'); continue; }
        if (t[i] === ']') { i++; return; }
        fail(`Expected "," or "]", found ${desc()}`);
      }
    }
    if (c === '"') return string();
    if (c === '-' || (c >= '0' && c <= '9')) {
      const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(t.slice(i));
      if (!m || m[0] === '-') fail('Invalid number');
      i += m[0].length; return;
    }
    for (const lit of ['true', 'false', 'null']) if (t.startsWith(lit, i)) { i += lit.length; return; }
    if (c === "'") fail('Strings must use double quotes');
    fail(i >= t.length ? 'Unexpected end of input' : `Unexpected ${desc()}`);
  }
  function string() {
    i++;
    while (i < t.length && t[i] !== '"') {
      if (t[i] === '\\') {
        i++;
        if (t[i] === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(t.slice(i + 1, i + 5))) fail('Invalid \\u escape'); i += 5; continue; }
        if (!'"\\/bfnrt'.includes(t[i])) fail('Invalid escape sequence');
      } else if (t.charCodeAt(i) < 0x20) fail('Control character in a string (use \\n, \\t …)');
      i++;
    }
    if (i >= t.length) fail('Unterminated string');
    i++;
  }
  try {
    value(); ws();
    if (i < t.length) fail(`Unexpected ${desc()} after the end of the JSON value`);
    return null;
  } catch (e) { if (e && typeof e.pos === 'number') return e; throw e; }
}

export function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  return v;
}

/** Numbers in the source text that JSON.parse can't represent exactly. */
export function unsafeNumbers(text) {
  const out = [];
  const re = /"(?:[^"\\]|\\.)*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let m;
  while ((m = re.exec(text)) && out.length < 5) {
    if (!m[1]) continue;
    const n = m[1];
    if (/^-?\d+$/.test(n) && !Number.isSafeInteger(Number(n))) out.push(n);
    else if (/[.eE]/.test(n) && n.replace(/^-|[.eE].*$/g, '').length + (n.split('.')[1] || '').replace(/[eE].*$/, '').length > 17) out.push(n);
  }
  return out;
}

const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
function leaf(v) {
  const t = typeOf(v);
  const s = t === 'string' ? JSON.stringify(v) : String(v);
  return `<span class="v-${t}">${esc(s)}</span>`;
}
/** Collapsible tree HTML for a JSON value. */
export function treeHtml(v, key = null, depth = 0) {
  const k = key === null ? '' : `<span class="key">${esc(key)}</span>: `;
  const t = typeOf(v);
  if (t !== 'object' && t !== 'array') return `<div class="leaf">${k}${leaf(v)}</div>`;
  const entries = t === 'array' ? v.map((x, i) => [String(i), x]) : Object.entries(v);
  const label = t === 'array' ? `[${entries.length}]` : `{${entries.length}}`;
  if (!entries.length) return `<div class="leaf">${k}<span class="t">${t === 'array' ? '[]' : '{}'}</span></div>`;
  return `<details${depth < 2 ? ' open' : ''}><summary>${k}<span class="t">${label}</span></summary>${entries.map(([ck, cv]) => treeHtml(cv, ck, depth + 1)).join('')}</details>`;
}
