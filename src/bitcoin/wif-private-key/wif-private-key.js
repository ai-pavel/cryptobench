// WIF Private Key: convert a private key between hex and WIF and show its public key and addresses.
import { InputError, secp256k1, bytesToHex, parsePrivateKeyHex, decodeWif, encodeWif, NETWORKS, networkOptions, addressesForPubkey } from '../lib/btc.js';
import { $, renderRows, live } from '../lib/ui.js';

/** The Bitcoin wiki WIF example key, uncompressed. */
export const EXAMPLE = { key: '0c28fca386c7a227600b2fe50b7cae11ec86d3bf1fbe471be89827e19d72aa1d', net: 'mainnet', compressed: false };

/**
 * Rows for a private key in hex (using the chosen network and compression) or WIF
 * (whose own network and compression win). Returns null for empty input; throws InputError.
 */
export function keyRows(input, { net: selectedNet, compressed: selectedCompressed }) {
  const v = input.trim();
  if (!v) return null;
  let priv, compressed, netKey, fromWif = false;
  if (/^(0x)?[0-9a-f]{64}$/i.test(v)) {
    priv = parsePrivateKeyHex(v); compressed = selectedCompressed; netKey = selectedNet;
  } else {
    const d = decodeWif(v);
    priv = d.priv; compressed = d.compressed; fromWif = true;
    netKey = d.networks.includes(selectedNet) ? selectedNet : d.networks[0];
    if (!netKey) throw new InputError(`Unknown WIF version byte 0x${d.version.toString(16)}`);
  }
  const net = NETWORKS[netKey];
  const pub = secp256k1.getPublicKey(priv, compressed);
  return [
    { label: 'Private key (hex)', value: bytesToHex(priv) },
    { label: 'WIF', value: encodeWif(priv, net, compressed), note: `${net.label}, ${compressed ? 'compressed' : 'uncompressed'}${fromWif ? ' (read from the WIF)' : ''}` },
    { label: `WIF (${compressed ? 'uncompressed' : 'compressed'})`, value: encodeWif(priv, net, !compressed), note: 'The same key flagged for the other public key format' },
    { label: 'Public key', value: bytesToHex(pub) },
    ...addressesForPubkey(pub, net).map(a => ({ label: a.type, value: a.address })),
  ];
}

function mount() {
  $('net').innerHTML = networkOptions('mainnet');
  const run = live([$('key'), $('net'), $('compressed')], () => {
    const rows = keyRows($('key').value, { net: $('net').value, compressed: $('compressed').checked });
    if (!rows) { $('out').innerHTML = ''; return; }
    renderRows($('out'), rows);
  }, { errEl: $('err'), outEl: $('out') });

  $('random').onclick = () => { $('key').value = bytesToHex(secp256k1.utils.randomPrivateKey()); run(); };
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // The Bitcoin wiki WIF example key, uncompressed.
  $('example').onclick = () => {
    exSet('key', EXAMPLE.key); exSet('net', EXAMPLE.net); exSet('compressed', EXAMPLE.compressed); run();
  };
}

if (globalThis.document) mount();
