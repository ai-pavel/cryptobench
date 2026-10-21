// Transaction Decoder: decode a protobuf-encoded Cosmos SDK transaction (TxRaw) into readable form.
import { sha256, base64, toHex, parseHexOrBase64, cosmosAddressBytes, ethAddressBytes, encodeBech32, secp256k1, kvTable, wireCopy, showError, esc } from '../lib/cosmos.js';
import { decode, S, MSGS, PUBKEYS } from '../lib/proto.js';
export const EXAMPLE = 'Cr0HCpABChwvY29zbW9zLmJhbmsudjFiZXRhMS5Nc2dTZW5kEnAKLWNvc21vczE5cmw0Y20yaG1yOGFmeTRrbGRweHozZmthNGpndXEwYXVxZGFsNBItY29zbW9zMWpya21kY3dncTk0dWFhbXg2emF4Mmx1ZXdsaGY3dTRrdWN4M2t6GhAKBXVhdG9tEgcxMjM0NTY3Cp4BCiMvY29zbW9zLnN0YWtpbmcudjFiZXRhMS5Nc2dEZWxlZ2F0ZRJ3Ci1jb3Ntb3MxOXJsNGNtMmhtcjhhZnk0a2xkcHh6M2ZrYTRqZ3VxMGF1cWRhbDQSNGNvc21vc3ZhbG9wZXIxc2psbHNucmFtdGczZXd4cXd3cndqeGZnYzRuNGVmOXUybGNuajAaEAoFdWF0b20SBzUwMDAwMDAKzAEKKS9pYmMuYXBwbGljYXRpb25zLnRyYW5zZmVyLnYxLk1zZ1RyYW5zZmVyEp4BCgh0cmFuc2ZlchILY2hhbm5lbC0xNDEaDAoFdWF0b20SAzEwMCItY29zbW9zMTlybDRjbTJobXI4YWZ5NGtsZHB4ejNma2E0amd1cTBhdXFkYWw0Kitvc21vMXF5cHF4cHE5cWNyc3N6ZzJwdnhxNnJzMHpxZzN5eWM1bHp2N3h1MgcIARD/rOIEOICA1K6zhrqjGkIIaWJjIG1lbW8K3wEKHS9jb3Ntb3MuYXV0aHoudjFiZXRhMS5Nc2dFeGVjEr0BCi1jb3Ntb3MxOXJsNGNtMmhtcjhhZnk0a2xkcHh6M2ZrYTRqZ3VxMGF1cWRhbDQSiwEKHC9jb3Ntb3MuYmFuay52MWJldGExLk1zZ1NlbmQSawotY29zbW9zMWpya21kY3dncTk0dWFhbXg2emF4Mmx1ZXdsaGY3dTRrdWN4M2t6Ei1jb3Ntb3MxOXJsNGNtMmhtcjhhZnk0a2xkcHh6M2ZrYTRqZ3VxMGF1cWRhbDQaCwoFdW9zbW8SAjQyCsIBCiQvY29zbXdhc20ud2FzbS52MS5Nc2dFeGVjdXRlQ29udHJhY3QSmQEKLWNvc21vczE5cmw0Y20yaG1yOGFmeTRrbGRweHozZmthNGpndXEwYXVxZGFsNBJBY29zbW9zMTRoajJ0YXZxOGZwZXNkd3h4Y3U0NHJ0eTNoaDkwdmh1anJ2Y21zdGw0enIzdHhtZnZ3OXM0aG1hbHIaGXsic3dhcCI6eyJtaW5fb3V0IjoiMTAifX0qCgoFdWF0b20SATcSEWhlbGxvIGZyb20gY29zbWpzEmcKUApGCh8vY29zbW9zLmNyeXB0by5zZWNwMjU2azEuUHViS2V5EiMKIQJPTirZnDTWC5umKDyUMahBivhnMhKWH5ene2N3/NBbYhIECgIIARgHEhMKDQoFdWF0b20SBDUwMDAQkKEPGkCBXnhNfNpzTc9yAY/BVu84DYsYv9AFRQ7JHHw1duFdRFNFQRMhKddggMW1zzTkYBZKei9ghXr2jgizIniFj5en';

