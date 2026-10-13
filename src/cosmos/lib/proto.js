// Minimal protobuf reader plus schemas for common Cosmos SDK transaction types.
import { utf8d, toHex } from './cosmos.js';

export class Reader {
  constructor(bytes) { this.b = bytes; this.pos = 0; }
  get done() { return this.pos >= this.b.length; }
  varint() {
    let result = 0n, shift = 0n;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.b.length) throw new Error(`Truncated varint at byte ${this.pos}.`);
      const byte = this.b[this.pos++];
      result |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) return result;
      shift += 7n;
    }
    throw new Error(`Varint longer than 10 bytes at byte ${this.pos}.`);
  }
  take(n, what) {
    if (this.pos + n > this.b.length) throw new Error(`${what} at byte ${this.pos} needs ${n} bytes but only ${this.b.length - this.pos} are left.`);
    const out = this.b.subarray(this.pos, this.pos + n); this.pos += n; return out;
  }
  // Reads every field as { num, wt, value } where value is a bigint (varint/fixed) or bytes.
  fields() {
    const out = [];
    while (!this.done) {
      const start = this.pos, key = this.varint();
      const num = Number(key >> 3n), wt = Number(key & 7n);
      if (num === 0) throw new Error(`Invalid field number 0 at byte ${start}.`);
      let value;
      if (wt === 0) value = this.varint();
      else if (wt === 1) value = this.take(8, 'Fixed64 field');
      else if (wt === 2) { const n = Number(this.varint()); value = this.take(n, `Field ${num}`); }
      else if (wt === 5) value = this.take(4, 'Fixed32 field');
      else throw new Error(`Unsupported wire type ${wt} (field ${num}) at byte ${start}.`);
      out.push({ num, wt, value });
    }
    return out;
  }
}

const str = b => { try { return utf8d.decode(b); } catch { throw new Error('A string field is not valid UTF-8.'); } };
const COIN = { 1: ['denom', 'string'], 2: ['amount', 'string'] };
const DEC_COIN = COIN;
const HEIGHT = { 1: ['revision_number', 'uint64'], 2: ['revision_height', 'uint64'] };
const VOTE_OPTION = ['UNSPECIFIED', 'YES', 'ABSTAIN', 'NO', 'NO_WITH_VETO'];
export const SIGN_MODE = { 0: 'UNSPECIFIED', 1: 'DIRECT', 2: 'TEXTUAL', 3: 'DIRECT_AUX', 127: 'LEGACY_AMINO_JSON', 191: 'EIP_191' };

// Schemas: field number → [name, type, repeated?]. Types: string, bytes, uint64, int64, bool, enum:<list>, json, any, or a nested schema object.
export const S = {};
S.Coin = COIN;
S.Any = { 1: ['type_url', 'string'], 2: ['value', 'bytes'] };
S.TxRaw = { 1: ['body_bytes', 'bytes'], 2: ['auth_info_bytes', 'bytes'], 3: ['signatures', 'bytes', true] };
S.TxBody = { 1: ['messages', 'any', true], 2: ['memo', 'string'], 3: ['timeout_height', 'uint64'], 4: ['unordered', 'bool'], 5: ['timeout_timestamp', 'bytes'], 1023: ['extension_options', 'any', true], 2047: ['non_critical_extension_options', 'any', true] };
S.ModeInfoSingle = { 1: ['mode', 'signmode'] };
S.ModeInfo = { 1: ['single', S.ModeInfoSingle], 2: ['multi', { 1: ['bitarray', 'bytes'], 2: ['mode_infos', 'bytes', true] }] };
S.SignerInfo = { 1: ['public_key', 'any'], 2: ['mode_info', S.ModeInfo], 3: ['sequence', 'uint64'] };
S.Fee = { 1: ['amount', COIN, true], 2: ['gas_limit', 'uint64'], 3: ['payer', 'string'], 4: ['granter', 'string'] };
S.Tip = { 1: ['amount', COIN, true], 2: ['tipper', 'string'] };
S.AuthInfo = { 1: ['signer_infos', S.SignerInfo, true], 2: ['fee', S.Fee], 3: ['tip', S.Tip] };
S.PubKey = { 1: ['key', 'bytes'] };
S.LegacyAminoPubKey = { 1: ['threshold', 'uint64'], 2: ['public_keys', 'any', true] };

