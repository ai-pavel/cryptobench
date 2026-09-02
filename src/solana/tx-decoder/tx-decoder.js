// Transaction Decoder: decode a serialized Solana transaction or message (legacy or v0).
import { base58, base64, hex, utf8d, PROGRAMS, TOKEN_PROGRAM, TOKEN_2022_PROGRAM, ATA_PROGRAM, esc, kvTable, wireCopy, showError } from '../lib/sol.js';
const SYSTEM = '11111111111111111111111111111111', COMPUTE = 'ComputeBudget111111111111111111111111111111';
const MEMOS = ['MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo'];

export class Reader {
  constructor(b) { this.b = b; this.o = 0; }
  left() { return this.b.length - this.o; }
  take(n, what = 'data') { if (this.o + n > this.b.length) throw new Error(`Unexpected end of data while reading ${what} at offset ${this.o}.`); const s = this.b.subarray(this.o, this.o + n); this.o += n; return s; }
  u8(what) { return this.take(1, what)[0]; }
  compact(what = 'length') {
    let n = 0;
    for (let k = 0; k < 3; k++) { const b = this.u8(what); n |= (b & 0x7f) << (7 * k); if (!(b & 0x80)) return n; }
    throw new Error(`Invalid compact-u16 ${what} at offset ${this.o}.`);
  }
  u32() { const b = this.take(4, 'u32'); return (b[0] | b[1] << 8 | b[2] << 16) + b[3] * 2 ** 24; }
  u64() { const b = this.take(8, 'u64'); let n = 0n; for (let k = 7; k >= 0; k--) n = (n << 8n) | BigInt(b[k]); return n; }
  i64() { const n = this.u64(); return n >= 1n << 63n ? n - (1n << 64n) : n; }
  pubkey() { return base58.encode(this.take(32, 'public key')); }
}

export function parseMessage(r) {
  const first = r.b[r.o];
  let version = 'legacy';
  if (first & 0x80) { version = first & 0x7f; r.o++; if (version !== 0) throw new Error(`Unsupported message version ${version}.`); }
  const header = { numRequiredSignatures: r.u8('header'), numReadonlySigned: r.u8('header'), numReadonlyUnsigned: r.u8('header') };
  const keys = Array.from({ length: r.compact('account count') }, () => r.pubkey());
  const recentBlockhash = r.pubkey();
  const instructions = Array.from({ length: r.compact('instruction count') }, () => ({
    programIdIndex: r.u8('program index'),
    accounts: Array.from(r.take(r.compact('account index count'), 'account indexes')),
    data: r.take(r.compact('data length'), 'instruction data').slice(),
  }));
  const lookups = version === 0 ? Array.from({ length: r.compact('lookup count') }, () => ({
    table: r.pubkey(),
    writable: Array.from(r.take(r.compact(), 'writable indexes')),
    readonly: Array.from(r.take(r.compact(), 'readonly indexes')),
  })) : [];
  if (header.numRequiredSignatures > keys.length || header.numReadonlySigned > header.numRequiredSignatures || header.numReadonlyUnsigned > keys.length - header.numRequiredSignatures)
    throw new Error('Message header does not match the number of accounts.');
  return { version, header, keys, recentBlockhash, instructions, lookups };
}
export function parse(bytes) {
  // Try a full transaction first (signatures + message), then a bare message.
  try {
    const r = new Reader(bytes);
    const n = r.compact('signature count');
    if (n === 0 || n > 64) throw 0;
    const signatures = Array.from({ length: n }, () => r.take(64, 'signature'));
    const msgStart = r.o;
    const message = parseMessage(r);
    if (r.left() !== 0 || message.header.numRequiredSignatures !== n) throw 0;
    return { signatures, message, messageBytes: bytes.subarray(msgStart) };
  } catch {}
  const r = new Reader(bytes);
  const message = parseMessage(r);
  if (r.left() !== 0) throw new Error(`${r.left()} trailing bytes after the message.`);
  return { signatures: null, message, messageBytes: bytes };
}
export function decodeInput(s, enc) {
  const t = s.trim().replace(/\s+/g, '');
  const dec = {
    base64: () => base64.decode(t),
    base58: () => base58.decode(t),
    hex: () => { const h = t.replace(/^0x/, ''); if (h.length % 2 || !/^[0-9a-fA-F]+$/.test(h)) throw 0; return hex.decode(h.toLowerCase()); },
  };
  const order = enc === 'auto' ? ['hex', 'base64', 'base58'] : [enc];
  let lastErr;
  for (const e of order) {
    let b; try { b = dec[e](); } catch { continue; }
    try { return { ...parse(b), encoding: e, length: b.length }; } catch (err) { lastErr = err; }
  }
  throw lastErr || new Error(enc === 'auto' ? 'Input is not valid base64, base58 or hex.' : `Input is not valid ${enc}.`);
}

