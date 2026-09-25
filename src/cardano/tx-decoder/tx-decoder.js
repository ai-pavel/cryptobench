// Transaction Decoder: decode a Cardano transaction from CBOR, compute its ID and check its signatures.
import { readItem, decode, toHex, fromHex, Tag, CborMap, blake2b224, blake2b256, ed25519, parseAddressBytes, assetFingerprint, assetNameText,
  metadataToJSON, formatAda, scriptHash, encode, bech32Encode } from '../lib/cardano.js';
import { pretty } from '../lib/cbor.js';
import { $, row, esc, showError } from '../lib/ui.js';

export const EXAMPLE = '84a700d9010281825820abababababababababababababababababababababababababababababababab010182825839019493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251821a001e8480a1581c7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373a1465041544154450582581d619493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e1a0012d687021a00029810031a05f5e0ff04d901028183028200581c337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251581c1111111111111111111111111111111111111111111111111111111105a1581de1337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c4725119138807582006dfa4056b702ef97817a03563418883447a3125038524e28400adca0950ae2ca100d9010281825820ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c58406cf3feebe2fb89633dc9b41a29d51b30afa5426189e28fac0b643b8826516c9894d1e5da69df25c8b2f9ce1371bb3dc1cac120ed5ebd6762aa92fa1b738eeb07f5a11902a2a1636d7367826568656c6c6f65776f726c64';

export const CERTS = { 0: 'Stake registration', 1: 'Stake deregistration', 2: 'Stake delegation', 3: 'Pool registration', 4: 'Pool retirement',
  5: 'Genesis key delegation', 6: 'Move instantaneous rewards', 7: 'Stake registration (with deposit)', 8: 'Stake deregistration (with refund)',
  9: 'Vote delegation', 10: 'Stake and vote delegation', 11: 'Stake registration and delegation', 12: 'Vote registration and delegation',
  13: 'Stake and vote registration and delegation', 14: 'Committee hot key authorization', 15: 'Committee cold key resignation',
  16: 'DRep registration', 17: 'DRep deregistration', 18: 'DRep update' };
