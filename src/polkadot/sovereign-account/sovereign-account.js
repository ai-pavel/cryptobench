// Sovereign Account: the relay-chain and sibling accounts of a parachain, as used by XCM.
import { $, kv, showError, fillNetworks } from '../lib/ui.js';
import { NETWORKS, ss58Encode, utf8, uintLE, toHex } from '../lib/dot.js';

// SS58 prefix from the network select value and the custom prefix input.
export const prefixFrom = (net, custom) => net === 'custom' ? parseInt(custom, 10) : NETWORKS[+net].prefix;
export const account = (tag, id) => { const b = new Uint8Array(32); b.set(utf8(tag)); b.set(uintLE(id, 4), 4); return b; };

// Parachain ID (as typed) → { relay, sib } account ids.
export function sovereignAccounts(para) {
  const s = para.trim();
  if (!/^\d+$/.test(s) || BigInt(s) > 0xffffffffn) throw new Error('Parachain ID must be a whole number from 0 to 4294967295.');
  const id = Number(s);
  return { relay: account('para', id), sib: account('sibl', id) };
}

function mount() {
  fillNetworks($('net'), NETWORKS, 0);
  const prefix = () => prefixFrom($('net').value, $('custom').value);
  function render() {
    $('customWrap').hidden = $('net').value !== 'custom';
    try {
      const { relay, sib } = sovereignAccounts($('para').value), p = prefix();
      showError($('err'), null);
      $('out').innerHTML = `<p class="section-title">On the relay chain</p>` + kv([['Address', ss58Encode(relay, p)], ['Account id', toHex(relay)]])
        + `<p class="section-title">On sibling parachains</p>` + kv([['Address', ss58Encode(sib, p)], ['Account id', toHex(sib)]]);
    } catch (e) { showError($('err'), e); $('out').innerHTML = ''; }
  }
  ['para', 'net', 'custom'].forEach(id => $(id).addEventListener('input', render));
  render();
  // Example button(s)
  $('example').onclick = () => { $('para').value = '1000'; $('net').value = '0'; render(); };
}

if (globalThis.document) mount();
