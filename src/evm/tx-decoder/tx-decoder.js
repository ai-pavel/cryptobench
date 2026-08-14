// Transaction Decoder: decode a signed raw transaction and recover its sender.
import { decodeTransaction, hexToBytes, bytesToHex, formatUnits, keccak, rlpEncode, bigIntToBytes, toChecksumAddress } from '../lib/evm.js';
import { $, esc, renderRows, live } from '../lib/ui.js';

// Signed with the well-known Hardhat test key #0; not a real mainnet transaction.
export const EXAMPLE = '0x02f8b00107843b9aca008506fc23ac0082ea6094a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4880b844a9059cbb000000000000000000000000000000000000000000000000000000000000dead0000000000000000000000000000000000000000000000000000000005f5e100c001a0adb67bf0243772376f3a40f6f427aa5e210808dccf185f6b6b7887f58100ef46a07b27e8500e1447b6f9f2b2ad648488db1cca9b37438ebfbff92ec55f3ecaf12e';
export const CHAINS = { 1: 'Ethereum', 10: 'OP Mainnet', 56: 'BNB Smart Chain', 100: 'Gnosis', 137: 'Polygon', 324: 'zkSync Era', 8453: 'Base', 42161: 'Arbitrum One', 43114: 'Avalanche C-Chain', 59144: 'Linea', 534352: 'Scroll', 11155111: 'Sepolia', 17000: 'Holesky', 560048: 'Hoodi' };

export const gwei = v => `${formatUnits(v, 9)} gwei`;
export const eth = v => `${formatUnits(v, 18)} ETH`;

/**
 * Decode a raw signed transaction into the rows shown on the page.
 * Returns null for empty input; otherwise { tx, rows, decodeData } where decodeData is the
 * calldata to link to the ABI decoder (null when it has no 4-byte selector).
 */
export function describeTransaction(raw) {
  raw = raw.trim();
  if (!raw) return null;
  const tx = decodeTransaction(hexToBytes(raw, 'Transaction'));
  const f = tx.fields;
  const chain = f.chainId === null ? 'None (pre-EIP-155, valid on any chain)' : `${f.chainId}${CHAINS[f.chainId] ? ' · ' + CHAINS[f.chainId] : ''}`;
  const dataBytes = (f.data.length - 2) / 2;
  const created = f.to === null
    ? toChecksumAddress(bytesToHex(keccak(rlpEncode([hexToBytes(tx.sender), bigIntToBytes(f.nonce)])).slice(12)))
    : null;
  const rows = [
    { label: 'Type', value: `${tx.type} · ${tx.typeName}${tx.networkWrapper ? ' · network form with blobs' : ''}`, copy: false },
    { label: 'Transaction hash', value: bytesToHex(tx.hash) },
    { label: 'From (recovered)', value: tx.sender, cls: 'ok' },
    { label: 'To', value: f.to ?? 'Contract creation', copy: f.to !== null, note: created ? `New contract address: ${created}` : '' },
    { label: 'Chain ID', value: chain, copy: false },
    { label: 'Nonce', value: f.nonce.toString() },
    { label: 'Value', value: eth(f.value), note: `${f.value} wei` },
    f.gasPrice !== undefined && { label: 'Gas price', value: gwei(f.gasPrice), note: `${f.gasPrice} wei` },
    f.maxFeePerGas !== undefined && { label: 'Max fee per gas', value: gwei(f.maxFeePerGas), note: `${f.maxFeePerGas} wei` },
    f.maxPriorityFeePerGas !== undefined && { label: 'Max priority fee', value: gwei(f.maxPriorityFeePerGas), note: `${f.maxPriorityFeePerGas} wei` },
    { label: 'Gas limit', value: f.gasLimit.toString() },
    { label: 'Max cost', value: eth(f.gasLimit * (f.maxFeePerGas ?? f.gasPrice) + f.value), copy: false, note: 'gas limit × max gas price + value' },
    f.maxFeePerBlobGas !== undefined && { label: 'Max fee per blob gas', value: gwei(f.maxFeePerBlobGas), note: `${f.maxFeePerBlobGas} wei` },
    f.blobVersionedHashes && { label: 'Blob hashes', value: f.blobVersionedHashes.join('\n') || '(none)' },
    { label: 'Data', value: f.data, note: dataBytes ? `${dataBytes} bytes${dataBytes >= 4 ? ` · selector ${f.data.slice(0, 10)}` : ''}` : 'empty' },
    f.accessList && { label: 'Access list', value: f.accessList.length ? JSON.stringify(f.accessList, null, 2) : '(empty)' },
    f.authorizationList && { label: 'Authorizations', value: JSON.stringify(f.authorizationList, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2) },
    tx.v !== undefined ? { label: 'v', value: tx.v.toString() } : { label: 'y parity', value: tx.yParity.toString() },
    { label: 'r', value: '0x' + tx.r.toString(16).padStart(64, '0') },
    { label: 's', value: '0x' + tx.s.toString(16).padStart(64, '0') },
    { label: 'Signing hash', value: bytesToHex(tx.signingHash) },
  ];
  return { tx, rows, decodeData: dataBytes >= 4 ? f.data : null };
}

function mount() {
  const run = live([$('raw')], () => {
    const r = describeTransaction($('raw').value);
    if (!r) { $('out').innerHTML = ''; return; }
    renderRows($('out'), r.rows);
    if (r.decodeData) {
      $('out').insertAdjacentHTML('beforeend', `<p style="margin:10px 0 0"><a href="../abi/?mode=decode&data=${esc(r.decodeData)}">Decode the data →</a></p>`);
    }
  }, { errEl: $('err'), outEl: $('out') });

  $('example').onclick = () => { $('raw').value = EXAMPLE; run(); };
}

if (globalThis.document) mount();
