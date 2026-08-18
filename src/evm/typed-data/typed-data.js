// EIP-712 Typed Data: hash typed structured data, sign its digest, or recover the signer.
import { hashTypedData, bytesToHex, parsePrivateKey, signHash, addressFromPrivateKey, parseEcdsaSignature, recoverAddress, InputError } from '../lib/evm.js';
import { $, renderRows, showError } from '../lib/ui.js';

// The "Mail" example from EIP-712.
export const EXAMPLE = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
    ],
    Person: [{ name: 'name', type: 'string' }, { name: 'wallet', type: 'address' }],
    Mail: [{ name: 'from', type: 'Person' }, { name: 'to', type: 'Person' }, { name: 'contents', type: 'string' }],
  },
  primaryType: 'Mail',
  domain: { name: 'Ether Mail', version: '1', chainId: 1, verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC' },
  message: {
    from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
    to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
    contents: 'Hello, Bob!',
  },
};

/**
 * Hash EIP-712 typed data given as JSON. Returns null for empty input; otherwise the
 * digest (bytes, the hash that is signed) and the rows shown.
 */
export function hashJson(raw) {
  raw = raw.trim();
  if (!raw) return null;
  let td;
  try { td = JSON.parse(raw); } catch (e) { throw new InputError(`Not valid JSON: ${e.message}`); }
  const h = hashTypedData(td);
  return { digest: h.digest, rows: [
    { label: 'Digest (signed hash)', value: bytesToHex(h.digest), cls: 'ok' },
    { label: 'Domain separator', value: bytesToHex(h.domainSeparator) },
    h.structHash && { label: 'Struct hash', value: bytesToHex(h.structHash) },
    h.encodedType && { label: 'Encoded type', value: h.encodedType },
  ] };
}

/** Sign a digest; returns the rows shown (null without a key or digest). */
export function signDigest(keyRaw, digest) {
  if (!keyRaw.trim() || !digest) return null;
  const key = parsePrivateKey(keyRaw);
  const sig = signHash(digest, key);
  return [
    { label: 'Signature', value: bytesToHex(sig.bytes), cls: 'ok' },
    { label: 'Signer', value: addressFromPrivateKey(key) },
    { label: 'r', value: bytesToHex(sig.r) },
    { label: 's', value: bytesToHex(sig.s) },
    { label: 'v', value: String(sig.v) },
  ];
}

/** Recover the address that signed a digest (null without a signature or digest). */
export function recoverSigner(sigRaw, digest) {
  if (!sigRaw.trim() || !digest) return null;
  return recoverAddress(digest, parseEcdsaSignature(sigRaw));
}

function mount() {
  let digest = null;

  function hash() {
    showError($('err'), null);
    $('out').innerHTML = '';
    digest = null;
    try {
      const h = hashJson($('json').value);
      if (!h) return;
      digest = h.digest;
      renderRows($('out'), h.rows);
    } catch (e) {
      showError($('err'), e);
    }
  }

  function sign() {
    showError($('sign-err'), null);
    $('sign-out').innerHTML = '';
    try {
      const rows = signDigest($('key').value, digest);
      if (rows) renderRows($('sign-out'), rows);
    } catch (e) {
      showError($('sign-err'), e);
    }
  }

  function recover() {
    showError($('rec-err'), null);
    $('rec-out').innerHTML = '';
    try {
      const signer = recoverSigner($('sig').value, digest);
      if (signer) renderRows($('rec-out'), [{ label: 'Signer', value: signer, cls: 'ok' }]);
    } catch (e) {
      showError($('rec-err'), e);
    }
  }

  const all = () => { hash(); sign(); recover(); };
  $('json').addEventListener('input', all);
  $('key').addEventListener('input', sign);
  $('sig').addEventListener('input', recover);
  $('example').onclick = () => { $('json').value = JSON.stringify(EXAMPLE, null, 2); all(); };
  $('json').value = JSON.stringify(EXAMPLE, null, 2);
  all();
}

if (globalThis.document) mount();
