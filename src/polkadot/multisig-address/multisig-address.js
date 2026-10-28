// Multisig Address: compute the pallet_multisig account of a set of signatories and a threshold.
import { $, kv, esc, showError, fillNetworks } from '../lib/ui.js';
import { NETWORKS, ss58Encode, accountIdFrom, blake2, concat, utf8, compact, uintLE, toHex } from '../lib/dot.js';

// SS58 prefix from the network select value and the custom prefix input.
export const prefixFrom = (net, custom) => net === 'custom' ? parseInt(custom, 10) : NETWORKS[+net].prefix;
export const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

// Signatories (one per line) + threshold → { id, sorted, threshold, count }.
export function multisigAccount(who, thr) {
  const lines = who.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('Enter at least two signatories.');
  if (lines.length > 100) throw new Error('pallet_multisig allows at most 100 signatories.');
  const ids = lines.map((l, i) => { try { return accountIdFrom(l); } catch (e) { throw new Error(`Line ${i + 1}: ${e.message}`); } });
  const sorted = [...ids].sort(cmp);
  const dup = sorted.some((x, i) => i && cmp(x, sorted[i - 1]) === 0);
  if (dup) throw new Error('The same account is listed twice; signatories must be unique.');
  const t = thr.trim();
  if (!/^\d+$/.test(t) || +t < 1 || +t > ids.length) throw new Error(`Threshold must be between 1 and ${ids.length}.`);
  const id = blake2(concat(utf8('modlpy/utilisuba'), compact(sorted.length), ...sorted, uintLE(+t, 2)), 256);
  return { id, sorted, threshold: t, count: ids.length };
}

function mount() {
  fillNetworks($('net'), NETWORKS, 0);
  const prefix = () => prefixFrom($('net').value, $('custom').value);
  function render() {
    $('customWrap').hidden = $('net').value !== 'custom';
    try {
      const { id, sorted, threshold: t, count } = multisigAccount($('who').value, $('thr').value);
      const p = prefix();
      showError($('err'), null);
      $('out').innerHTML = kv([['Multisig address', ss58Encode(id, p)], ['Account id', toHex(id)], ['Threshold', `${t} of ${count}`, { copy: false }]])
        + `<p class="section-title">Signatories in the order the chain uses</p>` + kv(sorted.map((x, i) => [`#${i + 1}`, ss58Encode(x, p)]));
    } catch (e) { showError($('err'), e); $('out').innerHTML = ''; }
  }
  ['who', 'thr', 'net', 'custom'].forEach(id => $(id).addEventListener('input', render));
  render();
  // Example button(s)
  $('example').onclick = () => { $('who').value = ['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y'].join('\n'); $('thr').value = '2'; $('net').value = '0'; render(); };
}

if (globalThis.document) mount();
