// Decoder for Sui TransactionData (BCS), following the layout used by the Sui protocol and SDK.
import { Reader, base58, utf8, utf8d, blake2b, hex, readTypeTag } from './sui.js';

const KINDS = ['ProgrammableTransaction', 'ChangeEpoch', 'Genesis', 'ConsensusCommitPrologue', 'AuthenticatorStateUpdate',
  'EndOfEpochTransaction', 'RandomnessStateUpdate', 'ConsensusCommitPrologueV2', 'ConsensusCommitPrologueV3',
  'ConsensusCommitPrologueV4', 'ProgrammableSystemTransaction'];

const digest = r => { const at = r.pos, n = r.uleb('digest length'); if (n !== 32) throw new Error(`Object digest at byte ${at} should be 32 bytes (got ${n}).`); return base58.encode(r.bytes(32, 'digest')); };
const objectRef = r => ({ objectId: r.address('object ID'), version: r.uint(64, 'version').toString(), digest: digest(r) });
const u64opt = (r, what) => r.option(() => r.uint(64, what).toString(), what);

function argument(r) {
  const at = r.pos, t = r.uleb('argument');
  if (t === 0) return { GasCoin: true };
  if (t === 1) return { Input: Number(r.uint(16, 'input index')) };
  if (t === 2) return { Result: Number(r.uint(16, 'result index')) };
  if (t === 3) return { NestedResult: [Number(r.uint(16, 'result index')), Number(r.uint(16, 'nested index'))] };
  throw new Error(`Unknown argument variant ${t} at byte ${at}.`);
}

function callArg(r) {
  const at = r.pos, t = r.uleb('input kind');
  if (t === 0) { const n = r.uleb('pure length'); return { Pure: r.bytes(n, 'pure value') }; }
  if (t === 1) {
    const o = r.uleb('object kind');
    if (o === 0) return { Object: { ImmOrOwnedObject: objectRef(r) } };
    if (o === 1) return { Object: { SharedObject: { objectId: r.address('object ID'), initialSharedVersion: r.uint(64, 'initial shared version').toString(), mutable: r.bool('mutable') } } };
    if (o === 2) return { Object: { Receiving: objectRef(r) } };
    throw new Error(`Unknown object argument variant ${o} at byte ${at + 1}.`);
  }
  if (t === 2) {
    const rv = r.uleb('reservation'); if (rv !== 0) throw new Error(`Unknown reservation variant ${rv}.`);
    const max = r.uint(64, 'max amount').toString();
    const tv = r.uleb('withdrawal type'); if (tv !== 0) throw new Error(`Unknown withdrawal type ${tv}.`);
    const typeArg = readTypeTag(r);
    const f = r.uleb('withdraw from');
    const from = f === 0 ? 'Sender' : f === 1 ? 'Sponsor' : f === 2 ? { SenderAllowance: { funder: r.address('funder'), allowance: r.address('allowance') } } : (() => { throw new Error(`Unknown withdraw-from variant ${f}.`); })();
    return { FundsWithdrawal: { maxAmount: max, typeArg, from } };
  }
  throw new Error(`Unknown input kind ${t} at byte ${at}.`);
}

function command(r) {
  const at = r.pos, t = r.uleb('command');
  const args = () => r.vec(() => argument(r), 'arguments');
  const mods = () => r.vec(() => r.bytes(r.uleb('module length'), 'module'), 'modules');
  switch (t) {
    case 0: return { MoveCall: { package: r.address('package'), module: r.string('module'), function: r.string('function'), typeArguments: r.vec(() => readTypeTag(r), 'type arguments'), arguments: args() } };
    case 1: return { TransferObjects: { objects: args(), address: argument(r) } };
    case 2: return { SplitCoins: { coin: argument(r), amounts: args() } };
    case 3: return { MergeCoins: { destination: argument(r), sources: args() } };
    case 4: return { Publish: { modules: mods(), dependencies: r.vec(() => r.address('dependency'), 'dependencies') } };
    case 5: return { MakeMoveVec: { type: r.option(() => readTypeTag(r), 'element type'), elements: args() } };
    case 6: return { Upgrade: { modules: mods(), dependencies: r.vec(() => r.address('dependency'), 'dependencies'), package: r.address('package'), ticket: argument(r) } };
    default: throw new Error(`Unknown command variant ${t} at byte ${at}.`);
  }
}