export function readInput(text) {
  const t = text.trim();
  if (t.startsWith('{')) {
    let j; try { j = JSON.parse(t); } catch { throw new Error('Input looks like JSON but isn\'t valid JSON.'); }
    const b = j.tx_bytes ?? j.txBytes ?? j.tx;
    if (typeof b !== 'string') throw new Error('JSON input needs a "tx_bytes" field with the base64 transaction (as sent to /cosmos/tx/v1beta1/txs). Decoded JSON transactions are already readable.');
    return parseHexOrBase64(b, 'tx_bytes');
  }
  return parseHexOrBase64(t, 'Transaction');
}

export const coins = list => (list || []).map(c => `${c.amount}${c.denom}`).join(', ') || '—';
export const isCoin = v => v && typeof v === 'object' && !Array.isArray(v) && 'denom' in v && 'amount' in v;
export function fmt(v) {
  if (v instanceof Uint8Array) return base64.encode(v);
  if (isCoin(v)) return `${v.amount}${v.denom}`;
  if (Array.isArray(v) && v.every(isCoin)) return coins(v);
  if (v && typeof v === 'object' && 'revision_height' in v) return `revision ${v.revision_number || 0}, height ${v.revision_height || 0}`;
  if (typeof v === 'object') return JSON.stringify(v, replacer, 2);
  return String(v);
}
export const replacer = (k, v) => (v instanceof Uint8Array ? base64.encode(v) : typeof v === 'bigint' ? v.toString() : v);

export function messageCard(m, i, prefix = '') {
  const type = m['@type'], label = MSGS[type]?.[0];
  const head = `<p class="section-title" style="margin:0 0 4px">${esc(prefix)}${i + 1}. ${esc(label || (m['@unknown'] ? 'Unknown message' : type))}</p><div class="type muted">${esc(type)}</div>`;
  if (m['@unknown']) return `<div class="msg">${head}<pre class="json">${esc(JSON.stringify(m.fields, null, 2))}</pre></div>`;
  const rows = [], nested = [];
  for (const [k, v] of Object.entries(m)) {
    if (k === '@type') continue;
    if (k === 'msgs' && Array.isArray(v)) { v.forEach((x, j) => nested.push(messageCard(x, j, `${i + 1}.`))); continue; }
    if (k === 'msg' && typeof v === 'object') { rows.push([k, JSON.stringify(v, null, 2), 'Contract message (JSON)']); continue; }
    if (k === 'timeout_timestamp' && v !== '0') { rows.push([k, v, new Date(Number(BigInt(v) / 1000000n)).toISOString() + ' (nanoseconds since epoch)']); continue; }
    if (k === '_unknown') { rows.push(['unknown fields', JSON.stringify(v)]); continue; }
    rows.push([k, fmt(v)]);
  }
  return `<div class="msg">${head}${kvTable(rows)}${nested.length ? `<div style="margin-left:10px">${nested.join('')}</div>` : ''}</div>`;
}

export function findPrefix(obj) {
  let found = '';
  JSON.stringify(obj, (k, v) => { if (!found && typeof v === 'string') { const m = v.match(/^([a-z]+?)(valoper)?1[02-9ac-hj-np-z]{38,}$/); if (m) found = m[1]; } return v instanceof Uint8Array ? null : v; });
  return found || 'cosmos';
}

export function signerAddress(pk, prefix) {
  const kind = PUBKEYS[pk['@type']];
  if (!pk.key || !kind) return '';
  try {
    if (kind === 'secp256k1') return encodeBech32(prefix, cosmosAddressBytes(pk.key));
    if (kind === 'ethsecp256k1') return encodeBech32(prefix, ethAddressBytes(secp256k1.Point.fromBytes(pk.key).toBytes(false)));
    if (kind === 'ed25519') return encodeBech32(prefix, sha256(pk.key).slice(0, 20));
  } catch {}
  return '';
}

