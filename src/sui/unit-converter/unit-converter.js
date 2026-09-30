// Unit Converter: convert between MIST and SUI exactly, and work out a gas budget.
import { kvTable, wireCopy, showError } from '../lib/sui.js';
const $ = id => document.getElementById(id);
const ONE = 10n ** 9n;

export function suiToMist(s) {
  const t = s.trim().replace(/[_,\s]/g, '');
  const m = /^(\d*)(?:\.(\d*))?$/.exec(t);
  if (!t || !m || (m[1] === '' && !m[2])) throw new Error('Enter a non-negative SUI amount, e.g. 1.5');
  const frac = m[2] || '';
  if (frac.length > 9) throw new Error('SUI has at most 9 decimal places (1 MIST = 0.000000001 SUI).');
  return BigInt(m[1] || '0') * ONE + BigInt(frac.padEnd(9, '0') || '0');
}
export function mistToSui(v) {
  const whole = v / ONE, frac = (v % ONE).toString().padStart(9, '0').replace(/0+$/, '');
  return whole.toString() + (frac ? '.' + frac : '');
}
export const group = n => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function whole(s, what) {
  const t = s.trim().replace(/[_,\s]/g, '');
  if (!/^\d+$/.test(t)) throw new Error(`${what} must be a whole non-negative number.`);
  return BigInt(t);
}
// Gas budget = price × units; returns the budget in MIST and its SUI value.
export function gasBudget(price, units) {
  const budget = whole(price, 'Gas price') * whole(units, 'Gas units');
  return { budget, mist: `${group(budget)} MIST`, sui: `${mistToSui(budget)} SUI` };
}

function mount() {
  const err = m => showError($('err'), m);

  $('sui').oninput = () => { try { $('mist').value = suiToMist($('sui').value).toString(); err(); } catch (e) { err(e.message); } };
  $('mist').oninput = () => { try { $('sui').value = mistToSui(whole($('mist').value, 'MIST')); err(); } catch (e) { err(e.message); } };

  function gas() {
    try {
      const g = gasBudget($('price').value, $('units').value);
      $('gas').innerHTML = kvTable([['Gas budget', g.mist, g.sui]]);
    } catch (e) { $('gas').innerHTML = `<p class="error">${e.message}</p>`; }
  }
  $('price').oninput = gas; $('units').oninput = gas;
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-copy-from]');
    if (!b) return;
    try { await navigator.clipboard.writeText($(b.dataset.copyFrom).value); b.textContent = 'Copied'; } catch { b.textContent = 'Press ⌘C'; }
    setTimeout(() => b.textContent = 'Copy', 1200);
  });
  wireCopy();
  $('sui').oninput(); gas();
  // Example button(s)
  document.getElementById('example').onclick = () => { $('sui').value = '2.5'; $('sui').oninput(); $('price').value = '750'; $('units').value = '2000000'; gas(); };
}

if (globalThis.document) mount();
