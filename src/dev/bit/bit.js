// Bit: flip bits in an interactive editor.
import { $, renderRows, showError } from '../lib/ui.js';
import { parseInteger, twos, signedOf, rangeCheck, group } from '../lib/num.js';

/** All ones in a `w`-bit value. */
export const maskOf = w => (1n << BigInt(w)) - 1n;

/** Parse the value field into a `w`-bit pattern (negative numbers as two's complement). */
export function parseValue(text, w) {
  const v = parseInteger(text);
  rangeCheck(v, w, v < 0n);
  return twos(v, w);
}

/** The result rows shown for the `w`-bit pattern u. */
export function bitRows(u, w, signed) {
  const shown = signed ? signedOf(u, w) : u;
  return [
    { label: 'Decimal', value: shown.toString() },
    { label: 'Hex', value: '0x' + u.toString(16).padStart(w / 4, '0') },
    { label: 'Binary', value: group(u.toString(2).padStart(w, '0'), 4) },
    { label: 'Octal', value: '0o' + u.toString(8) },
    { label: 'Set bits', value: String([...u.toString(2)].filter(c => c === '1').length), copy: false },
  ];
}

function mount() {
  let value = 0xdeadbeefn;
  const width = () => +$('bits').value;
  const mask = () => maskOf(width());

  function render(fromInput) {
    const w = width(), u = value & mask();
    value = u;
    let html = '';
    for (let i = w - 1; i >= 0; i--) {
      if ((i + 1) % 8 === 0) html += `<div class="byte-label">Byte ${i >> 3} · bits ${i}–${i - 7}</div>`;
      const on = (u >> BigInt(i)) & 1n;
      html += `<button data-bit="${i}" class="${on ? 'on' : ''}" aria-pressed="${!!on}">${on}<small>${i}</small></button>`;
    }
    $('grid').innerHTML = html;
    if (!fromInput) $('in').value = '0x' + u.toString(16);
    renderRows($('out'), bitRows(u, w, $('signed').checked));
  }
  $('in').addEventListener('input', () => {
    try {
      showError($('err'), null);
      value = parseValue($('in').value, width()); render(true);
    } catch (e) { showError($('err'), e); }
  });
  $('grid').addEventListener('click', e => { const b = e.target.closest('[data-bit]'); if (!b) return; value ^= 1n << BigInt(b.dataset.bit); showError($('err'), null); render(); });
  $('bits').addEventListener('input', () => render());
  $('signed').addEventListener('input', () => render());
  $('shl').onclick = () => { value = (value << 1n) & mask(); render(); };
  $('shr').onclick = () => { value = value >> 1n; render(); };
  $('not').onclick = () => { value = ~value & mask(); render(); };
  $('clear').onclick = () => { value = 0n; render(); };
  $('fill').onclick = () => { value = mask(); render(); };
  render(true);
}

if (globalThis.document) mount();
