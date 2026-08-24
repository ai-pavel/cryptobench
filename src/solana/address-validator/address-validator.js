// Address Validator: check Solana addresses for base58, length, curve membership and well-known programs.
import { base58, hex, isOnCurve, PROGRAMS, esc } from '../lib/sol.js';

/** Validate one address; returns { ok, msg } plus notes, hex and known name when valid. */
export function check(addr) {
  let bytes;
  try { bytes = base58.decode(addr); } catch {
    const bad = [...addr].filter(c => !'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.includes(c));
    return { ok: false, msg: bad.length ? `Not base58: contains ${[...new Set(bad)].map(c => `"${c}"`).join(', ')}` + (bad.some(c => '0OIl'.includes(c)) ? ' (base58 has no 0, O, I or l)' : '') : 'Not valid base58.' };
  }
  if (bytes.length !== 32) return { ok: false, msg: `Decodes to ${bytes.length} bytes; a Solana address is 32 bytes.` };
  const on = isOnCurve(bytes);
  const notes = [
    on ? 'On the ed25519 curve: a regular wallet address that can have a private key.'
       : 'Off the ed25519 curve: no private key exists. Typically a program derived address (PDA).',
  ];
  if (PROGRAMS[addr]) notes.unshift(`Known address: ${PROGRAMS[addr]}.`);
  return { ok: true, msg: 'Valid address', notes, hex: hex.encode(bytes), name: PROGRAMS[addr] };
}

/** The addresses typed into the box: one per line, trimmed, blank lines dropped. */
export const parseLines = text => text.split('\n').map(s => s.trim()).filter(Boolean);

function mount() {
  const $ = id => document.getElementById(id);

  function render() {
    const lines = parseLines($('input').value);
    $('out').innerHTML = lines.map(a => {
      const r = check(a);
      return `<div class="result">
      <div class="addr">${esc(a)}</div>
      <div class="${r.ok ? 'ok' : 'bad'}" style="margin-top:6px">${r.ok ? '✅' : '❌'} ${esc(r.msg)}${r.name ? ` · ${esc(r.name)}` : ''}</div>
      ${r.ok ? `<ul>${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}<li class="mono" style="word-break:break-all">Hex: ${r.hex}</li></ul>` : ''}
    </div>`;
    }).join('');
  }
  $('input').oninput = render;
  // Example: a wallet (on the curve), the USDC mint, the Token program, a PDA (off the curve) and a typo.
  $('example').onclick = () => {
    $('input').value = ['9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWW0'].join('\n');
    render();
  };
}

if (globalThis.document) mount();