// Account metas, including those loaded from address lookup tables.
export function accountList(m) {
  const { numRequiredSignatures: ns, numReadonlySigned: rs, numReadonlyUnsigned: ru } = m.header;
  const list = m.keys.map((k, i) => ({
    address: k, signer: i < ns,
    writable: i < ns ? i < ns - rs : i < m.keys.length - ru,
    source: i === 0 ? 'Fee payer' : '',
  }));
  for (const l of m.lookups) l.writable.forEach(ix => list.push({ address: null, table: l.table, index: ix, signer: false, writable: true }));
  for (const l of m.lookups) l.readonly.forEach(ix => list.push({ address: null, table: l.table, index: ix, signer: false, writable: false }));
  return list;
}
export const label = a => a.address ? a.address : `Lookup ${a.table.slice(0, 4)}…${a.table.slice(-4)} #${a.index}`;
export const fmtAmount = (n, d) => d === undefined ? n.toString() : (() => { const s = n.toString().padStart(d + 1, '0'); const w = s.slice(0, s.length - d), f = s.slice(s.length - d).replace(/0+$/, ''); return f ? `${w}.${f}` : w; })();
export const sol = n => `${n} lamports (${fmtAmount(n, 9)} SOL)`;

// ---------- Instruction decoders: return { name, params: [[k, v]], accountNames: [] } ----------
export function decodeSystem(d) {
  const r = new Reader(d), op = r.u32();
  const str = () => { const n = Number(r.u64()); return utf8d.decode(r.take(n, 'seed')); };
  switch (op) {
    case 0: return { name: 'Create Account', params: [['Lamports', sol(r.u64())], ['Space', `${r.u64()} bytes`], ['Owner', r.pubkey()]], accountNames: ['Funding account', 'New account'] };
    case 1: return { name: 'Assign', params: [['Owner', r.pubkey()]], accountNames: ['Account'] };
    case 2: return { name: 'Transfer', params: [['Amount', sol(r.u64())]], accountNames: ['From', 'To'] };
    case 3: return { name: 'Create Account With Seed', params: [['Base', r.pubkey()], ['Seed', str()], ['Lamports', sol(r.u64())], ['Space', `${r.u64()} bytes`], ['Owner', r.pubkey()]], accountNames: ['Funding account', 'New account', 'Base'] };
    case 4: return { name: 'Advance Nonce Account', params: [], accountNames: ['Nonce account', 'Recent blockhashes sysvar', 'Nonce authority'] };
    case 5: return { name: 'Withdraw Nonce Account', params: [['Lamports', sol(r.u64())]], accountNames: ['Nonce account', 'Recipient', 'Recent blockhashes sysvar', 'Rent sysvar', 'Nonce authority'] };
    case 6: return { name: 'Initialize Nonce Account', params: [['Authority', r.pubkey()]], accountNames: ['Nonce account', 'Recent blockhashes sysvar', 'Rent sysvar'] };
    case 7: return { name: 'Authorize Nonce Account', params: [['New authority', r.pubkey()]], accountNames: ['Nonce account', 'Nonce authority'] };
    case 8: return { name: 'Allocate', params: [['Space', `${r.u64()} bytes`]], accountNames: ['Account'] };
    case 9: return { name: 'Allocate With Seed', params: [['Base', r.pubkey()], ['Seed', str()], ['Space', `${r.u64()} bytes`], ['Owner', r.pubkey()]], accountNames: ['Account', 'Base'] };
    case 10: return { name: 'Assign With Seed', params: [['Base', r.pubkey()], ['Seed', str()], ['Owner', r.pubkey()]], accountNames: ['Account', 'Base'] };
    case 11: return { name: 'Transfer With Seed', params: [['Amount', sol(r.u64())], ['From seed', str()], ['From owner', r.pubkey()]], accountNames: ['From', 'Base', 'To'] };
    case 12: return { name: 'Upgrade Nonce Account', params: [], accountNames: ['Nonce account'] };
  }
  return null;
}
const AUTH_TYPES = ['Mint tokens', 'Freeze account', 'Account owner', 'Close account'];
export function decodeToken(d) {
  const r = new Reader(d), op = r.u8();
  const coption = () => r.u8() ? r.pubkey() : 'None';
  switch (op) {
    case 0: return { name: 'Initialize Mint', params: [['Decimals', r.u8()], ['Mint authority', r.pubkey()], ['Freeze authority', coption()]], accountNames: ['Mint', 'Rent sysvar'] };
    case 1: return { name: 'Initialize Account', params: [], accountNames: ['Account', 'Mint', 'Owner', 'Rent sysvar'] };
    case 2: return { name: 'Initialize Multisig', params: [['Required signers', r.u8()]], accountNames: ['Multisig', 'Rent sysvar'] };
    case 3: return { name: 'Transfer', params: [['Amount (raw)', r.u64().toString()]], accountNames: ['Source', 'Destination', 'Owner'] };
    case 4: return { name: 'Approve', params: [['Amount (raw)', r.u64().toString()]], accountNames: ['Source', 'Delegate', 'Owner'] };
    case 5: return { name: 'Revoke', params: [], accountNames: ['Source', 'Owner'] };
    case 6: { const t = r.u8(); return { name: 'Set Authority', params: [['Authority type', AUTH_TYPES[t] || `Type ${t}`], ['New authority', coption()]], accountNames: ['Account or mint', 'Current authority'] }; }
    case 7: return { name: 'Mint To', params: [['Amount (raw)', r.u64().toString()]], accountNames: ['Mint', 'Destination', 'Mint authority'] };
    case 8: return { name: 'Burn', params: [['Amount (raw)', r.u64().toString()]], accountNames: ['Account', 'Mint', 'Owner'] };
    case 9: return { name: 'Close Account', params: [], accountNames: ['Account', 'Destination', 'Owner'] };
    case 10: return { name: 'Freeze Account', params: [], accountNames: ['Account', 'Mint', 'Freeze authority'] };
    case 11: return { name: 'Thaw Account', params: [], accountNames: ['Account', 'Mint', 'Freeze authority'] };
    case 12: case 13: case 14: case 15: {
      const amount = r.u64(), dec = r.u8();
      const names = { 12: ['Transfer Checked', ['Source', 'Mint', 'Destination', 'Owner']], 13: ['Approve Checked', ['Source', 'Mint', 'Delegate', 'Owner']], 14: ['Mint To Checked', ['Mint', 'Destination', 'Mint authority']], 15: ['Burn Checked', ['Account', 'Mint', 'Owner']] }[op];
      return { name: names[0], params: [['Amount', `${fmtAmount(amount, dec)} (raw ${amount})`], ['Decimals', dec]], accountNames: names[1] };
    }
    case 16: return { name: 'Initialize Account 2', params: [['Owner', r.pubkey()]], accountNames: ['Account', 'Mint', 'Rent sysvar'] };
    case 17: return { name: 'Sync Native', params: [], accountNames: ['Native token account'] };
    case 18: return { name: 'Initialize Account 3', params: [['Owner', r.pubkey()]], accountNames: ['Account', 'Mint'] };
    case 20: return { name: 'Initialize Mint 2', params: [['Decimals', r.u8()], ['Mint authority', r.pubkey()], ['Freeze authority', coption()]], accountNames: ['Mint'] };
    case 21: return { name: 'Get Account Data Size', params: [], accountNames: ['Mint'] };
    case 22: return { name: 'Initialize Immutable Owner', params: [], accountNames: ['Account'] };
    case 23: return { name: 'Amount To UI Amount', params: [['Amount (raw)', r.u64().toString()]], accountNames: ['Mint'] };
  }
  return { name: `Token instruction ${op}`, params: [], accountNames: [] };
}
export function decodeAta(d) {
  const kind = d.length === 0 || d[0] === 0 ? 'Create' : d[0] === 1 ? 'Create Idempotent' : d[0] === 2 ? 'Recover Nested' : null;
  if (!kind) return null;
  return { name: kind, params: [], accountNames: kind === 'Recover Nested' ? ['Nested account', 'Nested mint', 'Destination', 'Owner account', 'Owner mint', 'Wallet', 'Token program'] : ['Payer', 'Associated token account', 'Wallet', 'Mint', 'System program', 'Token program'] };
}
export function decodeCompute(d) {
  const r = new Reader(d), op = r.u8();
  switch (op) {
    case 0: return { name: 'Request Units (deprecated)', params: [['Units', r.u32()], ['Additional fee', `${r.u32()} lamports`]], accountNames: [] };
    case 1: return { name: 'Request Heap Frame', params: [['Bytes', r.u32()]], accountNames: [] };
    case 2: return { name: 'Set Compute Unit Limit', params: [['Units', r.u32()]], accountNames: [], limit: null };
    case 3: return { name: 'Set Compute Unit Price', params: [['Price', `${r.u64()} micro-lamports per CU`]], accountNames: [] };
    case 4: return { name: 'Set Loaded Accounts Data Size Limit', params: [['Bytes', r.u32()]], accountNames: [] };
  }
  return null;
}
export function decodeIx(program, data) {
  try {
    if (program === SYSTEM) return decodeSystem(data);
    if (program === TOKEN_PROGRAM || program === TOKEN_2022_PROGRAM) return decodeToken(data);
    if (program === ATA_PROGRAM) return decodeAta(data);
    if (program === COMPUTE) return decodeCompute(data);
    if (MEMOS.includes(program)) { try { return { name: 'Memo', params: [['Text', utf8d.decode(data)]], accountNames: [] }; } catch { return { name: 'Memo', params: [['Bytes', hex.encode(data)]], accountNames: [] }; } }
  } catch (e) { return { name: 'Could not decode', params: [['Error', e.message]], accountNames: [] }; }
  return null;
}

