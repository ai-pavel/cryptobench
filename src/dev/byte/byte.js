// Byte: show every representation of a byte.
import { $, renderRows, showError, InputError } from '../lib/ui.js';
import { parseInteger, charName, charDescription } from '../lib/num.js';

/** Parsers for each input field: text → byte value (0 … 255); bad input throws. */
export const PARSE = {
  bin: s => { s = s.replace(/^0b/i, '').replace(/[\s_]/g, ''); if (!/^[01]{1,8}$/.test(s)) throw new InputError('Binary: up to 8 digits of 0 and 1.'); return parseInt(s, 2); },
  hex: s => { s = s.replace(/^0x/i, ''); if (!/^[0-9a-f]{1,2}$/i.test(s)) throw new InputError('Hex: one or two digits 0-9, a-f.'); return parseInt(s, 16); },
  oct: s => { s = s.replace(/^0o/i, ''); if (!/^[0-7]{1,3}$/.test(s) || parseInt(s, 8) > 255) throw new InputError('Octal: 0 … 377.'); return parseInt(s, 8); },
  dec: s => { const v = Number(parseInteger(s, 10)); if (v < 0 || v > 255) throw new InputError('Unsigned byte: 0 … 255.'); return v; },
  sdec: s => { const v = Number(parseInteger(s, 10)); if (v < -128 || v > 127) throw new InputError('Signed byte: −128 … 127.'); return v & 0xff; },
  ch: s => {
    if (!s) throw new InputError('Type a character.');
    const cp = s.codePointAt(0);
    if (cp > 255) throw new InputError(`"${String.fromCodePoint(cp)}" (U+${cp.toString(16).toUpperCase().padStart(4, '0')}) doesn't fit in one byte. Its UTF-8 bytes: ${[...new TextEncoder().encode(String.fromCodePoint(cp))].map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
    return cp;
  },
};

/** The value shown in each input field for byte b (character is empty for control characters). */
export function fieldValues(b) {
  return { bin: b.toString(2).padStart(8, '0'), hex: b.toString(16).padStart(2, '0'), oct: b.toString(8), dec: String(b), sdec: String(b > 127 ? b - 256 : b), ch: b >= 32 && b !== 127 && !(b >= 128 && b < 160) ? String.fromCharCode(b) : '' };
}

/** The result rows shown for byte b. */
export function byteRows(b) {
  const values = fieldValues(b);
  return [
    { label: 'Character', value: charDescription(b), copy: false },
    { label: 'Hex', value: '0x' + values.hex },
    { label: 'Binary', value: '0b' + values.bin },
    { label: 'Nibbles', value: `high ${b >> 4} (0x${(b >> 4).toString(16)}), low ${b & 15} (0x${(b & 15).toString(16)})`, copy: false },
    { label: 'Escape', value: b === 92 ? '\\\\' : b >= 32 && b < 127 ? String.fromCharCode(b) : '\\x' + values.hex },
    { label: 'HTML entity', value: '&#' + b + ';' },
    { label: 'URL-encoded', value: '%' + values.hex.toUpperCase() },
    { label: 'Set bits', value: String([...values.bin].filter(x => x === '1').length), copy: false },
    { label: 'Bits reversed', value: '0x' + parseInt([...values.bin].reverse().join(''), 2).toString(16).padStart(2, '0') },
    { label: 'Inverted (NOT)', value: '0x' + (~b & 0xff).toString(16).padStart(2, '0') },
  ];
}

function mount() {
  let current = 0x2a;
  function show(b, except) {
    current = b;
    const values = fieldValues(b);
    for (const k of Object.keys(values)) if (k !== except) $(k).value = values[k];
    $('bits').innerHTML = [...Array(8)].map((_, i) => { const bit = 7 - i, on = (b >> bit) & 1; return `<button data-bit="${bit}" class="${on ? 'on' : ''}" aria-pressed="${!!on}">${on}<small>${1 << bit}</small></button>`; }).join('');
    renderRows($('out'), byteRows(b));
    document.querySelectorAll('#table button').forEach(x => x.classList.toggle('sel', +x.dataset.b === b));
  }
  for (const id of Object.keys(PARSE)) $(id).addEventListener('input', () => {
    try { const b = PARSE[id]($(id).value.trim() || (id === 'ch' ? '' : 'x')); showError($('err'), null); show(b, id); }
    catch (e) { showError($('err'), e); }
  });
  $('bits').addEventListener('click', e => { const b = e.target.closest('[data-bit]'); if (b) { showError($('err'), null); show(current ^ (1 << +b.dataset.bit)); } });
  $('prev').onclick = () => { showError($('err'), null); show((current + 255) % 256); };
  $('next').onclick = () => { showError($('err'), null); show((current + 1) % 256); };
  $('table').innerHTML = Array.from({ length: 128 }, (_, b) =>
    `<button data-b="${b}" title="${charDescription(b).replace(/"/g, '&quot;')}">${charName(b).replace(/&/g, '&amp;').replace(/</g, '&lt;')}<small>${b} · ${b.toString(16).padStart(2, '0')}</small></button>`).join('');
  $('table').addEventListener('click', e => { const t = e.target.closest('[data-b]'); if (t) { showError($('err'), null); show(+t.dataset.b); } });
  show(current);
}

if (globalThis.document) mount();
