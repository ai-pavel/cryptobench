// Address from Key: derive the EVM address and public keys from a private or public key.
import { hexToBytes, bytesToHex, secp256k1, parsePrivateKey, parsePublicKey, addressFromPoint, InputError } from '../lib/evm.js';
import { $, renderRows, live } from '../lib/ui.js';

/**
 * Derive the address from a 32-byte private key or a 33/64/65-byte public key.
 * Returns null for empty input; otherwise the address, key type and both public key forms.
 */
export function deriveFromKey(raw) {
  raw = raw.trim();
  if (!raw) return null;
  const b = hexToBytes(raw, 'Key');
  let point, priv = null;
  if (b.length === 32) { priv = parsePrivateKey(raw); point = secp256k1.ProjectivePoint.fromPrivateKey(priv); }
  else if ([33, 64, 65].includes(b.length)) point = parsePublicKey(b);
  else throw new InputError(`Expected 32 bytes (private key) or 33/64/65 bytes (public key), got ${b.length}`);
  return {
    address: addressFromPoint(point),
    keyType: priv ? 'Private key' : 'Public key',
    compressed: bytesToHex(point.toRawBytes(true)),
    uncompressed: bytesToHex(point.toRawBytes(false)),
  };
}

function mount() {
  const run = live([$('key')], () => {
    const r = deriveFromKey($('key').value);
    if (!r) { $('out').innerHTML = ''; return; }
    renderRows($('out'), [
      { label: 'Address', value: r.address },
      { label: 'Key type', value: r.keyType, copy: false },
      { label: 'Public key (compressed)', value: r.compressed },
      { label: 'Public key (uncompressed)', value: r.uncompressed },
    ]);
  }, { errEl: $('err'), outEl: $('out') });

  // Example: Hardhat/Anvil test account #0 (a well-known public test key).
  $('example').onclick = () => {
    $('key').value = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    run();
  };

  $('random').onclick = () => {
    $('key').value = bytesToHex(secp256k1.utils.randomPrivateKey());
    run();
  };
}

if (globalThis.document) mount();
