// Unit Converter: convert between lamports and SOL exactly, and estimate priority fees.
import { kvTable, wireCopy } from '../lib/sol.js';

const DEC = 9n, ONE = 10n ** DEC;

export function solToLamports(s) {
  const t = s.trim().replace(/[_,\s]/g, '');
  const m = /^(\d*)(?:\.(\d*))?$/.exec(t);
  if (!t || !m || (m[1] === '' && !m[2])) throw new Error('Enter a non-negative SOL amount, e.g. 1.5');
  const frac = m[2] || '';
  if (frac.length > 9) throw new Error('SOL has at most 9 decimal places (1 lamport = 0.000000001 SOL).');
  return BigInt(m[1] || '0') * ONE + BigInt(frac.padEnd(9, '0') || '0');
}
export function lamportsToSol(l) {
  const whole = l / ONE, frac = (l % ONE).toString().padStart(9, '0').replace(/0+$/, '');
  return whole.toString() + (frac ? '.' + frac : '');
}
export const group = n => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function parseInt_(s, what) {
  const t = s.trim().replace(/[_,\s]/g, '');
  if (!/^\d+$/.test(t)) throw new Error(`${what} must be a whole non-negative number.`);
  return BigInt(t);
}

/** Fee table rows for a compute unit limit, a price (micro-lamports per CU) and a signature count. Throws on bad input. */
export function feeRows(cuStr, priceStr, sigsStr) {
  const cu = parseInt_(cuStr, 'Compute unit limit'), price = parseInt_(priceStr, 'Price'), sigs = parseInt_(sigsStr, 'Signatures');
  const prio = (cu * price + 999999n) / 1000000n, base = 5000n * sigs, total = prio + base;
  return [
    ['Priority fee', `${group(prio)} lamports`, `${lamportsToSol(prio)} SOL`],
    ['Base fee', `${group(base)} lamports`, `${lamportsToSol(base)} SOL`],
    ['Total', `${group(total)} lamports`, `${lamportsToSol(total)} SOL`],
  ];
}

function mount() {
  const $ = id => document.getElementById(id);
  function err(m) { $('err').textContent = m || ''; $('err').hidden = !m; }

  $('sol').oninput = () => { try { $('lamports').value = solToLamports($('sol').value).toString(); err(); } catch (e) { err(e.message); } };
  $('lamports').oninput = () => { try { $('sol').value = lamportsToSol(parseInt_($('lamports').value, 'Lamports')); err(); } catch (e) { err(e.message); } };

  function fee() {
    try {
      $('fee').innerHTML = kvTable(feeRows($('cu').value, $('price').value, $('sigs').value));
    } catch (e) { $('fee').innerHTML = `<p class="error">${e.message}</p>`; }
  }
  ['cu', 'price', 'sigs'].forEach(id => $(id).oninput = fee);
  // Example: the rent-exempt minimum for a 165-byte SPL token account.
  $('example').onclick = () => { $('lamports').value = '2039280'; $('lamports').oninput(); };
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-copy-from]');
    if (!b) return;
    try { await navigator.clipboard.writeText($(b.dataset.copyFrom).value); b.textContent = 'Copied'; } catch { b.textContent = 'Press ⌘C'; }
    setTimeout(() => b.textContent = 'Copy', 1200);
  });
  wireCopy();
  $('sol').oninput(); fee();
}

if (globalThis.document) mount();
