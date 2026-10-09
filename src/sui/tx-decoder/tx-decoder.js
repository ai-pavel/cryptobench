// Transaction Decoder: decode Sui transaction bytes (sender, gas, inputs, commands) and the transaction digest.
import { parseHexOrBase64, hex, typeTagToString, shortAddress, kvTable, wireCopy, showError, esc } from '../lib/sui.js';
import { parseTransaction, describePure } from '../lib/tx.js';
const $ = id => document.getElementById(id);
export const EXAMPLE = 'AAAHAAgAypo7AAAAAAAgIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAQAAAAAAAAAAAAkIbWVtbyDinJMBADMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzCQAAAAAAAAAgAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEACAEAAAAAAAAAAAgCAAAAAAAAAAUCAAEBAAABAQMAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACBGNvaW4Eam9pbgEHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDc3VpA1NVSQACAQIAAQMAAwABAQQABQECAgEFAAEGAKLRT61gxWBJ7PdSRqSBk0aRIUzkE+aori/mg0wXOmEzARERERERERERERERERERERERERERERERERERERERERERBwAAAAAAAAAgAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGi0U+tYMVgSez3UkakgZNGkSFM5BPmqK4v5oNMFzphM+gDAAAAAAAAgPD6AgAAAAAB9AEAAAAAAAA=';
const ONE = 10n ** 9n;
export const sui = m => { const v = BigInt(m), f = (v % ONE).toString().padStart(9, '0').replace(/0+$/, ''); return `${v / ONE}${f ? '.' + f : ''} SUI`; };
export const group = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function arg(a) {
  if (a.GasCoin) return 'Gas coin';
  if ('Input' in a) return `Input ${a.Input}`;
  if ('Result' in a) return `Result ${a.Result}`;
  return `Result ${a.NestedResult[0]}.${a.NestedResult[1]}`;
}

// How each input is used, to interpret Pure values.
export function usageHints(tx) {
  const hints = {};
  const mark = (a, h) => { if (a && 'Input' in a) hints[a.Input] = hints[a.Input] || h; };
  for (const c of tx.commands) {
    if (c.SplitCoins) c.SplitCoins.amounts.forEach(a => mark(a, 'u64'));
    if (c.TransferObjects) mark(c.TransferObjects.address, 'address');
  }
  return hints;
}

export function inputRow(inp, i, hint) {
  if (inp.Pure) {
    const guesses = describePure(inp.Pure, hint);
    return `<tr><td>${i}</td><td>Pure</td><td><div class="mono">0x${hex.encode(inp.Pure)}</div>${guesses.length ? `<div class="muted">${guesses.map(esc).join(' · ')}</div>` : ''}</td></tr>`;
  }
  if (inp.Object) {
    const [k, o] = Object.entries(inp.Object)[0];
    const extra = k === 'SharedObject' ? `initial shared version ${o.initialSharedVersion}, ${o.mutable ? 'mutable' : 'read-only'}` : `version ${o.version}, digest ${o.digest}`;
    const label = { ImmOrOwnedObject: 'Owned object', SharedObject: 'Shared object', Receiving: 'Receiving object' }[k];
    return `<tr><td>${i}</td><td>${label}</td><td><div class="mono">${o.objectId}</div><div class="muted">${esc(extra)}</div></td></tr>`;
  }
  const f = inp.FundsWithdrawal;
  return `<tr><td>${i}</td><td>Funds withdrawal</td><td class="mono">up to ${f.maxAmount} of ${esc(typeTagToString(f.typeArg))} from ${esc(typeof f.from === 'string' ? f.from : 'allowance ' + f.from.SenderAllowance.allowance)}</td></tr>`;
}

