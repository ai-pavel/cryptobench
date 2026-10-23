// Unit Converter: convert between the smallest unit (Planck, rao) and whole tokens, exactly.
import { $, kv, showError } from '../lib/ui.js';

export const TOKENS = [
  { name: 'DOT — Polkadot', symbol: 'DOT', decimals: 10, base: 'Planck' },
  { name: 'KSM — Kusama', symbol: 'KSM', decimals: 12, base: 'Planck' },
  { name: 'TAO — Bittensor', symbol: 'TAO', decimals: 9, base: 'rao' },
  { name: 'WND — Westend', symbol: 'WND', decimals: 12, base: 'Planck' },
  { name: 'PAS — Paseo', symbol: 'PAS', decimals: 10, base: 'Planck' },
  { name: 'ACA — Acala', symbol: 'ACA', decimals: 12, base: 'Planck' },
  { name: 'HDX — Hydration', symbol: 'HDX', decimals: 12, base: 'Planck' },
  { name: 'ASTR — Astar', symbol: 'ASTR', decimals: 18, base: 'Planck' },
  { name: 'GLMR — Moonbeam', symbol: 'GLMR', decimals: 18, base: 'Wei' },
  { name: 'Custom…', symbol: 'Token', decimals: null, base: 'Planck' },
];

// The selected token; Custom takes its decimals (clamped to 0–40) from the input.
export function tokenAt(index, decimalsValue) {
  const t = TOKENS[+index];
  return { ...t, decimals: t.decimals ?? Math.max(0, Math.min(40, parseInt(decimalsValue, 10) || 0)) };
}

export function toBase(s, d) {
  s = s.trim().replace(/[_,\s]/g, '');
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') throw new Error('Enter a non-negative number, e.g. 1.5');
  const [i, f = ''] = s.split('.');
  if (f.length > d) throw new Error(`Too many decimal places: this token has ${d}.`);
  return BigInt((i || '0') + f.padEnd(d, '0'));
}

export function fromBase(s, d) {
  s = s.trim().replace(/[_,\s]/g, '');
  if (!/^\d+$/.test(s)) throw new Error('The smallest unit is a whole number, e.g. 15000000000');
  const v = BigInt(s);
  if (!d) return { v, text: v.toString() };
  const str = v.toString().padStart(d + 1, '0');
  const frac = str.slice(-d).replace(/0+$/, '');
  return { v, text: str.slice(0, -d) + (frac ? '.' + frac : '') };
}

export const group = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Result rows for kv(); throws if the amount doesn't fit in a u128 balance.
export function resultRows(t, v, text) {
  if (v >= 1n << 128n) throw new Error('Larger than u128, the type used for balances.');
  return [[t.symbol, text], [t.base, v.toString()], ['Grouped', group(v.toString()), { copy: false }], ['Hex (u128)', '0x' + v.toString(16)]];
}

function mount() {
  $('token').innerHTML = TOKENS.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
  const cur = () => tokenAt($('token').value, $('decimals').value);
  let last = 'tok';
  function render() {
    const t = cur();
    $('decWrap').hidden = TOKENS[+$('token').value].decimals !== null;
    $('tokLabel').textContent = t.symbol; $('baseLabel').textContent = t.base;
    $('t1').textContent = t.symbol; $('t2').textContent = t.base; $('pow').textContent = t.decimals;
    try {
      let v, text;
      if (last === 'tok') { v = toBase($('tok').value, t.decimals); $('base').value = v.toString(); ({ text } = fromBase(v.toString(), t.decimals)); }
      else { ({ v, text } = fromBase($('base').value, t.decimals)); $('tok').value = text; }
      const rows = resultRows(t, v, text);
      showError($('err'), null);
      $('out').innerHTML = kv(rows);
    } catch (e) { showError($('err'), e); $('out').innerHTML = ''; }
  }
  $('tok').addEventListener('input', () => { last = 'tok'; render(); });
  $('base').addEventListener('input', () => { last = 'base'; render(); });
  $('token').addEventListener('input', render);
  $('decimals').addEventListener('input', render);
  render();
  // Example button(s)
  $('example').onclick = () => { $('token').value = '0'; $('tok').value = '12.5'; last = 'tok'; render(); };
}

if (globalThis.document) mount();
