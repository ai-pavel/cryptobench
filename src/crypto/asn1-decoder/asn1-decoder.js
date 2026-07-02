// ASN.1 Decoder: decode DER or PEM into a collapsible tree of elements.
import { showError, esc, hex, debounce } from '../lib/common.js';
import { parseNode, parseDer, readDerInput, typeName, decodeOid, decodeInteger, decodeTime, decodeString, isStringTag, oidName } from '../lib/asn1.js';

export const EXAMPLE = 'MIIBwzCCAWmgAwIBAgIUFU5OiXSD7If2KqskmiLO1WLYV0QwCgYIKoZIzj0EAwIwPjELMAkGA1UEBhMCVVMxFTATBgNVBAoMDEV4YW1wbGUgTGFiczEYMBYGA1UEAwwPRXhhbXBsZSBSb290IENBMB4XDTI2MTEwNTAwMTczN1oXDTM2MTEwMjAwMTczN1owPjELMAkGA1UEBhMCVVMxFTATBgNVBAoMDEV4YW1wbGUgTGFiczEYMBYGA1UEAwwPRXhhbXBsZSBSb290IENBMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEr4SNETtxaQbJtjvTf8Hzb5ow8q3NRjDhgg6wH5M3t+vGWMm1U7KdyjKurdtRPYBZIBzNUxus6SVUHE9E+iLPQaNFMEMwHQYDVR0OBBYEFDLCaeRm99cR+9zRP0ImwAoyEYBTMBIGA1UdEwEB/wQIMAYBAf8CAQAwDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMCA0gAMEUCIDA6ivp0JJb9OuuLn790E0uX0pAlIwEF78tPKgjTBhm3AiEAxHPfTCHM7uwYpURCxrrgKPokk42q5JHodySGSwQC6ig=';
export const MAX_ELEMENTS = 5000;
let count = 0;

// An OCTET STRING or BIT STRING that holds DER (a constructed element, OID or INTEGER) is shown as encapsulated.
export function tryInner(v) {
  if (v.length < 2) return null;
  try { const n = parseDer(v); return n.constructed || n.tag === 6 || n.tag === 2 ? n : null; } catch { return null; }
}

// The one-line value shown for a primitive universal element.
export function valueText(n) {
  if (n.cls !== 0 || n.constructed) return '';
  const v = n.value;
  switch (n.tag) {
    case 1: return v[0] ? 'TRUE' : 'FALSE';
    case 2: case 10: { const i = decodeInteger(v); return v.length <= 8 ? i.toString() : `${v.length * 8 - (v[0] === 0 ? 8 : 0)}-bit: ${hex.encode(v)}`; }
    case 5: return '';
    case 6: { const o = decodeOid(v); return oidName(o) ? `${o} (${oidName(o)})` : o; }
    case 23: case 24: { const d = decodeTime(n); return d ? d.toISOString() : new TextDecoder().decode(v); }
    case 3: return `${v[0]} unused bits · ${v.length - 1} bytes${v.length > 1 ? ': ' + hex.encode(v.subarray(1, 65)) + (v.length > 65 ? '…' : '') : ''}`;
    case 4: return `${v.length} bytes: ${hex.encode(v.subarray(0, 64))}${v.length > 64 ? '…' : ''}`;
    default: return isStringTag(n.tag) ? JSON.stringify(decodeString(n)) : hex.encode(v.subarray(0, 64)) + (v.length > 64 ? '…' : '');
  }
}

function nodeHtml(n, base, depth) {
  if (++count > MAX_ELEMENTS) return '';
  const head = `<span class="k">@${base + n.offset} h${n.headerLen} l${n.indefinite ? '∞' : n.length}</span> <b>${esc(typeName(n))}</b>`;
  const val = valueText(n);
  let kids = n.children;
  let encap = null;
  if (!n.constructed && n.cls === 0 && (n.tag === 3 || n.tag === 4)) {
    const inner = tryInner(n.tag === 3 ? n.value.subarray(1) : n.value);
    if (inner) encap = { node: inner, base: base + n.offset + n.headerLen + (n.tag === 3 ? 1 : 0) };
  }
  if (!kids && !encap) return `<div class="leaf">${head} ${val ? `<span class="mono">${esc(val)}</span>` : ''}</div>`;
  const inner = (kids || []).map(c => nodeHtml(c, base, depth + 1)).join('')
    + (encap ? `<div class="muted" style="margin-top:4px">encapsulated:</div>${nodeHtml(encap.node, encap.base - encap.node.offset, depth + 1)}` : '');
  return `<details ${depth < 4 ? 'open' : ''}><summary>${head}${kids ? ` <span class="muted">(${kids.length})</span>` : ` <span class="mono">${esc(val)}</span>`}</summary><div class="kids">${inner}</div></details>`;
}

/**
 * Decode DER/PEM/hex/base64 text into the tree's HTML and the summary line.
 * Returns null for empty input; throws on input that isn't DER.
 */
export function decodeTree(text) {
  const t = text.trim();
  if (!t) return null;
  const bytes = readDerInput(t);
  const root = parseNode(bytes, 0);
  count = 0;
  const html = nodeHtml(root, 0, 0);
  const trailing = bytes.length - root.end;
  const summary = `${bytes.length} bytes, ${count} elements` + (trailing ? ` · ${trailing} trailing bytes not decoded` : '') + (count > MAX_ELEMENTS ? ' · showing the first 5000' : '');
  return { html, summary };
}

function mount() {
  const $ = id => document.getElementById(id);
  function render() {
    showError($('err'), ''); $('summary').textContent = '';
    try {
      const r = decodeTree($('input').value);
      if (!r) { $('out').innerHTML = ''; return; }
      $('out').innerHTML = r.html;
      $('summary').textContent = r.summary;
    } catch (e) { $('out').innerHTML = ''; showError($('err'), e.message); }
  }
  $('input').addEventListener('input', debounce(render, 120));
  $('example').onclick = () => { $('input').value = EXAMPLE; render(); };
  $('expand').onclick = () => $('out').querySelectorAll('details').forEach(d => d.open = true);
  $('collapse').onclick = () => $('out').querySelectorAll('details').forEach(d => d.open = false);
}

if (globalThis.document) mount();