function programmable(r) {
  return { inputs: r.vec(() => callArg(r), 'inputs'), commands: r.vec(() => command(r), 'commands') };
}

function kind(r) {
  const at = r.pos, t = r.uleb('transaction kind');
  if (t === 0 || t === 10) return { kind: KINDS[t], ...programmable(r) };
  if (t < KINDS.length) throw new Error(`This is a ${KINDS[t]} system transaction; only programmable transactions are decoded.`);
  throw new Error(`Unknown transaction kind ${t} at byte ${at}.`);
}

function expiration(r) {
  const at = r.pos, t = r.uleb('expiration');
  if (t === 0) return { None: true };
  if (t === 1) return { Epoch: r.uint(64, 'epoch').toString() };
  if (t === 2 || t === 3) {
    const v = { minEpoch: u64opt(r, 'min epoch'), maxEpoch: u64opt(r, 'max epoch'), minTimestamp: u64opt(r, 'min timestamp'), maxTimestamp: u64opt(r, 'max timestamp'), chain: digest(r), nonce: Number(r.uint(32, 'nonce')) };
    if (t === 3) v.allowedProposers = r.option(() => ({ epoch: r.uint(64, 'epoch').toString(), proposers: r.vec(() => Number(r.uint(32, 'proposer')), 'proposers') }), 'allowed proposers');
    return { [t === 2 ? 'ValidDuring' : 'Validity']: v };
  }
  throw new Error(`Unknown expiration variant ${t} at byte ${at}.`);
}

export function transactionDigest(bytes) {
  const tag = utf8.encode('TransactionData::');
  const pre = new Uint8Array(tag.length + bytes.length); pre.set(tag); pre.set(bytes, tag.length);
  return base58.encode(blake2b(pre, { dkLen: 32 }));
}

// Parses full TransactionData; if that fails, tries a bare TransactionKind (as built with onlyTransactionKind).
export function parseTransaction(bytes) {
  let firstError;
  try {
    const r = new Reader(bytes);
    const v = r.uleb('version');
    if (v !== 0) throw new Error(`Unknown TransactionData version ${v} (only V1 exists).`);
    const k = kind(r);
    const sender = r.address('sender');
    const gas = { payment: r.vec(() => objectRef(r), 'gas payment'), owner: r.address('gas owner'), price: r.uint(64, 'gas price').toString(), budget: r.uint(64, 'gas budget').toString() };
    const exp = expiration(r);
    r.done('the transaction');
    return { type: 'TransactionData', ...k, sender, gas, expiration: exp, digest: transactionDigest(bytes) };
  } catch (e) { firstError = e; }
  try {
    const r = new Reader(bytes);
    const k = kind(r);
    r.done('the transaction kind');
    return { type: 'TransactionKind', ...k };
  } catch { throw firstError; }
}

// Best-effort reading of a Pure input; `hint` comes from how commands use it.
export function describePure(b, hint) {
  const out = [];
  const le = () => { let v = 0n; for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]); return v; };
  if (hint === 'u64' && b.length === 8) return [`u64 ${le()}`];
  if (hint === 'address' && b.length === 32) return [`address 0x${hex.encode(b)}`];
  if (b.length === 32) out.push(`address 0x${hex.encode(b)}`);
  if (b.length === 8) out.push(`u64 ${le()}`);
  if (b.length === 1) out.push(b[0] <= 1 ? `bool ${b[0] === 1} / u8 ${b[0]}` : `u8 ${b[0]}`);
  if (b.length === 2) out.push(`u16 ${le()}`);
  if (b.length === 4) out.push(`u32 ${le()}`);
  if (b.length === 16) out.push(`u128 ${le()}`);
  if (b.length >= 1) {
    try {
      const r = new Reader(b), n = r.uleb();
      if (n === b.length - r.pos && n > 0) {
        const s = utf8d.decode(r.bytes(n));
        if (/^[\P{Cc}\n\t]*$/u.test(s)) out.push(`string ${JSON.stringify(s)}`);
        else out.push(`vector<u8> 0x${hex.encode(b.slice(r.pos - n))}`);
      }
    } catch {
      try { const r = new Reader(b), n = r.uleb(); if (n === b.length - r.pos) out.push(`vector<u8> 0x${hex.encode(b.slice(r.pos))}`); } catch {}
    }
  }
  return out;
}
