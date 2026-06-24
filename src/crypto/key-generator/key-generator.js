// Key Generator: generate a key pair and show it in every format, with a hand-off to the Key Converter.
import { showError, wireCopy, KEY_NOTE } from '../lib/common.js';
import { generate, generateRsa, pkcs8, toPem } from '../lib/keys.js';
import { renderKey } from '../lib/keyview.js';

// The RSA modulus size for 'RSA-2048' style types, or null for curve types.
export const rsaBitsFor = type => type.startsWith('RSA-') ? Number(type.slice(4)) : null;

// A fresh key of the chosen type (the option values of the type select).
export async function makeKey(type) {
  const bits = rsaBitsFor(type);
  return bits ? generateRsa(bits) : generate(type);
}

// The PKCS#8 PEM handed to the Key Converter.
export const handoffPem = key => toPem('PRIVATE KEY', pkcs8(key));

function mount() {
  const $ = id => document.getElementById(id);
  $('keynote').textContent = KEY_NOTE;
  let lastPem = '';
  // Hand the key over in sessionStorage (this tab only), never in the URL, so it stays out of history.
  $('convertLink').onclick = () => { try { sessionStorage.setItem('crypto.handoffKey', lastPem); } catch {} };

  async function go() {
    showError($('err'), ''); $('out').innerHTML = ''; $('convert').hidden = true;
    const type = $('type').value;
    $('go').disabled = true;
    try {
      let key;
      if (rsaBitsFor(type)) {
        $('status').innerHTML = '<span class="spinner"></span> Generating RSA key…';
        const t0 = performance.now();
        key = await makeKey(type);
        $('status').textContent = `Took ${(performance.now() - t0).toFixed(0)} ms.`;
      } else { key = await makeKey(type); $('status').textContent = ''; }
      await renderKey($('out'), key);
      lastPem = handoffPem(key);
      $('convert').hidden = false;
    } catch (e) { $('status').textContent = ''; showError($('err'), e.message); }
    finally { $('go').disabled = false; }
  }
  $('go').onclick = go;
  $('type').oninput = go;
  wireCopy();
  go();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  $('example').onclick = () => { exSet('type', 'Ed25519'); go(); };
}

if (globalThis.document) mount();
