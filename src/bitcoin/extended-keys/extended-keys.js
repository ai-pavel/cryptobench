// Extended Keys: decode an xpub / xprv (and SLIP-132 variants), derive children and convert prefixes.
import { bytesToHex, InputError } from '../lib/btc.js';
import { parseExtendedKey, VERSIONS, encodeVersion, normalizePath, formatIndex, fingerprintHex, keyFingerprint, addressFor } from '../lib/hd.js';
import { $, renderRows, live } from '../lib/ui.js';

// BIP32 test vector 1 master key, derive m/0'/1.
export const EXAMPLE = { key: 'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi', path: "m/0'/1" };

/**
 * Rows for an extended key, optionally derived along a path (relative to the key, "m/" optional)
 * and shown with another SLIP-132 prefix (`as`, '' for the same). Returns null for empty input; throws InputError.
 */
export function extendedKeyRows(keyText, pathText, as) {
  if (!keyText.trim()) return null;
  const p = parseExtendedKey(keyText);
  let key = p.key, pathNote = '';
  if (pathText.trim()) {
    const path = normalizePath(pathText.trim().startsWith('m') ? pathText : 'm/' + pathText.replace(/^\//, ''));
    if (!p.isPrivate && /'/.test(path)) throw new InputError('Hardened children need the private key; this is a public extended key');
    key = key.derive(path);
    pathNote = ` (child ${path})`;
  }
  const family = as || p.family, v = VERSIONS[family];
  const showPriv = p.isPrivate && key.privateKey;
  const rows = [
    { label: 'Type', value: `${p.isPrivate ? 'Private' : 'Public'} extended key, version ${p.versionName} (0x${p.version.toString(16).padStart(8, '0')})`, copy: false, note: VERSIONS[p.family].note },
    showPriv && { label: `Extended private${pathNote}`, value: encodeVersion(key, v.prv, true) },
    { label: `Extended public${pathNote}`, value: encodeVersion(key, v.pub, false) },
    { label: 'Depth', value: String(key.depth), copy: false },
    { label: 'Parent fingerprint', value: fingerprintHex(key.parentFingerprint) },
    { label: 'Child number', value: key.depth ? formatIndex(key.index) : '0 (master)', copy: false },
    { label: 'Fingerprint', value: keyFingerprint(key.publicKey) },
    { label: 'Chain code', value: bytesToHex(key.chainCode) },
    showPriv && { label: 'Private key', value: bytesToHex(key.privateKey) },
    { label: 'Public key', value: bytesToHex(key.publicKey) },
  ].filter(Boolean);
  if (['p2pkh', 'p2sh-p2wpkh', 'p2wpkh'].includes(v.script)) {
    rows.push({ label: `Address (${v.script.toUpperCase()})`, value: addressFor(key.publicKey, v.script, v.net), note: 'The address of this exact key; receive addresses are usually its children /0/i' });
  }
  return rows;
}

function mount() {
  $('as').innerHTML = '<option value="">Same prefix</option>' + Object.entries(VERSIONS).map(([k, v]) => `<option value="${k}">${k} / ${v.prvName}: ${v.note}</option>`).join('');

  const run = live([$('key'), $('path'), $('as')], () => {
    const rows = extendedKeyRows($('key').value, $('path').value, $('as').value);
    if (!rows) { $('out').innerHTML = ''; return; }
    renderRows($('out'), rows);
  }, { errEl: $('err'), outEl: $('out') });
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // BIP32 test vector 1 master key, derive m/0'/1.
  $('example').onclick = () => {
    exSet('key', EXAMPLE.key);
    exSet('path', EXAMPLE.path); run();
  };
}

if (globalThis.document) mount();
