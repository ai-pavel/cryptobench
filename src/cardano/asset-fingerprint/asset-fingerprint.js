// Asset Fingerprint: compute a native asset's CIP-14 fingerprint from its policy ID and name.
import { assetFingerprint, assetNameText, fromHex, toHex } from '../lib/cardano.js';
import { $, row, showError } from '../lib/ui.js';

/**
 * Compute the fingerprint from the policy field (a policy ID, or a full asset ID)
 * and the asset name field (text, or hex in hex mode). Returns null for an empty
 * policy field; throws on invalid input.
 */
export function fingerprint(policy, name, hexMode) {
  let p = policy.trim().replace(/^0x/i, '');
  if (!p) return null;
  if (!/^[0-9a-f]*$/i.test(p)) throw new Error('The policy ID must be hex.');
  let nameBytes;
  if (p.length > 56) {
    if (p.length % 2) throw new Error('A full asset ID must have an even number of hex characters.');
    nameBytes = fromHex(p.slice(56)); p = p.slice(0, 56);
  } else {
    if (p.length !== 56) throw new Error(`A policy ID is 28 bytes (56 hex characters); this one has ${p.length}.`);
    nameBytes = hexMode ? fromHex(name.trim() || '') : new TextEncoder().encode(name);
  }
  if (nameBytes.length > 32) throw new Error(`An asset name can be at most 32 bytes; this one is ${nameBytes.length}.`);
  const text = assetNameText(nameBytes);
  return {
    fingerprint: assetFingerprint(fromHex(p), nameBytes),
    policyId: p.toLowerCase(),
    nameHex: toHex(nameBytes),
    nameLength: nameBytes.length,
    nameText: text !== null && nameBytes.length ? text : null,
    assetId: p.toLowerCase() + toHex(nameBytes),
  };
}

// Converting the name field when switching Text / Hex; hex that isn't valid stays as it is.
export function nameHexToText(hex) {
  try { return new TextDecoder().decode(fromHex(hex || '')); } catch { return hex; }
}
export const nameTextToHex = text => toHex(new TextEncoder().encode(text));

function mount() {
  let hexMode = false;
  function setMode(hex) {
    hexMode = hex;
    $('asText').setAttribute('aria-pressed', String(!hex));
    $('asHex').setAttribute('aria-pressed', String(hex));
    $('name').placeholder = hex ? 'e.g. 504154415445' : 'e.g. PATATE';
  }
  function render() {
    $('out').innerHTML = '';
    try {
      const r = fingerprint($('policy').value, $('name').value, hexMode);
      showError($('err'));
      if (!r) return;
      $('out').innerHTML = [
        row('Fingerprint', r.fingerprint),
        row('Policy ID', r.policyId),
        row('Asset name (hex)', r.nameHex || '(empty)', r.nameLength + ' bytes'),
        r.nameText !== null ? row('Asset name (text)', r.nameText) : '',
        row('Asset ID (policy ID + name)', r.assetId),
      ].join('');
    } catch (e) { showError($('err'), e); }
  }
  $('asText').onclick = () => { if (hexMode) $('name').value = nameHexToText($('name').value); setMode(false); render(); };
  $('asHex').onclick = () => { if (!hexMode) $('name').value = nameTextToHex($('name').value); setMode(true); render(); };
  $('policy').addEventListener('input', render);
  $('name').addEventListener('input', render);
  $('example').onclick = () => { $('policy').value = '7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373'; setMode(false); $('name').value = 'PATATE'; render(); };
  setMode(false);
}

if (globalThis.document) mount();
