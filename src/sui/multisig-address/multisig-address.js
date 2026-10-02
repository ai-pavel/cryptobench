// Multisig Address: derive a multisig address from public keys, weights and a threshold.
import { parseHexOrBase64, checkPublicKey, addressFromPublicKey, schemeName, base64, hex, concat, blake256, addr, kvTable, wireCopy, showError, esc, Writer } from '../lib/sui.js';
const $ = id => document.getElementById(id);
const PREFIX = { ed25519: 0, secp256k1: 1, secp256r1: 2 };

export function parseSigner(line, n) {
  const parts = line.trim().split(/\s+/);
  if (parts.length > 2) throw new Error(`Line ${n}: expected "public key [weight]".`);
  let [key, w = '1'] = parts, flag, pub;
  const m = /^(ed25519|secp256k1|secp256r1):(.+)$/i.exec(key);
  try {
    if (m) { flag = PREFIX[m[1].toLowerCase()]; pub = parseHexOrBase64(m[2], 'Key'); }
    else {
      const b = parseHexOrBase64(key, 'Key');
      if (b.length === 33 && b[0] === 0) { flag = 0; pub = b.slice(1); }
      else if (b.length === 34 && (b[0] === 1 || b[0] === 2)) { flag = b[0]; pub = b.slice(1); }
      else throw new Error(`a ${b.length}-byte key without a scheme; use a Sui public key or prefix the scheme (e.g. secp256k1:…)`);
    }
    pub = checkPublicKey(flag, pub);
  } catch (e) { throw new Error(`Line ${n}: ${e.message.replace(/\.$/, '')}.`); }
  if (!/^\d+$/.test(w) || +w < 1 || +w > 255) throw new Error(`Line ${n}: weight must be a whole number from 1 to 255.`);
  return { flag, pub, weight: +w };
}

// Parses the signer lines and threshold; returns null for no signers, otherwise the
// result rows and each signer with its scheme name and own address.
export function multisig(text, thresholdInput) {
  const lines = text.split('\n').map((l, i) => [l, i + 1]).filter(([l]) => l.trim());
  if (!lines.length) return null;
  const signers = lines.map(([l, n]) => parseSigner(l, n));
  if (signers.length > 10) throw new Error(`A multisig can have at most 10 signers (got ${signers.length}).`);
  const seen = new Set();
  signers.forEach((s, i) => { const k = s.flag + hex.encode(s.pub); if (seen.has(k)) throw new Error(`Signer ${i + 1} repeats an earlier key.`); seen.add(k); });
  const t = thresholdInput.trim();
  if (!/^\d+$/.test(t)) throw new Error('Threshold must be a whole number.');
  const threshold = Number(t), total = signers.reduce((a, s) => a + s.weight, 0);
  if (threshold < 1 || threshold > 65535) throw new Error('Threshold must be between 1 and 65535.');
  if (threshold > total) throw new Error(`Threshold ${threshold} is more than the total weight ${total}, so no set of signatures could reach it.`);
  const thr = new Writer().uint(16, threshold).toBytes();
  const pre = concat(Uint8Array.of(3), thr, ...signers.map(s => concat(Uint8Array.of(s.flag), s.pub, Uint8Array.of(s.weight))));
  // MultiSigPublicKey as BCS: vector<(PublicKey enum, u8 weight)>, u16 threshold; prefixed with flag 0x03.
  const w = new Writer().u8(3).uleb(signers.length);
  signers.forEach(s => w.uleb(s.flag).push(s.pub).u8(s.weight));
  w.uint(16, threshold);
  return {
    rows: [
      ['Multisig address', addr(blake256(pre))],
      ['Multisig public key', base64.encode(w.toBytes()), 'base64 of 0x03 ‖ BCS MultiSigPublicKey'],
      ['Threshold', `${threshold} of total weight ${total}`],
    ],
    signers: signers.map(s => ({ ...s, name: schemeName(s.flag), address: addressFromPublicKey(s.flag, s.pub) })),
  };
}

function mount() {
  function render() {
    showError($('err'), '');
    $('out').innerHTML = '';
    try {
      const r = multisig($('keys').value, $('threshold').value);
      if (!r) return;
      $('out').innerHTML = kvTable(r.rows) + `<p class="section-title">Signers</p><table><thead><tr><th>#</th><th>Scheme</th><th>Weight</th><th>Address</th></tr></thead><tbody>` +
        r.signers.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${s.weight}</td><td class="mono" style="overflow-wrap:anywhere;font-size:13px">${s.address}</td></tr>`).join('') + '</tbody></table>';
    } catch (e) { showError($('err'), e.message); }
  }
  $('keys').oninput = render; $('threshold').oninput = render;
  wireCopy();
  render();
  // Example button(s)
  $('example').onclick = () => { $('keys').value = "ACJkf+7vNjBgvUIFoWcaFfEKEjZ2WRixtfY42C8zz8Rp 1\nAQK9lbNnoth4GgiL3LAFQGemymF4Q30U5ReN9qfFp+JbCw== 2\nAgJ8+PjJHCyHvxf21ycmLkdGeUjA+ClnQBEn9awscbk50g== 3"; $('threshold').value = "3"; render(); };
}

if (globalThis.document) mount();
