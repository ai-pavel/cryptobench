// PSBT (BIP174 v0 and BIP370 v2) decoder: generic key-value maps plus decoding of known key types.
import {
  InputError, Reader, bytesToHex, reverse, hexToBytes, parseTx, decompile, toAsm, classifyScript,
  scriptToAddress, NETWORKS, base58check, formatSats,
} from './btc.js';
import { base64 } from '../../assets/vendor/@scure/base@1.2.6/index.esm.js';
import { sighashName } from './sig.js';

const GLOBAL = { 0x00: 'UNSIGNED_TX', 0x01: 'XPUB', 0x02: 'TX_VERSION', 0x03: 'FALLBACK_LOCKTIME', 0x04: 'INPUT_COUNT', 0x05: 'OUTPUT_COUNT', 0x06: 'TX_MODIFIABLE', 0xfb: 'VERSION', 0xfc: 'PROPRIETARY' };
const INPUT = {
  0x00: 'NON_WITNESS_UTXO', 0x01: 'WITNESS_UTXO', 0x02: 'PARTIAL_SIG', 0x03: 'SIGHASH_TYPE', 0x04: 'REDEEM_SCRIPT', 0x05: 'WITNESS_SCRIPT',
  0x06: 'BIP32_DERIVATION', 0x07: 'FINAL_SCRIPTSIG', 0x08: 'FINAL_SCRIPTWITNESS', 0x09: 'POR_COMMITMENT', 0x0a: 'RIPEMD160', 0x0b: 'SHA256',
  0x0c: 'HASH160', 0x0d: 'HASH256', 0x0e: 'PREVIOUS_TXID', 0x0f: 'OUTPUT_INDEX', 0x10: 'SEQUENCE', 0x11: 'REQUIRED_TIME_LOCKTIME',
  0x12: 'REQUIRED_HEIGHT_LOCKTIME', 0x13: 'TAP_KEY_SIG', 0x14: 'TAP_SCRIPT_SIG', 0x15: 'TAP_LEAF_SCRIPT', 0x16: 'TAP_BIP32_DERIVATION',
  0x17: 'TAP_INTERNAL_KEY', 0x18: 'TAP_MERKLE_ROOT', 0x1a: 'MUSIG2_PARTICIPANT_PUBKEYS', 0x1b: 'MUSIG2_PUB_NONCE', 0x1c: 'MUSIG2_PARTIAL_SIG', 0xfc: 'PROPRIETARY',
};
const OUTPUT = {
  0x00: 'REDEEM_SCRIPT', 0x01: 'WITNESS_SCRIPT', 0x02: 'BIP32_DERIVATION', 0x03: 'AMOUNT', 0x04: 'SCRIPT', 0x05: 'TAP_INTERNAL_KEY',
  0x06: 'TAP_TREE', 0x07: 'TAP_BIP32_DERIVATION', 0x08: 'MUSIG2_PARTICIPANT_PUBKEYS', 0xfc: 'PROPRIETARY',
};

const u32 = b => new DataView(b.slice().buffer).getUint32(0, true);
const i64 = b => new DataView(b.slice().buffer).getBigInt64(0, true);

function path(b) {
  if (b.length < 4 || (b.length - 4) % 4) throw new InputError('Malformed key origin (fingerprint + path)');
  const fp = bytesToHex(b.slice(0, 4)), parts = ['m'];
  for (let i = 4; i < b.length; i += 4) {
    const n = u32(b.slice(i, i + 4));
    parts.push(n >= 0x80000000 ? `${n - 0x80000000}'` : String(n));
  }
  return `[${fp}] ${parts.join('/')}`;
}

function scriptDesc(s) {
  const c = classifyScript(s);
  let addr = null;
  try { addr = scriptToAddress(s, NETWORKS.mainnet); } catch {}
  let asm;
  try { asm = toAsm(decompile(s)); } catch { asm = bytesToHex(s); }
  return `${c.name}${addr ? `\n${addr} (mainnet)` : ''}\n${asm}`;
}

function readMap(r, names, where) {
  const entries = [];
  for (;;) {
    const keyLen = r.varint(`${where} key length`);
    if (keyLen === 0) return entries;
    const key = r.take(keyLen, `${where} key`);
    const kr = new Reader(key);
    const type = kr.varint('key type');
    const keyData = key.slice(kr.o);
    const value = r.take(r.varint(`${where} value length`), `${where} value`);
    entries.push({ type, name: names[type] || `UNKNOWN_0x${type.toString(16)}`, keyData, value });
  }
}

export function decodePsbtInput(text) {
  const t = String(text).trim().replace(/\s+/g, '');
  if (!t) return null;
  if (/^70736274ff[0-9a-f]*$/i.test(t)) return hexToBytes(t, 'PSBT');
  try { return base64.decode(t); } catch { throw new InputError('Not valid base64 or hex'); }
}

export function decodePsbt(bytes) {
  if (bytes.length < 5 || bytesToHex(bytes.slice(0, 5)) !== '70736274ff') throw new InputError('Missing PSBT magic bytes (psbt\\xff); this is not a PSBT');
  const r = new Reader(bytes);
  r.take(5);
  const global = readMap(r, GLOBAL, 'global');
  let tx = null, version = 0, nIn, nOut;
  for (const e of global) {
    if (e.type === 0x00) tx = parseTx(e.value);
    if (e.type === 0xfb) version = u32(e.value);
    if (e.type === 0x04) nIn = new Reader(e.value).varint();
    if (e.type === 0x05) nOut = new Reader(e.value).varint();
  }
  if (version === 0) {
    if (!tx) throw new InputError('PSBT v0 must contain the unsigned transaction');
    nIn = tx.inputs.length; nOut = tx.outputs.length;
  } else if (nIn === undefined || nOut === undefined) {
    throw new InputError('PSBT v2 must contain INPUT_COUNT and OUTPUT_COUNT');
  }
  const inputs = [], outputs = [];
  for (let i = 0; i < nIn; i++) inputs.push(readMap(r, INPUT, `input ${i}`));
  for (let i = 0; i < nOut; i++) outputs.push(readMap(r, OUTPUT, `output ${i}`));
  if (r.left) throw new InputError(`${r.left} unexpected bytes after the last output map`);
  return { version, tx, global, inputs, outputs };
}