/**
 * Decode a transaction given as base64, hex or { "tx_bytes": … } JSON. Returns null
 * for empty input; otherwise the bytes, hash, decoded body, auth info, signatures,
 * messages and the address prefix found in the messages. Throws on invalid input.
 */
export function decodeTx(text) {
  if (!text.trim()) return null;
  const bytes = readInput(text);
  const raw = decode(bytes, S.TxRaw);
  if (!raw.body_bytes) throw new Error('No transaction body found — this doesn\'t look like a TxRaw.');
  const body = decode(raw.body_bytes, S.TxBody);
  const auth = raw.auth_info_bytes ? decode(raw.auth_info_bytes, S.AuthInfo) : {};
  const msgs = body.messages || [];
  return { bytes, hash: toHex(sha256(bytes)).toUpperCase(), body, auth, sigs: raw.signatures || [], msgs, prefix: findPrefix(msgs) };
}

// The result HTML for a decoded transaction.
export function txHtml({ bytes, hash, body, auth, sigs, msgs, prefix }) {
  const fee = auth.fee || {};
  let html = kvTable([
    ['Transaction hash', hash, 'SHA-256 of the transaction bytes'],
    ['Messages', String(msgs.length), msgs.map(m => MSGS[m['@type']]?.[0] || m['@type']).join(', ')],
    ['Memo', body.memo || '—'],
    ['Fee', coins(fee.amount), `Gas limit ${fee.gas_limit || '0'}`],
    ...(fee.payer ? [['Fee payer', fee.payer]] : []),
    ...(fee.granter ? [['Fee granter', fee.granter]] : []),
    ...(body.timeout_height && body.timeout_height !== '0' ? [['Timeout height', body.timeout_height]] : []),
    ['Size', `${bytes.length} bytes`],
  ]);
  html += `<p class="section-title">Messages</p>` + (msgs.length ? msgs.map((m, i) => messageCard(m, i)).join('') : '<p class="muted">No messages.</p>');
  const signers = auth.signer_infos || [];
  html += `<p class="section-title">Signers</p>`;
  html += signers.length ? signers.map((s, i) => {
    const pk = s.public_key || {};
    const kind = PUBKEYS[pk['@type']] || pk['@type'] || 'none';
    const rows = [
      ['Public key type', kind, pk['@type'] || 'No public key (account already has one on chain)'],
      ...(pk.key ? [['Public key', base64.encode(pk.key), toHex(pk.key)]] : []),
    ];
    const addr = signerAddress(pk, prefix);
    if (addr) rows.push(['Signer address', addr, `Derived from the public key with prefix "${prefix}"`]);
    if (pk.threshold) rows.push(['Multisig', `${pk.threshold} of ${(pk.public_keys || []).length}`]);
    rows.push(['Sign mode', s.mode_info?.single?.mode || (s.mode_info?.multi ? 'multisig' : '—')], ['Sequence', s.sequence || '0']);
    if (sigs[i]) rows.push(['Signature', base64.encode(sigs[i]), `${sigs[i].length} bytes · hex ${toHex(sigs[i])}`]);
    return `<div class="msg"><p class="section-title" style="margin:0 0 4px">Signer ${i + 1}</p>${kvTable(rows)}</div>`;
  }).join('') : '<p class="muted">No signer info.</p>';
  if (sigs.length > signers.length) html += `<p class="note">${sigs.length} signatures but ${signers.length} signer infos.</p>`;
  html += `<details style="margin-top:14px"><summary>Decoded JSON</summary><pre class="json">${esc(JSON.stringify({ body, auth_info: auth, signatures: sigs }, replacer, 2))}</pre></details>`;
  return html;
}

function mount() {
  const $ = id => document.getElementById(id);

  function render() {
    showError($('err'), ''); $('out').innerHTML = '';
    try {
      const tx = decodeTx($('tx').value);
      if (tx) $('out').innerHTML = txHtml(tx);
    } catch (e) { showError($('err'), e.message); }
  }
  $('tx').oninput = render;
  $('example').onclick = () => { $('tx').value = EXAMPLE; render(); };
  wireCopy(); render();
}

if (globalThis.document) mount();
