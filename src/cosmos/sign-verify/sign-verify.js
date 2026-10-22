// Sign & Verify: sign arbitrary data with ADR-36 (Keplr signArbitrary) and verify such signatures.
import { generateMnemonic, validateMnemonic, mnemonicToSeedSync } from '../../assets/vendor/@scure/bip39@2.4.0/index.esm.js';
import { wordlist } from '../../assets/vendor/@scure/bip39@2.4.0/wordlists/english.esm.js';
import { HDKey } from '../../assets/vendor/@scure/bip32@2.4.0/index.esm.js';
import { sha256, secp256k1, base64, hex, utf8, toHex, parseHex, parseBase64, parseHexOrBase64, cosmosAddressBytes, encodeBech32, decodeBech32, splitPrefix, chainOptions, equal, kvTable, wireCopy, showError, esc, KEY_NOTE } from '../lib/cosmos.js';

// ---------- ADR-36 ----------
export const escapeJson = s => s.replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
export function sortedJson(v) {
  if (Array.isArray(v)) return '[' + v.map(sortedJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + sortedJson(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export function signDoc(signer, data) {
  return escapeJson(sortedJson({
    chain_id: '', account_number: '0', sequence: '0', fee: { gas: '0', amount: [] }, memo: '',
    msgs: [{ type: 'sign/MsgSignData', value: { signer, data: base64.encode(data) } }],
  }));
}
export function dataBytes(text, enc) {
  if (enc === 'text') return utf8.encode(text);
  if (!text.trim()) return new Uint8Array();
  return enc === 'hex' ? parseHex(text, 'Data') : parseBase64(text, 'Data');
}

// ---------- Sign ----------
// Whether the key field holds a mnemonic (12 or more words) rather than a raw key.
export const isMnemonicInput = text => text.trim().toLowerCase().split(/\s+/).filter(Boolean).length >= 12;

// The private key from a hex/base64 key or a mnemonic (m/44'/118'/0'/0/index).
export function privateKey(text, index = 0) {
  const t = text.trim();
  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 12) {
    const m = words.join(' ');
    if (!validateMnemonic(m, wordlist)) throw new Error('This mnemonic is not valid BIP39 (unknown word or wrong checksum).');
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0) throw new Error('Account index must be a whole number.');
    return { key: HDKey.fromMasterSeed(mnemonicToSeedSync(m)).derive(`m/44'/118'/0'/0/${i}`).privateKey, from: `mnemonic, m/44'/118'/0'/0/${i}` };
  }
  const key = parseHexOrBase64(t, 'Private key');
  if (key.length !== 32) throw new Error(`Private key is ${key.length} bytes; secp256k1 private keys are 32 bytes.`);
  if (!secp256k1.utils.isValidSecretKey(key)) throw new Error('Private key is out of range for secp256k1.');
  return { key, from: 'private key' };
}

/**
 * Sign data with ADR-36. Returns the signer address, the StdSignature JSON object
 * (as Keplr's signArbitrary returns), the sign doc and its SHA-256.
 */
export function signArbitrary({ keyText, index = 0, prefix, data, enc }) {
  const { key } = privateKey(keyText, index);
  const pub = secp256k1.getPublicKey(key, true);
  const signer = encodeBech32(prefix, cosmosAddressBytes(pub));
  const doc = signDoc(signer, dataBytes(data, enc));
  const hash = sha256(utf8.encode(doc));
  const sig = secp256k1.sign(hash, key, { prehash: false, lowS: true });
  const std = { pub_key: { type: 'tendermint/PubKeySecp256k1', value: base64.encode(pub) }, signature: base64.encode(sig) };
  return { signer, std, doc, hash };
}

// ---------- Verify ----------
/**
 * Verify an ADR-36 signature. `sig` is base64/hex or StdSignature JSON; `pub` is an
 * optional public key that overrides the one in the JSON. Returns null when the address
 * or signature is empty; otherwise whether the signature and key match, and the
 * address derived from the public key. Throws on malformed input.
 */
export function verifyArbitrary({ addr, data, enc, sig: sigText, pub: pubText = '' }) {
  addr = addr.trim(); sigText = sigText.trim();
  if (!addr || !sigText) return null;
  const { prefix, bytes: addrBytes } = decodeBech32(addr, 'Signer address');
  if (splitPrefix(prefix).kind) throw new Error('Use the signer\'s account address, not a validator address.');
  let sigB64 = sigText, pubB64 = pubText.trim();
  if (sigText.startsWith('{')) {
    let j; try { j = JSON.parse(sigText); } catch { throw new Error('Signature looks like JSON but isn\'t valid JSON.'); }
    sigB64 = j.signature; pubB64 = pubB64 || j.pub_key?.value || j.pub_key?.key || '';
    if (typeof sigB64 !== 'string') throw new Error('The JSON has no "signature" field.');
  }
  if (!pubB64) throw new Error('A public key is needed to verify. Paste the StdSignature JSON or the public key.');
  const sig = parseHexOrBase64(sigB64, 'Signature');
  if (sig.length !== 64) throw new Error(`Signature is ${sig.length} bytes; ADR-36 signatures are 64 bytes (r‖s).`);
  const pub = parseHexOrBase64(pubB64, 'Public key');
  let point; try { point = secp256k1.Point.fromBytes(pub); } catch { throw new Error('Public key is not a valid secp256k1 point.'); }
  const derived = cosmosAddressBytes(point.toBytes(true));
  const keyMatches = equal(derived, addrBytes);
  const hash = sha256(utf8.encode(signDoc(addr.toLowerCase(), dataBytes(data, enc))));
  let sigOk = false;
  try { sigOk = secp256k1.verify(sig, hash, point.toBytes(true), { prehash: false, lowS: false }); } catch {}
  return { valid: sigOk && keyMatches, sigOk, keyMatches, derivedAddress: encodeBech32(prefix, derived) };
}

function mount() {
  const $ = id => document.getElementById(id);
  $('keynote').textContent = KEY_NOTE;
  $('s-chain').innerHTML = chainOptions('cosmos');

  // ---------- tabs (?mode=sign|verify) ----------
  const tabs = [...document.querySelectorAll('.mode-tabs [data-tab]')];
  function showTab(mode, push) {
    if (!tabs.some(t => t.dataset.tab === mode)) mode = 'sign';
    for (const t of tabs) { const on = t.dataset.tab === mode; t.setAttribute('aria-selected', String(on)); $('tab-' + t.dataset.tab).hidden = !on; }
    if (push) { const u = new URL(location.href); u.searchParams.set('mode', mode); history.replaceState(null, '', u); }
  }
  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab, true)));
  showTab(new URLSearchParams(location.search).get('mode'), false);

  // ---------- Sign ----------
  let lastSigned = null;
  function sign() {
    showError($('s-err'), ''); $('s-out').innerHTML = ''; lastSigned = null;
    if (!$('s-key').value.trim()) { $('s-indexWrap').hidden = true; return; }
    try {
      $('s-indexWrap').hidden = !isMnemonicInput($('s-key').value);
      const { signer, std, doc, hash } = signArbitrary({ keyText: $('s-key').value, index: $('s-index').value, prefix: $('s-chain').value, data: $('s-data').value, enc: $('s-enc').value });
      lastSigned = { signer, data: $('s-data').value, enc: $('s-enc').value, std };
      $('s-out').innerHTML = kvTable([
        ['Signer address', signer],
        ['Signature (base64)', std.signature, '64 bytes r‖s, low-S'],
        ['Public key (base64)', std.pub_key.value],
        ['StdSignature JSON', JSON.stringify(std), 'What Keplr\'s signArbitrary returns'],
        ['Sign doc', doc, 'Sorted-key JSON that was hashed'],
        ['SHA-256 of sign doc', toHex(hash)],
      ]) + '<div class="row" style="margin-top:12px"><button type="button" class="primary" id="toVerify">Verify this signature →</button></div>';
      $('toVerify').onclick = () => {
        $('v-addr').value = lastSigned.signer; $('v-data').value = lastSigned.data; $('v-enc').value = lastSigned.enc;
        $('v-sig').value = JSON.stringify(lastSigned.std); $('v-pub').value = '';
        showTab('verify', true); verify();
      };
    } catch (e) { showError($('s-err'), e.message); }
  }
  $('s-random').onclick = () => { $('s-key').value = toHex(secp256k1.utils.randomSecretKey()); sign(); };
  for (const id of ['s-key', 's-chain', 's-index', 's-data', 's-enc']) $(id).oninput = sign;

  // ---------- Verify ----------
  function verify() {
    showError($('v-err'), ''); $('v-out').innerHTML = '';
    try {
      const r = verifyArbitrary({ addr: $('v-addr').value, data: $('v-data').value, enc: $('v-enc').value, sig: $('v-sig').value, pub: $('v-pub').value });
      if (!r) return;
      $('v-out').innerHTML = `<p style="font-size:18px;margin:14px 0 6px" class="${r.valid ? 'ok' : 'bad'}">${r.valid ? '✅ Valid signature' : '❌ Invalid'}</p>` + kvTable([
        ['Signature', r.sigOk ? 'Matches the data and public key' : 'Does not match the data and public key', r.sigOk ? '' : 'Check the data, its encoding and the signer address — all three are part of what was signed'],
        ['Public key → address', r.derivedAddress, r.keyMatches ? 'Matches the signer address' : 'Does NOT match the signer address'],
      ]);
    } catch (e) { showError($('v-err'), e.message); }
  }
  for (const id of ['v-addr', 'v-data', 'v-enc', 'v-sig', 'v-pub']) $(id).oninput = verify;
  wireCopy(); sign(); verify();
  // Example button(s)
  $('example-sign').onclick = () => { $('s-key').value = "c4a48e2fce1481cd3294b4490f6678090ea98d3d0e5cd984558ab0968741b104"; $('s-chain').value = 'cosmos'; $('s-data').value = "Sign in to example.com"; $('s-enc').value = 'text'; $('s-key').oninput(); };
  $('example-verify').onclick = () => { $('v-addr').value = "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4"; $('v-data').value = "Sign in to example.com"; $('v-enc').value = 'text'; $('v-sig').value = "k1TCYs+EWgHI1ZEc8eYdJZbHB8o+VPYzEGUr7PBbeaxbbmyy/5goYer/WBoViMwwQUO8oYci7I4V5VAU1QKLNw=="; $('v-pub').value = "Ak9OKtmcNNYLm6YoPJQxqEGK+GcyEpYfl6d7Y3f80Fti"; $('v-sig').oninput(); };
}

if (globalThis.document) mount();
