// Barcode Reader: scan QR codes and barcodes from images or the camera (BarcodeDetector or ZXing).
const $ = id => document.getElementById(id);
export const FORMAT_NAMES = {
  qr_code: 'QR code', ean_13: 'EAN-13', ean_8: 'EAN-8', upc_a: 'UPC-A', upc_e: 'UPC-E', code_128: 'Code 128',
  code_39: 'Code 39', code_93: 'Code 93', codabar: 'Codabar', itf: 'ITF', data_matrix: 'Data Matrix',
  aztec: 'Aztec', pdf417: 'PDF417', micro_qr_code: 'Micro QR', databar: 'DataBar',
};
const PONYFILL = '../../assets/vendor/barcode-detector@3.2.3/dist/iife/ponyfill.js';

export const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const isUrl = s => { try { return ['http:', 'https:'].includes(new URL(s).protocol); } catch { return false; } };
export const formatName = format => FORMAT_NAMES[format] || format;

// The camera keeps seeing the same code; ignore it while it was last seen less than 3 s ago.
export const isRepeat = (lastSeen, value, now) => value === lastSeen.value && now - lastSeen.at < 3000;

// The scan history, newest first.
export function resultsHtml(scans) {
  return scans.map((h, i) => `
    <div class="item result">
      <div class="format">${esc(h.format)} · ${h.time.toLocaleTimeString('en-GB')}</div>
      <div class="value mono">${esc(h.value)}</div>
      <div class="row">
        <button data-copy="${i}">Copy</button>
        ${isUrl(h.value) ? `<a class="btn" href="${esc(h.value)}" target="_blank" rel="noopener noreferrer">Open link</a>` : ''}
      </div>
    </div>`).join('');
}

export const cameraError = e => e.name === 'NotAllowedError' ? 'Camera access was denied. Allow it in your browser settings and try again.' : 'Could not start the camera.';

function mount() {
  let detectorPromise = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the barcode library.'));
      document.head.append(s);
    });
  }
  function getDetector() {
    return detectorPromise ||= (async () => {
      if ('BarcodeDetector' in window) {
        try {
          const formats = await BarcodeDetector.getSupportedFormats();
          if (formats.length) { $('engine').textContent = 'Using your browser’s built-in barcode detector.'; return new BarcodeDetector({ formats }); }
        } catch {}
      }
      await loadScript(PONYFILL);
      // Load the ZXing engine from our own copy instead of the library's default CDN.
      BarcodeDetectionAPI.setZXingModuleOverrides({ locateFile: (file, prefix) =>
        file.endsWith('.wasm') ? new URL('../../assets/vendor/zxing-wasm@3.1.6/dist/reader/' + file, location.href).href : prefix + file });
      const D = BarcodeDetectionAPI.BarcodeDetector;
      $('engine').textContent = 'Using the ZXing barcode library.';
      return new D({ formats: await D.getSupportedFormats() });
    })();
  }

  const scans = [];
  let lastSeen = { value: null, at: 0 };

  function addResult(code) {
    const now = Date.now();
    if (isRepeat(lastSeen, code.rawValue, now)) { lastSeen.at = now; return false; }
    lastSeen = { value: code.rawValue, at: now };
    scans.unshift({ value: code.rawValue, format: formatName(code.format), time: new Date() });
    renderResults();
    return true;
  }
  function renderResults() {
    $('results').innerHTML = resultsHtml(scans);
  }
  $('results').onclick = async e => {
    const i = e.target.dataset.copy;
    if (i === undefined) return;
    try { await navigator.clipboard.writeText(scans[+i].value); e.target.textContent = 'Copied'; }
    catch { e.target.textContent = 'Copy failed'; }
    setTimeout(() => e.target.textContent = 'Copy', 1500);
  };
  function showError(m) { $('error').textContent = m || ''; $('error').hidden = !m; }

  // Image input
  async function scanFile(file) {
    if (!file || !file.type.startsWith('image/')) { showError('Please choose an image file.'); return; }
    showError('');
    $('thumb').src = URL.createObjectURL(file); $('thumb').hidden = false;
    try {
      const [detector, bitmap] = await Promise.all([getDetector(), createImageBitmap(file)]);
      const codes = await detector.detect(bitmap);
      if (!codes.length) { showError('No barcode found in this image. Try a sharper or closer image.'); return; }
      lastSeen = { value: null, at: 0 };
      codes.forEach(addResult);
    } catch (e) { showError(e.message || 'Could not read this image.'); }
  }
  $('file').onchange = e => { scanFile(e.target.files[0]); e.target.value = ''; };
  const drop = $('drop');
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); scanFile(e.dataTransfer.files[0]); };
  document.addEventListener('paste', e => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) scanFile(item.getAsFile());
  });

  // Camera
  let stream = null, scanTimer = null;
  async function startCamera(deviceId) {
    stopCamera();
    showError('');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }, audio: false,
      });
    } catch (e) {
      showError(cameraError(e));
      return;
    }
    const video = $('video');
    video.srcObject = stream; await video.play();
    $('videoWrap').hidden = false; $('cam').textContent = 'Stop camera';
    await listCameras(stream.getVideoTracks()[0].getSettings().deviceId);
    const detector = await getDetector();
    let busy = false;
    scanTimer = setInterval(async () => {
      if (busy || video.readyState < 2) return;
      busy = true;
      try { (await detector.detect(video)).forEach(addResult); } catch {}
      busy = false;
    }, 250);
  }
  function stopCamera() {
    clearInterval(scanTimer); scanTimer = null;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; $('videoWrap').hidden = true; $('cam').textContent = 'Start camera';
  }
  async function listCameras(activeId) {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    $('cams').innerHTML = cams.map((c, i) => `<option value="${c.deviceId}">${esc(c.label || 'Camera ' + (i + 1))}</option>`).join('');
    $('cams').value = activeId || '';
    $('cams').hidden = cams.length < 2;
  }
  $('cam').onclick = () => stream ? stopCamera() : startCamera();
  $('cams').onchange = () => startCamera($('cams').value);
  if (!navigator.mediaDevices?.getUserMedia) { $('cam').disabled = true; $('cam').title = 'Camera is not available in this browser'; }

  getDetector().catch(e => showError(e.message));
}

if (globalThis.document) mount();
