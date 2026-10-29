// Pure Proxy: compute the address of a pure proxy created with proxy.createPure.
import { $, kv, showError, fillNetworks } from '../lib/ui.js';
import { NETWORKS, ss58Encode, accountIdFrom, blake2, concat, utf8, uintLE, toHex } from '../lib/dot.js';

export const TYPES = [
  ['Polkadot relay chain', ['Any', 'NonTransfer', 'Governance', 'Staking', null, null, 'CancelProxy', 'Auction', 'NominationPools', 'ParaRegistration']],
  ['Kusama relay chain', ['Any', 'NonTransfer', 'Governance', 'Staking', null, 'CancelProxy', 'Auction', 'Society', 'NominationPools', 'Spokesperson', 'ParaRegistration']],
];

// SS58 prefix from the network select value and the custom prefix input.
export const prefixFrom = (net, custom) => net === 'custom' ? parseInt(custom, 10) : NETWORKS[+net].prefix;
export const intIn = (value, max, what) => { const s = value.trim(); if (!/^\d+$/.test(s) || BigInt(s) > BigInt(max)) throw new Error(`${what} must be a whole number from 0 to ${max}.`); return Number(s); };

// pallet_proxy::pure_account. Number fields are strings as typed; ptype is the proxy type
// select value, or 'custom' to use pcustom.
export function pureAccount({ who, ptype, pcustom, height, ext, idx }) {
  const spawner = accountIdFrom(who, 'spawner');
  const type = ptype === 'custom' ? intIn(pcustom, 255, 'Proxy type index') : +ptype;
  return blake2(concat(utf8('modlpy/proxy____'), spawner, uintLE(intIn(height, 4294967295, 'Block number'), 4),
    uintLE(intIn(ext, 4294967295, 'Extrinsic index'), 4), new Uint8Array([type]), uintLE(intIn(idx, 65535, 'Index'), 2)), 256);
}

function mount() {
  $('ptype').innerHTML = TYPES.map(([net, names]) => `<optgroup label="${net}">${names.map((n, i) => n ? `<option value="${i}">${n} (${i})</option>` : '').join('')}</optgroup>`).join('') + '<option value="custom">Other index…</option>';
  fillNetworks($('net'), NETWORKS, 0);
  const prefix = () => prefixFrom($('net').value, $('custom').value);
  function render() {
    $('customWrap').hidden = $('net').value !== 'custom';
    $('pcustomWrap').hidden = $('ptype').value !== 'custom';
    try {
      const id = pureAccount(Object.fromEntries(['who', 'ptype', 'pcustom', 'height', 'ext', 'idx'].map(k => [k, $(k).value])));
      showError($('err'), null);
      $('out').innerHTML = kv([['Pure proxy address', ss58Encode(id, prefix())], ['Account id', toHex(id)]]);
    } catch (e) { showError($('err'), e); $('out').innerHTML = ''; }
  }
  ['who', 'ptype', 'pcustom', 'idx', 'height', 'ext', 'net', 'custom'].forEach(id => $(id).addEventListener('input', render));
  render();
  // Example button(s)
  $('example').onclick = () => { $('who').value = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'; $('ptype').value = '0'; $('idx').value = '0'; $('height').value = '22000000'; $('ext').value = '2'; $('net').value = '0'; render(); };
}

if (globalThis.document) mount();
