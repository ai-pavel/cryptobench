// Derivation Paths: derive addresses from a mnemonic or seed along BIP44/49/84/86 or custom paths.
import { bytesToHex, parseInteger, InputError } from '../lib/btc.js';
import { HDKey, seedFromInput, normalizePath, encodeVersion, VERSIONS, addressFor, wifFor } from '../lib/hd.js';
import { $, renderRows, showError, esc } from '../lib/ui.js';

const TYPES = { 44: 'p2pkh', 49: 'p2sh-p2wpkh', 84: 'p2wpkh', 86: 'p2tr' };
const XPUB = { mainnet: { 44: 'xpub', 49: 'ypub', 84: 'zpub', 86: 'xpub' }, test: { 44: 'tpub', 49: 'upub', 84: 'vpub', 86: 'tpub' } };

// BIP84 test mnemonic.
export const EXAMPLE = {
  secret: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', passphrase: '', net: 'mainnet', preset: '84',
  account: 0, change: '0', start: 0, count: 5, showPriv: false,
};

/**
 * Derive addresses from a seed ({ seed, from } as returned by seedFromInput).
 * opts: { net, preset ('44' | '49' | '84' | '86' | 'custom'), account, change, start, count, custom, type } (strings).
 * Returns the info rows and the derived keys ({ path, address, pub, wif }); throws InputError.
 */
export function derive({ seed, from }, { net: netKey, preset, account, change, start: startText, count: countText, custom, type: customType }) {
  const root = HDKey.fromMasterSeed(seed);
  const coin = netKey === 'mainnet' ? 0 : 1;
  const start = Number(parseInteger(startText, 'Start index', { max: 0x7fffffffn }));
  const count = Number(parseInteger(countText, 'Count', { min: 1n, max: 200n }));
  let template, type, accountPath = null;
  if (preset === 'custom') {
    template = custom.trim(); type = customType;
    if (!template.includes('{i}')) throw new InputError('Custom path must contain {i} where the index goes');
  } else {
    const acct = Number(parseInteger(account, 'Account', { max: 0x7fffffffn }));
    accountPath = `m/${preset}'/${coin}'/${acct}'`;
    template = `${accountPath}/${change}/{i}`; type = TYPES[preset];
  }
  const rows = [];
  for (let i = start; i < start + count; i++) {
    const path = normalizePath(template.replace('{i}', String(i)));
    const k = root.derive(path);
    rows.push({ path, address: addressFor(k.publicKey, type, netKey), pub: bytesToHex(k.publicKey), wif: wifFor(k.privateKey, netKey) });
  }
  const info = [{ label: 'Seed from', value: from === 'mnemonic' ? 'Mnemonic (BIP39)' : 'Raw seed', copy: false },
    { label: 'Root fingerprint', value: bytesToHex(root.identifier.slice(0, 4)) }];
  if (accountPath) {
    const acc = root.derive(accountPath), fam = XPUB[netKey === 'mainnet' ? 'mainnet' : 'test'][preset];
    info.push({ label: `Account ${fam} (${accountPath})`, value: encodeVersion(acc, VERSIONS[fam].pub, false), note: 'Watch-only key for this account' });
    if (preset === '86') info.push({ label: 'Descriptor', value: `tr([${bytesToHex(root.identifier.slice(0, 4))}/${accountPath.slice(2)}]${encodeVersion(acc, VERSIONS[fam].pub, false)}/${change}/*)` });
  }
  return { info, rows };
}

function mount() {
  let cache = { key: null, seed: null };
  let token = 0;

  async function run() {
    const my = ++token;
    showError($('err'), null);
    const preset = $('preset').value;
    $('customField').hidden = preset !== 'custom'; $('typeField').hidden = preset !== 'custom';
    try {
      if (!$('secret').value.trim()) { $('out').innerHTML = ''; $('table').innerHTML = ''; return; }
      const ck = $('secret').value.trim() + '\u0000' + $('passphrase').value;
      if (cache.key !== ck) {
        await new Promise(r => setTimeout(r)); // let the UI paint before the 2048-round PBKDF2
        if (my !== token) return;
        cache = { key: ck, ...seedFromInput($('secret').value, $('passphrase').value) };
      }
      const { info, rows } = derive(cache, {
        net: $('net').value, preset, account: $('account').value, change: $('change').value,
        start: $('start').value, count: $('count').value, custom: $('custom').value, type: $('type').value,
      });
      renderRows($('out'), info);
      const priv = $('showPriv').checked;
      $('table').innerHTML = `<tr><th>Path</th><th>Address</th><th>Public key</th>${priv ? '<th>Private key (WIF)</th>' : ''}</tr>` +
        rows.map(r => `<tr><td class="range">${esc(r.path)}</td><td class="hexcell">${esc(r.address)}</td><td class="hexcell">${esc(r.pub)}</td>${priv ? `<td class="hexcell">${esc(r.wif)}</td>` : ''}</tr>`).join('');
    } catch (e) {
      if (my !== token) return;
      $('out').innerHTML = ''; $('table').innerHTML = '';
      showError($('err'), e);
    }
  }
  for (const id of ['secret', 'passphrase', 'net', 'preset', 'account', 'change', 'start', 'count', 'custom', 'type', 'showPriv']) $(id).addEventListener('input', run);
  run();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  const exFire = id => document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
  // BIP84 test mnemonic.
  $('example').onclick = () => {
    exSet('secret', EXAMPLE.secret); exSet('passphrase', EXAMPLE.passphrase); exSet('net', EXAMPLE.net); exSet('preset', EXAMPLE.preset);
    exSet('account', EXAMPLE.account); exSet('change', EXAMPLE.change); exSet('start', EXAMPLE.start); exSet('count', EXAMPLE.count); exSet('showPriv', EXAMPLE.showPriv); exFire('secret');
  };
}

if (globalThis.document) mount();
