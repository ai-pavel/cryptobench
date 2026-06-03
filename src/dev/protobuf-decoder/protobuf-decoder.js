// Protobuf Decoder: decode a protobuf message without its schema.
import { $, live, esc } from '../lib/ui.js';
import { parseBinary } from '../lib/bytes.js';
import { decodeProtobuf, scalarViews, bestScalar, toHex } from '../lib/protobuf.js';

/** HTML tree of decoded fields: each value in its most likely form, with alternatives. */
export function renderFields(fields) {
  return fields.map(f => {
    const hd = `<span>${f.num}</span> <span class="w">${f.wireName} · offset ${f.start}</span>`;
    if (f.wire !== 2) {
      const [main, ...alts] = scalarViews(f);
      return `<div class="pf"><div class="hd">${hd}</div><div class="v">${esc(main)}</div><div class="alt">${esc(alts.join(' · '))}</div></div>`;
    }
    const it = f.interp, len = f.bytes.length;
    const alts = [];
    if (it.kind !== 'string' && it.text !== null) alts.push(`string: ${JSON.stringify(it.text)}`);
    if (it.kind !== 'bytes') alts.push(`bytes: ${toHex(f.bytes)}`);
    if (it.kind !== 'packed' && it.packed) alts.push(`packed varints: [${it.packed.join(', ')}]`);
    const altHtml = alts.length ? `<div class="alt">${esc(alts.join(' · '))}</div>` : '';
    if (it.kind === 'message') {
      return `<div class="pf"><details open><summary>${hd} <span class="w">message, ${len} bytes</span></summary>${renderFields(it.message)}${altHtml}</details></div>`;
    }
    const v = it.kind === 'string' ? JSON.stringify(it.text) : it.kind === 'packed' ? `[${it.packed.join(', ')}] (packed varints)` : it.kind === 'empty' ? '(empty)' : toHex(f.bytes);
    return `<div class="pf"><div class="hd">${hd} <span class="w">${it.kind}, ${len} bytes</span></div><div class="v">${esc(v)}</div>${altHtml}</div>`;
  }).join('');
}
/** Best-guess JSON object keyed by field number; repeated fields become arrays. */
export function toJson(fields) {
  const o = {};
  for (const f of fields) {
    let v;
    if (f.wire !== 2) v = bestScalar(f);
    else { const it = f.interp; v = it.kind === 'message' ? toJson(it.message) : it.kind === 'string' ? it.text : it.kind === 'packed' ? it.packed.map(Number) : '0x' + toHex(f.bytes); }
    const k = String(f.num);
    if (k in o) o[k] = [].concat(o[k], [v]); else o[k] = v;
  }
  return o;
}

/** Decode a message given as hex or base64 ('auto', 'hex', 'base64'); null for empty input. */
export function decode(text, fmt) {
  if (!text.trim()) return null;
  const fields = decodeProtobuf(parseBinary(text, fmt));
  return { fields, html: renderFields(fields), json: JSON.stringify(toJson(fields), null, 2) };
}

function mount() {
  live([$('in'), $('fmt')], () => {
    $('tree').innerHTML = ''; $('jsonBox').hidden = true;
    const r = decode($('in').value, $('fmt').value);
    if (!r) return;
    $('tree').innerHTML = r.html;
    $('json').textContent = r.json;
    $('jsonBox').hidden = false;
  }, { errEl: $('err') });
}

if (globalThis.document) mount();
