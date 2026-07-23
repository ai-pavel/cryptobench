// Address: decode a Bitcoin address, or build one from a scriptPubKey or a hash / witness program.
import { hexToBytes, bytesToHex, classifyScript, scriptToAddress, addressToScript, NETWORKS, networkOptions, decompile, toAsm,
  witnessScript, p2pkhScript, p2shScript, locateBech32Error, bech32, bech32m, base58, InputError, parseInteger } from '../lib/btc.js';
import { $, renderRows, live, segmented, esc } from '../lib/ui.js';

// BIP84 test vector: first receive address of the "abandon … about" wallet.
export const EXAMPLE = {
  address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
  script: '0014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2',
  ptype: 'p2wpkh',
  program: 'c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2',
};

const asmOf = s => { try { return toAsm(decompile(s)); } catch (e) { return `(cannot decode: ${e.message})`; } };

/** Rows describing a scriptPubKey and its address on a network; throws InputError (e.g. segwit on a network without it). */
export function scriptRows(script, net) {
  const c = classifyScript(script);
  const addr = scriptToAddress(script, net);
  const segwit = c.program !== undefined;
  return [
    { label: 'Address', value: addr || 'No address: this script type has no standard address', copy: !!addr },
    { label: 'Type', value: c.name, copy: false },
    segwit && { label: 'Encoding', value: c.version === 0 ? 'Bech32 (BIP173, witness v0)' : 'Bech32m (BIP350, witness v1+)', copy: false },
    segwit && { label: 'Human-readable part', value: net.hrp || '—', copy: false },
    segwit && { label: 'Witness version', value: String(c.version), copy: false },
    segwit && { label: 'Witness program', value: bytesToHex(c.program), note: `${c.program.length} bytes` },
    c.hash && { label: c.type === 'p2pkh' ? 'Public key hash' : 'Script hash', value: bytesToHex(c.hash) },
    c.hash && { label: 'Version byte', value: '0x' + (c.type === 'p2pkh' ? net.pkh : net.sh).toString(16).padStart(2, '0'), copy: false, note: 'Base58Check encoding' },
    c.pubkey && { label: 'Public key', value: bytesToHex(c.pubkey) },
    { label: 'scriptPubKey', value: bytesToHex(script) },
    { label: 'ASM', value: asmOf(script) },
  ].filter(Boolean);
}

/** For a string that looks like bech32, the likely single-character typo ({ index, char, fix, fixed }) or null. */
export function bech32Typo(s) {
  if (/^[a-z]{1,10}1/i.test(s) && !/^[13mn2]/.test(s)) return locateBech32Error(s) || null;
  return null;
}

/** Decode an address into its script; for an invalid bech32 string, say why it is invalid. Throws InputError. */
export function decodeAddress(s) {
  try { return addressToScript(s); } catch (e) {
    if (/^[a-z]{1,10}1/i.test(s) && !/^[13mn2]/.test(s)) {
      // A valid bech32 string that is not a valid segwit address: say why.
      for (const [name, enc] of [['Bech32', bech32], ['Bech32m', bech32m]]) {
        let d = null;
        try { d = enc.decode(s.toLowerCase(), 90); } catch {}
        if (!d) continue;
        const known = Object.values(NETWORKS).some(n => n.hrp === d.prefix);
        throw new InputError(`Valid ${name} checksum, but ` + (known ? `not a valid segwit address: ${e.message}` : `"${d.prefix}" is not a known Bitcoin, Litecoin or test network prefix`));
      }
    }
    throw e;
  }
}

