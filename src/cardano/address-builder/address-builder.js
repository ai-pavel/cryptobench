// Address Builder: build a Cardano address from a payment and a stake credential.
import { buildAddress, parseCredential, toHex } from '../lib/cardano.js';
import { $, row, showError } from '../lib/ui.js';

// A pointer field: a whole number, as a BigInt.
export const parseNat = (s, label) => {
  s = s.trim();
  if (!/^\d+$/.test(s)) throw new Error(`${label} must be a whole number.`);
  return BigInt(s);
};

// A credential from its input and the selected type; bech32 prefixes override the selected type.
export function credential(input, type, role) {
  const c = parseCredential(input, role);
  if (!c) throw new Error(`Enter the ${role} credential.`);
  return { hash: c.hash, type: c.type || type };
}

/**
 * Build the address from the form's values: kind, network, pay, payType, stake,
 * stakeType, slot, txi, certi. Returns null when both credentials are empty.
 * Detected credential types are written back to f.payType / f.stakeType as they
 * are found (even if a later field fails), so the page can update its selects.
 */
export function buildFromForm(f) {
  const { kind } = f;
  if (!f.pay.trim() && !f.stake.trim()) return null;
  let payment = null, stake = null;
  if (kind !== 'reward') { payment = credential(f.pay, f.payType, 'payment'); f.payType = payment.type; }
  if (kind === 'base' || kind === 'reward') { stake = credential(f.stake, f.stakeType, 'stake'); f.stakeType = stake.type; }
  const pointer = kind === 'pointer' ? { slot: parseNat(f.slot, 'Slot'), txIndex: parseNat(f.txi, 'Transaction index'), certIndex: parseNat(f.certi, 'Certificate index') } : null;
  const a = buildAddress({ kind, network: Number(f.network), payment, stake, pointer });
  return { bech32: a.bech32, typeName: a.typeName, hex: toHex(a.bytes) };
}

function mount() {
  const FIELDS = { kind: 'kind', network: 'net', pay: 'pay', payType: 'payType', stake: 'stake', stakeType: 'stakeType', slot: 'slot', txi: 'txi', certi: 'certi' };
  function render() {
    const kind = $('kind').value;
    $('payRow').hidden = kind === 'reward';
    $('stakeRow').hidden = kind === 'enterprise' || kind === 'pointer';
    $('ptrRow').hidden = kind !== 'pointer';
    $('out').innerHTML = '';
    const f = Object.fromEntries(Object.entries(FIELDS).map(([k, id]) => [k, $(id).value]));
    try {
      const a = buildFromForm(f);
      if (!a) { showError($('err')); return; }
      showError($('err'));
      $('out').innerHTML = [
        row('Address', a.bech32, `${a.typeName}`),
        row('Bytes (hex)', a.hex),
      ].join('') + `<p class="muted" style="margin-top:12px"><a href="../address-inspector/?a=${encodeURIComponent(a.bech32)}">Inspect this address →</a></p>`;
    } catch (e) { showError($('err'), e); }
    finally { $('payType').value = f.payType; $('stakeType').value = f.stakeType; }  // bech32 prefixes tell us the type
  }
  for (const id of ['kind', 'net', 'payType', 'stakeType']) $(id).addEventListener('input', render);
  for (const id of ['pay', 'stake', 'slot', 'txi', 'certi']) $(id).addEventListener('input', render);
  $('example').onclick = () => {
    $('kind').value = 'base'; $('net').value = '1';
    $('pay').value = '9493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e'; $('payType').value = 'key';
    $('stake').value = '337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251'; $('stakeType').value = 'key';
    render();
  };
  render();
}

if (globalThis.document) mount();
