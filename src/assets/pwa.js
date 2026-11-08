// Registers the service worker that makes the site installable and usable offline.
// sw.js sits at the site root, one level above this file; resolving it from here
// keeps the site working under any base path.
const SW_URL = new URL('../sw.js', document.currentScript.src);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL).catch(() => {});
  });
}
