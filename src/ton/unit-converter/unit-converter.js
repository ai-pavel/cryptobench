// Unit Converter: convert between TON and nanotons, and jetton amounts and their units.
import { toUnits, fromUnits } from '../lib/ton.js';
import { $, showError } from '../lib/ui.js';

/** Amount → units as a string, e.g. ('1.5', 9) → '1500000000'. */
export const amountToUnits = (text, decimals) => toUnits(text, decimals).toString();

/** Units text (whole number; _ , and spaces allowed as separators) → BigInt. */
export function parseUnits(text) {
  const t = text.trim().replace(/[_\s,]/g, '');
  if (!/^-?\d+$/.test(t)) throw new Error('Units must be a whole number');
  return BigInt(t);
}

/** Units → amount, e.g. ('5500000', 9) → '0.0055'. */
export const unitsToAmount = (text, decimals) => fromUnits(parseUnits(text), decimals);

/** Jetton decimals field → integer from 0 to 255. */
export function parseDecimals(value) {
  const d = Number(value);
  if (!Number.isInteger(d) || d < 0 || d > 255) throw new Error('Decimals must be a whole number from 0 to 255');
  return d;
}

function pair(a, b, err, decimals) {
  const fwd = () => { try { $(b).value = amountToUnits($(a).value, decimals()); showError($(err)); } catch (e) { $(b).value = ''; showError($(err), e); } };
  const back = () => {
    try {
      $(a).value = fromUnits(parseUnits($(b).value), decimals()); showError($(err));
    } catch (e) { $(a).value = ''; showError($(err), e); }
  };
  $(a).addEventListener('input', fwd); $(b).addEventListener('input', back);
  return fwd;
}

function mount() {
  const decimals = () => parseDecimals($('dec').value);
  pair('ton', 'nano', 'ton-err', () => 9)();
  const jet = pair('amt', 'units', 'jet-err', decimals);
  $('dec').addEventListener('input', jet);
  document.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => { $('dec').value = b.dataset.dec; jet(); });
  jet();
  // Examples: about 0.0055 TON, a typical wallet transfer fee; and 12.5 USDT (6 decimals) in jetton units.
  $('ton-example').onclick = () => { $('nano').value = '5500000'; $('nano').dispatchEvent(new Event('input')); };
  $('jet-example').onclick = () => { $('dec').value = '6'; $('amt').value = '12.5'; jet(); };
}

if (globalThis.document) mount();