export function priorityFee(m) {
  let limit = null, price = null, ixCount = 0;
  for (const ix of m.instructions) {
    const p = m.keys[ix.programIdIndex];
    if (p !== COMPUTE) { ixCount++; continue; }
    const r = new Reader(ix.data);
    try { const op = r.u8(); if (op === 2) limit = r.u32(); if (op === 3) price = r.u64(); } catch {}
  }
  if (price === null) return null;
  const units = BigInt(limit ?? Math.min(1400000, 200000 * ixCount));
  return { limit: units, price, fee: (units * price + 999999n) / 1000000n, defaulted: limit === null };
}

// Overview rows for a decoded transaction or message and its priority fee (or null).
export function overviewRows(t, fee) {
  const m = t.message;
  return [
    ['Type', `${t.signatures ? 'Transaction' : 'Message only'} · ${m.version === 'legacy' ? 'legacy' : 'version 0'} · ${t.length} bytes · ${t.encoding}`],
    ['Fee payer', m.keys[0] || '—'],
    ['Recent blockhash / nonce', m.recentBlockhash],
    ['Required signatures', `${m.header.numRequiredSignatures} (${m.header.numReadonlySigned} read-only signed, ${m.header.numReadonlyUnsigned} read-only unsigned)`],
    ...(fee ? [['Priority fee', `${fee.fee} lamports`, `${fee.limit} CU${fee.defaulted ? ' (default limit)' : ''} × ${fee.price} micro-lamports`]] : []),
    ['Message (base64)', base64.encode(t.messageBytes)],
  ];
}
// Signature rows: the signer's short address and the signature (base58), or a note if it is still empty.
export function signatureRows(t) {
  const m = t.message;
  return t.signatures.map((s, i) => {
    const empty = s.every(b => b === 0);
    return [`#${i + 1} · ${m.keys[i] ? m.keys[i].slice(0, 4) + '…' + m.keys[i].slice(-4) : ''}`, empty ? '(not signed yet)' : base58.encode(s)];
  });
}

