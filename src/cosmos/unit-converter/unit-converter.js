// Unit Converter: convert token amounts between display units and base denoms.
import { wireCopy, showError, kvTable, esc } from '../lib/cosmos.js';

// [display unit, base denom, exponent, chain]
export const PRESETS = [
  ['ATOM', 'uatom', 6, 'Cosmos Hub'], ['OSMO', 'uosmo', 6, 'Osmosis'], ['TIA', 'utia', 6, 'Celestia'],
  ['INJ', 'inj', 18, 'Injective'], ['EVMOS', 'aevmos', 18, 'Evmos'], ['DYDX', 'adydx', 18, 'dYdX'],
  ['CRO', 'basecro', 8, 'Cronos POS'], ['JUNO', 'ujuno', 6, 'Juno'], ['STARS', 'ustars', 6, 'Stargaze'],
  ['AKT', 'uakt', 6, 'Akash'], ['KAVA', 'ukava', 6, 'Kava'], ['SEI', 'usei', 6, 'Sei'],
  ['NTRN', 'untrn', 6, 'Neutron'], ['STRD', 'ustrd', 6, 'Stride'], ['AXL', 'uaxl', 6, 'Axelar'],
  ['USDC', 'uusdc', 6, 'Noble USDC'], ['LUNA', 'uluna', 6, 'Terra'], ['SCRT', 'uscrt', 6, 'Secret'],
];

export function parseExponent(value) {
  const e = Number(value);
  if (!Number.isInteger(e) || e < 0 || e > 36) throw new Error('Exponent must be a whole number from 0 to 36.');
  return e;
}
export const group = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function displayToRaw(s, e) {
  const t = s.trim().replace(/[,_\s]/g, '');
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') throw new Error('Display amount must be a non-negative decimal number.');
  const [i, f = ''] = t.split('.');
  if (f.length > e) throw new Error(`Too many decimal places: this token has ${e}, so the smallest unit is 0.${'0'.repeat(Math.max(0, e - 1))}1.`);
  return BigInt((i || '0') + f.padEnd(e, '0'));
}
export function rawToDisplay(n, e) {
  const s = n.toString().padStart(e + 1, '0');
  const i = s.slice(0, s.length - e), f = s.slice(s.length - e).replace(/0+$/, '');
  return f ? `${i}.${f}` : i;
}

// A base amount as typed: digits only, with commas, underscores and spaces ignored.
export function parseRaw(s) {
  const t = s.trim().replace(/[,_\s]/g, '');
  if (!/^\d+$/.test(t)) throw new Error('Base amount must be a whole non-negative number (base denoms have no fractions).');
  return BigInt(t);
}

// Result rows for a base amount `raw` of a token with exponent `e`.
export function resultRows(raw, e, disp = '', base = '') {
  disp = disp || 'units'; base = base || 'base';
  return [
    [`In ${disp}`, rawToDisplay(raw, e), group(rawToDisplay(raw, e).split('.')[0]) + (rawToDisplay(raw, e).includes('.') ? '.' + rawToDisplay(raw, e).split('.')[1] : '')],
    [`In ${base}`, raw.toString(), group(raw.toString())],
    ['Coin string', `${raw}${base}`, 'The format used in transactions and CLI commands'],
    [`1 ${disp}`, `${10n ** BigInt(e)}${base}`],
  ];
}

function mount() {
  const $ = id => document.getElementById(id);
  $('preset').innerHTML = PRESETS.map((p, i) => `<option value="${i}">${esc(p[0])} — ${esc(p[3])} (${esc(p[1])}, ${p[2]} decimals)</option>`).join('') + '<option value="custom">Custom…</option>';

  function setPreset() {
    const v = $('preset').value;
    if (v === 'custom') return;
    const [disp, base, exp] = PRESETS[+v];
    $('disp').value = disp; $('base').value = base; $('exp').value = exp;
  }

  let last = 'display';
  function render() {
    showError($('err'), ''); $('out').innerHTML = '';
    $('dispLabel').textContent = $('disp').value || 'display unit';
    $('baseLabel').textContent = $('base').value || 'base denom';
    try {
      const e = parseExponent($('exp').value);
      let raw;
      if (last === 'display') {
        if (!$('display').value.trim()) { $('raw').value = ''; return; }
        raw = displayToRaw($('display').value, e); $('raw').value = raw.toString();
      } else {
        if (!$('raw').value.trim().replace(/[,_\s]/g, '')) { $('display').value = ''; return; }
        raw = parseRaw($('raw').value); $('display').value = rawToDisplay(raw, e);
      }
      $('out').innerHTML = kvTable(resultRows(raw, e, $('disp').value, $('base').value));
    } catch (err) { showError($('err'), err.message); }
  }
  $('preset').oninput = () => { setPreset(); render(); };
  for (const id of ['base', 'disp', 'exp']) $(id).oninput = () => { $('preset').value = 'custom'; render(); };
  $('display').oninput = () => { last = 'display'; render(); };
  $('raw').oninput = () => { last = 'raw'; render(); };
  setPreset(); $('display').value = '1'; wireCopy(); render();
  // Example button(s)
  $('example').onclick = () => { $('preset').value = '0'; setPreset(); $('display').value = '2.5'; last = 'display'; render(); };
}

if (globalThis.document) mount();
