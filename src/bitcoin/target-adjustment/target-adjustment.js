// Target Adjustment: compute the next difficulty retarget from the current bits and the period's timespan.
import { bitsToTarget, targetToBits, difficulty, hex32, hexU32, parseInteger, humanDuration, MAX_TARGET, InputError } from '../lib/btc.js';
import { $, renderRows, live, segmented } from '../lib/ui.js';

export const TARGET_SPAN = 14n * 24n * 60n * 60n; // 2 weeks = 2016 blocks × 10 minutes

/** The first retarget period: blocks 0 to 2015. */
export const EXAMPLE = { bits: '0x1d00ffff', first: 1231006505, last: 1232103989, span: 1097484 };

/**
 * Retarget like Bitcoin Core: clamp the timespan to 4× either way, scale the target,
 * cap it at the proof-of-work limit and round it to compact bits.
 * inputs: { bits, first, last } in 'timestamps' mode or { bits, span } in 'timespan' mode (strings).
 * Returns the new bits and the result rows; throws InputError for bad input.
 */
export function retarget(mode, { bits: bitsText = '', first = '', last = '', span = '' }) {
  const t = bitsText.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]{1,8}$/i.test(t)) throw new InputError('Bits must be hex, e.g. 0x1d00ffff');
  const oldTarget = bitsToTarget(parseInt(t, 16) >>> 0).target;
  let actual = mode === 'timestamps'
    ? parseInteger(last, 'Last block time') - parseInteger(first, 'First block time')
    : parseInteger(span, 'Timespan');
  const raw = actual;
  if (actual < TARGET_SPAN / 4n) actual = TARGET_SPAN / 4n;
  if (actual > TARGET_SPAN * 4n) actual = TARGET_SPAN * 4n;
  let next = (oldTarget * actual) / TARGET_SPAN;
  const capped = next > MAX_TARGET;
  if (capped) next = MAX_TARGET;
  const bits = targetToBits(next), rounded = bitsToTarget(bits).target;
  const change = Number((oldTarget * 1000000n) / rounded) / 10000 - 100;
  return {
    bits,
    rows: [
      { label: 'New bits', value: hexU32(bits) },
      { label: 'New target', value: hex32(rounded), note: rounded !== next ? 'After compact rounding' : '' },
      { label: 'Difficulty', value: `${difficulty(oldTarget)} → ${difficulty(rounded)}`, copy: false, note: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` },
      { label: 'Actual timespan', value: `${raw} s (${humanDuration(Number(raw < 0n ? 0n : raw))})`, copy: false,
        note: raw !== actual ? `Clamped to ${actual} s (the 4× limit)` : `Expected ${TARGET_SPAN} s (2 weeks)` },
      capped && { label: 'Note', value: 'The result was capped at the minimum difficulty (proof-of-work limit 0x1d00ffff)', copy: false },
      { label: 'Formula', value: 'new target = old target × actual timespan ÷ 1,209,600 s', copy: false, note: 'Bitcoin Core measures the timespan over 2015 intervals (first to last block of the period), a known off-by-one.' },
    ].filter(Boolean),
  };
}

function mount() {
  let run;
  const mode = segmented($('mode'), () => { $('tsFields').hidden = mode() !== 'timestamps'; $('spanField').hidden = mode() === 'timestamps'; run(); });

  run = live([$('bits'), $('first'), $('last'), $('span')], () => {
    const r = retarget(mode(), { bits: $('bits').value, first: $('first').value, last: $('last').value, span: $('span').value });
    renderRows($('out'), r.rows);
  }, { errEl: $('err'), outEl: $('out') });
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // The first retarget period: blocks 0 to 2015.
  $('example').onclick = () => {
    exSet('bits', EXAMPLE.bits);
    if (mode() === 'timestamps') { exSet('first', EXAMPLE.first); exSet('last', EXAMPLE.last); }
    else exSet('span', EXAMPLE.span);
    run();
  };
}

if (globalThis.document) mount();