/** Human-readable value for a key-value entry. */
export function describe(scope, e, ctx = {}) {
  const k = e.keyData, v = e.value;
  try {
    switch (`${scope}:${e.name}`) {
      case 'global:UNSIGNED_TX': return `TXID ${ctx.tx.txid}\n${ctx.tx.inputs.length} input(s), ${ctx.tx.outputs.length} output(s), version ${ctx.tx.version}, locktime ${ctx.tx.locktime}`;
      case 'global:XPUB': return `${base58check.encode(k)}\n${path(v)}`;
      case 'global:VERSION': case 'global:TX_VERSION': case 'global:FALLBACK_LOCKTIME': return String(u32(v));
      case 'global:INPUT_COUNT': case 'global:OUTPUT_COUNT': return String(new Reader(v).varint());
      case 'input:NON_WITNESS_UTXO': { const p = parseTx(v); return `Previous transaction ${p.txid}${ctx.vout !== undefined && p.outputs[ctx.vout] ? `\nSpent output #${ctx.vout}: ${formatSats(p.outputs[ctx.vout].value)}` : ''}`; }
      case 'input:WITNESS_UTXO': case 'output:WITNESS_UTXO': {
        const r = new Reader(v), amount = r.u64(), script = r.take(r.varint());
        return `${formatSats(amount)}\n${scriptDesc(script)}`;
      }
      case 'input:PARTIAL_SIG': return `Public key ${bytesToHex(k)}\nSignature ${bytesToHex(v)}\nSighash ${sighashName(v[v.length - 1])}`;
      case 'input:SIGHASH_TYPE': return `${u32(v)} = ${sighashName(u32(v))}`;
      case 'input:REDEEM_SCRIPT': case 'input:WITNESS_SCRIPT': case 'output:REDEEM_SCRIPT': case 'output:WITNESS_SCRIPT': case 'input:FINAL_SCRIPTSIG':
        return toAsm(decompile(v));
      case 'input:BIP32_DERIVATION': case 'output:BIP32_DERIVATION': return `Public key ${bytesToHex(k)}\n${path(v)}`;
      case 'input:FINAL_SCRIPTWITNESS': {
        const r = new Reader(v), n = r.varint(), items = [];
        for (let i = 0; i < n; i++) items.push(bytesToHex(r.take(r.varint())) || '(empty)');
        return `${n} item(s)\n${items.join('\n')}`;
      }
      case 'input:PREVIOUS_TXID': return bytesToHex(reverse(v));
      case 'input:OUTPUT_INDEX': case 'input:SEQUENCE': case 'input:REQUIRED_TIME_LOCKTIME': case 'input:REQUIRED_HEIGHT_LOCKTIME': return String(u32(v));
      case 'output:AMOUNT': return formatSats(i64(v));
      case 'output:SCRIPT': return scriptDesc(v);
      case 'input:TAP_KEY_SIG': return `${bytesToHex(v)}${v.length === 65 ? `\nSighash ${sighashName(v[64])}` : '\nSighash SIGHASH_DEFAULT'}`;
      case 'input:TAP_INTERNAL_KEY': case 'output:TAP_INTERNAL_KEY': case 'input:TAP_MERKLE_ROOT': return bytesToHex(v);
      case 'input:TAP_BIP32_DERIVATION': case 'output:TAP_BIP32_DERIVATION': {
        const r = new Reader(v), n = r.varint(), leaves = [];
        for (let i = 0; i < n; i++) leaves.push(bytesToHex(r.take(32)));
        return `x-only key ${bytesToHex(k)}\n${path(v.slice(r.o))}${n ? `\nLeaf hashes: ${leaves.join(', ')}` : ''}`;
      }
      case 'input:TAP_SCRIPT_SIG': return `Key ${bytesToHex(k.slice(0, 32))}, leaf ${bytesToHex(k.slice(32))}\nSignature ${bytesToHex(v)}`;
      case 'input:TAP_LEAF_SCRIPT': return `Control block ${bytesToHex(k)}\nLeaf version 0x${v[v.length - 1].toString(16)}\n${toAsm(decompile(v.slice(0, -1)))}`;
    }
  } catch (err) {
    return `(could not decode: ${err.message})\n${bytesToHex(v)}`;
  }
  return null;
}

/** Amount spent by input i if the PSBT carries its UTXO; null otherwise. */
export function inputAmount(psbt, i) {
  const m = psbt.inputs[i];
  const w = m.find(e => e.type === 0x01);
  if (w) return new Reader(w.value).u64();
  const nw = m.find(e => e.type === 0x00);
  if (nw) {
    const vout = psbt.tx ? psbt.tx.inputs[i].vout : u32(m.find(e => e.type === 0x0f)?.value || new Uint8Array(4));
    const prev = parseTx(nw.value);
    return prev.outputs[vout] ? prev.outputs[vout].value : null;
  }
  return null;
}

export function outputAmount(psbt, i) {
  if (psbt.tx) return psbt.tx.outputs[i].value;
  const a = psbt.outputs[i].find(e => e.type === 0x03);
  return a ? BigInt(i64(a.value)) : null;
}
