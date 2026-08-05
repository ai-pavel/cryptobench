// Keccak-256: hash text or hex bytes with Ethereum's Keccak-256 (not NIST SHA3-256).
import { keccakHex, utf8, hexToBytes } from '../lib/evm.js';
import { $, renderRows, live, segmented } from '../lib/ui.js';

/**
 * Hash the input as UTF-8 text (mode 'text') or hex bytes (mode 'hex').
 * Returns null for empty input; otherwise the hash and the input size in bytes.
 */
export function hashInput(value, mode) {
  if (!value) return null;
  const bytes = mode === 'hex' ? hexToBytes(value, 'Input') : utf8(value);
  return { hash: keccakHex(bytes), size: bytes.length };
}

function mount() {
  let run;
  const mode = segmented($('mode'), () => {
    $('input').placeholder = mode() === 'hex' ? '0x…' : 'Type or paste input';
    run();
  });
  run = live([$('input')], () => {
    const r = hashInput($('input').value, mode());
    if (!r) { $('out').innerHTML = ''; return; }
    renderRows($('out'), [
      { label: 'Keccak-256', value: r.hash },
      { label: 'Input size', value: `${r.size} bytes`, copy: false },
    ]);
  }, { errEl: $('err'), outEl: $('out') });

  // Example: the ERC-20 transfer signature; its hash starts with the selector a9059cbb.
  $('example').onclick = () => {
    $('mode').querySelector('[data-mode="text"]').click();
    $('input').value = 'transfer(address,uint256)';
    run();
  };
}

if (globalThis.document) mount();