export function commandHtml(c, i) {
  const [k, v] = Object.entries(c)[0];
  let body;
  if (k === 'MoveCall') body = `<div class="mono">${esc(shortAddress(v.package))}::${esc(v.module)}::${esc(v.function)}${v.typeArguments.length ? esc(`<${v.typeArguments.map(typeTagToString).join(', ')}>`) : ''}</div><div class="muted">Arguments: ${v.arguments.map(arg).join(', ') || 'none'}</div>`;
  else if (k === 'TransferObjects') body = `<div class="muted">Objects: ${v.objects.map(arg).join(', ')} → recipient ${arg(v.address)}</div>`;
  else if (k === 'SplitCoins') body = `<div class="muted">Coin: ${arg(v.coin)}; amounts: ${v.amounts.map(arg).join(', ')}</div>`;
  else if (k === 'MergeCoins') body = `<div class="muted">Into ${arg(v.destination)} from ${v.sources.map(arg).join(', ')}</div>`;
  else if (k === 'MakeMoveVec') body = `<div class="muted">Type: ${v.type ? esc(typeTagToString(v.type)) : 'inferred (objects)'}; elements: ${v.elements.map(arg).join(', ') || 'none'}</div>`;
  else if (k === 'Publish') body = `<div class="muted">${v.modules.length} module(s), ${v.modules.reduce((n, m) => n + m.length, 0)} bytes; dependencies: ${v.dependencies.map(d => esc(shortAddress(d))).join(', ') || 'none'}</div>`;
  else body = `<div class="muted">Package ${esc(shortAddress(v.package))}, ${v.modules.length} module(s), ticket ${arg(v.ticket)}; dependencies: ${v.dependencies.map(d => esc(shortAddress(d))).join(', ')}</div>`;
  return `<div class="cmd"><span class="name">${i}. ${k}</span>${body}</div>`;
}

export function expirationText(e) {
  if (e.None) return 'None';
  if (e.Epoch) return `Epoch ${e.Epoch}`;
  const [k, v] = Object.entries(e)[0];
  const parts = [];
  if (v.minEpoch !== null) parts.push(`min epoch ${v.minEpoch}`);
  if (v.maxEpoch !== null) parts.push(`max epoch ${v.maxEpoch}`);
  if (v.minTimestamp !== null) parts.push(`after ${new Date(Number(v.minTimestamp)).toISOString()}`);
  if (v.maxTimestamp !== null) parts.push(`before ${new Date(Number(v.maxTimestamp)).toISOString()}`);
  parts.push(`chain ${v.chain}`, `nonce ${v.nonce}`);
  return `${k}: ${parts.join(', ')}`;
}

// Decodes transaction bytes (base64 or hex) and returns the result HTML.
export function decodeTransactionHtml(input) {
  const tx = parseTransaction(parseHexOrBase64(input, 'Transaction bytes'));
  const hints = usageHints(tx);
  let html = '';
  if (tx.type === 'TransactionData') {
    html += kvTable([
      ['Digest', tx.digest, 'Transaction ID (base58)'],
      ['Sender', tx.sender],
      ['Gas budget', `${group(tx.gas.budget)} MIST`, sui(tx.gas.budget)],
      ['Gas price', `${group(tx.gas.price)} MIST per unit`],
      ['Gas owner', tx.gas.owner, tx.gas.owner === tx.sender ? 'Same as sender' : 'Sponsored: gas is paid by another address'],
      ['Expiration', expirationText(tx.expiration)],
    ]);
    html += `<p class="section-title">Gas payment (${tx.gas.payment.length})</p>` + (tx.gas.payment.length ? kvTable(tx.gas.payment.map((p, i) => [`Coin ${i}`, p.objectId, `version ${p.version}, digest ${p.digest}`])) : '<p class="muted">None.</p>');
  } else html += '<p class="note">These bytes are a transaction kind only (no sender, gas or expiration), so there is no digest.</p>';
  html += `<p class="section-title">${tx.kind === 'ProgrammableSystemTransaction' ? 'Programmable system transaction' : 'Programmable transaction'}: inputs (${tx.inputs.length})</p>`;
  html += tx.inputs.length ? `<table class="inputs"><thead><tr><th>#</th><th style="width:28%">Kind</th><th>Value</th></tr></thead><tbody>${tx.inputs.map((x, i) => inputRow(x, i, hints[i])).join('')}</tbody></table>` : '<p class="muted">None.</p>';
  html += `<p class="section-title">Commands (${tx.commands.length})</p>` + tx.commands.map(commandHtml).join('');
  return html;
}

function mount() {
  function render() {
    showError($('err'), ''); $('out').innerHTML = '';
    if (!$('tx').value.trim()) return;
    try { $('out').innerHTML = decodeTransactionHtml($('tx').value); }
    catch (e) { showError($('err'), e.message); }
  }
  $('tx').oninput = render;
  $('example').onclick = () => { $('tx').value = EXAMPLE; render(); };
  wireCopy();
  render();
  // ex-applied
}

if (globalThis.document) mount();
