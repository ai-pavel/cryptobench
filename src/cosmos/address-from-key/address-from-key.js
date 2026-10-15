// Address from Key: derive a chain's account address from a secp256k1 public key.
import { parsePublicKey, cosmosAddressBytes, ethAddressBytes, ethChecksum, encodeBech32, chainOptions, CHAINS, base64, toHex, kvTable, wireCopy, showError } from '../lib/cosmos.js';

/**
 * Derive the address for a public key on a chain. `type` is 'auto', 'cosmos' or 'eth'.
 * Returns null for empty input; otherwise the result rows and the other key type's
 * address row for comparison. Throws on an invalid public key.
 */
export function addressFromKey(input, prefix, type = 'auto') {
  if (!input.trim()) return null;
  const { compressed, uncompressed } = parsePublicKey(input);
  const chain = CHAINS.find(c => c.prefix === prefix);
  if (type === 'auto') type = chain?.eth ? 'eth' : 'cosmos';
  const cosmos = cosmosAddressBytes(compressed), eth = ethAddressBytes(uncompressed);
  const rows = type === 'eth'
    ? [['Address', encodeBech32(prefix, eth), 'ethsecp256k1: Keccak-256 of the uncompressed key'], ['Ethereum address', ethChecksum(eth), 'Same bytes, EIP-55 checksummed']]
    : [['Address', encodeBech32(prefix, cosmos), 'secp256k1: RIPEMD-160(SHA-256(compressed key))']];
  rows.push(['Address bytes', toHex(type === 'eth' ? eth : cosmos)]);
  rows.push(['Compressed key (hex)', toHex(compressed)], ['Compressed key (base64)', base64.encode(compressed), 'As shown in amino/protobuf PubKey JSON']);
  rows.push(['Uncompressed key (hex)', toHex(uncompressed)]);
  const other = type === 'eth' ? ['secp256k1 (Cosmos) form', encodeBech32(prefix, cosmos)] : ['ethsecp256k1 form', encodeBech32(prefix, eth)];
  return { type, rows, other: [...other, 'If this is the address you expected, switch the key type above'] };
}

function mount() {
  const $ = id => document.getElementById(id);
  $('chain').innerHTML = chainOptions('cosmos');

  function render() {
    showError($('err'), ''); $('out').innerHTML = '';
    try {
      const r = addressFromKey($('pk').value, $('chain').value, $('type').value);
      if (!r) return;
      let html = kvTable(r.rows);
      html += `<p class="section-title">The other key type, for comparison</p>` + kvTable([r.other]);
      $('out').innerHTML = html;
    } catch (e) { showError($('err'), e.message); }
  }
  $('pk').oninput = render; $('chain').oninput = render; $('type').oninput = render;
  wireCopy(); render();
  // Example button(s)
  $('example').onclick = () => { $('pk').value = "Ak9OKtmcNNYLm6YoPJQxqEGK+GcyEpYfl6d7Y3f80Fti"; $('chain').value = 'cosmos'; $('type').value = 'auto'; render(); };
}

if (globalThis.document) mount();
