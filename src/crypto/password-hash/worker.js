// Runs the slow password hashes off the main thread so the page stays responsive.
importScripts('../../assets/vendor/hash-wasm@4.12.0/dist/index.umd.min.js');

const b64 = b => btoa(String.fromCharCode(...b)).replace(/=+$/, '');
const unb64 = s => Uint8Array.from(atob(s + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

async function scryptRaw(password, salt, ln, r, p, len) {
  return hashwasm.scrypt({ password, salt, costFactor: 2 ** ln, blockSize: r, parallelism: p, hashLength: len, outputType: 'binary' });
}

onmessage = async ({ data }) => {
  const t0 = performance.now();
  try {
    let result;
    if (data.op === 'hash') {
      const { algo, password, salt, params } = data;
      if (algo.startsWith('argon2')) {
        result = await hashwasm[algo]({ password, salt, parallelism: params.p, iterations: params.t, memorySize: params.m, hashLength: params.len, outputType: 'encoded' });
      } else if (algo === 'bcrypt') {
        result = await hashwasm.bcrypt({ password, salt, costFactor: params.cost, outputType: 'encoded' });
      } else if (algo === 'scrypt') {
        const h = await scryptRaw(password, salt, params.ln, params.r, params.p, params.len);
        result = `$scrypt$ln=${params.ln},r=${params.r},p=${params.p}$${b64(salt)}$${b64(h)}`;
      }
    } else if (data.op === 'verify') {
      const { kind, password, hash } = data;
      if (kind === 'argon2') result = await hashwasm.argon2Verify({ password, hash });
      else if (kind === 'bcrypt') result = await hashwasm.bcryptVerify({ password, hash: hash.replace(/^\$2[xy]\$/, '$2b$') });
      else if (kind === 'scrypt') {
        const m = hash.match(/^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/);
        const expected = unb64(m[5]);
        const h = await scryptRaw(password, unb64(m[4]), +m[1], +m[2], +m[3], expected.length);
        result = eq(h, expected);
      }
    }
    postMessage({ id: data.id, result, ms: performance.now() - t0 });
  } catch (e) {
    postMessage({ id: data.id, error: e.message || String(e) });
  }
};
