// Text Diff: compare two texts line by line, with word-level highlights.
import { $, esc, segmented } from '../lib/ui.js';
import { diff, tokens } from '../lib/diff.js';

/** Word-level highlight of a changed line pair. */
export function wordDiff(x, y, ignoreCase = false) {
  const A = tokens(x), B = tokens(y);
  if (A.length * B.length > 250000) return [esc(x), esc(y)];
  const ops = diff(A, B, t => ignoreCase ? t.toLowerCase() : t);
  let l = '', r = '';
  for (const o of ops) {
    if (o.op === 'equal') { l += esc(A[o.a]); r += esc(B[o.b]); }
    else if (o.op === 'del') l += `<del>${esc(A[o.a])}</del>`;
    else r += `<ins>${esc(B[o.b])}</ins>`;
  }
  return [l, r];
}

/**
 * Diff two texts line by line. Options: ws / ignoreCase (ignore whitespace / case),
 * collapse (hide long runs of unchanged lines), split (side by side, else inline).
 * Returns the stats line { cls, text } and the diff's HTML.
 */
export function diffTexts(a, b, { ws = false, ignoreCase = false, collapse = true, split = true } = {}) {
  const norm = s => { if (ws) s = s.replace(/\s+/g, ' ').trim(); if (ignoreCase) s = s.toLowerCase(); return s; };
  const A = a.split('\n'), B = b.split('\n');
  const ops = diff(A, B, norm);
  // Group into blocks of equal lines and change hunks (deletes then inserts).
  const blocks = [];
  for (const o of ops) {
    const kind = o.op === 'equal' ? 'eq' : 'ch';
    let blk = blocks[blocks.length - 1];
    if (!blk || blk.kind !== kind) blocks.push(blk = { kind, eq: [], del: [], ins: [] });
    if (o.op === 'equal') blk.eq.push(o); else if (o.op === 'del') blk.del.push(o.a); else blk.ins.push(o.b);
  }
  const added = ops.filter(o => o.op === 'ins').length, removed = ops.filter(o => o.op === 'del').length;
  const stats = {
    cls: 'status ' + (added || removed ? '' : 'ok'),
    text: added || removed ? `+${added} line${added === 1 ? '' : 's'} added, −${removed} removed` : 'No differences.',
  };
  const row = (cells) => `<div class="ln">${cells}</div>`;
  const cell = (no, html, cls) => `<div class="no ${cls}">${no ?? ''}</div><div class="tx ${cls}">${html}</div>`;
  let html = '';
  blocks.forEach((blk, bi) => {
    if (blk.kind === 'eq') {
      let eqs = blk.eq;
      const CTX = 3;
      if (collapse && eqs.length > CTX * 2 + 1) {
        const head = bi === 0 ? [] : eqs.slice(0, CTX), tail = bi === blocks.length - 1 ? [] : eqs.slice(-CTX);
        const hidden = eqs.length - head.length - tail.length;
        const r = o => split ? row(cell(o.a + 1, esc(A[o.a]), '') + cell(o.b + 1, esc(B[o.b]), '')) : row(cell(o.b + 1, '&nbsp; ' + esc(B[o.b]), ''));
        html += head.map(r).join('') + `<div class="ln"><div class="gap">⋯ ${hidden} unchanged line${hidden === 1 ? '' : 's'}</div></div>` + tail.map(r).join('');
        return;
      }
      for (const o of eqs) html += split ? row(cell(o.a + 1, esc(A[o.a]), '') + cell(o.b + 1, esc(B[o.b]), '')) : row(cell(o.b + 1, '&nbsp; ' + esc(B[o.b]), ''));
      return;
    }
    const n = Math.max(blk.del.length, blk.ins.length);
    if (split) {
      for (let i = 0; i < n; i++) {
        const ai = blk.del[i], bi2 = blk.ins[i];
        let [l, r] = [ai !== undefined ? esc(A[ai]) : '', bi2 !== undefined ? esc(B[bi2]) : ''];
        if (ai !== undefined && bi2 !== undefined) [l, r] = wordDiff(A[ai], B[bi2], ignoreCase);
        html += row(cell(ai !== undefined ? ai + 1 : '', l, ai !== undefined ? 'del' : 'empty') + cell(bi2 !== undefined ? bi2 + 1 : '', r, bi2 !== undefined ? 'ins' : 'empty'));
      }
    } else {
      const pairs = Math.min(blk.del.length, blk.ins.length);
      const words = Array.from({ length: pairs }, (_, i) => wordDiff(A[blk.del[i]], B[blk.ins[i]], ignoreCase));
      blk.del.forEach((ai, i) => { html += row(cell(ai + 1, '− ' + (i < pairs ? words[i][0] : esc(A[ai])), 'del')); });
      blk.ins.forEach((bi2, i) => { html += row(cell(bi2 + 1, '+ ' + (i < pairs ? words[i][1] : esc(B[bi2])), 'ins')); });
    }
  });
  return { stats, html };
}

function mount() {
  const view = segmented($('view'), run);
  function run() {
    const split = view() === 'split';
    const r = diffTexts($('a').value, $('b').value, { ws: $('ws').checked, ignoreCase: $('case').checked, collapse: $('ctx').checked, split });
    $('stats').className = r.stats.cls;
    $('stats').textContent = r.stats.text;
    $('out').className = 'diff' + (split ? ' split' : '');
    $('out').innerHTML = r.html;
  }
  for (const id of ['a', 'b', 'ws', 'case', 'ctx']) $(id).addEventListener('input', run);
  run();
}

if (globalThis.document) mount();