export const WITNESS = { 0: 'VKey witnesses', 1: 'Native scripts', 2: 'Bootstrap (Byron) witnesses', 3: 'Plutus V1 scripts', 4: 'Plutus data', 5: 'Redeemers', 6: 'Plutus V2 scripts', 7: 'Plutus V3 scripts' };
const BODY_KNOWN = new Set([0, 1, 2, 3, 4, 5, 7, 8, 9, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);

export const unset = v => (v instanceof Tag && v.tag === 258 ? v.value : v) || [];
const big = v => BigInt(v);
const details = (title, inner, open = false) => `<details${open ? ' open' : ''}><summary>${title}</summary>${inner}</details>`;
const pre = obj => `<pre class="json">${esc(typeof obj === 'string' ? obj : pretty(obj))}</pre>`;

export function addrText(bytes) {
  try { const a = parseAddressBytes(bytes); return { text: a.bech32 || a.base58, note: a.typeName }; }
  catch { return { text: toHex(bytes), note: 'Unrecognized address' }; }
}
export function credText(c) {
  if (!Array.isArray(c)) return pretty(c);
  return `${Number(c[0]) === 0 ? 'key hash' : 'script hash'} ${toHex(c[1])}`;
}
export function assetsList(ma) {
  if (!(ma instanceof CborMap)) return '';
  const lines = [];
  for (const [policy, names] of ma.entries) for (const [name, qty] of names.entries) {
    const text = assetNameText(name);
    lines.push(row(`${text && name.length ? text : toHex(name) || '(no name)'} · ${assetFingerprint(policy, name)}`, String(qty), `Policy ${toHex(policy)}${name.length ? ' · name ' + toHex(name) : ''}`));
  }
  return lines.join('');
}
export function valueOf(v) {
  if (Array.isArray(v)) return { coin: big(v[0]), assets: v[1] };
  return { coin: big(v), assets: null };
}
export function inputsHtml(list) {
  const items = unset(list);
  return `<div class="kv">${items.map((i, n) => row(`#${n}`, `${toHex(i[0])}#${i[1]}`)).join('') || '<p class="muted">None</p>'}</div>`;
}
export function outputHtml(o, n) {
  let addr, amount, datum = null, scriptRef = null;
  if (o instanceof CborMap) { addr = o.get(0); amount = o.get(1); datum = o.get(2); scriptRef = o.get(3); }
  else { [addr, amount] = o; if (o[2]) datum = [0, o[2]]; }
  const a = addrText(addr), v = valueOf(amount);
  let extra = '';
  if (datum) extra += Number(datum[0]) === 0 ? row('Datum hash', toHex(datum[1])) : row('Inline datum (CBOR)', toHex(datum[1] instanceof Tag ? datum[1].value : datum[1]));
  if (scriptRef) extra += row('Reference script (CBOR)', toHex(scriptRef instanceof Tag ? scriptRef.value : scriptRef));
  return details(`#${n} · ${esc(formatAda(v.coin))}${v.assets ? ` <span class="tag">+ ${v.assets.entries.reduce((k, [, m]) => k + m.size, 0)} tokens</span>` : ''}`,
    `<div class="kv">${row('Address', a.text, a.note)}${row('Lovelace', v.coin.toString())}${assetsList(v.assets)}${extra}</div>`, true);
}

export function decodeTx(bytes) {
  const spans = new Map();
  const [tx, end] = readItem(bytes, 0, spans);
  if (end !== bytes.length) throw new Error(`Extra ${bytes.length - end} bytes after the transaction.`);
  if (!Array.isArray(tx) || tx.length < 2 || !(tx[0] instanceof CborMap)) throw new Error('Not a transaction: expected [body, witnesses, …]. If this is only a body or a witness set, paste the full signed transaction.');
  const [bs, be] = spans.get(tx[0]);
  const bodyBytes = bytes.slice(bs, be);
  let auxBytes = null, aux = null, isValid = true;
  if (tx.length === 4) { isValid = tx[2]; aux = tx[3]; }
  else if (tx.length === 3) aux = tx[2];
  if (aux !== null && aux !== undefined && typeof aux === 'object') { const sp = spans.get(aux); if (sp) auxBytes = bytes.slice(sp[0], sp[1]); }
  return { tx, body: tx[0], wits: tx[1], aux, auxBytes, isValid, id: blake2b256(bodyBytes) };
}

export function metadataOf(aux) {
  if (aux instanceof CborMap) return aux;                       // Shelley: metadata map
  if (Array.isArray(aux)) return aux[0];                         // Allegra/Mary: [metadata, scripts]
  if (aux instanceof Tag && aux.tag === 259) return aux.value.get(0); // Alonzo+: tagged map
  return null;
}

// The pasted text: CBOR hex, or a cardano-cli JSON envelope with "cborHex". Returns the transaction bytes.
export function parseTxInput(input) {
  let v = input.trim();
  if (v.startsWith('{')) {
    let env; try { env = JSON.parse(v); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    if (!env.cborHex) throw new Error('The JSON has no "cborHex" field.');
    v = env.cborHex;
  }
  return fromHex(v);
}

// The VKey witnesses, each checked against the transaction ID.
export function signatures(t) {
  const wits = t.wits instanceof CborMap ? t.wits : new CborMap();
  return unset(wits.get(0)).map(([vk, sig]) => {
    let ok = false; try { ok = ed25519.verify(sig, t.id, vk); } catch {}
    return { keyHash: toHex(blake2b224(vk)), publicKey: toHex(vk), ok };
  });
}

// The summary of a decoded transaction: ID, fee, outputs and their total, signatures.
export function txSummary(t) {
  const b = t.body;
  const outs = unset(b.get(1));
  const total = outs.reduce((s, o) => s + valueOf(o instanceof CborMap ? o.get(1) : o[1]).coin, 0n);
  const fee = b.get(2) !== undefined ? big(b.get(2)) : 0n;
  const sigs = signatures(t);
  return { txId: toHex(t.id), fee, outputs: outs.length, total, signatures: sigs, allOk: sigs.length > 0 && sigs.every(s => s.ok), isValid: t.isValid };
}

export function summaryHtml(s) {
  const n = s.signatures.length;
  return [
    row('Transaction ID', s.txId, 'Blake2b-256 of the transaction body'),
    row('Fee', formatAda(s.fee), s.fee.toString() + ' lovelace'),
    row('Outputs', `${s.outputs} · ${formatAda(s.total)}`),
    `<div class="kv-row"><div class="kv-label">Signatures</div><div class="kv-value ${n ? (s.allOk ? 'ok' : 'bad') : ''}">${n ? (s.allOk ? `✓ ${n} valid` : '✗ some signatures are invalid') : 'None (unsigned or script-only)'}</div></div>`,
    s.isValid === false ? row('Phase-2 validity', 'false', 'Script validation failed: only collateral is spent.') : '',
  ].join('');
}

// The certificate's credential (and pool, for delegations), or '' for other kinds.
export function certNote(c) {
  const kind = Number(c[0]);
  return (kind <= 2 || (kind >= 7 && kind <= 13)) && Array.isArray(c[1]) ? 'Credential: ' + credText(c[1]) + (kind === 2 || kind === 10 || kind === 11 || kind === 13 ? ' · pool ' + bech32Encode('pool', c[2]) : '') : '';
}

// The detail tree of a decoded transaction: inputs, outputs, other body fields, metadata, witnesses.
export function treeHtml(t, sigs = signatures(t)) {
  const b = t.body;
  const outs = unset(b.get(1));
  const wits = t.wits instanceof CborMap ? t.wits : new CborMap();
  const vkeys = unset(wits.get(0));
  // Signatures over the transaction ID
  const sigRows = sigs.map(({ keyHash, publicKey, ok }) =>
    `<div class="kv-row"><div class="kv-label">Key hash ${esc(keyHash)}</div><div class="kv-value ${ok ? 'ok' : 'bad'}">${ok ? '✓ valid signature' : '✗ invalid signature'}</div>` +
    `<div class="kv-note">Public key ${esc(publicKey)}</div></div>`);

  const parts = [];
  parts.push(details(`Inputs <span class="tag">${unset(b.get(0)).length}</span>`, inputsHtml(b.get(0))));
  parts.push(details(`Outputs <span class="tag">${outs.length}</span>`, `<div class="tree">${outs.map(outputHtml).join('')}</div>`, true));

  const misc = [];
  if (b.has(3)) misc.push(row('Valid until slot (TTL)', String(b.get(3))));
  if (b.has(8)) misc.push(row('Valid from slot', String(b.get(8))));
  if (b.has(15)) misc.push(row('Network ID', String(b.get(15)), Number(b.get(15)) === 1 ? 'Mainnet' : 'Testnet'));
  if (b.has(7)) {
    const h = toHex(b.get(7));
    const check = t.auxBytes ? (toHex(blake2b256(t.auxBytes)) === h ? ' · matches the auxiliary data' : ' · does NOT match the auxiliary data') : '';
    misc.push(row('Auxiliary data hash', h, 'Hash of the metadata' + check));
  }
  if (b.has(11)) misc.push(row('Script data hash', toHex(b.get(11))));
  if (b.has(17)) misc.push(row('Total collateral', formatAda(big(b.get(17)))));
  if (b.has(21)) misc.push(row('Current treasury value', formatAda(big(b.get(21)))));
  if (b.has(22)) misc.push(row('Treasury donation', formatAda(big(b.get(22)))));
  if (misc.length) parts.push(details('Validity and other fields', `<div class="kv">${misc.join('')}</div>`));

  if (b.has(9)) {
    const mint = b.get(9);
    parts.push(details(`Mint and burn <span class="tag">${mint.entries.reduce((k, [, m]) => k + m.size, 0)}</span>`, `<div class="kv">${assetsList(mint)}</div><p class="muted">Negative quantities are burns.</p>`));
  }
  if (b.has(4)) {
    const certs = unset(b.get(4));
    parts.push(details(`Certificates <span class="tag">${certs.length}</span>`, `<div class="kv">${certs.map((c, n) => {
      const kind = Number(c[0]);
      const note = certNote(c);
      return `<div class="kv-row"><div class="kv-label">#${n} · ${esc(CERTS[kind] || 'Certificate type ' + kind)}</div><div class="kv-value" style="grid-column:1/-1">${esc(note)}</div>${pre(c)}</div>`;
    }).join('')}</div>`));
  }
  if (b.has(5)) {
    const w = b.get(5);
    parts.push(details(`Withdrawals <span class="tag">${w.size}</span>`, `<div class="kv">${w.entries.map(([a, amt]) => row(addrText(a).text, formatAda(big(amt)))).join('')}</div>`));
  }
  if (b.has(13)) parts.push(details('Collateral inputs', inputsHtml(b.get(13))));
  if (b.has(16)) parts.push(details('Collateral return', `<div class="tree">${outputHtml(b.get(16), 0)}</div>`));
  if (b.has(18)) parts.push(details('Reference inputs', inputsHtml(b.get(18))));
  if (b.has(14)) parts.push(details('Required signers', `<div class="kv">${unset(b.get(14)).map((h, n) => row(`#${n}`, toHex(h))).join('')}</div>`));
  if (b.has(19)) parts.push(details('Voting procedures', pre(b.get(19))));
  if (b.has(20)) parts.push(details('Governance proposals', pre(b.get(20))));
  const unknown = b.entries.filter(([k]) => !BODY_KNOWN.has(Number(k)));
  if (unknown.length) parts.push(details('Other body fields', pre(new CborMap(unknown))));

  const md = metadataOf(t.aux);
  if (md instanceof CborMap && md.size) parts.push(details(`Metadata <span class="tag">${md.entries.map(([k]) => 'label ' + k).join(', ')}</span>`, pre(JSON.stringify(metadataToJSON(md), null, 2)), true));

  const witParts = [];
  if (sigRows.length) witParts.push(`<div class="kv">${sigRows.join('')}</div>`);
  for (const [k, val] of wits.entries) {
    const key = Number(k);
    if (key === 0) continue;
    const items = unset(val);
    let inner = '';
    if (key === 1 || key === 3 || key === 6 || key === 7) {
      const tag = key === 1 ? 0 : key === 3 ? 1 : key === 6 ? 2 : 3;
      inner = `<div class="kv">${items.map((sc, n) => row(`#${n} script hash`, toHex(scriptHash(tag, key === 1 ? encode(sc) : sc)))).join('')}</div>`;
    } else inner = pre(val);
    witParts.push(details(`${esc(WITNESS[key] || 'Witness field ' + key)} <span class="tag">${Array.isArray(items) ? items.length : val instanceof CborMap ? val.size : 1}</span>`, inner));
  }
  parts.push(details(`Witnesses <span class="tag">${vkeys.length} signatures</span>`, witParts.join('') || '<p class="muted">None</p>'));
  parts.push(details('Raw body (JSON)', pre(b)));
  return parts.join('');
}

function mount() {
  function render() {
    $('summary').innerHTML = ''; $('tree').innerHTML = '';
    const v = $('tx').value.trim();
    if (!v) { showError($('err')); return; }
    try {
      const t = decodeTx(parseTxInput(v));
      const s = txSummary(t);
      showError($('err'));
      $('summary').innerHTML = summaryHtml(s);
      $('tree').innerHTML = treeHtml(t, s.signatures);
    } catch (e) { showError($('err'), e); }
  }
  $('tx').addEventListener('input', render);
  $('example').onclick = () => { $('tx').value = EXAMPLE; render(); };
}

if (globalThis.document) mount();
