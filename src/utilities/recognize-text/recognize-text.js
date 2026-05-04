// Recognize Text: extract text from an image with Tesseract.js (OCR).
// The vendored tesseract.min.js is a classic script that defines the Tesseract global.
const $ = id => document.getElementById(id);
export const LANGS = [
  ['eng', 'English'], ['rus', 'Russian'], ['ukr', 'Ukrainian'], ['deu', 'German'], ['fra', 'French'],
  ['spa', 'Spanish'], ['ita', 'Italian'], ['por', 'Portuguese'], ['pol', 'Polish'], ['nld', 'Dutch'],
  ['tur', 'Turkish'], ['chi_sim', 'Chinese (Simplified)'], ['jpn', 'Japanese'], ['kor', 'Korean'],
];
const KEY = 'toolbox.ocrLangs';

export const STATUS = {
  'loading tesseract core': 'Loading OCR engine…', 'initializing tesseract': 'Starting OCR engine…',
  'loading language traineddata': 'Downloading language data…', 'initializing api': 'Preparing…',
  'recognizing text': 'Recognizing text…',
};
// The status line for a Tesseract progress message (unknown steps show nothing).
export const statusText = m => STATUS[m.status] || '';

// The language checkboxes, with the saved languages ticked.
export function langsHtml(chosen) {
  return LANGS.map(([code, name]) =>
    `<label><input type="checkbox" value="${code}" ${chosen.includes(code) ? 'checked' : ''}> ${name}</label>`).join('');
}

// The status and error shown for a recognition result.
export function resultMessages(rawText, confidence) {
  const text = rawText.trim();
  return {
    text,
    status: text ? `Done · ${Math.round(confidence)}% confidence` : '',
    error: text ? '' : 'No text was found. Try a sharper image or a different language.',
  };
}
export const failureMessage = e => 'Recognition failed: ' + (e.message || e);

function mount() {
  let chosen;
  try { chosen = JSON.parse(localStorage.getItem(KEY)) || ['eng']; } catch { chosen = ['eng']; }
  $('langs').innerHTML = langsHtml(chosen);

  let image = null, worker = null, workerLangs = '';

  function selectedLangs() { return [...document.querySelectorAll('#langs input:checked')].map(i => i.value); }
  function showError(m) { $('error').textContent = m || ''; $('error').hidden = !m; }
  function updateRun() { $('run').disabled = !image || !selectedLangs().length; }
  function flash(m) { $('msg').textContent = m; clearTimeout(flash.t); flash.t = setTimeout(() => $('msg').textContent = '', 2000); }

  function setImage(file) {
    if (!file || !file.type.startsWith('image/')) { showError('Please choose an image file.'); return; }
    showError('');
    image = file;
    $('preview').src = URL.createObjectURL(file); $('preview').hidden = false;
    updateRun();
  }
  $('file').onchange = e => { setImage(e.target.files[0]); e.target.value = ''; };
  const drop = $('drop');
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); setImage(e.dataTransfer.files[0]); };
  document.addEventListener('paste', e => {
    if (e.target.closest('textarea, input')) return;
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) setImage(item.getAsFile());
  });
  $('langs').onchange = () => {
    try { localStorage.setItem(KEY, JSON.stringify(selectedLangs())); } catch {}
    updateRun();
  };

  function onProgress(m) {
    $('status').textContent = statusText(m);
    if (typeof m.progress === 'number') $('progress').value = m.progress;
  }
  async function getWorker(langs) {
    const key = langs.join('+');
    if (worker && workerLangs === key) return worker;
    if (worker) { await worker.terminate(); worker = null; }
    worker = await Tesseract.createWorker(langs, 1, {
      workerPath: '../../assets/vendor/tesseract.js@5.1.1/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
      logger: onProgress,
    });
    workerLangs = key;
    return worker;
  }

  $('run').onclick = async () => {
    const langs = selectedLangs();
    $('run').disabled = true; showError('');
    $('progress').hidden = false; $('progress').value = 0;
    try {
      const w = await getWorker(langs);
      const { data } = await w.recognize(image);
      const r = resultMessages(data.text, data.confidence);
      $('text').value = r.text; $('out').hidden = false;
      $('status').textContent = r.status;
      if (r.error) showError(r.error);
    } catch (e) {
      worker = null; workerLangs = '';
      $('status').textContent = '';
      showError(failureMessage(e));
    } finally {
      $('progress').hidden = true; updateRun();
    }
  };
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('text').value); flash('Copied.'); }
    catch { $('text').select(); flash('Press ⌘C / Ctrl+C to copy.'); }
  };
  $('download').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([$('text').value], { type: 'text/plain;charset=utf-8' }));
    a.download = 'recognized-text.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}

if (globalThis.document) mount();
