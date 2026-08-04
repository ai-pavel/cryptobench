// Unit Converter: convert an amount between wei, gwei, ether and the other EVM units.
import { UNITS, parseUnits, formatUnits } from '../lib/evm.js';
import { $, showError } from '../lib/ui.js';

/** Superscript digits, for the 10ⁿ wei labels. */
export const sup = n => String(n).replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);

/**
 * Convert an amount typed in unit `from` to every other unit.
 * Returns null for blank input; otherwise { unit: value } for the other units.
 * Throws an InputError for an invalid amount.
 */
export function convertFrom(raw, from) {
  if (!raw.trim()) return null;
  const [, decimals] = UNITS.find(([u]) => u === from);
  const wei = parseUnits(raw, decimals, from);
  const out = {};
  UNITS.forEach(([u, d]) => { if (u !== from) out[u] = formatUnits(wei, d); });
  return out;
}

function mount() {
  $('units').innerHTML = UNITS.map(([u, d]) => `
  <div class="field">
    <label for="u-${u}" style="display:block">${u}${d ? ` · 10${sup(d)} wei` : ''}</label>
    <div class="row" style="flex-wrap:nowrap">
      <input class="mono" id="u-${u}" inputmode="decimal" autocomplete="off" spellcheck="false" style="flex:1">
      <button class="icon-btn" data-copy-from="u-${u}">Copy</button>
    </div>
  </div>`).join('');
  $('units').querySelectorAll('label').forEach(l => { l.style.color = 'var(--muted)'; l.style.fontSize = '14px'; });

  function update(from) {
    const input = $('u-' + from), raw = input.value;
    input.removeAttribute('aria-invalid');
    showError($('err'), null);
    try {
      const values = convertFrom(raw, from);
      UNITS.forEach(([u]) => { if (u !== from) $('u-' + u).value = values ? values[u] : ''; });
    } catch (e) {
      input.setAttribute('aria-invalid', 'true');
      showError($('err'), e);
    }
  }
  UNITS.forEach(([u]) => $('u-' + u).addEventListener('input', () => update(u)));
  $('u-ether').value = '1';
  update('ether');

  // Example: a plain ETH transfer uses 21,000 gas; at 30 gwei that is 630,000 gwei.
  $('example').onclick = () => {
    $('u-gwei').value = String(21000 * 30);
    update('gwei');
  };
}

if (globalThis.document) mount();
