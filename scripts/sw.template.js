// Service worker template. scripts/generate.py fills in VERSION and PRECACHE
// and writes the result to /sw.js. Edit this file, not sw.js.
const VERSION = '__VERSION__';
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
const PRECACHE = __PRECACHE__;

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
