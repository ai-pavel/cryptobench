// Key Converter: read a key in any format and show it as PEM, DER, JWK, raw bytes and OpenSSH.
import { showError, wireCopy, KEY_NOTE, debounce } from '../lib/common.js';
import { parseAnyKey } from '../lib/keys.js';
import { renderKey } from '../lib/keyview.js';

// The RFC 8032 test 1 Ed25519 private key as PKCS#8 PEM.
export const EXAMPLE_KEY = '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIJ1hsZ3v/VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g\n-----END PRIVATE KEY-----';

/**
 * Parse a pasted key. Returns null for empty input; otherwise the key and the
 * "Read as" line. Throws on keys that cannot be read.
 */
export async function readKey(text, hint, rawKind) {
  if (!text.trim()) return null;
  const key = await parseAnyKey(text, hint, rawKind);
  return { key, detected: `Read as: ${key.format}` };
}

function mount() {
  const $ = id => document.getElementById(id);
  $('keynote').textContent = KEY_NOTE;
  let run = 0;
  async function render() {
    const my = ++run;
    showError($('err'), ''); $('detected').textContent = '';
    if (!$('key').value.trim()) { $('out').innerHTML = ''; return; }
    try {
      const { key, detected } = await readKey($('key').value, $('hint').value, $('rawKind').value);
      if (my !== run) return;
      $('detected').textContent = detected;
      await renderKey($('out'), key, { showPrivate: !$('pubOnly').checked });
    } catch (e) { if (my === run) { $('out').innerHTML = ''; showError($('err'), e.message); } }
  }
  const later = debounce(render, 120);
  for (const id of ['key', 'hint', 'rawKind', 'pubOnly']) $(id).addEventListener('input', later);
  try {
    const handoff = sessionStorage.getItem('crypto.handoffKey');
    if (handoff) { $('key').value = handoff; sessionStorage.removeItem('crypto.handoffKey'); }
  } catch {}
  wireCopy();
  render();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  $('example').onclick = () => {
    exSet('key', EXAMPLE_KEY);
    exSet('hint', ''); exSet('pubOnly', false); render();
  };
}

if (globalThis.document) mount();
