// Barcode Generator: QR codes (qrcode-generator) and linear barcodes (JsBarcode) as SVG and PNG.
// The vendored libraries are classic scripts that define the qrcode and JsBarcode globals.
const $ = id => document.getElementById(id);

export const HINTS = {
  CODE128: 'Any ASCII text.',
  EAN13: '12 digits (the check digit is added for you) or 13 digits with a valid check digit.',
  UPC: '11 digits (the check digit is added for you) or 12 digits with a valid check digit.',
  CODE39: 'Uppercase letters A–Z, digits and - . $ / + % and space.',
};
export const SAMPLES = { CODE128: 'Hello-123', EAN13: '590123412345', UPC: '03600029145', CODE39: 'CODE-39' };

// Escape for MECARD-style Wi‑Fi fields.
export const wifiEsc = s => s.replace(/([\\;,:"])/g, '\\$1');
// The QR code content for a template and its field values.
export function qrPayload(tpl, f) {
  switch (tpl) {
    case 'wifi': {
      const sec = f.wsec;
      return `WIFI:T:${sec};S:${wifiEsc(f.ssid)};` + (sec === 'nopass' ? '' : `P:${wifiEsc(f.wpass)};`) + (f.whidden ? 'H:true;' : '') + ';';
    }
    case 'email': {
      const q = [['subject', f.esub], ['body', f.ebody]].filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v));
      return 'mailto:' + f.eto.trim() + (q.length ? '?' + q.join('&') : '');
    }
    case 'phone': return 'tel:' + f.tel.replace(/[^\d+]/g, '');
    case 'sms': return 'SMSTO:' + f.smsto.replace(/[^\d+]/g, '') + ':' + f.smsbody;
    default: return f.text;
  }
}

export function qrSvg(data, size, fg, bg, ecc) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const qr = qrcode(0, ecc);
  qr.addData(data); qr.make();
  const n = qr.getModuleCount(), quiet = 4, total = n + quiet * 2;
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="${bg}"/><path d="${path}" fill="${fg}"/></svg>`;
}

// The value a linear barcode encodes (Code 39 has no lowercase letters).
export const linearValue = (format, raw) => format === 'CODE39' ? raw.toUpperCase() : raw;

export function linearError(format, value) {
  if (!value) return 'Enter a value.';
  if (format === 'EAN13') return /^\d{12,13}$/.test(value) ? 'Invalid check digit: the last digit does not match. Enter the first 12 digits to have it calculated.' : 'EAN-13 needs 12 or 13 digits.';
  if (format === 'UPC') return /^\d{11,12}$/.test(value) ? 'Invalid check digit: the last digit does not match. Enter the first 11 digits to have it calculated.' : 'UPC-A needs 11 or 12 digits.';
  if (format === 'CODE39') return 'Code 39 supports only A–Z, 0–9, space and - . $ / + %.';
  return 'Code 128 supports only ASCII characters.';
}

// The message for an exception thrown while generating.
export const generateError = e => /overflow|too long|length/i.test(e.message || e) ? 'Too much data for a QR code. Shorten the text or lower the error correction.' : 'Could not generate: ' + (e.message || e);

export const fileBase = type => type === 'QR' ? 'qr-code' : 'barcode-' + type.toLowerCase();

function mount() {
  let currentSvg = null;

  const fields = () => ({
    text: $('text').value, ssid: $('ssid').value, wpass: $('wpass').value, wsec: $('wsec').value, whidden: $('whidden').checked,
    eto: $('eto').value, esub: $('esub').value, ebody: $('ebody').value, tel: $('tel').value, smsto: $('smsto').value, smsbody: $('smsbody').value,
  });

  function linearSvg(format, value, size, fg, bg) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    let valid = true;
    JsBarcode(el, value, {
      format, lineColor: fg, background: bg, width: Math.max(1, Math.round(size / 160)), height: Math.round(size / 3),
      displayValue: $('showText').checked, font: 'monospace', fontSize: Math.max(14, Math.round(size / 18)), margin: 12,
      valid: v => { valid = v; },
    });
    if (!valid) return null;
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return el.outerHTML;
  }

  function render() {
    const type = $('type').value, size = +$('size').value, fg = $('fg').value, bg = $('bg').value;
    const isQR = type === 'QR';
    $('tplWrap').hidden = $('eccWrap').hidden = !isQR;
    $('linear').hidden = $('showTextWrap').hidden = isQR;
    document.querySelectorAll('[data-tpl]').forEach(el => el.hidden = !isQR || el.dataset.tpl !== $('tpl').value);
    $('hint').textContent = HINTS[type] || '';
    $('sizeOut').textContent = size + ' px';

    let svg = null, error = '';
    try {
      if (isQR) {
        const data = qrPayload($('tpl').value, fields());
        if (!data) error = 'Enter some content.';
        else svg = qrSvg(data, size, fg, bg, $('ecc').value);
      } else {
        const value = linearValue(type, $('value').value);
        svg = value ? linearSvg(type, value, size, fg, bg) : null;
        if (!svg) error = linearError(type, value);
      }
    } catch (e) {
      error = generateError(e);
    }
    currentSvg = svg;
    $('preview').innerHTML = svg || '';
    $('error').textContent = error; $('error').hidden = !error;
    ['png', 'svg', 'copy'].forEach(id => $(id).disabled = !svg);
    $('copy').hidden = !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
  }

  function pngBlob() {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([currentSvg], { type: 'image/svg+xml' }));
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve(b) : reject(new Error('PNG export failed')), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('PNG export failed')); };
      img.src = url;
    });
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function flash(m) { $('msg').textContent = m; clearTimeout(flash.t); flash.t = setTimeout(() => $('msg').textContent = '', 2500); }

  $('png').onclick = async () => { try { download(await pngBlob(), fileBase($('type').value) + '.png'); } catch (e) { flash(e.message); } };
  $('svg').onclick = () => download(new Blob([currentSvg], { type: 'image/svg+xml' }), fileBase($('type').value) + '.svg');
  $('copy').onclick = async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]); flash('Copied.'); }
    catch { flash('Your browser did not allow copying the image.'); }
  };
  $('type').onchange = () => {
    const t = $('type').value;
    if (t !== 'QR') $('value').value = SAMPLES[t];
    render();
  };
  document.querySelectorAll('input, select, textarea').forEach(el => el.addEventListener('input', render));
  $('tpl').addEventListener('change', render);
  render();
}

if (globalThis.document) mount();