function mount() {
  const $ = id => document.getElementById(id);
  function render() {
    $('out').innerHTML = '';
    const v = $('input').value;
    if (!v.trim()) return showError($('err'));
    let t;
    try { t = decodeInput(v, $('enc').value); } catch (e) { return showError($('err'), 'Could not decode: ' + e.message); }
    showError($('err'));
    const m = t.message, accts = accountList(m);
    const fee = priorityFee(m);
    let html = '<p class="section-title">Overview</p>' + kvTable(overviewRows(t, fee));
    if (t.signatures) {
      html += '<p class="section-title">Signatures</p>' + kvTable(signatureRows(t));
    }
    html += `<p class="section-title">Accounts (${accts.length})</p><table class="accts"><thead><tr><th>#</th><th>Address</th><th>Role</th></tr></thead><tbody>` +
      accts.map((a, i) => `<tr><td>${i}</td><td class="mono">${esc(label(a))}${a.address && PROGRAMS[a.address] ? `<div class="muted">${esc(PROGRAMS[a.address])}</div>` : ''}${a.table ? `<div class="muted">Loaded from lookup table ${esc(a.table)}</div>` : ''}</td>
        <td>${a.signer ? '<span class="badge on">signer</span>' : ''}${a.writable ? '<span class="badge on">writable</span>' : '<span class="badge">read-only</span>'}${a.source ? `<div class="muted">${a.source}</div>` : ''}</td></tr>`).join('') + '</tbody></table>';
    if (m.lookups.length) {
      html += '<p class="section-title">Address lookup tables</p>' + kvTable(m.lookups.map(l => [`Writable [${l.writable.join(', ')}] · Read-only [${l.readonly.join(', ')}]`, l.table]));
    }
    html += `<p class="section-title">Instructions (${m.instructions.length})</p>`;
    m.instructions.forEach((ix, n) => {
      const p = accts[ix.programIdIndex];
      const program = p ? p.address : null;
      const name = program ? (PROGRAMS[program] || 'Unknown program') : 'Program from lookup table';
      const dec = program ? decodeIx(program, ix.data) : null;
      const params = dec ? dec.params : [];
      const raw = [['Data (hex)', hex.encode(ix.data) || '(empty)'], ['Data (base58)', base58.encode(ix.data) || '(empty)']];
      if (!dec && ix.data.length >= 8) raw.push(['First 8 bytes', hex.encode(ix.data.slice(0, 8)) + ' · possible Anchor discriminator']);
      html += `<div class="ix"><h3>#${n + 1} ${esc(dec ? dec.name : 'Instruction')}</h3>
        <div class="prog">${esc(name)} · ${esc(program || label(p || { table: '?', index: ix.programIdIndex }))}</div>
        ${params.length ? `<table class="params"><tbody>${params.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${esc(v)}</td></tr>`).join('')}</tbody></table>` : ''}
        <table class="accts"><thead><tr><th>#</th><th>Account</th><th>Role</th></tr></thead><tbody>${ix.accounts.map((ai, k) => {
          const a = accts[ai]; if (!a) return `<tr><td>${k}</td><td class="bad">Index ${ai} out of range</td><td></td></tr>`;
          return `<tr><td>${k}</td><td class="mono">${esc(label(a))}</td><td>${esc(dec?.accountNames?.[k] || '')}${a.signer ? ' <span class="badge on">signer</span>' : ''}${a.writable ? ' <span class="badge on">writable</span>' : ''}</td></tr>`;
        }).join('') || '<tr><td></td><td class="muted">No accounts</td><td></td></tr>'}</tbody></table>
        ${kvTable(raw)}</div>`;
    });
    $('out').innerHTML = html;
  }
  $('input').oninput = render;
  $('enc').onchange = render;
  // Example: a legacy transaction with System, Token, Compute Budget and Memo instructions, signed by a test key.
  $('example').onclick = () => {
    $('input').value = 'AVPA4nBoi5Me4M/NDK8h9BEPZk9P/mfgXByRvu4LJn2vqjZUzuixMHG70aMoRP+M/6phePcenjBoCrQ9KnDV1gcBAAcMebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQuporZK9DwEMFFlyF5b6W6RJHDb10Imi8d/U8hdh3Y6mcwLkkYlNdJLqa+T5FOpPRfoULmRYZ8kWSidtXddvB22tNJXI8XCeAY4cFGpjC1+A6VreWp0gZMmvZZ4h/xa1HqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+FkDBkZv5SEXMv/srbpyw5vnvIzlu8X3EmssQ5s6QAAAAMb6evO+2606PWXzaqvJdDGxu+TC0vbg5HymAgNFL11hBUpTWpkpIQZNJOhxYNo4fHw1td28kruB5B+oQEEFRI0GodgXkTdUKpg0N73+KnqyVX9TXIp4citopJ3AAAAAAAbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpxJrndgN4IFTxep3s6kO0ROug7bEsbx0xxuDkqEvwUusHBwAFAuCTBAAHAAkDqGEAAAAAAAAFAgAEDAIAAAAAL2hZAAAAAAYGAAIECAULAQELBAMIAgAKDIfWEgAAAAAABgkACWdtIOKYgO+4jwoBAQmvr20fDZib7QE=';
    $('enc').value = 'auto';
    render();
  };
  wireCopy();
}

if (globalThis.document) mount();
