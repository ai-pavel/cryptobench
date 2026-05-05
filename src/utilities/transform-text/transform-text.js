// Transform Text: change case, clean up lines and encode text in place.
const $ = id => document.getElementById(id);

export const words = s => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const lines = (s, f) => s.split('\n').map(f).join('\n');
export const OPS = {
  upper: s => s.toUpperCase(),
  lower: s => s.toLowerCase(),
  title: s => s.toLowerCase().replace(/(^|[\s\-("'])(\p{L})/gu, (m, p, c) => p + c.toUpperCase()),
  sentence: s => s.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, p, c) => p + c.toUpperCase()),
  camel: s => lines(s, l => words(l).map((w, i) => i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).join('')),
  snake: s => lines(s, l => words(l).join('_').toLowerCase()),
  kebab: s => lines(s, l => words(l).join('-').toLowerCase()),
  trim: s => lines(s, l => l.trim()),
  spaces: s => lines(s, l => l.replace(/[ \t]+/g, ' ')),
  empty: s => s.split('\n').filter(l => l.trim()).join('\n'),
  sort: s => s.split('\n').sort((a, b) => a.localeCompare(b)).join('\n'),
  unique: s => [...new Set(s.split('\n'))].join('\n'),
  reverseLines: s => s.split('\n').reverse().join('\n'),
  reverse: s => [...s].reverse().join(''),
  b64e: s => { let b = ''; new TextEncoder().encode(s).forEach(c => b += String.fromCharCode(c)); return btoa(b); },
  b64d: s => new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(s.trim()), c => c.charCodeAt(0))),
  urle: s => encodeURIComponent(s),
  urld: s => decodeURIComponent(s),
};

// The character, word and line counts shown under the text.
export function statsText(s) {
  return `${[...s].length} characters · ${(s.match(/\S+/g) || []).length} words · ${s ? s.split('\n').length : 0} lines`;
}

function mount() {
  const text = $('text');
  const undoStack = [];

  function flash(m) { $('msg').textContent = m; clearTimeout(flash.t); flash.t = setTimeout(() => $('msg').textContent = '', 2000); }
  function stats() {
    $('stats').textContent = statsText(text.value);
  }

  document.querySelectorAll('[data-op]').forEach(b => b.onclick = () => {
    try {
      const out = OPS[b.dataset.op](text.value);
      if (out === text.value) return;
      undoStack.push(text.value); $('undo').disabled = false;
      text.value = out; stats();
    } catch { flash('Could not transform: the input is not valid for this operation.'); }
  });
  $('undo').onclick = () => { text.value = undoStack.pop(); $('undo').disabled = !undoStack.length; stats(); };
  $('clear').onclick = () => { if (text.value) { undoStack.push(text.value); $('undo').disabled = false; } text.value = ''; stats(); };
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(text.value); flash('Copied.'); }
    catch { text.select(); flash('Press ⌘C / Ctrl+C to copy.'); }
  };
  text.oninput = stats;
  stats();
}

if (globalThis.document) mount();
