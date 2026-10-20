// IBC Denom: compute the ibc/… hash of a denom trace, or look a hash up in a built-in list.
import { sha256, utf8, toHex, kvTable, wireCopy, showError, esc } from '../lib/cosmos.js';

export const ibcHash = trace => 'ibc/' + toHex(sha256(utf8.encode(trace))).toUpperCase();

// [description, chain it lives on, trace] — hashes are computed, not stored.
export const KNOWN = [
  ['ATOM', 'Osmosis', 'transfer/channel-0/uatom'],
  ['OSMO', 'Cosmos Hub', 'transfer/channel-141/uosmo'],
  ['USDC (Noble)', 'Osmosis', 'transfer/channel-750/uusdc'],
  ['TIA', 'Osmosis', 'transfer/channel-6994/utia'],
  ['ATOM', 'Neutron', 'transfer/channel-1/uatom'],
  ['USDC (Noble)', 'Cosmos Hub', 'transfer/channel-536/uusdc'],
  ['NTRN', 'Osmosis', 'transfer/channel-874/untrn'],
  ['STARS', 'Osmosis', 'transfer/channel-75/ustars'],
  ['AKT', 'Osmosis', 'transfer/channel-1/uakt'],
  ['JUNO', 'Osmosis', 'transfer/channel-42/ujuno'],
].map(([d, chain, trace]) => ({ d, chain, trace, hash: ibcHash(trace) }));

/**
 * Resolve a query: a trace ("port/channel/…/denom") or an ibc/<hash> denom.
 * Returns null for empty input; { rows } for a result, or { note } when a hash isn't
 * in the built-in list. Throws on malformed input.
 */
export function lookupDenom(q) {
  q = q.trim();
  if (!q) return null;
  const m = q.match(/^ibc\/([0-9a-f]{64})$/i);
  if (m) {
    const hash = 'ibc/' + m[1].toUpperCase();
    const hit = KNOWN.find(k => k.hash === hash);
    if (hit) return { rows: [['Trace', hit.trace, `${hit.d} on ${hit.chain}`], ['Base denom', hit.trace.split('/').pop()]] };
    return { note: 'This hash isn\'t in the built-in list. Hashing is one-way, so finding its trace needs a query to the chain (/ibc/apps/transfer/v1/denom_traces/' + m[1].toUpperCase() + ').' };
  }
  if (/^ibc\//i.test(q)) throw new Error('An ibc/ denom is "ibc/" followed by 64 hex characters.');
  const parts = q.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length < 3 || parts.length % 2 === 0) throw new Error('A trace is one or more "port/channel" pairs followed by the base denom, e.g. transfer/channel-0/uatom.');
  const hops = [];
  for (let i = 0; i < parts.length - 1; i += 2) {
    if (!/^channel-\d+$/.test(parts[i + 1])) throw new Error(`"${parts[i + 1]}" doesn't look like a channel ID (channel-N).`);
    hops.push(`${parts[i]}/${parts[i + 1]}`);
  }
  const trace = parts.join('/');
  return { rows: [
    ['IBC denom', ibcHash(trace)],
    ['Path', hops.join(' → '), hops.length > 1 ? `${hops.length} hops, newest first` : '1 hop'],
    ['Base denom', parts[parts.length - 1]],
  ] };
}

function mount() {
  const $ = id => document.getElementById(id);
  $('known').innerHTML = `<table class="kv"><thead><tr><th>Token</th><th>Trace and hash</th><th></th></tr></thead><tbody>${KNOWN.map(k =>
    `<tr><th>${esc(k.d)}<div class="muted">on ${esc(k.chain)}</div></th><td class="mono">${esc(k.hash)}<div class="muted">${esc(k.trace)}</div></td><td><button class="icon-btn copy" data-copy="${esc(k.hash)}">Copy</button></td></tr>`).join('')}</tbody></table>`;

  function render() {
    showError($('err'), ''); $('out').innerHTML = '';
    try {
      const r = lookupDenom($('q').value);
      if (!r) return;
      if (r.note) showError($('err'), r.note);
      else $('out').innerHTML = kvTable(r.rows);
    } catch (e) { showError($('err'), e.message); }
  }
  $('q').oninput = render;
  wireCopy(); render();
  // Example button(s)
  $('example').onclick = () => { $('q').value = 'transfer/channel-0/uatom'; render(); };
}

if (globalThis.document) mount();
