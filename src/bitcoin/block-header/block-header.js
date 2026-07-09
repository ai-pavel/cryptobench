// Block Header: decode an 80-byte block header, edit its fields and recompute the hash.
import { hexToBytes, bytesToHex, hash256, parseHeader, serializeHeader, bitsToTarget, difficulty, hex32, hexU32, parseInteger } from '../lib/btc.js';
import { $, renderRows, showError, esc } from '../lib/ui.js';

export const SAMPLES = {
  genesis: '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c',
  b100k: '0100000050120119172a610421a6c3011dd330d9df07b63616c2cc1f1cd00200000000006657a9252aacd5c0b2940996ecff952228c3067cc38d4885efb5a4ac4247e9f337221b4d4c86041b0f2b5710',
};
export const FIELDS = [['Version', 0, 4], ['Previous block hash', 4, 36], ['Merkle root', 36, 68], ['Time', 68, 72], ['Bits', 72, 76], ['Nonce', 76, 80]];

/**
 * Parse header hex into its bytes and the editable field values (as shown in the inputs).
 * Returns null for empty input; throws InputError for bad hex or a wrong length.
 */
export function headerFromHex(hex) {
  if (!hex.trim()) return null;
  const bytes = hexToBytes(hex, 'Header');
  const h = parseHeader(bytes);
  return { bytes, fields: { version: String(h.version), time: String(h.time), bits: hexU32(h.bits), nonce: String(h.nonce), prev: h.prev, merkle: h.merkle } };
}

/** Serialize header bytes from the field inputs (strings); throws InputError for bad values. */
export function headerFromFields(f) {
  const u32 = (v, what) => Number(parseInteger(v, what, { max: 0xffffffffn }));
  const version = Number(BigInt.asIntN(32, parseInteger(f.version, 'Version', { min: -(2n ** 31n), max: 0xffffffffn })));
  return serializeHeader({ version, prev: f.prev, merkle: f.merkle, time: u32(f.time, 'Time'), bits: u32(f.bits, 'Bits'), nonce: u32(f.nonce, 'Nonce') });
}

/**
 * Everything shown for header bytes: proof-of-work status and message, the hash rows,
 * the decoded rows and the byte layout ({ range, name, hex } per field).
 */
export function describeHeader(bytes) {
  const h = parseHeader(bytes);
  const { target } = bitsToTarget(h.bits);
  const ok = BigInt('0x' + h.hash) <= target;
  const bip9 = (h.version & 0xe0000000) === 0x20000000;
  return {
    ok,
    status: ok ? 'ok' : 'warn',
    message: ok ? '✓ Valid proof of work for these bits' : 'Hash is above the target (not a valid block, which is expected while editing)',
    hashRows: [
      { label: 'Block hash', value: h.hash, note: 'HASH256 of the header, reversed byte order, as explorers show it' },
      { label: 'HASH256 (internal order)', value: bytesToHex(hash256(bytes)) },
      { label: 'Target (from bits)', value: hex32(target), note: `bits ${hexU32(h.bits)}` },
    ],
    rows: [
      { label: 'Version', value: `${h.version} (${hexU32(h.version)})`, copy: false, note: bip9 ? `BIP9 version bits set: ${[...Array(29).keys()].filter(b => h.version & (1 << b)).join(', ') || 'none'}` : '' },
      { label: 'Time', value: new Date(h.time * 1000).toISOString().replace('.000Z', ' UTC').replace('T', ' '), copy: false },
      { label: 'Difficulty', value: difficulty(target), copy: false },
    ],
    layout: FIELDS.map(([n, a, b]) => ({ range: `${a}–${b - 1}`, name: n, hex: bytesToHex(bytes.slice(a, b)) })),
  };
}

function mount() {
  function show(bytes) {
    const d = describeHeader(bytes);
    $('status').hidden = false;
    $('status').className = 'status ' + d.status;
    $('status').textContent = d.message;
    renderRows($('hash-out'), d.hashRows);
    renderRows($('out'), d.rows);
    $('bytes').innerHTML = '<tr><th>Bytes</th><th>Field</th><th>Raw (as stored)</th></tr>' +
      d.layout.map(f => `<tr><td class="range">${f.range}</td><td>${esc(f.name)}</td><td class="hexcell">${f.hex}</td></tr>`).join('');
  }

  function fromHex() {
    showError($('err'), null); $('status').hidden = true;
    try {
      const r = headerFromHex($('header').value);
      if (!r) { $('out').innerHTML = ''; $('hash-out').innerHTML = ''; $('bytes').innerHTML = ''; return; }
      for (const [id, v] of Object.entries(r.fields)) $(id).value = v;
      show(r.bytes);
    } catch (e) { $('out').innerHTML = ''; $('hash-out').innerHTML = ''; $('bytes').innerHTML = ''; showError($('err'), e); }
  }

  function fromFields() {
    showError($('err'), null); $('status').hidden = true;
    try {
      const bytes = headerFromFields({ version: $('version').value, time: $('time').value, bits: $('bits').value, nonce: $('nonce').value, prev: $('prev').value, merkle: $('merkle').value });
      $('header').value = bytesToHex(bytes);
      show(bytes);
    } catch (e) { $('out').innerHTML = ''; $('hash-out').innerHTML = ''; $('bytes').innerHTML = ''; showError($('err'), e); }
  }

  $('header').addEventListener('input', fromHex);
  for (const id of ['version', 'time', 'bits', 'nonce', 'prev', 'merkle']) $(id).addEventListener('input', fromFields);
  $('genesis').onclick = () => { $('header').value = SAMPLES.genesis; fromHex(); };
  $('b100k').onclick = () => { $('header').value = SAMPLES.b100k; fromHex(); };
}

if (globalThis.document) mount();
