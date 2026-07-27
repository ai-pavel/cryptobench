// Base58Check: encode hex to Base58 / Base58Check and decode it back, verifying the checksum.
import { base58, hash256, hexToBytes, bytesToHex, concat, equalBytes, InputError } from '../lib/btc.js';
import { $, renderRows, live, segmented } from '../lib/ui.js';

// Satoshi's genesis address (Base58Check) and the Bitcoin wiki example (plain Base58).
export const EXAMPLES = {
  encode: { check: { version: '00', payload: '62e907b15cbf27d5425399ebf6f0fb50ebb88f18' }, plain: { version: '', payload: '00010966776006953D5567439E5E39F86A0D273BEED61967F6' } },
  decode: { check: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', plain: '16UwLL9Risc3QfPqBUvKofHmBQ7wMtjvM' },
};

const ALPHABET = /[^123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]/;
const zeros = b => { const i = b.findIndex(x => x !== 0); return i === -1 ? b.length : i; };

/** Encode version ‖ payload (hex), with or without checksum. Returns rows, or null when both are empty; throws InputError. */
export function encodeRows(version, payload, check) {
  if (!payload.trim() && !version.trim()) return null;
  const data = concat(hexToBytes(version, 'Version'), hexToBytes(payload, 'Payload'));
  if (!check) {
    return [
      { label: 'Base58', value: base58.encode(data) },
      { label: 'Leading zero bytes', value: `${zeros(data)} (each becomes a leading “1”)`, copy: false },
    ];
  }
  const sum = hash256(data).slice(0, 4);
  return [
    { label: 'Base58Check', value: base58.encode(concat(data, sum)) },
    { label: 'Checksum', value: bytesToHex(sum), note: 'First 4 bytes of HASH256(version ‖ payload)' },
    { label: 'Bytes encoded', value: bytesToHex(concat(data, sum)) },
  ];
}

/**
 * Decode a Base58 string, with or without checksum. Returns null for empty input; otherwise
 * { rows } and, with a checksum, { ok, status, message }. Throws InputError.
 */
export function decodeBase58(input, check) {
  const v = input.trim();
  if (!v) return null;
  const bad = v.match(ALPHABET);
  if (bad) throw new InputError(`"${bad[0]}" is not in the Base58 alphabet${'0OIl'.includes(bad[0]) ? ' (0, O, I and l are left out to avoid confusion)' : ''}`);
  const raw = base58.decode(v);
  if (!check) return { rows: [{ label: 'Hex', value: bytesToHex(raw) }, { label: 'Length', value: `${raw.length} bytes`, copy: false }] };
  if (raw.length < 5) throw new InputError('Too short to contain a 4-byte checksum');
  const data = raw.slice(0, -4), sum = raw.slice(-4), expected = hash256(data).slice(0, 4);
  const ok = equalBytes(sum, expected);
  return {
    ok,
    status: ok ? 'ok' : 'bad',
    message: ok ? '✓ Checksum is valid' : '✗ Checksum does not match: the string has a typo',
    rows: [
      { label: 'Version byte', value: bytesToHex(data.slice(0, 1)) },
      { label: 'Payload', value: bytesToHex(data.slice(1)), note: `${data.length - 1} bytes` },
      { label: 'Checksum', value: bytesToHex(sum) },
      !ok && { label: 'Expected checksum', value: bytesToHex(expected) },
      { label: 'All bytes', value: bytesToHex(raw) },
    ].filter(Boolean),
  };
}

function mount() {
  let run;
  const mode = segmented($('mode'), () => { $('encodeFields').hidden = mode() !== 'encode'; $('decodeFields').hidden = mode() === 'encode'; run(); });
  const cs = segmented($('cs'), () => run());
  $('preset').addEventListener('input', () => { if ($('preset').value) $('version').value = $('preset').value; run(); });

  run = live([$('version'), $('payload'), $('encoded')], () => {
    $('status').hidden = true;
    const check = cs() === 'check';
    if (mode() === 'encode') {
      const rows = encodeRows($('version').value, $('payload').value, check);
      if (!rows) { $('out').innerHTML = ''; return; }
      renderRows($('out'), rows);
    } else {
      const r = decodeBase58($('encoded').value, check);
      if (!r) { $('out').innerHTML = ''; return; }
      if (check) {
        $('status').hidden = false;
        $('status').className = 'status ' + r.status;
        $('status').textContent = r.message;
      }
      renderRows($('out'), r.rows);
    }
  }, { errEl: $('err'), outEl: $('out') });
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // Satoshi's genesis address (Base58Check) and the Bitcoin wiki example (plain Base58).
  $('example').onclick = () => {
    const check = cs() === 'check';
    if (mode() === 'encode') {
      const ex = EXAMPLES.encode[check ? 'check' : 'plain'];
      exSet('preset', ''); exSet('version', ex.version);
      exSet('payload', ex.payload);
    } else exSet('encoded', EXAMPLES.decode[check ? 'check' : 'plain']);
    run();
  };
}

if (globalThis.document) mount();