const IO = { 1: ['address', 'string'], 2: ['coins', COIN, true] };
const vote = { 1: ['proposal_id', 'uint64'], 2: ['voter', 'string'], 3: ['option', VOTE_OPTION], 4: ['metadata', 'string'] };
const deposit = { 1: ['proposal_id', 'uint64'], 2: ['depositor', 'string'], 3: ['amount', COIN, true] };

// Message schemas by type URL, with a short human label.
export const MSGS = {
  '/cosmos.bank.v1beta1.MsgSend': ['Send', { 1: ['from_address', 'string'], 2: ['to_address', 'string'], 3: ['amount', COIN, true] }],
  '/cosmos.bank.v1beta1.MsgMultiSend': ['Multi-send', { 1: ['inputs', IO, true], 2: ['outputs', IO, true] }],
  '/cosmos.staking.v1beta1.MsgDelegate': ['Delegate', { 1: ['delegator_address', 'string'], 2: ['validator_address', 'string'], 3: ['amount', COIN] }],
  '/cosmos.staking.v1beta1.MsgUndelegate': ['Undelegate', { 1: ['delegator_address', 'string'], 2: ['validator_address', 'string'], 3: ['amount', COIN] }],
  '/cosmos.staking.v1beta1.MsgBeginRedelegate': ['Redelegate', { 1: ['delegator_address', 'string'], 2: ['validator_src_address', 'string'], 3: ['validator_dst_address', 'string'], 4: ['amount', COIN] }],
  '/cosmos.staking.v1beta1.MsgCancelUnbondingDelegation': ['Cancel unbonding', { 1: ['delegator_address', 'string'], 2: ['validator_address', 'string'], 3: ['amount', COIN], 4: ['creation_height', 'int64'] }],
  '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward': ['Withdraw rewards', { 1: ['delegator_address', 'string'], 2: ['validator_address', 'string'] }],
  '/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission': ['Withdraw commission', { 1: ['validator_address', 'string'] }],
  '/cosmos.distribution.v1beta1.MsgSetWithdrawAddress': ['Set withdraw address', { 1: ['delegator_address', 'string'], 2: ['withdraw_address', 'string'] }],
  '/cosmos.distribution.v1beta1.MsgFundCommunityPool': ['Fund community pool', { 1: ['amount', COIN, true], 2: ['depositor', 'string'] }],
  '/cosmos.gov.v1beta1.MsgVote': ['Vote', vote],
  '/cosmos.gov.v1.MsgVote': ['Vote', vote],
  '/cosmos.gov.v1beta1.MsgDeposit': ['Deposit', deposit],
  '/cosmos.gov.v1.MsgDeposit': ['Deposit', deposit],
  '/ibc.applications.transfer.v1.MsgTransfer': ['IBC transfer', { 1: ['source_port', 'string'], 2: ['source_channel', 'string'], 3: ['token', COIN], 4: ['sender', 'string'], 5: ['receiver', 'string'], 6: ['timeout_height', HEIGHT], 7: ['timeout_timestamp', 'uint64'], 8: ['memo', 'string'] }],
  '/cosmos.authz.v1beta1.MsgExec': ['Authz exec', { 1: ['grantee', 'string'], 2: ['msgs', 'any', true] }],
  '/cosmos.authz.v1beta1.MsgRevoke': ['Authz revoke', { 1: ['granter', 'string'], 2: ['grantee', 'string'], 3: ['msg_type_url', 'string'] }],
  '/cosmwasm.wasm.v1.MsgExecuteContract': ['Execute contract', { 1: ['sender', 'string'], 2: ['contract', 'string'], 3: ['msg', 'json'], 5: ['funds', COIN, true] }],
  '/cosmwasm.wasm.v1.MsgInstantiateContract': ['Instantiate contract', { 1: ['sender', 'string'], 2: ['admin', 'string'], 3: ['code_id', 'uint64'], 4: ['label', 'string'], 5: ['msg', 'json'], 6: ['funds', COIN, true] }],
  '/cosmos.feegrant.v1beta1.MsgGrantAllowance': ['Grant fee allowance', { 1: ['granter', 'string'], 2: ['grantee', 'string'], 3: ['allowance', 'any'] }],
  '/cosmos.feegrant.v1beta1.MsgRevokeAllowance': ['Revoke fee allowance', { 1: ['granter', 'string'], 2: ['grantee', 'string'] }],
};

