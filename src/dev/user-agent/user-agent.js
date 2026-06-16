// User-Agent Parser: parse a User-Agent string (uses the vendored UAParser, loaded as a classic script).
import { $, renderRows } from '../lib/ui.js';

const v = (...xs) => xs.filter(Boolean).join(' ') || '—';

/** Rows describing a User-Agent string, parsed with the UAParser constructor; null for empty input. */
export function uaRows(UAParser, text) {
  const ua = text.trim();
  if (!ua) return null;
  const r = new UAParser(ua).getResult();
  const bot = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit/i.test(ua);
  return [
    { label: 'Browser', value: v(r.browser.name, r.browser.version), copy: false },
    { label: 'Engine', value: v(r.engine.name, r.engine.version), copy: false },
    { label: 'Operating system', value: v(r.os.name, r.os.version), copy: false },
    { label: 'Device', value: v(r.device.vendor, r.device.model) === '—' ? (r.device.type ? r.device.type : 'Desktop (or unknown)') : v(r.device.vendor, r.device.model) + (r.device.type ? ` (${r.device.type})` : ''), copy: false },
    { label: 'CPU', value: r.cpu.architecture || '—', copy: false },
    bot && { label: 'Bot', value: 'Looks like a crawler or bot', copy: false },
  ];
}

/** Rows for the browser's client hints: navigator.userAgentData and its high-entropy values. */
export function hintRows(d, high = {}) {
  return [
    { label: 'Brands', value: (high.fullVersionList || d.brands).map(b => `${b.brand} ${b.version}`).join(', '), copy: false },
    { label: 'Platform', value: v(d.platform, high.platformVersion), copy: false },
    { label: 'Mobile', value: d.mobile ? 'Yes' : 'No', copy: false },
    high.architecture && { label: 'Architecture', value: `${high.architecture}${high.bitness ? ` (${high.bitness}-bit)` : ''}`, copy: false },
    high.model && { label: 'Model', value: high.model, copy: false },
  ];
}

async function mount() {
  await new Promise(r => window.UAParser ? r() : addEventListener('load', r, { once: true }));
  function run() {
    const rows = uaRows(window.UAParser, $('in').value);
    if (!rows) { $('out').innerHTML = ''; return; }
    renderRows($('out'), rows);
  }
  $('in').addEventListener('input', run);
  $('mine').onclick = () => { $('in').value = navigator.userAgent; run(); };
  document.querySelectorAll('[data-ua]').forEach(b => b.onclick = () => { $('in').value = b.dataset.ua; run(); });
  $('in').value = navigator.userAgent; run();
  if (navigator.userAgentData) {
    const d = navigator.userAgentData;
    let high = {};
    try { high = await d.getHighEntropyValues(['platformVersion', 'architecture', 'model', 'fullVersionList', 'bitness']); } catch {}
    renderRows($('hints'), hintRows(d, high));
    $('hintsBox').hidden = false;
  }
}

if (globalThis.document) mount();