/** Decode an address: the status message and rows. Returns null for empty input; throws InputError. */
export function addressInfo(input) {
  const s = input.trim();
  if (!s) return null;
  const d = decodeAddress(s);
  const c = classifyScript(d.script);
  return {
    message: `✓ Valid ${c.name.split(' (')[0]} address`,
    rows: [
      { label: 'Type', value: c.name, copy: false },
      { label: 'Network', value: d.networks.join(', '), copy: false },
      d.encoding && { label: 'Encoding', value: d.encoding === 'bech32' ? 'Bech32 (BIP173)' : 'Bech32m (BIP350)', copy: false },
      d.hrp && { label: 'Human-readable part', value: d.hrp, copy: false },
      d.program && { label: 'Witness version', value: String(d.version), copy: false },
      d.program && { label: 'Witness program', value: bytesToHex(d.program), note: `${d.program.length} bytes` },
      d.hash && { label: 'Version byte', value: '0x' + d.version.toString(16).padStart(2, '0'), copy: false, note: 'Base58Check encoding' },
      d.hash && { label: d.kind === 'p2pkh' ? 'Public key hash' : 'Script hash', value: bytesToHex(d.hash) },
      d.hash && { label: 'Raw Base58 bytes', value: bytesToHex(base58.decode(s)), note: 'Version ‖ hash ‖ 4-byte checksum' },
      { label: 'scriptPubKey', value: bytesToHex(d.script) },
      { label: 'ASM', value: asmOf(d.script) },
    ].filter(Boolean),
  };
}

/** Build a scriptPubKey from a type (p2wpkh, p2wsh, p2tr, p2pkh, p2sh, witness) and a hash / program in hex; throws InputError. */
export function partsScript(t, programHex, wver) {
  const prog = hexToBytes(programHex, 'Hash / program');
  const need = { p2wpkh: 20, p2wsh: 32, p2tr: 32, p2pkh: 20, p2sh: 20 }[t];
  if (need && prog.length !== need) throw new InputError(`${t.toUpperCase()} needs ${need} bytes; this is ${prog.length}`);
  return t === 'p2pkh' ? p2pkhScript(prog) : t === 'p2sh' ? p2shScript(prog)
    : witnessScript(t === 'p2tr' ? 1 : t === 'witness' ? Number(parseInteger(wver, 'Witness version', { max: 16n })) : 0, prog);
}

function mount() {
  $('net').innerHTML = networkOptions('mainnet');
  let run;
  const mode = segmented($('mode'), () => {
    for (const m of ['address', 'script', 'parts']) $(m + 'Fields').hidden = mode() !== m;
    $('netField').hidden = mode() === 'address';
    run();
  });
  $('ptype').addEventListener('input', () => { $('wverField').hidden = $('ptype').value !== 'witness'; });

  run = live([$('address'), $('script'), $('net'), $('ptype'), $('program'), $('wver')], () => {
    $('status').hidden = true;
    $('out').innerHTML = '';
    if (mode() === 'address') {
      let r;
      try { r = addressInfo($('address').value); } catch (e) {
        // Explain bech32 typos: try to locate a single wrong character.
        const fix = bech32Typo($('address').value.trim());
        if (fix) {
          $('out').innerHTML = `<p class="small">Likely typo at position ${fix.index + 1}: “${esc(fix.char)}” should probably be “${esc(fix.fix)}”.</p>` +
            `<div class="kv"><div class="k">Corrected</div><div class="v">${esc(fix.fixed)}</div><button class="icon-btn copy" data-copy="${esc(fix.fixed)}">Copy</button></div>`;
        }
        throw e;
      }
      if (!r) return;
      $('status').hidden = false; $('status').className = 'status ok';
      $('status').textContent = r.message;
      renderRows($('out'), r.rows);
    } else if (mode() === 'script') {
      if (!$('script').value.trim()) return;
      renderRows($('out'), scriptRows(hexToBytes($('script').value, 'Script'), NETWORKS[$('net').value]));
    } else {
      if (!$('program').value.trim()) return;
      renderRows($('out'), scriptRows(partsScript($('ptype').value, $('program').value, $('wver').value), NETWORKS[$('net').value]));
    }
  }, { errEl: $('err') });
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  const exFire = id => document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
  // BIP84 test vector: first receive address of the "abandon … about" wallet.
  $('example').onclick = () => {
    exSet('net', 'mainnet');
    if (mode() === 'address') exSet('address', EXAMPLE.address);
    else if (mode() === 'script') exSet('script', EXAMPLE.script);
    else { exSet('ptype', EXAMPLE.ptype); exFire('ptype'); exSet('program', EXAMPLE.program); }
    run();
  };
}

if (globalThis.document) mount();
