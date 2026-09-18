// Address Inspector: decode a Cardano address into its type, network, credentials and stake address.
import { parseAddress, stakeAddressOf, credBech32, NETWORKS, toHex } from '../lib/cardano.js';
import { $, row, showError } from '../lib/ui.js';

export const EXAMPLES = {
  base: 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x',
  script: 'addr1z8phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gten0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs9yc0hh',
  enterprise: 'addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8',
  pointer: 'addr1gx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer5pnz75xxcrzqf96k',
  stake: 'stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw',
  byron: 'DdzFFzCqrhsw3prhfMFDNFowbzUku3QmrMwarfjUbWXRisodn97R436SHc1rimp4MhPNmbdYb1aTdqtGSJixMVMi5MkArDQJ6Sc1n3Ez',
};
// Result rows are { label, value, note }; the Byron checksum row is { label, value, ok } instead.
const credRow = (label, c, role) => ({ label: `${label} credential (${c.type === 'script' ? 'script hash' : 'key hash'})`, value: c.hex, note: credBech32(c, role) });

// The stake (reward) address of an address, or why it has none.
export function stakeInfo(a) {
  let info = '', rows = [];
  if (a.byron) info = 'Byron addresses have no stake part, so they can\'t delegate.';
  else if (a.type === 14 || a.type === 15) {
    info = 'This is already a stake address.';
    rows = [{ label: 'Stake address', value: a.bech32 }, { label: 'Stake credential (' + a.stake.type + ' hash)', value: a.stake.hex, note: credBech32(a.stake, 'stake') }];
  } else if (a.type === 6 || a.type === 7) info = 'Enterprise addresses have no stake part, so funds there can\'t be staked.';
  else if (a.type === 4 || a.type === 5) info = `A pointer address refers to the stake registration certificate at slot ${a.pointer.slot}, transaction ${a.pointer.txIndex}, certificate ${a.pointer.certIndex}. Finding its stake key needs the chain, so it can't be worked out offline.`;
  else {
    const s = stakeAddressOf(a);
    info = `${NETWORKS[a.network] || 'Network ' + a.network} · shared by every base address of this wallet account.`;
    rows = [{ label: 'Stake address', value: s.bech32 }, { label: 'Stake address (hex)', value: toHex(s.bytes) }];
  }
  return { info, rows };
}

// The detail rows of a parsed address.
export function detailRows(a) {
  const rows = [];
  if (a.byron) {
    rows.push({ label: 'Type', value: a.typeName }, { label: 'Network', value: a.attributes.protocolMagic === undefined ? 'Mainnet' : `Protocol magic ${a.attributes.protocolMagic} (testnet)` });
    rows.push({ label: 'Address root (Blake2b-224)', value: a.root }, { label: 'Spending data type', value: a.byronType === 0 ? '0 · public key' : a.byronType === 2 ? '2 · redeem key' : String(a.byronType) });
    if (a.attributes.derivationPath) rows.push({ label: 'Encrypted derivation path', value: a.attributes.derivationPath, note: 'Daedalus (legacy) wallets store the encrypted HD path here.' });
    rows.push({ label: 'Checksum', value: a.crcOk ? 'CRC32 OK' : 'CRC32 mismatch: the address is corrupted', ok: a.crcOk });
    rows.push({ label: 'Base58', value: a.base58 }, { label: 'Bytes (hex)', value: toHex(a.bytes) });
    return rows;
  }
  rows.push({ label: 'Type', value: `${a.type} · ${a.typeName}` }, { label: 'Network', value: `${a.network} · ${NETWORKS[a.network] || 'unknown network'}` });
  if (a.payment) rows.push(credRow('Payment', a.payment, 'payment'));
  if (a.stake) rows.push(credRow('Stake', a.stake, 'stake'));
  if (a.pointer) rows.push({ label: 'Pointer', value: `slot ${a.pointer.slot} · transaction ${a.pointer.txIndex} · certificate ${a.pointer.certIndex}` });
  rows.push({ label: 'Bech32', value: a.bech32 }, { label: 'Bytes (hex)', value: toHex(a.bytes), note: `Header byte 0x${a.header.toString(16).padStart(2, '0')} · ${a.bytes.length} bytes` });
  return rows;
}

// Inspect an address: null for empty input, otherwise its warning, stake info and detail rows. Throws on invalid input.
export function inspect(input) {
  const v = input.trim();
  if (!v) return null;
  const a = parseAddress(v);
  return { warning: a.warning || '', stake: stakeInfo(a), rows: detailRows(a) };
}

function mount() {
  const html = r => 'ok' in r
    ? `<div class="kv-row"><div class="kv-label">${r.label}</div><div class="kv-value ${r.ok ? 'ok' : 'bad'}">${r.value}</div></div>`
    : row(r.label, r.value, r.note);
  function render() {
    $('out').innerHTML = ''; $('warn').hidden = true; $('stake-box').hidden = true; $('details-h').hidden = true;
    let r;
    try { r = inspect($('addr').value); } catch (e) { showError($('err'), e); return; }
    showError($('err'));
    if (!r) return;
    if (r.warning) { $('warn').textContent = r.warning; $('warn').hidden = false; }
    $('stake-info').textContent = r.stake.info;
    $('stake-out').innerHTML = r.stake.rows.map(html).join('');
    $('stake-box').hidden = false;
    $('details-h').hidden = false;
    $('out').innerHTML = r.rows.map(html).join('');
  }
  $('addr').addEventListener('input', render);
  document.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { $('addr').value = EXAMPLES[b.dataset.ex]; render(); });
  const fromUrl = new URLSearchParams(location.search).get('a');
  if (fromUrl) { $('addr').value = fromUrl; render(); }
}

if (globalThis.document) mount();
