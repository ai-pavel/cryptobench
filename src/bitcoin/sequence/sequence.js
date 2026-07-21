// Sequence: decode an input's nSequence, or build one for a BIP68 relative locktime.
import { hexToBytes, bytesToHex, u32le, parseInteger, describeSequence, hexU32, humanDuration, scriptNum, pushData, InputError } from '../lib/btc.js';
import { $, renderRows, live, segmented } from '../lib/ui.js';

/** Example values per mode. */
export const EXAMPLE = { seq: '0xfffffffd', le: false, blocks: 144, days: 1, hours: 0, minutes: 0, seconds: 0 };

export function decodeRows(seq) {
  const bin = seq.toString(2).padStart(32, '0').replace(/(.{8})(?!$)/g, '$1 ');
  return [
    { label: 'Value', value: `${seq} = ${hexU32(seq)}`, copy: false },
    { label: 'Raw bytes (little-endian)', value: bytesToHex(u32le(seq)) },
    { label: 'Bits (31 … 0)', value: bin, copy: false, note: 'Bit 31: disable relative locktime · bit 22: time-based · bits 0–15: value' },
    ...describeSequence(seq),
  ];
}

/**
 * Parse a sequence as a number (decimal or 0x-hex) or, when `le`, as 4 raw little-endian bytes.
 * Returns null for empty input; throws InputError.
 */
export function parseSequence(input, le) {
  const v = input.trim();
  if (!v) return null;
  if (le) {
    const b = hexToBytes(v, 'Sequence bytes');
    if (b.length !== 4) throw new InputError('Raw sequence must be exactly 4 bytes');
    return new DataView(b.buffer).getUint32(0, true);
  }
  return Number(parseInteger(v, 'Sequence', { max: 0xffffffffn }));
}

/** Block-based relative locktime: { seq, note }; throws InputError. */
export function buildBlocks(blocks) {
  const n = Number(parseInteger(blocks, 'Blocks', { max: 65535n }));
  return { seq: n, note: `${n} block${n === 1 ? '' : 's'}, about ${humanDuration(n * 600)}` };
}

/** Time-based relative locktime from days/hours/minutes/seconds (strings, empty = 0), rounded up to 512 s units: { seq, note }; throws InputError. */
export function buildTime({ days, hours, minutes, seconds }) {
  const secs = Number(parseInteger(days || '0', 'Days') * 86400n + parseInteger(hours || '0', 'Hours') * 3600n +
    parseInteger(minutes || '0', 'Minutes') * 60n + parseInteger(seconds || '0', 'Seconds'));
  const units = Math.ceil(secs / 512);
  if (units > 65535) throw new InputError(`That is ${units} units of 512 s; the maximum is 65535 (about 388 days)`);
  const seq = (0x00400000 | units) >>> 0;
  return { seq, note: `${units} × 512 s = ${(units * 512).toLocaleString('en-US')} s (${humanDuration(units * 512)})${units * 512 !== secs ? `, rounded up from ${secs.toLocaleString('en-US')} s` : ''}` };
}

/** Rows for a built sequence. */
export function buildRows({ seq, note }) {
  return [
    { label: 'nSequence', value: hexU32(seq), note },
    { label: 'Decimal', value: String(seq) },
    { label: 'Raw bytes (little-endian)', value: bytesToHex(u32le(seq)), note: 'As written in the transaction input. The transaction must be version 2 or higher.' },
    { label: 'CSV script', value: `${bytesToHex(pushData(scriptNum(seq)))}b275`, note: `<${hexU32(seq)}> OP_CHECKSEQUENCEVERIFY OP_DROP: the matching script check` },
    { label: 'Also signals', value: 'RBF (any sequence below 0xfffffffe signals replace-by-fee)', copy: false },
  ];
}

function mount() {
  let run;
  const mode = segmented($('mode'), () => {
    $('decodeFields').hidden = mode() !== 'decode'; $('blocksFields').hidden = mode() !== 'blocks'; $('timeFields').hidden = mode() !== 'time';
    run();
  });

  run = live([$('seq'), $('le'), $('blocks'), $('days'), $('hours'), $('minutes'), $('seconds')], () => {
    if (mode() === 'decode') {
      const seq = parseSequence($('seq').value, $('le').checked);
      if (seq === null) { $('out').innerHTML = ''; return; }
      renderRows($('out'), decodeRows(seq));
      return;
    }
    const built = mode() === 'blocks'
      ? buildBlocks($('blocks').value)
      : buildTime({ days: $('days').value, hours: $('hours').value, minutes: $('minutes').value, seconds: $('seconds').value });
    renderRows($('out'), buildRows(built));
  }, { errEl: $('err'), outEl: $('out') });
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  $('example').onclick = () => {
    if (mode() === 'decode') { exSet('seq', EXAMPLE.seq); exSet('le', EXAMPLE.le); }
    else if (mode() === 'blocks') exSet('blocks', EXAMPLE.blocks);
    else { exSet('days', EXAMPLE.days); exSet('hours', EXAMPLE.hours); exSet('minutes', EXAMPLE.minutes); exSet('seconds', EXAMPLE.seconds); }
    run();
  };
}

if (globalThis.document) mount();
