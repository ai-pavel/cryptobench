// Base64: encode and decode Base64 text and files.
import { $, renderRows, segmented, showError, esc } from '../lib/ui.js';
import { toBase64, fromBase64, utf8, utf8OrNull, printable, toHex } from '../lib/bytes.js';

export const wrap76 = (s, wrap) => wrap ? s.replace(/(.{76})/g, '$1\n').trim() : s;

/** Text → Base64: the result rows for the given options { url, pad, wrap }. */
export function encodeRows(text, { url = false, pad = true, wrap = false } = {}) {
  const bytes = utf8(text);
  return [
    { label: url ? 'Base64url' : 'Base64', value: wrap76(toBase64(bytes, { url, pad }), wrap) },
    { label: 'Size', value: `${bytes.length} bytes → ${toBase64(bytes, { url, pad }).length} characters`, copy: false },
  ];
}

/** Base64 (or a base64 data: URI) → bytes and the result rows; null for empty input. Bad base64 throws. */
export function decodeRows(text) {
  if (!text.trim()) return null;
  const bytes = fromBase64(text.replace(/^data:[^,]*;base64,/, ''));
  const str = utf8OrNull(bytes);
  return {
    bytes,
    rows: [
      str !== null && printable(str) ? { label: 'Text (UTF-8)', value: str } : { label: 'Text', value: 'Not readable text (binary data); see hex below.', copy: false },
      { label: 'Hex', value: toHex(bytes, ' ').slice(0, 30000) + (bytes.length > 10000 ? ' …' : '') },
      { label: 'Size', value: `${bytes.length} bytes`, copy: false },
    ],
  };
}

/** File → Base64: the data URI and the result rows for a file's name, MIME type and bytes. */
export function fileRows(name, type, bytes) {
  const b64 = toBase64(bytes);
  const uri = `data:${type || 'application/octet-stream'};base64,${b64}`;
  return {
    uri,
    rows: [
      { label: 'File', value: `${name} · ${type || 'unknown type'} · ${bytes.length} bytes`, copy: false },
      { label: 'Base64', value: b64 },
      { label: 'Data URI', value: uri },
    ],
  };
}

function mount() {
  let decoded = null;
  const mode = segmented($('mode'), m => {
    $('textPane').hidden = m === 'file'; $('filePane').hidden = m !== 'file';
    $('encOpts').hidden = m !== 'encode';
    $('inLabel').textContent = m === 'encode' ? 'Text' : 'Base64 or base64url';
    if (m === 'decode' && !/^[A-Za-z0-9+/=_\-\s]+$/.test($('in').value)) $('in').value = 'SGVsbG8sIHdvcmxkISDwn5GL';
    $('out').innerHTML = ''; $('preview').innerHTML = ''; $('dlRow').hidden = true;
    if (m !== 'file') run();
  });
  function run() {
    showError($('err'), null); $('preview').innerHTML = ''; $('dlRow').hidden = true;
    try {
      if (mode() === 'encode') {
        renderRows($('out'), encodeRows($('in').value, { url: $('url').checked, pad: $('pad').checked, wrap: $('wrap').checked }));
      } else if (mode() === 'decode') {
        const r = decodeRows($('in').value);
        if (!r) { $('out').innerHTML = ''; return; }
        decoded = r.bytes;
        renderRows($('out'), r.rows);
        $('dlRow').hidden = false;
      }
    } catch (e) { $('out').innerHTML = ''; showError($('err'), e); }
  }
  for (const id of ['in', 'url', 'pad', 'wrap']) $(id).addEventListener('input', run);
  $('download').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([decoded])); a.download = 'decoded.bin'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  async function useFile(f) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const { uri, rows } = fileRows(f.name, f.type, bytes);
    renderRows($('out'), rows);
    $('preview').innerHTML = f.type.startsWith('image/') ? `<img alt="${esc(f.name)}" src="${uri}">` : '';
  }
  $('file').addEventListener('input', () => $('file').files[0] && useFile($('file').files[0]));
  const drop = $('drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); e.dataTransfer.files[0] && useFile(e.dataTransfer.files[0]); });
  run();
}

if (globalThis.document) mount();
