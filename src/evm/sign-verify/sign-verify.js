// Sign & Verify: sign a message with EIP-191 personal_sign, or recover and check its signer.
import { parsePrivateKey, addressFromPrivateKey, personalMessageHash, signHash, parseEcdsaSignature, recoverAddress, parseAddress, hexToBytes, bytesToHex, utf8, secp256k1 } from '../lib/evm.js';
import { esc, renderRows, live, param } from '../lib/ui.js';

/** Message bytes: hex when isHex, otherwise UTF-8 text. */
export const messageBytes = (msg, isHex) => isHex ? hexToBytes(msg, 'Message') : utf8(msg);

/**
 * personal_sign a message. Returns null without a key; otherwise the signature and its
 * parts, the signer, the message hash and the query string for the Verify link.
 */
export function signMessage(keyRaw, msg, isHex) {
  if (!keyRaw.trim()) return null;
  const key = parsePrivateKey(keyRaw);
  const hash = personalMessageHash(messageBytes(msg, isHex));
  const sig = signHash(hash, key);
  const address = addressFromPrivateKey(key);
  const signature = bytesToHex(sig.bytes);
  const q = new URLSearchParams({ msg, sig: signature, addr: address });
  if (isHex) q.set('hex', '1');
  return { signature, address, r: bytesToHex(sig.r), s: bytesToHex(sig.s), v: String(sig.v), hash: bytesToHex(hash), query: q.toString() };
}

/**
 * Recover the signer of a personal_sign signature. Returns null without a signature;
 * otherwise the signer, the message hash and, when an expected address is given,
 * whether it matches with the status class and message shown.
 */
export function verifyMessage(msg, isHex, sigRaw, addrRaw) {
  if (!sigRaw.trim()) return null;
  const hash = personalMessageHash(messageBytes(msg, isHex));
  const signer = recoverAddress(hash, parseEcdsaSignature(sigRaw));
  let status = null;
  if (addrRaw.trim()) {
    const expected = parseAddress(addrRaw, 'Expected signer');
    const match = expected === signer;
    status = { match, cls: match ? 'ok' : 'bad', message: match ? '✅ Signature is valid for this address' : '❌ Signed by a different address' };
  }
  return { signer, hash: bytesToHex(hash), status };
}

// Tabs: ?mode=<tab> selects one; switching keeps the rest of the URL.
function mountTabs() {
  const tabs = [...document.querySelectorAll('.mode-tabs [data-tab]')];
  const show = (mode, push) => {
    if (!tabs.some(t => t.dataset.tab === mode)) mode = tabs[0].dataset.tab;
    for (const t of tabs) {
      const on = t.dataset.tab === mode;
      t.setAttribute('aria-selected', String(on));
      document.getElementById('tab-' + t.dataset.tab).hidden = !on;
    }
    if (push) {
      const u = new URL(location.href);
      u.searchParams.set('mode', mode);
      history.replaceState(null, '', u);
    }
    document.dispatchEvent(new CustomEvent('tabchange', { detail: mode }));
  };
  tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.tab, true)));
  show(new URLSearchParams(location.search).get('mode'), false);
}

function mountSign() {
  const $ = id => document.getElementById('s-' + id);

  const run = live([$('key'), $('msg'), $('is-hex')], () => {
    const r = signMessage($('key').value, $('msg').value, $('is-hex').checked);
    if (!r) { $('out').innerHTML = ''; return; }
    renderRows($('out'), [
      { label: 'Signature', value: r.signature, cls: 'ok' },
      { label: 'Signer', value: r.address },
      { label: 'r', value: r.r },
      { label: 's', value: r.s },
      { label: 'v', value: r.v },
      { label: 'Message hash', value: r.hash, note: 'keccak256("\\x19Ethereum Signed Message:\\n" + length + message)' },
    ]);
    $('out').insertAdjacentHTML('beforeend', `<p style="margin:10px 0 0"><a href="?mode=verify&${esc(r.query)}">Verify this signature →</a></p>`);
  }, { errEl: $('err'), outEl: $('out') });

  $('random').onclick = () => { $('key').value = bytesToHex(secp256k1.utils.randomPrivateKey()); run(); };
  // Example: Hardhat/Anvil test account #0 (a well-known public test key).
  $('example').onclick = () => {
    $('key').value = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    $('msg').value = 'Hello, Ethereum!';
    $('is-hex').checked = false;
    run();
  };
}

function mountVerify() {
  const $ = id => document.getElementById('v-' + id);

  $('msg').value = param('msg') ?? 'Hello, Ethereum!';
  $('is-hex').checked = param('hex') === '1';
  $('sig').value = param('sig') ?? '';
  $('addr').value = param('addr') ?? '';

  const run = live([$('msg'), $('is-hex'), $('sig'), $('addr')], () => {
    $('status').hidden = true;
    const r = verifyMessage($('msg').value, $('is-hex').checked, $('sig').value, $('addr').value);
    if (!r) { $('out').innerHTML = ''; return; }
    if (r.status) {
      $('status').className = 'status ' + r.status.cls;
      $('status').textContent = r.status.message;
      $('status').hidden = false;
    }
    renderRows($('out'), [
      { label: 'Recovered signer', value: r.signer },
      { label: 'Message hash', value: r.hash },
    ]);
  }, { errEl: $('err'), outEl: $('out') });

  // Example: "Hello, Ethereum!" signed by Hardhat/Anvil test account #0.
  $('example').onclick = () => {
    $('msg').value = 'Hello, Ethereum!';
    $('is-hex').checked = false;
    $('sig').value = '0xf875be44b382147d14f23ae10a3cd544e54996013ea390cef46c215f063862760011cd83eee30440d9dd72aa4a0c401d8ef014efd1c34b983217616bef8fbd401b';
    $('addr').value = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    run();
  };
}

function mount() {
  mountTabs();
  mountSign();
  mountVerify();
}

if (globalThis.document) mount();
