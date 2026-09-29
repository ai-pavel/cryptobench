// Verify Message: verify a CIP-8 / CIP-30 signData signature (COSE_Sign1) against a key and its address.
import { decode, encode, fromHex, toHex, Tag, CborMap, ed25519, blake2b224, parseAddressBytes, bech32Encode } from '../lib/cardano.js';
import { $, row, showError } from '../lib/ui.js';

// Signed with the public test phrase "test walk nut …" (account 0, address 0).
export const EXAMPLE = {
  sig: "845846a2012767616464726573735839019493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e32c728d3861e164cab28cb8f006448139c8f1740ffb8e7aa9e5232dca166686173686564f458205369676e20696e20746f206578616d706c652e636f6d0a6e6f6e63653a2034325840f9550ea9f540afde463f1e8322edd1b47b89d9f9ec6d07f211b247883ec52fc0aaba4e5cf800a8a26a14f20c169350968f100d5b1b699093a71cbfbf765b7e04",
  key: "a401010327200621582073fea80d424276ad0978d4fe5310e8bc2d485f5f6bb3bf87612989f112ad5a7d",
  message: "Sign in to example.com\nnonce: 42"
};

export function coseKeyPub(hex) {
  const b = fromHex(hex);
  if (b.length === 32) return b;
  let k; try { k = decode(b); } catch (e) { throw new Error('The key is neither a 32-byte public key nor valid COSE_Key CBOR.'); }
  if (!(k instanceof CborMap)) throw new Error('A COSE_Key is a CBOR map.');
  const x = k.get(-2), kty = k.get(1), crv = k.get(-1);
  if (kty !== undefined && kty !== 1) throw new Error(`COSE_Key type ${kty} isn't OKP (1).`);
  if (crv !== undefined && crv !== 6) throw new Error(`COSE_Key curve ${crv} isn't Ed25519 (6).`);
  if (!(x instanceof Uint8Array) || x.length !== 32) throw new Error('The COSE_Key has no 32-byte public key (label -2).');
  return x;
}

/**
 * Verify a COSE_Sign1 signature (hex) with a key (hex) and an optional expected message.
 * Returns null without a signature. Otherwise { rows, checks }: rows are { label, value, note }
 * for the result table; checks is null while the key is missing, else a list of { ok, text }
 * (signature, key vs. address, message). Throws on invalid input.
 */
export function verifyMessage({ sig, key, expected = '' }) {
  const sigHex = sig.trim(), keyHex = key.trim();
  if (!sigHex) return null;
  let s = decode(fromHex(sigHex));
  if (s instanceof Tag && s.tag === 18) s = s.value;
  if (!Array.isArray(s) || s.length !== 4 || !(s[0] instanceof Uint8Array) || !(s[3] instanceof Uint8Array)) throw new Error('This isn\'t a COSE_Sign1 structure ([protected, unprotected, payload, signature]).');
  const [protBytes, unprot, payload, signature] = s;
  const prot = protBytes.length ? decode(protBytes) : new CborMap();
  const alg = prot.get(1), addrBytes = prot.get('address');
  const hashed = unprot instanceof CborMap ? unprot.get('hashed') === true : false;
  const rows = [];
  if (alg !== -8) rows.push({ label: 'Algorithm', value: String(alg), note: 'Expected -8 (EdDSA).' });
  let address = null;
  if (addrBytes instanceof Uint8Array) {
    try { address = parseAddressBytes(addrBytes); rows.push({ label: 'Signing address', value: address.bech32 || address.base58, note: address.typeName }); }
    catch { rows.push({ label: 'Signing address (hex)', value: toHex(addrBytes) }); }
  }
  if (payload === null) rows.push({ label: 'Payload', value: '(detached: not included in the signature)' });
  else {
    let text = null; try { text = new TextDecoder('utf-8', { fatal: true }).decode(payload); } catch {}
    if (text !== null && !hashed) rows.push({ label: 'Message', value: text });
    rows.push({ label: hashed ? 'Payload (Blake2b-224 hash of the message)' : 'Payload (hex)', value: toHex(payload) });
  }
  if (!keyHex) return { rows, checks: null };
  const pub = coseKeyPub(keyHex);
  if (payload === null) throw new Error('The payload is detached; this tool needs it inside the signature.');
  const toSign = encode(['Signature1', protBytes, new Uint8Array(0), payload]);
  let valid = false; try { valid = ed25519.verify(signature, toSign, pub); } catch {}
  const keyHash = blake2b224(pub);
  let addrMatch = null;
  if (address && !address.byron) {
    const cred = address.payment?.type === 'key' && toHex(address.payment.hash) === toHex(keyHash) ? 'payment'
      : address.stake?.type === 'key' && toHex(address.stake.hash) === toHex(keyHash) ? 'stake' : null;
    addrMatch = cred;
  }
  let msgMatch = null;
  if (expected) {
    const exp = new TextEncoder().encode(expected);
    msgMatch = toHex(hashed ? blake2b224(exp) : exp) === toHex(payload);
  }
  rows.push({ label: 'Public key', value: toHex(pub) }, { label: 'Key hash', value: toHex(keyHash), note: bech32Encode('addr_vkh', keyHash) }, { label: 'Signature', value: toHex(signature) });
  const checks = [valid ? { ok: true, text: '✓ Valid signature' } : { ok: false, text: '✗ Invalid signature' }];
  if (address && !address.byron) checks.push(addrMatch ? { ok: true, text: `✓ Key matches the address's ${addrMatch} credential` } : { ok: false, text: '✗ Key doesn\'t match the signing address' });
  if (msgMatch !== null) checks.push(msgMatch ? { ok: true, text: '✓ Message matches' } : { ok: false, text: '✗ Message differs from the expected one' });
  return { rows, checks };
}

// Change one character of the signed message inside the COSE structure: the signature must then fail.
export function tamper(sigHex) {
  let c = decode(fromHex(sigHex.trim()));
  const arr = c instanceof Tag ? c.value : c;
  const p = arr[2].slice(); p[p.length - 1] ^= 1; arr[2] = p;
  return toHex(encode(c));
}

function mount() {
  function render() {
    $('out').innerHTML = ''; $('verdict').innerHTML = '';
    try {
      const r = verifyMessage({ sig: $('sig').value, key: $('key').value, expected: $('expected').value });
      showError($('err'));
      if (!r) return;
      $('out').innerHTML = r.rows.map(x => row(x.label, x.value, x.note)).join('');
      $('verdict').innerHTML = r.checks
        ? r.checks.map(c => `<span class="${c.ok ? 'ok' : 'bad'}">${c.text}</span>`).join('<br>')
        : '<span class="muted">Add the key to verify the signature.</span>';
    } catch (e) { showError($('err'), e); }
  }
  for (const id of ['sig', 'key', 'expected']) $(id).addEventListener('input', render);
  $('example').onclick = () => { $('sig').value = EXAMPLE.sig; $('key').value = EXAMPLE.key; $('expected').value = EXAMPLE.message; render(); };
  $('tamper').onclick = () => {
    if (!$('sig').value.trim()) $('example').click();
    try { $('sig').value = tamper($('sig').value); } catch {}
    render();
  };
}

if (globalThis.document) mount();
