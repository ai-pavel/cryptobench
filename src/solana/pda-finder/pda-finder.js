// PDA Finder: find a program derived address from a program ID and typed seeds, or check a specific bump.
import { decodePubkey, findProgramAddress, createProgramAddress, base58, hex, utf8, kvTable, wireCopy, showError, esc, ATA_PROGRAM, TOKEN_PROGRAM } from '../lib/sol.js';

export const TYPES = {
  string: 'String (UTF-8)', pubkey: 'Public key', hex: 'Hex bytes',
  u8: 'u8', u16: 'u16 (LE)', u32: 'u32 (LE)', u64: 'u64 (LE)', i64: 'i64 (LE)', u128: 'u128 (LE)',
};
const INT = { u8: [1, false], u16: [2, false], u32: [4, false], u64: [8, false], i64: [8, true], u128: [16, false] };

export function encodeSeed(type, value) {
  const v = value.trim();
  if (type === 'string') return utf8.encode(value);
  if (type === 'pubkey') return decodePubkey(v, 'Public key');
  if (type === 'hex') {
    const h = v.replace(/^0x/, '').replace(/\s+/g, '');
    if (h.length % 2 || !/^[0-9a-fA-F]*$/.test(h)) throw new Error('Hex must have an even number of 0-9, a-f characters.');
    return hex.decode(h.toLowerCase());
  }
  const [size, signed] = INT[type];
  if (!/^-?\d+$/.test(v)) throw new Error(`${type} must be an integer.`);
  let n = BigInt(v);
  const bits = BigInt(size * 8), min = signed ? -(1n << (bits - 1n)) : 0n, max = signed ? (1n << (bits - 1n)) - 1n : (1n << bits) - 1n;
  if (n < min || n > max) throw new Error(`${type} must be between ${min} and ${max}.`);
  if (n < 0n) n += 1n << bits;
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) { out[i] = Number(n & 255n); n >>= 8n; }
  return out;
}

/** The line shown under an encoded seed; bad when it is longer than 32 bytes. */
export function describeSeed(bytes) {
  return {
    bad: bytes.length > 32,
    text: `${bytes.length} bytes: ${hex.encode(bytes) || '(empty)'}` + (bytes.length > 32 ? ' · too long, max 32 bytes' : ''),
  };
}

/**
 * Derive the PDA for encoded seeds and a program ID (base58). With a bump (typed string, '' for none),
 * check that bump and whether it is canonical. Returns the table rows; throws on bad input.
 */
export function derivePda(seeds, prog, bumpStr) {
  const pid = decodePubkey(prog, 'Program ID');
  if (bumpStr !== '') {
    const bump = Number(bumpStr);
    if (!Number.isInteger(bump) || bump < 0 || bump > 255) throw new Error('Bump must be 0–255.');
    const addr = createProgramAddress([...seeds, Uint8Array.of(bump)], pid);
    const canon = findProgramAddress(seeds, pid);
    return [['Address', base58.encode(addr)], ['Bump', String(bump), bump === canon.bump ? 'This is the canonical bump.' : `Not canonical: findProgramAddress returns bump ${canon.bump}.`]];
  }
  const r = findProgramAddress(seeds, pid);
  return [['Address', base58.encode(r.address)], ['Canonical bump', String(r.bump)], ['Address (hex)', hex.encode(r.address)]];
}

function mount() {
  const $ = id => document.getElementById(id);

  function addSeed(type = 'string', value = '') {
    const div = document.createElement('div');
    div.className = 'seed';
    div.innerHTML = `<select>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}"${k === type ? ' selected' : ''}>${v}</option>`).join('')}</select>
    <input spellcheck="false" autocomplete="off" placeholder="Seed value"><button class="icon-btn" title="Remove">✕</button><div class="bytes"></div>`;
    div.querySelector('input').value = value;
    div.querySelector('button').onclick = () => { div.remove(); render(); };
    div.querySelector('select').onchange = render;
    div.querySelector('input').oninput = render;
    $('seeds').append(div);
  }

  function render() {
    $('out').innerHTML = '';
    let ok = true;
    const seeds = [...$('seeds').children].map((div, i) => {
      const b = div.querySelector('.bytes');
      try {
        const bytes = encodeSeed(div.querySelector('select').value, div.querySelector('input').value);
        const d = describeSeed(bytes);
        b.className = d.bad ? 'bytes bad' : 'bytes';
        b.textContent = d.text;
        return bytes;
      } catch (e) { b.className = 'bytes bad'; b.textContent = e.message; ok = false; return null; }
    });
    const prog = $('program').value.trim();
    if (!prog) { showError($('err')); return; }
    if (!ok) { showError($('err'), 'Fix the seeds marked in red.'); return; }
    try {
      $('out').innerHTML = kvTable(derivePda(seeds, prog, $('bump').value.trim()));
      showError($('err'));
    } catch (e) { showError($('err'), e.message); }
  }

  $('program').oninput = render;
  $('bump').oninput = render;
  $('add').onclick = () => { addSeed(); render(); };
  $('example').onclick = () => {
    $('program').value = ATA_PROGRAM; $('seeds').innerHTML = ''; $('bump').value = '';
    addSeed('pubkey', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
    addSeed('pubkey', TOKEN_PROGRAM);
    addSeed('pubkey', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    render();
  };
  addSeed();
  wireCopy();
}

if (globalThis.document) mount();
