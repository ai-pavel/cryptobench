// Service worker template. scripts/generate.py fills in VERSION and PRECACHE
// and writes the result to /sw.js. Edit this file, not sw.js.
const VERSION = '0b8004aa789c';
const SITE_CACHE = 'site-' + VERSION;
// Heavy, version-pinned files that tools download on first use (the ffmpeg core,
// the OCR engine and its language data). Cached once and kept across site updates.
const RUNTIME_CACHE = 'runtime-v1';
const RUNTIME_PREFIXES = [
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@',
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/',
  'https://tessdata.projectnaptha.com/',
];
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/assets/pwa.js",
  "/assets/search-index.js",
  "/assets/search.js",
  "/assets/style.css",
  "/assets/tools.json",
  "/assets/icons/apple-touch-icon.png",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/maskable-512.png",
  "/assets/icons/robot.svg",
  "/assets/vendor/@noble/ciphers@2.4.0/aes.esm.js",
  "/assets/vendor/@noble/ciphers@2.4.0/chacha.esm.js",
  "/assets/vendor/@noble/curves@1.9.0/secp256k1.esm.js",
  "/assets/vendor/@noble/curves@1.9.0/abstract/modular.esm.js",
  "/assets/vendor/@noble/curves@1.9.1/secp256k1.esm.js",
  "/assets/vendor/@noble/curves@1.9.7/ed25519.esm.js",
  "/assets/vendor/@noble/curves@1.9.7/secp256k1.esm.js",
  "/assets/vendor/@noble/curves@2.4.0/ed25519.esm.js",
  "/assets/vendor/@noble/curves@2.4.0/nist.esm.js",
  "/assets/vendor/@noble/curves@2.4.0/secp256k1.esm.js",
  "/assets/vendor/@noble/curves@2.4.0/utils.esm.js",
  "/assets/vendor/@noble/curves@2.4.0/abstract/modular.esm.js",
  "/assets/vendor/@noble/hashes@1.8.0/blake2b.esm.js",
  "/assets/vendor/@noble/hashes@1.8.0/crypto.esm.js",
  "/assets/vendor/@noble/hashes@1.8.0/hmac.esm.js",
  "/assets/vendor/@noble/hashes@1.8.0/legacy.esm.js",
  "/assets/vendor/@noble/hashes@1.8.0/pbkdf2.esm.js",
  "/assets/vendor/@noble/hashes@1.8.0/sha2.esm.js",
  "/assets/vendor/@noble/hashes@1.8.0/sha3.esm.js",
  "/assets/vendor/@noble/hashes@1.8.0/utils.esm.js",
  "/assets/vendor/@noble/hashes@2.4.0/blake2.esm.js",
  "/assets/vendor/@noble/hashes@2.4.0/hkdf.esm.js",
  "/assets/vendor/@noble/hashes@2.4.0/hmac.esm.js",
  "/assets/vendor/@noble/hashes@2.4.0/legacy.esm.js",
  "/assets/vendor/@noble/hashes@2.4.0/pbkdf2.esm.js",
  "/assets/vendor/@noble/hashes@2.4.0/sha2.esm.js",
  "/assets/vendor/@noble/hashes@2.4.0/sha3.esm.js",
  "/assets/vendor/@noble/hashes@2.4.0/utils.esm.js",
  "/assets/vendor/@noble/hashes@2.4.0/webcrypto.esm.js",
  "/assets/vendor/@scure/base@1.2.5/index.esm.js",
  "/assets/vendor/@scure/base@1.2.6/index.esm.js",
  "/assets/vendor/@scure/base@2.4.0/index.esm.js",
  "/assets/vendor/@scure/bip32@1.7.0/index.esm.js",
  "/assets/vendor/@scure/bip32@2.4.0/index.esm.js",
  "/assets/vendor/@scure/bip39@1.6.0/index.esm.js",
  "/assets/vendor/@scure/bip39@1.6.0/wordlists/english.esm.js",
  "/assets/vendor/@scure/bip39@2.4.0/index.esm.js",
  "/assets/vendor/@scure/bip39@2.4.0/wordlists/english.esm.js",
  "/assets/vendor/@scure/btc-signer@1.8.1/index.esm.js",
  "/assets/vendor/@scure/sr25519@2.4.0/index.esm.js",
  "/assets/vendor/barcode-detector@3.2.3/dist/iife/ponyfill.js",
  "/assets/vendor/fflate@0.8.3/esm/browser.js",
  "/assets/vendor/fflate@0.8.3/umd/index.js",
  "/assets/vendor/gifenc@1.0.3/dist/gifenc.esm.js",
  "/assets/vendor/hash-wasm@4.12.0/dist/index.umd.min.js",
  "/assets/vendor/js-yaml@4.1.0/index.esm.js",
  "/assets/vendor/jsbarcode@3.11.6/dist/JsBarcode.all.min.js",
  "/assets/vendor/micro-packed@0.7.3/index.esm.js",
  "/assets/vendor/qrcode-generator@1.4.4/qrcode.js",
  "/assets/vendor/sql-formatter@15.9.0/dist/sql-formatter.min.js",
  "/assets/vendor/tesseract.js@5.1.1/dist/tesseract.min.js",
  "/assets/vendor/tesseract.js@5.1.1/dist/worker.min.js",
  "/assets/vendor/ua-parser-js@1.0.41/dist/ua-parser.min.js",
  "/assets/vendor/zxing-wasm@3.1.6/dist/reader/zxing_reader.wasm",
  "/utilities/",
  "/utilities/alarm/alarm.js",
  "/utilities/alarm/",
  "/utilities/break-time/break-time.js",
  "/utilities/break-time/",
  "/utilities/date-countdown/date-countdown.js",
  "/utilities/date-countdown/",
  "/utilities/recognize-text/",
  "/utilities/recognize-text/recognize-text.js",
  "/utilities/stopwatch/",
  "/utilities/stopwatch/stopwatch.js",
  "/utilities/timer/",
  "/utilities/timer/timer.js",
  "/utilities/transform-text/",
  "/utilities/transform-text/transform-text.js",
  "/utilities/vendor/ffmpeg/loader.js",
  "/utilities/vendor/ffmpeg/ffmpeg/classes.js",
  "/utilities/vendor/ffmpeg/ffmpeg/const.js",
  "/utilities/vendor/ffmpeg/ffmpeg/empty.mjs",
  "/utilities/vendor/ffmpeg/ffmpeg/errors.js",
  "/utilities/vendor/ffmpeg/ffmpeg/index.js",
  "/utilities/vendor/ffmpeg/ffmpeg/types.js",
  "/utilities/vendor/ffmpeg/ffmpeg/utils.js",
  "/utilities/vendor/ffmpeg/ffmpeg/worker.js",
  "/utilities/vendor/ffmpeg/util/const.js",
  "/utilities/vendor/ffmpeg/util/errors.js",
  "/utilities/vendor/ffmpeg/util/index.js",
  "/utilities/vendor/ffmpeg/util/types.js",
  "/utilities/world-time/",
  "/utilities/world-time/world-time.js"
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SITE_CACHE)
      .then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('site-') && key !== SITE_CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function fromSite(request) {
  const cached = await caches.match(request, { cacheName: SITE_CACHE, ignoreSearch: true });
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch (err) {
    // Offline and not cached: send page loads to the home page, which is always cached.
    if (request.mode === 'navigate') return Response.redirect('/', 302);
    throw err;
  }
}

async function fromRuntime(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  // Request in CORS mode: importScripts() asks for these with no-cors, which yields an
  // opaque response we couldn't check. jsDelivr sends CORS headers, so this always works.
  const response = await fetch(request.url, { mode: 'cors', credentials: 'omit' });
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(fromSite(request));
  } else if (RUNTIME_PREFIXES.some(prefix => request.url.startsWith(prefix))) {
    event.respondWith(fromRuntime(request));
  }
});
