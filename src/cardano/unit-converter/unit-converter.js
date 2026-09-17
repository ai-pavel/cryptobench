// Unit Converter: convert between ADA and lovelace.
import { $, row, showError } from '../lib/ui.js';

export const PER_ADA = 1000000n, MAX_SUPPLY = 45000000000n * PER_ADA;

export function parseAda(s) {
  s = s.trim().replace(/[,_\s]/g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) throw new Error('Enter an ADA amount, e.g. 1.5');
  const neg = s.startsWith('-'); if (neg) s = s.slice(1);
  const [w, f = ''] = s.split('.');
  if (f.length > 6) throw new Error('ADA has 6 decimal places: the smallest amount is 0.000001 ADA (1 lovelace).');
  const v = BigInt(w || '0') * PER_ADA + BigInt((f + '000000').slice(0, 6));
  return neg ? -v : v;
}
export function parseLovelace(s) {
  s = s.trim().replace(/[,_\s]/g, '');
  if (!/^-?\d+$/.test(s)) throw new Error('Lovelace is a whole number: no decimals.');
  return BigInt(s);
}
export function adaString(v) {
  const neg = v < 0n, a = neg ? -v : v;
  const frac = (a % PER_ADA).toString().padStart(6, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + (a / PER_ADA).toString() + (frac ? '.' + frac : '');
}
export const group = s => s.replace(/^(-?)(\d+)/, (m, sign, d) => sign + d.replace(/\B(?=(\d{3})+(?!\d))/g, ','));

function mount() {
  function show(v) {
    showError($('err'));
    $('out').innerHTML = [
      row('ADA', adaString(v)),
      row('Lovelace', v.toString(), group(v.toString()) + ' lovelace'),
    ].join('') + (v > MAX_SUPPLY ? '<p class="notice" style="margin-top:12px">That is more than the maximum ADA supply (45 billion).</p>' : '');
  }
  function fromAda() {
    try { const v = parseAda($('ada').value); $('lovelace').value = v.toString(); show(v); }
    catch (e) { showError($('err'), e); $('out').innerHTML = ''; }
  }
  function fromLovelace() {
    try { const v = parseLovelace($('lovelace').value); $('ada').value = adaString(v); show(v); }
    catch (e) { showError($('err'), e); $('out').innerHTML = ''; }
  }
  $('ada').addEventListener('input', fromAda);
  $('lovelace').addEventListener('input', fromLovelace);
  document.querySelectorAll('[data-ada]').forEach(b => b.onclick = () => { $('ada').value = b.dataset.ada; fromAda(); });
  fromAda();
}

if (globalThis.document) mount();
