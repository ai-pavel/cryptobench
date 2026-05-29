// URL Parser: split a URL and edit its query parameters.
import { $, renderRows, showError, esc, InputError } from '../lib/ui.js';

export function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

/** Parse an absolute URL: null for empty input, else the URL object and its rows. */
export function parseUrl(text) {
  const t = text.trim();
  if (!t) return null;
  let url;
  try { url = new URL(t); } catch { throw new InputError('Not a valid absolute URL. Include the scheme, e.g. https://'); }
  return {
    url,
    rows: [
      { label: 'Protocol', value: url.protocol },
      url.username && { label: 'Username', value: decodeURIComponent(url.username) },
      url.password && { label: 'Password', value: decodeURIComponent(url.password) },
      { label: 'Host', value: url.host },
      { label: 'Hostname', value: url.hostname },
      { label: 'Port', value: url.port || `(default${url.protocol === 'https:' ? ' 443' : url.protocol === 'http:' ? ' 80' : ''})`, copy: !!url.port },
      { label: 'Origin', value: url.origin },
      { label: 'Path', value: url.pathname },
      { label: 'Path (decoded)', value: safeDecode(url.pathname) },
      url.search && { label: 'Query', value: url.search },
      url.hash && { label: 'Fragment', value: url.hash },
      { label: 'Normalized URL', value: url.href },
    ],
  };
}

/** Query string from edited [name, value] pairs; rows with both empty are dropped. */
export function buildSearch(pairs) {
  const sp = new URLSearchParams();
  for (const [k, v] of pairs) if (k !== '' || v !== '') sp.append(k, v);
  return sp.toString();
}

/** Encode / decode a single URL component. */
export function componentRows(s) {
  let dec; try { dec = decodeURIComponent(s.replace(/\+/g, ' ')); } catch { dec = '(not valid percent-encoding)'; }
  return [
    { label: 'encodeURIComponent', value: encodeURIComponent(s) },
    { label: 'encodeURI', value: encodeURI(s) },
    { label: 'Form encoding', value: new URLSearchParams({ x: s }).toString().slice(2) },
    { label: 'Decoded', value: dec },
  ];
}

function mount() {
  let url = null;
  function parse() {
    showError($('err'), null);
    try {
      const r = parseUrl($('url').value);
      if (!r) { $('out').innerHTML = ''; $('paramsBox').hidden = true; return; }
      url = r.url;
      renderRows($('out'), r.rows);
      renderParams();
    } catch (e) { url = null; $('out').innerHTML = ''; $('paramsBox').hidden = true; showError($('err'), e); }
  }
  function renderParams() {
    $('paramsBox').hidden = false;
    $('params').innerHTML = [...url.searchParams].map(([k, v], i) => `<tr data-i="${i}">
    <td><input class="mono" data-k value="${esc(k)}"></td><td><input class="mono" data-v value="${esc(v)}"></td>
    <td><button class="icon-btn" data-del title="Remove">✕</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">No query parameters.</td></tr>';
  }
  function rebuild() {
    const pairs = [...$('params').querySelectorAll('tr[data-i]')].map(tr => [tr.querySelector('[data-k]').value, tr.querySelector('[data-v]').value]);
    url.search = buildSearch(pairs);
    $('url').value = url.href;
    const keep = document.activeElement;
    const pos = keep && keep.closest('tr') ? [keep.closest('tr').dataset.i, keep.hasAttribute('data-k') ? 'k' : 'v'] : null;
    parse();
    if (pos) { const el = $('params').querySelector(`tr[data-i="${pos[0]}"] [data-${pos[1]}]`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
  }
  $('params').addEventListener('input', rebuild);
  $('params').addEventListener('click', e => { if (e.target.closest('[data-del]')) { e.target.closest('tr').remove(); rebuild(); } });
  $('add').onclick = () => { if (!url) return; url.searchParams.append('name', 'value'); $('url').value = url.href; parse(); };
  $('url').addEventListener('input', parse);
  function comp() {
    renderRows($('compOut'), componentRows($('comp').value));
  }
  $('comp').addEventListener('input', comp);
  parse(); comp();
}

if (globalThis.document) mount();
