// JSON Diff: compare two JSON documents and list what was added, removed or changed.
import { $, live, esc } from '../lib/ui.js';
import { parseJson, sortKeys } from '../lib/json.js';

const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
const canon = v => JSON.stringify(sortKeys(v));
const keyPath = (p, k) => /^[A-Za-z_$][\w$]*$/.test(k) ? `${p}.${k}` : `${p}[${JSON.stringify(k)}]`;
/** Push the differences between a and b into out: { kind: 'added' | 'removed' | 'changed', path, from?, to? }. */
export function compare(a, b, path, out, unordered) {
  const ta = typeOf(a), tb = typeOf(b);
  if (ta !== tb) { out.push({ kind: 'changed', path, from: a, to: b }); return; }
  if (ta === 'object') {
    for (const k of Object.keys(a)) if (!(k in b)) out.push({ kind: 'removed', path: keyPath(path, k), from: a[k] });
    for (const k of Object.keys(b)) {
      if (!(k in a)) out.push({ kind: 'added', path: keyPath(path, k), to: b[k] });
      else compare(a[k], b[k], keyPath(path, k), out, unordered);
    }
  } else if (ta === 'array') {
    if (unordered) {
      const left = a.map(canon), right = b.map(canon);
      const pool = new Map();
      right.forEach((c, i) => pool.set(c, [...(pool.get(c) || []), i]));
      a.forEach((x, i) => { const hits = pool.get(left[i]); if (hits && hits.length) hits.shift(); else out.push({ kind: 'removed', path: `${path}[${i}]`, from: x }); });
      for (const [c, idx] of pool) for (const i of idx) out.push({ kind: 'added', path: `${path}[${i}]`, to: b[i] });
    } else {
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        if (i >= a.length) out.push({ kind: 'added', path: `${path}[${i}]`, to: b[i] });
        else if (i >= b.length) out.push({ kind: 'removed', path: `${path}[${i}]`, from: a[i] });
        else compare(a[i], b[i], `${path}[${i}]`, out, unordered);
      }
    }
  } else if (a !== b) out.push({ kind: 'changed', path, from: a, to: b });
}
const show = v => v === undefined ? '' : esc(JSON.stringify(v));

/** Diff two JSON texts: the list of differences, the stats line { cls, text } and the table HTML. */
export function diffJson(aText, bText, unordered = false) {
  const a = parseJson(aText, 'original JSON'), b = parseJson(bText, 'changed JSON');
  const out = [];
  compare(a, b, '$', out, unordered);
  const count = k => out.filter(d => d.kind === k).length;
  return {
    diffs: out,
    stats: {
      cls: 'status ' + (out.length ? '' : 'ok'),
      text: out.length ? `${out.length} difference${out.length === 1 ? '' : 's'}: ${count('added')} added, ${count('removed')} removed, ${count('changed')} changed` : 'The documents are equal.',
    },
    html: out.length ? '<tr><th>Change</th><th>Path</th><th>Before</th><th>After</th></tr>' + out.map(d =>
      `<tr><td class="${d.kind === 'added' ? 'add' : d.kind === 'removed' ? 'rem' : 'chg'}">${d.kind}</td><td class="mono">${esc(d.path)}</td><td class="mono">${show(d.from)}</td><td class="mono">${show(d.to)}</td></tr>`).join('') : '',
  };
}

function mount() {
  live([$('a'), $('b'), $('unordered')], () => {
    $('out').innerHTML = ''; $('stats').textContent = '';
    const r = diffJson($('a').value, $('b').value, $('unordered').checked);
    $('stats').className = r.stats.cls;
    $('stats').textContent = r.stats.text;
    if (r.diffs.length) $('out').innerHTML = r.html;
  }, { errEl: $('err') });
}

if (globalThis.document) mount();
