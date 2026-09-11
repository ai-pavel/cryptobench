// Comment Payload: encode a text comment into a message body BOC, or decode one.
import { commentCell, decodeComment, bocFromString, serializeBoc, bytesToBase64, bytesToHex, utf8, OP_ENCRYPTED_COMMENT } from '../lib/ton.js';
import { $, row, esc, showError } from '../lib/ui.js';

export function countCells(c) { return 1 + c.refs.reduce((n, r) => n + countCells(r), 0); }

/**
 * Encode a text comment (op 0, snake-encoded UTF-8) as a message body.
 * Returns null for empty text; otherwise the info line and [label, value] rows.
 */
export function encodeComment(text) {
  if (!text) return null;
  const cell = commentCell(text), boc = serializeBoc(cell);
  return {
    info: `${utf8(text).length} bytes of UTF-8 in ${countCells(cell)} cell${countCells(cell) === 1 ? '' : 's'}.`,
    rows: [
      ['Body BOC (base64)', bytesToBase64(boc)],
      ['Body BOC (base64url)', bytesToBase64(boc, true)],
      ['Body BOC (hex)', bytesToHex(boc)],
      ['Body cell hash', bytesToHex(cell.hash())],
    ],
  };
}

/**
 * Decode a message body BOC as a comment. Returns null for empty input; otherwise
 * the decoded comment and the HTML describing it. Throws on a bad BOC or body.
 */
export function decodeBody(input) {
  if (!input.trim()) return null;
  const r = decodeComment(bocFromString(input).roots[0]);
  let html;
  if (r.kind === 'empty') html = '<p class="muted">Empty body: a plain transfer with no comment.</p>';
  else if (r.kind === 'text') {
    html = `<p class="ok">Text comment (op 0)${r.validUtf8 ? '' : ' <span class="bad">· not valid UTF-8</span>'}</p>` +
      `<div class="kv">${row('Text', r.text)}</div>`;
  } else if (r.kind === 'encrypted') {
    html = `<p>Encrypted comment (op 0x${OP_ENCRYPTED_COMMENT.toString(16)}), ${r.bytes.length} bytes. It can only be read with the recipient's private key.</p>`;
  } else {
    html = `<p>Not a comment: op code 0x${r.op.toString(16).padStart(8, '0')}. Look it up in the Op Code tool or decode the cell in the BOC Decoder.</p>`;
  }
  return { ...r, html };
}

function mount() {
  let mode = 'enc';
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    mode = b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('enc-box').hidden = mode !== 'enc'; $('dec-box').hidden = mode !== 'dec';
    showError($('err'));
  });

  function encode() {
    showError($('err'));
    const text = $('text').value;
    if (!text) { $('enc-out').innerHTML = ''; $('enc-info').textContent = ''; return; }
    try {
      const r = encodeComment(text);
      $('enc-info').textContent = r.info;
      $('enc-out').innerHTML = r.rows.map(([label, value]) => row(label, value)).join('');
    } catch (e) { showError($('err'), e); }
  }

  function decode() {
    showError($('err')); $('dec-out').innerHTML = '';
    if (!$('boc').value.trim()) return;
    try {
      $('dec-out').innerHTML = decodeBody($('boc').value).html;
    } catch (e) { showError($('err'), e); }
  }
  $('text').addEventListener('input', encode);
  $('boc').addEventListener('input', decode);
  // Examples: a short comment, and the body BOC that encodes it.
  $('enc-example').onclick = () => { $('text').value = "Hello, TON! 👋"; encode(); };
  $('dec-example').onclick = () => { $('boc').value = 'te6cckEBAQEAFgAAKAAAAABIZWxsbywgVE9OISDwn5GL+K/u8w=='; decode(); };
}

if (globalThis.document) mount();
