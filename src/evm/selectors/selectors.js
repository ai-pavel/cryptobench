// Selectors & Topics: compute function selectors and event topics from Solidity signatures.
import { parseSignature, selectorOf, keccakHex, utf8, InputError } from '../lib/evm.js';
import { esc, errorText } from '../lib/ui.js';

/** Non-empty trimmed lines of the input; each is one signature. */
export const signatureLines = text => text.split('\n').map(l => l.trim()).filter(Boolean);

/**
 * A function (or event) signature line: its canonical form, whether it is an event,
 * its selector (or event topic) and full Keccak-256 hash.
 */
export function functionSelector(line) {
  const sig = parseSignature(line);
  if (!sig.name) throw new InputError('Missing function name');
  const isEvent = sig.kind === 'event';
  const hash = keccakHex(utf8(sig.canonical));
  return { canonical: sig.canonical, isEvent, value: isEvent ? hash : selectorOf(sig.canonical), hash };
}

/**
 * An event signature line: its canonical form, topic 0 and how its parameters are laid
 * out across topics and data (tooMany when more than 3 are indexed).
 */
export function eventTopic(line) {
  const sig = parseSignature(line);
  if (!sig.name) throw new InputError('Missing event name');
  const indexed = sig.inputs.map((p, i) => ({ p, i })).filter(x => x.p.indexed);
  const data = sig.inputs.map((p, i) => ({ p, i })).filter(x => !x.p.indexed);
  const name = x => x.p.name || `#${x.i}`;
  const tooMany = indexed.length > 3;
  const layout = tooMany
    ? 'Too many indexed parameters: an event can have at most 3 (4 if anonymous).'
    : [
        'topic 0 = event hash',
        ...indexed.map((x, k) => `topic ${k + 1} = ${name(x)}`),
        data.length ? `data = ${data.map(name).join(', ')}` : 'data = (empty)',
      ].join('\n');
  return { canonical: sig.canonical, topic: keccakHex(utf8(sig.canonical)), layout, tooMany };
}

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

function mountFunctions() {
  const $ = id => document.getElementById('f-' + id);

  function render() {
    $('out').innerHTML = signatureLines($('input').value).map(line => {
      try {
        const r = functionSelector(line);
        return `<div class="out" style="margin-top:12px">
        <div class="kv"><div class="k">Signature</div><div class="v">${esc(r.canonical)}</div><button class="icon-btn copy" data-copy="${esc(r.canonical)}">Copy</button></div>
        <div class="kv ok"><div class="k">${r.isEvent ? 'Event topic' : 'Selector'}</div><div class="v">${r.value}</div><button class="icon-btn copy" data-copy="${r.value}">Copy</button></div>
        ${r.isEvent ? '<div class="kv"><div class="k">Note</div><div class="v" style="font-family:inherit">This is an event; it has a 32-byte topic, not a selector.</div><span></span></div>'
          : `<div class="kv"><div class="k">Keccak-256</div><div class="v">${r.hash}</div><button class="icon-btn copy" data-copy="${r.hash}">Copy</button></div>`}
      </div>`;
      } catch (e) {
        return `<p class="error"><span class="mono">${esc(line)}</span>\n${esc(errorText(e))}</p>`;
      }
    }).join('');
  }
  $('input').addEventListener('input', render);
  render();
  // Example: ERC-20 functions; transfer's selector is 0xa9059cbb.
  $('example').onclick = () => { $('input').value = "function transfer(address to, uint256 amount) external returns (bool);\napprove(address spender, uint amount)"; render(); };
}

function mountEvents() {
  const $ = id => document.getElementById('e-' + id);

  const row = (k, v, copy = true, cls = '') =>
    `<div class="kv ${cls}"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>${copy ? `<button class="icon-btn copy" data-copy="${esc(v)}">Copy</button>` : '<span></span>'}</div>`;

  function render() {
    $('out').innerHTML = signatureLines($('input').value).map(line => {
      try {
        const r = eventTopic(line);
        return `<div class="out" style="margin-top:12px">
        ${row('Signature', r.canonical)}
        ${row('Topic 0', r.topic, true, 'ok')}
        ${row('Log layout', r.layout, false, r.tooMany ? 'bad' : '')}
      </div>`;
      } catch (e) {
        return `<p class="error"><span class="mono">${esc(line)}</span>\n${esc(errorText(e))}</p>`;
      }
    }).join('');
  }
  $('input').addEventListener('input', render);
  render();
  // Example: ERC-20 events; Transfer's topic is 0xddf252ad….
  $('example').onclick = () => { $('input').value = "event Transfer(address indexed from, address indexed to, uint256 value);\nevent Approval(address indexed owner, address indexed spender, uint256 value)"; render(); };
}

function mount() {
  mountTabs();
  mountFunctions();
  mountEvents();
}

if (globalThis.document) mount();
