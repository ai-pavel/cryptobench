// Token Account: derive the associated token account (ATA) address for a wallet and a token mint.
import { decodePubkey, ataAddress, isOnCurve, base58, kvTable, wireCopy, showError } from '../lib/sol.js';

/** ATA for a wallet and mint (base58) under a token program; returns the table rows and whether the wallet is off-curve. Throws on bad input. */
export function deriveAta(walletStr, mintStr, program) {
  const wallet = decodePubkey(walletStr, 'Wallet'), mint = decodePubkey(mintStr, 'Mint');
  const r = ataAddress(wallet, mint, base58.decode(program));
  return { rows: [['Associated token account', base58.encode(r.address)], ['Bump', String(r.bump)]], offCurve: !isOnCurve(wallet) };
}

function mount() {
  const $ = id => document.getElementById(id);
  function render() {
    $('out').innerHTML = '';
    if (!$('wallet').value.trim() || !$('mint').value.trim()) { showError($('err')); return; }
    try {
      const r = deriveAta($('wallet').value, $('mint').value, $('program').value);
      showError($('err'));
      $('out').innerHTML = kvTable(r.rows) +
        (!r.offCurve ? '' : '<p class="muted">The wallet is off-curve (a PDA). That is allowed, but SPL libraries require <code>allowOwnerOffCurve</code> for it.</p>');
    } catch (e) { showError($('err'), e.message); }
  }
  ['wallet', 'mint'].forEach(id => $(id).oninput = render);
  $('program').onchange = render;
  $('example').onclick = () => {
    $('wallet').value = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
    $('mint').value = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    $('program').value = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    render();
  };
  wireCopy();
}

if (globalThis.document) mount();
