// Modular Arithmetic: inverse, power, reduction, gcd and square roots modulo n, with BigInt.
import { kvTable, wireCopy, showError, esc } from '../lib/common.js';

export const big = (s, label) => {
  const t = s.trim().replace(/[\s_,]/g, '');
  if (!t) throw new Error(`${label} is empty.`);
  if (!/^-?(0x[0-9a-fA-F]+|\d+)$/.test(t)) throw new Error(`${label} must be a decimal or 0x-hex integer.`);
  return t.startsWith('-') ? -BigInt(t.slice(1)) : BigInt(t);
};
export const mod = (a, n) => ((a % n) + n) % n;
export function powmod(b, e, m) { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
export function egcd(a, b, steps) {
  let [r0, r1, s0, s1, t0, t1] = [a, b, 1n, 0n, 0n, 1n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    if (steps.length < 200) steps.push([q, r0, r1, s0, t0]);
    [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; [t0, t1] = [t1, t0 - q * t1];
  }
  return { g: r0, x: s0, y: t0 };
}
export function isProbablePrime(n) {
  if (n < 2n) return false;
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) { if (n === p) return true; if (n % p === 0n) return false; }
  let d = n - 1n, r = 0;
  while (!(d & 1n)) { d >>= 1n; r++; }
  for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    let x = powmod(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let ok = false;
    for (let i = 1; i < r; i++) { x = x * x % n; if (x === n - 1n) { ok = true; break; } }
    if (!ok) return false;
  }
  return true;
}
export function sqrtmod(a, p) {
  a = mod(a, p);
  if (a === 0n) return 0n;
  if (p === 2n) return a;
  if (powmod(a, (p - 1n) / 2n, p) !== 1n) return null;
  if (p % 4n === 3n) return powmod(a, (p + 1n) / 4n, p);
  let q = p - 1n, s = 0n;
  while (!(q & 1n)) { q >>= 1n; s++; }
  let z = 2n;
  while (powmod(z, (p - 1n) / 2n, p) !== p - 1n) z++;
  let m = s, c = powmod(z, q, p), t = powmod(a, q, p), r = powmod(a, (q + 1n) / 2n, p);
  while (t !== 1n) {
    let i = 0n, t2 = t;
    while (t2 !== 1n) { t2 = t2 * t2 % p; i++; }
    const b = powmod(c, 1n << (m - i - 1n), p);
    m = i; c = b * b % p; t = t * c % p; r = r * b % p;
  }
  return r;
}
export const both = (label, v, note) => [[`${label} (decimal)`, v.toString(), note], [`${label} (hex)`, '0x' + v.toString(16)]];


/**
 * Compute op ('inv', 'pow', 'mod', 'gcd' or 'sqrt') for the typed a, b and n.
 * Returns the output rows and, for the inverse, the extended Euclid steps; throws on bad input.
 */
export function calculate(op, aText, bText, nText) {
  const a = big(aText, 'a'), n = big(nText, op === 'sqrt' ? 'p' : 'n');
  if (n <= 0n) throw new Error('The modulus must be positive.');
  let rows = [], steps = null;
  if (op === 'inv') {
    steps = [];
    const { g, x } = egcd(mod(a, n), n, steps);
    if (g !== 1n) throw new Error(`No inverse: gcd(a, n) = ${g}, not 1.`);
    const inv = mod(x, n);
    rows = [...both('a⁻¹ mod n', inv), ['Check', `a · a⁻¹ mod n = ${mod(a * inv, n)}`]];
  } else if (op === 'pow') {
    const b = big(bText, 'b');
    if (b < 0n) {
      const { g, x } = egcd(mod(a, n), n, []);
      if (g !== 1n) throw new Error('Negative exponent needs an inverse, but gcd(a, n) ≠ 1.');
      rows = both('aᵇ mod n', powmod(mod(x, n), -b, n));
    } else rows = both('aᵇ mod n', powmod(a, b, n));
  } else if (op === 'mod') rows = both('a mod n', mod(a, n), 'always in 0 … n−1');
  else if (op === 'gcd') {
    const { g, x, y } = egcd(a < 0n ? -a : a, n, []);
    rows = [...both('gcd(a, n)', g), ...both('lcm(a, n)', g ? (a < 0n ? -a : a) / g * n : 0n), ['Bézout', `${x} · a + ${y} · n = ${g}`]];
  } else {
    if (!isProbablePrime(n)) throw new Error('p is not prime (Miller–Rabin); square roots here need a prime modulus.');
    const r = sqrtmod(a, n);
    if (r === null) throw new Error('a has no square root mod p (it is a quadratic non-residue).');
    const other = mod(-r, n);
    rows = [...both('√a mod p', r < other ? r : other, 'smaller root'), ...both('other root', r < other ? other : r, 'p − root'), ['Check', `root² mod p = ${r * r % n}`]];
  }
  return { rows, steps };
}

export function stepsHtml(steps) {
  return `<p class="section-title">Extended Euclid${steps.length >= 200 ? ' (first 200 steps)' : ''}</p><div style="overflow-x:auto"><table><thead><tr><th>q</th><th>r₀</th><th>r₁</th><th>s</th></tr></thead><tbody>${steps.map(s => `<tr>${s.slice(0, 4).map(v => `<td class="mono" style="font-size:12px;overflow-wrap:anywhere">${esc(v.toString())}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function mount() {
  const $ = id => document.getElementById(id);
  function render() {
    showError($('err'), ''); $('out').innerHTML = ''; $('steps').innerHTML = '';
    const op = $('op').value;
    $('bField').hidden = op !== 'pow';
    $('nLabel').textContent = op === 'sqrt' ? 'p — prime modulus' : 'n — modulus';
    try {
      const { rows, steps } = calculate(op, $('a').value, $('b').value, $('n').value);
      if (steps) $('steps').innerHTML = stepsHtml(steps);
      $('out').innerHTML = kvTable(rows);
    } catch (e) { showError($('err'), e.message); }
  }
  $('preset').oninput = () => { if ($('preset').value) $('n').value = $('preset').value; render(); };
  for (const id of ['op', 'a', 'b', 'n']) $(id).addEventListener('input', () => { if (id === 'n') $('preset').value = ''; render(); });
  wireCopy();
  render();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // Inverse of 3 modulo the secp256k1 group order.
  $('example').onclick = () => {
    exSet('op', 'inv'); exSet('a', '3');
    exSet('preset', '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
    exSet('n', '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'); render();
  };
}

if (globalThis.document) mount();
