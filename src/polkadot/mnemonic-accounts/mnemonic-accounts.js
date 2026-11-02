// Mnemonic Accounts: derive Substrate accounts from a mnemonic or seed and a derivation path.
import { $, kv, esc, showError, fillNetworks } from '../lib/ui.js';
import { NETWORKS, ss58Encode, keypairFromSuri, accountIdOf, toHex, generateMnemonic, wordlist } from '../lib/dot.js';

export const DEV = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
export const PRESETS = ['', '//Alice', '//Bob', '//Charlie', '//Alice//stash', '//polkadot//0', '//0'];

// SS58 prefix from the network select value and the custom prefix input.
export const prefixFrom = (net, custom) => net === 'custom' ? parseInt(custom, 10) : NETWORKS[+net].prefix;
// Number of numbered accounts to list, clamped to 1–50.
export const clampCount = v => Math.max(1, Math.min(50, parseInt(v, 10) || 1));

// Derive the account; returns { rows, numbered } where numbered is null unless list is set.
export function deriveAccounts({ phrase, path, pass, type, prefix: p, reveal = false, list = false, count = 5 }) {
  phrase = phrase.trim().split(/\s+/).join(' ');
  if (!phrase) throw new Error('Enter a mnemonic or a 0x-prefixed 32-byte seed.');
  path = path.trim();
  if (path && !/^(\/\/?[^/]+)+$/.test(path)) throw new Error('A path is a list of junctions like //hard or /soft, e.g. //polkadot//0.');
  const suri = phrase + path + (pass ? '///' + pass : '');
  const kp = keypairFromSuri(type, suri);
  const id = accountIdOf(type, kp.publicKey);
  const rows = [
    ['Address', ss58Encode(id, p)],
    ['Public key', toHex(kp.publicKey)],
    type === 'ecdsa' ? ['Account id', toHex(id), { note: 'Blake2b-256 of the compressed public key' }] : null,
    ['Path', (path || '(none)') + (pass ? ' + password' : ''), { copy: false }],
    reveal ? ['Seed (mini-secret)', toHex(kp.seed), { note: 'before derivation' }] : null,
    reveal ? [type === 'sr25519' ? 'Secret key (64 bytes)' : 'Private key', toHex(kp.secret)] : null,
  ];
  let numbered = null;
  if (list) {
    const n = clampCount(count);
    numbered = [];
    for (let i = 0; i < n; i++) {
      const k = keypairFromSuri(type, phrase + path + '//' + i + (pass ? '///' + pass : ''));
      numbered.push([`${path}//${i}`, ss58Encode(accountIdOf(type, k.publicKey), p)]);
    }
  }
  return { rows, numbered };
}

function mount() {
  fillNetworks($('net'), NETWORKS, 0);
  $('presets').innerHTML = PRESETS.map(p => `<button type="button" data-path="${p}">${p || '(no path)'}</button>`).join('');
  const prefix = () => prefixFrom($('net').value, $('custom').value);
  function render() {
    $('customWrap').hidden = $('net').value !== 'custom';
    try {
      const { rows, numbered } = deriveAccounts({
        phrase: $('phrase').value, path: $('path').value, pass: $('pass').value, type: $('type').value, prefix: prefix(),
        reveal: $('reveal').checked, list: $('list').checked, count: $('count').value,
      });
      showError($('err'), null);
      let html = kv(rows);
      if (numbered) html += `<p class="section-title">Numbered accounts</p>` + kv(numbered);
      $('out').innerHTML = html;
    } catch (e) { showError($('err'), e); $('out').innerHTML = ''; }
  }
  $('presets').addEventListener('click', e => { const b = e.target.closest('[data-path]'); if (b) { $('path').value = b.dataset.path; render(); } });
  $('gen12').onclick = () => { $('phrase').value = generateMnemonic(wordlist, 128); $('path').value = ''; render(); };
  $('gen24').onclick = () => { $('phrase').value = generateMnemonic(wordlist, 256); $('path').value = ''; render(); };
  $('dev').onclick = () => { $('phrase').value = DEV; $('path').value = '//Alice'; render(); };
  ['phrase', 'path', 'pass', 'type', 'net', 'custom', 'list', 'count', 'reveal'].forEach(id => $(id).addEventListener('input', render));
  render();
  // Example button(s)
  $('dev').onclick = () => { $('phrase').value = DEV; $('path').value = '//Alice'; $('pass').value = ''; $('type').value = 'sr25519'; $('net').value = '2'; render(); };
}

if (globalThis.document) mount();