export const PUBKEYS = {
  '/cosmos.crypto.secp256k1.PubKey': 'secp256k1',
  '/cosmos.crypto.ed25519.PubKey': 'ed25519',
  '/cosmos.crypto.secp256r1.PubKey': 'secp256r1',
  '/ethermint.crypto.v1.ethsecp256k1.PubKey': 'ethsecp256k1',
  '/injective.crypto.v1beta1.ethsecp256k1.PubKey': 'ethsecp256k1',
  '/cosmos.evm.crypto.v1.ethsecp256k1.PubKey': 'ethsecp256k1',
};

// Decodes bytes with a schema into a plain object. Unknown fields are kept under "_unknown".
export function decode(bytes, schema, depth = 0) {
  if (depth > 40) throw new Error('Message is nested too deeply.');
  const obj = {};
  for (const f of new Reader(bytes).fields()) {
    const spec = schema[f.num];
    if (!spec) { (obj._unknown ||= []).push(rawField(f)); continue; }
    const [name, type, repeated] = spec;
    const v = decodeValue(f, type, name, depth);
    if (repeated) (obj[name] ||= []).push(v); else obj[name] = v;
  }
  return obj;
}

function decodeValue(f, type, name, depth) {
  const need = wt => { if (f.wt !== wt) throw new Error(`Field "${name}" has wire type ${f.wt}, expected ${wt}.`); };
  if (type === 'string') { need(2); return str(f.value); }
  if (type === 'bytes') { need(2); return f.value; }
  if (type === 'uint64') { need(0); return f.value.toString(); }
  if (type === 'int64') { need(0); return BigInt.asIntN(64, f.value).toString(); }
  if (type === 'bool') { need(0); return f.value !== 0n; }
  if (type === 'signmode') { need(0); return SIGN_MODE[Number(f.value)] || `unknown (${f.value})`; }
  if (Array.isArray(type)) { need(0); return type[Number(f.value)] || `unknown (${f.value})`; }
  if (type === 'json') { need(2); const s = str(f.value); try { return JSON.parse(s); } catch { return s; } }
  if (type === 'any') { need(2); return decodeAny(decode(f.value, S.Any, depth + 1), depth + 1); }
  need(2); return decode(f.value, type, depth + 1);
}

// Decodes an Any's value when its type is known; otherwise returns a schema-less tree.
export function decodeAny(any, depth = 0) {
  const type = any.type_url || '', value = any.value || new Uint8Array();
  if (MSGS[type]) return { '@type': type, ...decode(value, MSGS[type][1], depth) };
  if (PUBKEYS[type]) return { '@type': type, key: decode(value, S.PubKey, depth).key };
  if (type === '/cosmos.crypto.multisig.LegacyAminoPubKey') return { '@type': type, ...decode(value, S.LegacyAminoPubKey, depth) };
  return { '@type': type, '@unknown': true, fields: guessTree(value, depth) };
}

function rawField(f) {
  return { field: f.num, wire_type: f.wt, value: typeof f.value === 'bigint' ? f.value.toString() : toHex(f.value) };
}

// Schema-less decoding: length-delimited fields become nested messages, strings or bytes.
export function guessTree(bytes, depth = 0) {
  if (depth > 20) return [{ bytes: toHex(bytes) }];
  let fields;
  try { fields = new Reader(bytes).fields(); } catch { return [{ bytes: toHex(bytes) }]; }
  return fields.map(f => {
    if (f.wt === 0) return { field: f.num, varint: f.value.toString() };
    if (f.wt !== 2) return { field: f.num, [f.wt === 1 ? 'fixed64' : 'fixed32']: toHex(f.value) };
    let s = null;
    try { s = utf8d.decode(f.value); if (/[\u0000-\u0008\u000e-\u001f]/.test(s)) s = null; } catch {}
    if (s !== null && s.length) return { field: f.num, string: s };
    try { const sub = new Reader(f.value).fields(); if (sub.length) return { field: f.num, message: guessTree(f.value, depth + 1) }; } catch {}
    return { field: f.num, bytes: toHex(f.value) };
  });
}
