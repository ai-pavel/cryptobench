// Derived Addresses: module account addresses and ICS-20 escrow addresses for a chain.
import { sha256, utf8, concat, encodeBech32, chainOptions, toHex, kvTable, wireCopy, showError } from '../lib/cosmos.js';

export const MODULES = ['fee_collector', 'distribution', 'bonded_tokens_pool', 'not_bonded_tokens_pool', 'gov', 'mint', 'transfer', 'ibc', 'auth', 'bank', 'staking', 'interchainaccounts', 'icahost', 'wasm', 'feeibc', 'consensus', 'upgrade', 'crisis', 'evidence', 'feegrant', 'authz'];

// Module account: the first 20 bytes of SHA-256(module name).
export const moduleAddressBytes = name => sha256(utf8.encode(name)).slice(0, 20);
// ICS-20 escrow account: the first 20 bytes of SHA-256(version ‖ 0x00 ‖ "port/channel").
export const escrowAddressBytes = (port, channel, version) => sha256(concat(utf8.encode(version), Uint8Array.of(0), utf8.encode(`${port}/${channel}`))).slice(0, 20);

/** Rows for a module account address, or null when the name is empty. */
export function moduleRows(prefix, name) {
  name = name.trim();
  if (!name) return null;
  const b = moduleAddressBytes(name);
  return [['Address', encodeBech32(prefix, b)], ['Bytes (hex)', toHex(b)]];
}

/**
 * Rows for an escrow address, or null when the port or channel is empty, plus a
 * note when the channel ID doesn't look like "channel-N".
 */
export function escrowRows(prefix, port, channel, version) {
  port = port.trim(); channel = channel.trim(); version = version.trim();
  if (!port || !channel) return null;
  const note = /^channel-\d+$/.test(channel) ? '' : 'Note: channel IDs normally look like "channel-123".';
  const b = escrowAddressBytes(port, channel, version);
  return { note, rows: [['Escrow address', encodeBech32(prefix, b), `${port}/${channel}`], ['Bytes (hex)', toHex(b)]] };
}

function mount() {
  const $ = id => document.getElementById(id);
  $('chain').innerHTML = chainOptions('cosmos');
  $('modules').innerHTML = MODULES.map(m => `<option value="${m}">`).join('');

  function render() {
    const prefix = $('chain').value;
    showError($('errModule'), ''); $('outModule').innerHTML = '';
    try {
      const rows = moduleRows(prefix, $('module').value);
      if (rows) $('outModule').innerHTML = kvTable(rows);
    } catch (e) { showError($('errModule'), e.message); }
    showError($('errEscrow'), ''); $('outEscrow').innerHTML = '';
    try {
      const r = escrowRows(prefix, $('port').value, $('channel').value, $('version').value);
      if (r) {
        if (r.note) showError($('errEscrow'), r.note);
        $('outEscrow').innerHTML = kvTable(r.rows);
      }
    } catch (e) { showError($('errEscrow'), e.message); }
  }
  for (const id of ['chain', 'module', 'port', 'channel', 'version']) $(id).oninput = render;
  wireCopy(); render();
  // Example button(s)
  $('example').onclick = () => { $('chain').value = 'cosmos'; $('module').value = 'distribution'; $('port').value = 'transfer'; $('channel').value = 'channel-141'; $('version').value = 'ics20-1'; render(); };
}

if (globalThis.document) mount();
