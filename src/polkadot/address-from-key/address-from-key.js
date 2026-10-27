// Address from Key: derive the SS58 address (and account id) of a public key.
import { $, kv, showError, fillNetworks } from '../lib/ui.js';
import { NETWORKS, ss58Encode, fromHex, toHex, accountIdOf, ethAddressOf, secp256k1 } from '../lib/dot.js';

// SS58 prefix from the network select value and the custom prefix input.
export const prefixFrom = (net, custom) => net === 'custom' ? parseInt(custom, 10) : NETWORKS[+net].prefix;

// Public key hex + key type select value ('auto', 'sr25519', 'ed25519', 'ecdsa') + SS58 prefix → kv rows.
export function keyRows(pkHex, selected, prefix) {
  const pk = fromHex(pkHex, 'public key');
  let type = selected;
  if (type === 'auto') type = pk.length === 32 ? 'sr25519' : (pk.length === 33 || pk.length === 65) ? 'ecdsa' : null;
  if (!type) throw new Error(`Public keys are 32 bytes (Sr25519/Ed25519) or 33/65 bytes (ECDSA); got ${pk.length}.`);
  if (type !== 'ecdsa' && pk.length !== 32) throw new Error(`${type} public keys are 32 bytes (got ${pk.length}).`);
  if (type === 'ecdsa') { if (pk.length !== 33 && pk.length !== 65) throw new Error(`ECDSA public keys are 33 or 65 bytes (got ${pk.length}).`); try { secp256k1.Point.fromBytes(pk); } catch { throw new Error('Not a valid secp256k1 point.'); } }
  const id = accountIdOf(type, pk);
  const rows = [['Key type', type === 'ecdsa' ? 'ECDSA (secp256k1)' : (pk.length === 32 && selected === 'auto' ? 'Sr25519 or Ed25519' : type), { copy: false }],
    ['Address', ss58Encode(id, prefix)], ['Account id', toHex(id)]];
  if (type === 'ecdsa') {
    const comp = secp256k1.Point.fromBytes(pk).toBytes(true);
    rows.push(['Compressed key', toHex(comp)]);
    rows.push(['Ethereum address', ethAddressOf(pk), { note: 'the H160 address of the same key, used by Ethereum-style chains such as Moonbeam' }]);
  }
  return rows;
}

function mount() {
  fillNetworks($('net'), NETWORKS, 0);
  const prefix = () => prefixFrom($('net').value, $('custom').value);
  function render() {
    $('customWrap').hidden = $('net').value !== 'custom';
    try {
      const rows = keyRows($('pk').value, $('type').value, prefix());
      showError($('err'), null);
      $('out').innerHTML = kv(rows);
    } catch (e) { showError($('err'), e); $('out').innerHTML = ''; }
  }
  ['pk', 'type', 'net', 'custom'].forEach(id => $(id).addEventListener('input', render));
  render();
  // Example button(s)
  $('example').onclick = () => { $('pk').value = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d'; $('type').value = 'auto'; $('net').value = '0'; render(); };
}

if (globalThis.document) mount();
