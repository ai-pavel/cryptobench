// Checksum Address: validate an address and convert it to its EIP-55 checksummed form.
import { toChecksumAddress, strip0x } from '../lib/evm.js';
import { $, esc, renderRows, live } from '../lib/ui.js';

/**
 * Check an address's EIP-55 checksum.
 * Returns null for empty input; otherwise the checksummed and lowercase forms, a
 * status (ok, warn: no checksum, bad: wrong case) with its message, and which
 * characters of the input have the wrong case.
 */
export function checkAddress(raw) {
  raw = raw.trim();
  if (!raw) return null;
  const checksummed = toChecksumAddress(raw);
  const body = strip0x(raw), csBody = checksummed.slice(2);
  const lower = body === body.toLowerCase(), upper = body === body.toUpperCase();
  const wrong = [...body].map((c, i) => c !== csBody[i]);
  const nWrong = wrong.filter(Boolean).length;
  let status, message;
  if (body === csBody) { status = 'ok'; message = '✅ Valid checksum'; }
  else if (lower || upper) { status = 'warn'; message = `⚠️ No checksum (all ${lower ? 'lowercase' : 'uppercase'}). The address is valid, but typos can't be detected. Use the checksummed form below.`; }
  else { status = 'bad'; message = `❌ Invalid checksum: ${nWrong} letter${nWrong === 1 ? ' has' : 's have'} the wrong case. This may be a typo; double-check the address.`; }
  return { checksummed, lowercase: checksummed.toLowerCase(), body, wrong: status === 'bad' ? wrong : null, status, message };
}

function mount() {
  const run = live([$('addr')], () => {
    const status = $('status');
    status.hidden = true;
    const r = checkAddress($('addr').value);
    if (!r) { $('out').innerHTML = ''; return; }
    status.hidden = false;
    status.className = `status ${r.status}`;
    status.textContent = r.message;
    renderRows($('out'), [{ label: 'Checksummed', value: r.checksummed }, { label: 'Lowercase', value: r.lowercase }]);
    if (r.wrong) {
      const marked = '0x' + [...r.body].map((c, i) => r.wrong[i] ? `<span class="mark">${esc(c)}</span>` : esc(c)).join('');
      $('out').insertAdjacentHTML('beforeend', `<div class="kv"><div class="k">Wrong case</div><div class="v">${marked}</div><span></span></div>`);
    }
  }, { errEl: $('err'), outEl: $('out') });

  // Example: a test vector from EIP-55 itself.
  $('example').onclick = () => {
    $('addr').value = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
    run();
  };
}

if (globalThis.document) mount();
