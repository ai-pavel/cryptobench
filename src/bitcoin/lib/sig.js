// ECDSA signature encoding helpers: strict DER (BIP66), sighash bytes.
import { InputError, secp256k1, bytesToBigInt, bigIntToBytes, concat } from './btc.js';

const N = secp256k1.CURVE.n;

export function sighashName(b) {
  const base = { 0x00: 'SIGHASH_DEFAULT (taproot only)', 0x01: 'SIGHASH_ALL', 0x02: 'SIGHASH_NONE', 0x03: 'SIGHASH_SINGLE' }[b & 0x1f];
  if (b === 0x00) return 'SIGHASH_DEFAULT (taproot only)';
  if (!base || (b & 0x60)) return 'Non-standard sighash type';
  return b & 0x80 ? `${base} | SIGHASH_ANYONECANPAY` : base;
}

/** Minimal DER integer for a positive bigint. */
function derInt(n) {
  let b = bigIntToBytes(n);
  if (b[0] & 0x80) b = concat(Uint8Array.of(0), b);
  return concat(Uint8Array.of(0x02, b.length), b);
}

export function encodeDer(r, s) {
  const body = concat(derInt(r), derInt(s));
  return concat(Uint8Array.of(0x30, body.length), body);
}

/**
 * Check a signature against Bitcoin Core's IsValidSignatureEncoding (BIP66).
 * Accepts the signature with or without a trailing sighash byte.
 * Returns { ok, error?, r?, s?, sighash?, derLength, highS }.
 */
export function checkStrictDer(sig) {
  const res = { ok: false, derLength: sig.length };
  if (sig.length < 8) return { ...res, error: `too short (${sig.length} bytes)` };
  if (sig[0] !== 0x30) return { ...res, error: `must start with 0x30 (compound), found 0x${sig[0].toString(16).padStart(2, '0')}` };
  let withHash;
  if (sig[1] === sig.length - 2) withHash = false;
  else if (sig[1] === sig.length - 3) withHash = true;
  else return { ...res, error: `length byte says ${sig[1]} bytes follow, but ${sig.length - 2} do` };
  const der = withHash ? sig.slice(0, -1) : sig;
  res.derLength = der.length;
  if (withHash) res.sighash = sig[sig.length - 1];
  if (der.length > 72) return { ...res, error: `DER part is ${der.length} bytes; the maximum is 72` };
  if (der[2] !== 0x02) return { ...res, error: 'r must be an INTEGER (0x02)' };
  const lenR = der[3];
  if (lenR === 0) return { ...res, error: 'r has zero length' };
  if (5 + lenR >= der.length) return { ...res, error: 'r length runs past the end of the signature' };
  const lenS = der[5 + lenR - 1 + 1];
  if (der[4 + lenR] !== 0x02) return { ...res, error: 's must be an INTEGER (0x02)' };
  if (lenR + lenS + 6 !== der.length) return { ...res, error: `r (${lenR}) and s (${lenS}) lengths do not add up to the signature length` };
  if (lenS === 0) return { ...res, error: 's has zero length' };
  const R = der.slice(4, 4 + lenR), S = der.slice(6 + lenR, 6 + lenR + lenS);
  if (R[0] & 0x80) return { ...res, error: 'r is negative (high bit set without a 0x00 pad)' };
  if (lenR > 1 && R[0] === 0 && !(R[1] & 0x80)) return { ...res, error: 'r has an unnecessary leading 0x00' };
  if (S[0] & 0x80) return { ...res, error: 's is negative (high bit set without a 0x00 pad)' };
  if (lenS > 1 && S[0] === 0 && !(S[1] & 0x80)) return { ...res, error: 's has an unnecessary leading 0x00' };
  const r = bytesToBigInt(R), s = bytesToBigInt(S);
  Object.assign(res, { r, s, highS: s > N / 2n });
  if (r === 0n || r >= N) return { ...res, error: 'r is out of range (must be 1 … n−1)' };
  if (s === 0n || s >= N) return { ...res, error: 's is out of range (must be 1 … n−1)' };
  return { ...res, ok: true };
}

/** Parse a DER (optionally with sighash) or 64-byte compact signature into { r, s, format, sighash? }. */
export function parseSig(bytes) {
  if (bytes.length === 64) {
    return { r: bytesToBigInt(bytes.slice(0, 32)), s: bytesToBigInt(bytes.slice(32)), format: 'Compact (64 bytes)' };
  }
  if (bytes[0] === 0x30) {
    const d = checkStrictDer(bytes);
    if (d.r !== undefined && d.s !== undefined) {
      return { r: d.r, s: d.s, format: d.ok ? 'Strict DER' : `DER (not strict: ${d.error})`, sighash: d.sighash };
    }
    throw new InputError(`Invalid DER signature: ${d.error}`);
  }
  throw new InputError('Signature must be DER (starting with 30) or 64 bytes compact');
}
