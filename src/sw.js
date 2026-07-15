// Service worker template. scripts/generate.py fills in VERSION and PRECACHE
// and writes the result to /sw.js. Edit this file, not sw.js.
const VERSION = '3c9c7f30b391';
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
  "/bitcoin/",
  "/bitcoin/block-header/block-header.js",
  "/bitcoin/block-header/",
  "/bitcoin/lib/btc.css",
  "/bitcoin/lib/btc.js",
  "/bitcoin/lib/hd.js",
  "/bitcoin/lib/psbt.js",
  "/bitcoin/lib/sig.js",
  "/bitcoin/lib/ui.js",
  "/bitcoin/merkle-root/",
  "/bitcoin/merkle-root/merkle-root.js",
  "/bitcoin/target-adjustment/",
  "/bitcoin/target-adjustment/target-adjustment.js",
  "/bitcoin/target-bits/",
  "/bitcoin/target-bits/target-bits.js",
  "/bitcoin/transaction-builder/",
  "/bitcoin/transaction-builder/transaction-builder.js",
  "/crypto/",
  "/crypto/asn1-decoder/asn1-decoder.js",
  "/crypto/asn1-decoder/",
  "/crypto/der-signature/der-signature.js",
  "/crypto/der-signature/",
  "/crypto/ecdh/ecdh.js",
  "/crypto/ecdh/",
  "/crypto/encryption/encryption.js",
  "/crypto/encryption/",
  "/crypto/hash/hash.js",
  "/crypto/hash/",
  "/crypto/hmac/hmac.js",
  "/crypto/hmac/",
  "/crypto/kdf/",
  "/crypto/kdf/kdf.js",
  "/crypto/key-converter/",
  "/crypto/key-converter/key-converter.js",
  "/crypto/key-generator/",
  "/crypto/key-generator/key-generator.js",
  "/crypto/lib/asn1.js",
  "/crypto/lib/common.js",
  "/crypto/lib/keys.js",
  "/crypto/lib/keyview.js",
  "/crypto/lib/ui.css",
  "/crypto/modular-arithmetic/",
  "/crypto/modular-arithmetic/modular-arithmetic.js",
  "/crypto/password-hash/",
  "/crypto/password-hash/password-hash.js",
  "/crypto/password-hash/worker.js",
  "/crypto/random-generator/",
  "/crypto/random-generator/random-generator.js",
  "/crypto/secret-sharing/",
  "/crypto/secret-sharing/secret-sharing.js",
  "/crypto/sign-verify/",
  "/crypto/sign-verify/sign-verify.js",
  "/crypto/totp/",
  "/crypto/totp/totp.js",
  "/crypto/x509-decoder/",
  "/crypto/x509-decoder/x509-decoder.js",
  "/dev/",
  "/dev/base64/base64.js",
  "/dev/base64/",
  "/dev/bit/bit.js",
  "/dev/bit/",
  "/dev/byte/byte.js",
  "/dev/byte/",
  "/dev/cbor-decoder/cbor-decoder.js",
  "/dev/cbor-decoder/",
  "/dev/cron/cron.js",
  "/dev/cron/",
  "/dev/csv-json/csv-json.js",
  "/dev/csv-json/",
  "/dev/html-entities/html-entities.js",
  "/dev/html-entities/",
  "/dev/json-diff/",
  "/dev/json-diff/json-diff.js",
  "/dev/json-formatter/",
  "/dev/json-formatter/json-formatter.js",
  "/dev/jwt-decoder/",
  "/dev/jwt-decoder/jwt-decoder.js",
  "/dev/lib/bytes.js",
  "/dev/lib/cbor.js",
  "/dev/lib/cron.js",
  "/dev/lib/dev.css",
  "/dev/lib/diff.js",
  "/dev/lib/json.js",
  "/dev/lib/num.js",
  "/dev/lib/protobuf.js",
  "/dev/lib/time.js",
  "/dev/lib/ui.js",
  "/dev/little-endian/",
  "/dev/little-endian/little-endian.js",
  "/dev/number-converter/",
  "/dev/number-converter/number-converter.js",
  "/dev/protobuf-decoder/",
  "/dev/protobuf-decoder/protobuf-decoder.js",
  "/dev/regex-tester/",
  "/dev/regex-tester/regex-tester.js",
  "/dev/regex-tester/worker.js",
  "/dev/sql-formatter/",
  "/dev/sql-formatter/sql-formatter.js",
  "/dev/text-diff/",
  "/dev/text-diff/text-diff.js",
  "/dev/timestamp/",
  "/dev/timestamp/timestamp.js",
  "/dev/url-parser/",
  "/dev/url-parser/url-parser.js",
  "/dev/user-agent/",
  "/dev/user-agent/user-agent.js",
  "/dev/uuid/",
  "/dev/uuid/uuid.js",
  "/dev/yaml-json/",
  "/dev/yaml-json/yaml-json.js",
  "/utilities/",
  "/utilities/alarm/alarm.js",
  "/utilities/alarm/",
  "/utilities/archive/archive.js",
  "/utilities/archive/",
  "/utilities/barcode-generator/barcode-generator.js",
  "/utilities/barcode-generator/",
  "/utilities/barcode-reader/barcode-reader.js",
  "/utilities/barcode-reader/",
  "/utilities/break-time/break-time.js",
  "/utilities/break-time/",
  "/utilities/convert-media/convert-media.js",
  "/utilities/convert-media/",
  "/utilities/date-countdown/date-countdown.js",
  "/utilities/date-countdown/",
  "/utilities/encrypt-files/encrypt-files.js",
  "/utilities/encrypt-files/",
  "/utilities/find-duplicates/find-duplicates.js",
  "/utilities/find-duplicates/",
  "/utilities/make-gif/",
  "/utilities/make-gif/make-gif.js",
  "/utilities/recognize-text/",
  "/utilities/recognize-text/recognize-text.js",
  "/utilities/resize-images/",
  "/utilities/resize-images/resize-images.js",
  "/utilities/stopwatch/",
  "/utilities/stopwatch/stopwatch.js",
  "/utilities/timer/",
  "/utilities/timer/timer.js",
  "/utilities/transform-text/",
  "/utilities/transform-text/transform-text.js",
  "/utilities/unit-converter/",
  "/utilities/unit-converter/unit-converter.js",
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
