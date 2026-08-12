// ABI Encoder / Decoder: encode function calls to calldata, and decode calldata back into arguments.
import { parseSignature, typeToString, abiEncode, abiDecode, abiJsonParam, selectorOf, toPlain, COMMON_SIGNATURES, bytesToHex, concat, hexToBytes, InputError } from '../lib/evm.js';
import { esc, renderRows, showError, param } from '../lib/ui.js';

// ---------- Encode ----------

export const PLACEHOLDER = { uint: '123 or 0x7b', int: '-5', address: '0x…', bool: 'true or false', fixedbytes: '0x…', bytes: '0x…', string: 'text', array: '[…] as JSON', tuple: '[…] as JSON' };
export const EXAMPLE = { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', uint: '1000000000000000000' };

/** Parse the signature field: a function signature, or a bare parameter list. */
export function parseSig(raw) {
  raw = raw.trim();
  if (!raw) throw new InputError('Enter a signature');
  return parseSignature(raw.startsWith('(') ? raw : raw.includes('(') ? raw : `(${raw})`);
}

/** A parameter field's text as the value abiEncode takes. */
export function paramValue(p, raw) {
  if (p.type.kind === 'array' || p.type.kind === 'tuple') {
    try { return JSON.parse(raw); } catch { throw new InputError(`${p.name || 'Parameter'}: not valid JSON`); }
  }
  if (p.type.kind === 'string') return raw;
  return raw.trim();
}

/**
 * Encode a call from a parsed signature and the raw parameter field texts.
 * Returns the rows shown, the link to decode it (null without a selector) and the
 * encoded parameters as 32-byte words of hex.
 */
export function encodeCall(parsed, raws) {
  const vals = parsed.inputs.map((p, i) => {
    const raw = raws[i];
    if (raw.trim() === '' && p.type.kind !== 'string') throw new InputError(`Enter a value for ${p.name || 'parameter ' + (i + 1)}`);
    return paramValue(p, raw);
  });
  const params = abiEncode(parsed.inputs, vals);
  const selector = parsed.name ? selectorOf(parsed.canonical) : null;
  const calldata = selector ? bytesToHex(concat(hexToBytes(selector), params)) : bytesToHex(params);
  const link = selector ? `?mode=decode&data=${calldata}&sig=${encodeURIComponent(parsed.canonical)}` : null;
  const rows = [
    { label: selector ? 'Calldata' : 'Encoded', value: calldata, cls: 'ok' },
    selector && { label: 'Selector', value: selector },
    selector && { label: 'Signature', value: parsed.canonical },
    { label: 'Size', value: `${(calldata.length - 2) / 2} bytes`, copy: false },
  ];
  const hex = bytesToHex(params).slice(2);
  const words = Array.from({ length: hex.length / 64 }, (_, i) => hex.slice(i * 64, i * 64 + 64));
  return { calldata, rows, link, words };
}

// ---------- Decode ----------

/** Functions from the signature / ABI field: one signature per line, or a JSON ABI. */
export function candidates(text) {
  text = text.trim();
  if (!text) return [];
  if (text.startsWith('[') || text.startsWith('{')) {
    let abi;
    try { abi = JSON.parse(text); } catch { throw new InputError('The ABI is not valid JSON'); }
    if (!Array.isArray(abi)) abi = abi.abi || [abi];
    if (!Array.isArray(abi)) throw new InputError('Expected a JSON ABI array');
    return abi.flatMap(f => {
      if (typeof f === 'string') return [parseSignature(f)];
      if (!f || (f.type && f.type !== 'function' && f.type !== 'error')) return [];
      const inputs = (f.inputs || []).map(abiJsonParam);
      return [{ name: f.name, inputs, canonical: `${f.name}(${inputs.map(p => typeToString(p.type)).join(',')})` }];
    });
  }
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(parseSignature);
}

/** A decoded value as shown in a row. */
export function show(v) {
  if (Array.isArray(v)) return JSON.stringify(toPlain(v), null, 1).replace(/\n\s*/g, ' ');
  return typeof v === 'bigint' ? v.toString() : String(v);
}

/**
 * Decode calldata with the signatures / ABI entered (or the built-in common ones).
 * Returns null for empty data; otherwise the rows shown and the arguments as pretty JSON
 * (json is null when the function is unknown).
 */
export function decodeCalldata(rawData, abiText, noSel) {
  rawData = rawData.trim();
  if (!rawData) return null;
  const data = hexToBytes(rawData, 'Calldata');
  const user = candidates(abiText);
  let fn, body, selector = null, guessed = false;
  if (noSel) {
    if (user.length !== 1) throw new InputError('Without a selector, enter exactly one signature or parameter list, e.g. (address,uint256)');
    fn = user[0]; body = data;
  } else {
    if (data.length < 4) throw new InputError('Calldata needs at least a 4-byte selector');
    selector = bytesToHex(data.slice(0, 4));
    body = data.slice(4);
    fn = user.find(f => f.name && selectorOf(f.canonical) === selector);
    if (!fn) {
      fn = COMMON_SIGNATURES.map(s => parseSignature(s)).find(f => selectorOf(f.canonical) === selector);
      guessed = !!fn;
    }
    if (!fn) {
      const tried = user.filter(f => f.name).map(f => `${f.canonical} → ${selectorOf(f.canonical)}`);
      return { json: null, rows: [
        { label: 'Selector', value: selector },
        { label: 'Function', value: 'Unknown', copy: false, cls: 'bad',
          note: tried.length ? `No signature you entered matches. Yours: ${tried.join('; ')}` : 'Paste the function signature or ABI above to decode the arguments.' },
        { label: 'Arguments size', value: `${body.length} bytes`, copy: false },
      ] };
    }
  }
  if (!fn.inputs.length && body.length) throw new InputError(`${fn.canonical} takes no arguments, but there are ${body.length} extra bytes`);
  const values = abiDecode(fn.inputs, body);
  const rows = [
    fn.name && { label: 'Function', value: fn.canonical, cls: 'ok', note: guessed ? 'Recognized from the built-in list of common functions.' : '' },
    selector && { label: 'Selector', value: selector },
    ...fn.inputs.map((p, i) => ({ label: `${p.name || '#' + i} · ${typeToString(p.type)}`, value: show(values[i]) })),
  ];
  const named = Object.fromEntries(fn.inputs.map((p, i) => [p.name || String(i), toPlain(values[i])]));
  return { rows, json: JSON.stringify(named, null, 2) };
}

// ---------- Page ----------

// Tabs: ?mode=<tab> selects one; switching keeps the rest of the URL.
function mountTabs() {
  const tabs = [...document.querySelectorAll('.mode-tabs [data-tab]')];
  const show = (mode, push) => {
    if (!tabs.some(t => t.dataset.tab === mode)) mode = tabs[0].dataset.tab;
    for (const t of tabs) {
      const on = t.dataset.tab === mode;
      t.setAttribute('aria-selected', String(on));
      document.getElementById('tab-' + t.dataset.tab).hidden = !on;
    }
    if (push) {
      const u = new URL(location.href);
      u.searchParams.set('mode', mode);
      history.replaceState(null, '', u);
    }
    document.dispatchEvent(new CustomEvent('tabchange', { detail: mode }));
  };
  tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.tab, true)));
  show(new URLSearchParams(location.search).get('mode'), false);
}

