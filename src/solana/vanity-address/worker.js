// Vanity address search worker: tries random keypairs until the address matches.
import { ed25519 } from '../../assets/vendor/@noble/curves@2.4.0/ed25519.esm.js';
import { base58 } from '../../assets/vendor/@scure/base@2.4.0/index.esm.js';

const BATCH = 256;
let running = false;

self.onmessage = e => {
  if (e.data.type === 'stop') { running = false; return; }
  if (e.data.type !== 'start') return;
  const { prefix, suffix, caseSensitive } = e.data;
  const p = caseSensitive ? prefix : prefix.toLowerCase();
  const s = caseSensitive ? suffix : suffix.toLowerCase();
  running = true;
  let tried = 0, lastReport = performance.now();
  const seeds = new Uint8Array(32 * BATCH);

  function loop() {
    const until = performance.now() + 50;
    while (running && performance.now() < until) {
      crypto.getRandomValues(seeds);
      for (let i = 0; i < BATCH; i++) {
        const seed = seeds.subarray(i * 32, i * 32 + 32);
        const pub = ed25519.getPublicKey(seed);
        const addr = base58.encode(pub);
        const a = caseSensitive ? addr : addr.toLowerCase();
        tried++;
        if (a.startsWith(p) && a.endsWith(s)) {
          running = false;
          self.postMessage({ type: 'found', tried, address: addr, seed: Array.from(seed), publicKey: Array.from(pub) });
          return;
        }
      }
    }
    const now = performance.now();
    if (now - lastReport > 250) { self.postMessage({ type: 'progress', tried }); tried = 0; lastReport = now; }
    if (running) setTimeout(loop, 0);
    else self.postMessage({ type: 'progress', tried });
  }
  loop();
};