function mountEncode() {
  const $ = id => document.getElementById('n-' + id);
  let parsed = null, fieldKey = '';

  function buildFields() {
    const key = parsed.inputs.map(p => typeToString(p.type) + ' ' + p.name).join(',');
    if (key === fieldKey) return;
    const old = [...$('params').querySelectorAll('[data-i]')].map(el => el.value);
    fieldKey = key;
    $('params').innerHTML = parsed.inputs.map((p, i) => {
      const t = typeToString(p.type), multi = p.type.kind === 'array' || p.type.kind === 'tuple' || p.type.kind === 'string' || p.type.kind === 'bytes';
      const attrs = `id="n-p${i}" data-i="${i}" class="mono" spellcheck="false" autocomplete="off" placeholder="${esc(PLACEHOLDER[p.type.kind] || '')}"`;
      return `<div class="field"><label for="n-p${i}" class="muted">${esc(p.name || 'param ' + (i + 1))} <code>${esc(t)}</code></label>
      ${multi ? `<textarea ${attrs} rows="2"></textarea>` : `<input ${attrs}>`}</div>`;
    }).join('');
    parsed.inputs.forEach((p, i) => { if (old[i] !== undefined) $('p' + i).value = old[i]; });
  }

  function render() {
    showError($('err'), null);
    $('out').innerHTML = '';
    $('words-box').hidden = true;
    try {
      parsed = parseSig($('sig').value);
      buildFields();
    } catch (e) {
      parsed = null; fieldKey = ''; $('params').innerHTML = '';
      showError($('err'), e);
      return;
    }
    try {
      const r = encodeCall(parsed, parsed.inputs.map((p, i) => $('p' + i).value));
      renderRows($('out'), r.rows);
      if (r.link) $('out').insertAdjacentHTML('beforeend', `<p style="margin:10px 0 0"><a href="${esc(r.link)}">Decode this calldata →</a></p>`);
      $('words').innerHTML = r.words.map((w, i) =>
        `<span>0x${(i * 32).toString(16).padStart(3, '0')}</span><span>${w}</span>`).join('');
      $('words').style.gridTemplateColumns = 'auto 1fr';
      $('words').style.columnGap = '12px';
      $('words-box').hidden = r.words.length === 0;
    } catch (e) {
      showError($('err'), e);
    }
  }

  $('sig').addEventListener('input', render);
  $('params').addEventListener('input', render);
  parsed = parseSig($('sig').value); buildFields();
  parsed.inputs.forEach((p, i) => { $('p' + i).value = EXAMPLE[p.type.kind] || ''; });
  render();

  // Example: send 25 USDC (6 decimals) to Hardhat/Anvil test account #0.
  $('example').onclick = () => {
    $('sig').value = 'transfer(address to, uint256 amount)';
    render();
    $('p0').value = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    $('p1').value = '25000000';
    render();
  };
}

function mountDecode() {
  const $ = id => document.getElementById('d-' + id);

  function render() {
    showError($('err'), null);
    $('out').innerHTML = '';
    $('json-box').hidden = true;
    try {
      const r = decodeCalldata($('data').value, $('abi').value, $('no-selector').checked);
      if (!r) return;
      renderRows($('out'), r.rows);
      if (r.json === null) return;
      $('json').textContent = r.json;
      $('json-box').hidden = false;
    } catch (e) {
      $('out').innerHTML = '';
      showError($('err'), e);
    }
  }

  for (const el of [$('data'), $('abi'), $('no-selector')]) el.addEventListener('input', render);
  $('data').value = param('data') || '0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000de0b6b3a7640000';
  if (param('sig')) $('abi').value = param('sig');
  render();

  // Example: ERC-20 transfer of 25 USDC (6 decimals), decoded with its signature.
  $('example').onclick = () => {
    $('data').value = '0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb9226600000000000000000000000000000000000000000000000000000000017d7840';
    $('abi').value = 'transfer(address to, uint256 amount)';
    $('no-selector').checked = false;
    render();
  };
}

function mount() {
  mountTabs();
  mountEncode();
  mountDecode();
}

if (globalThis.document) mount();
