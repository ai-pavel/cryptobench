// Transaction Builder: build an unsigned transaction and PSBT from inputs and outputs, and optionally sign it.
import * as btc from '../../assets/vendor/@scure/btc-signer@1.8.1/index.esm.js';
import { secp256k1, hexToBytes, bytesToHex, parseInteger, parseAmount, addressToScript, networkOptions, parseTx, formatSats, parseAnyPrivateKey, xOnly, InputError } from '../lib/btc.js';
import { base64 } from '../../assets/vendor/@scure/base@1.2.6/index.esm.js';
import { $, renderRows, showError, esc } from '../lib/ui.js';

export const SAMPLE_IN = { txid: '0'.repeat(63) + '1', vout: '0', seq: '0xfffffffd', amount: '100000' };
export const SAMPLE_OUT = { to: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', amount: '90000' };

// Spend 100,000 sats received by the BIP84 test wallet's first address to its second address (1,000 sat fee), unsigned.
export const EXAMPLE = {
  inputs: [{ txid: 'd74f11e0e7302e58c8a10f818ca54132d88be9b669984427326cf7f4a9eae639', vout: '0', seq: '0xfffffffd', amount: '100000' }],
  outputs: [{ to: 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g', amount: '99000' }],
  version: '2', locktime: 0, net: 'mainnet', key: '', spend: 'p2wpkh',
};

/**
 * Build the transaction and its result rows.
 * opts: { version, locktime, key, spend ('p2wpkh' | 'p2tr' | 'p2pkh'), inputs: [{ txid, vout, seq, amount }], outputs: [{ to, amount }] }
 * with trimmed string values. Throws InputError for bad input.
 */
export function buildTx({ version, locktime, key, spend, inputs: ins, outputs: outs }) {
  if (!ins.length || !outs.length) throw new InputError('Add at least one input and one output');
  const tx = new btc.Transaction({
    version: Number(version),
    lockTime: Number(parseInteger(locktime, 'Locktime', { max: 0xffffffffn })),
    allowUnknownOutputs: true, allowLegacyWitnessUtxo: true, disableScriptCheck: true,
  });
  const keyText = key.trim();
  const signer = keyText ? parseAnyPrivateKey(keyText) : null;
  let spendScript = null, tapKey = null;
  if (signer) {
    const pub = secp256k1.getPublicKey(signer.priv, true);
    const t = spend;
    if (t === 'p2wpkh') spendScript = btc.p2wpkh(pub).script;
    else if (t === 'p2pkh') spendScript = btc.p2pkh(secp256k1.getPublicKey(signer.priv, signer.compressed)).script;
    else { const p = btc.p2tr(xOnly(pub)); spendScript = p.script; tapKey = xOnly(pub); }
  }
  let inTotal = 0n, allAmounts = true;
  ins.forEach((r, i) => {
    const txid = hexToBytes(r.txid, `Input ${i} TXID`);
    if (txid.length !== 32) throw new InputError(`Input ${i}: TXID must be 32 bytes`);
    const inp = { txid, index: Number(parseInteger(r.vout, `Input ${i} index`, { max: 0xffffffffn })), sequence: Number(parseInteger(r.seq, `Input ${i} sequence`, { max: 0xffffffffn })) };
    if (r.amount) { const a = parseAmount(r.amount, `Input ${i} amount`); inTotal += a; if (signer) inp.witnessUtxo = { script: spendScript, amount: a }; }
    else { allAmounts = false; if (signer) throw new InputError(`Input ${i}: the amount is needed to sign`); }
    if (tapKey) inp.tapInternalKey = tapKey;
    tx.addInput(inp);
  });
  let outTotal = 0n;
  outs.forEach((r, i) => {
    if (!r.to) throw new InputError(`Output ${i}: address or script is empty`);
    const script = /^(0x)?[0-9a-f]+$/i.test(r.to) && r.to.length % 2 === 0 && !/^(bc|tb|bcrt|ltc)1/i.test(r.to) ? hexToBytes(r.to, `Output ${i} script`) : addressToScript(r.to).script;
    const amount = parseAmount(r.amount, `Output ${i} amount`);
    outTotal += amount;
    tx.addOutput({ script, amount });
  });
  const unsigned = tx.unsignedTx;
  const parsed = parseTx(unsigned);
  const out = [
    { label: 'Unsigned transaction', value: bytesToHex(unsigned), note: `${unsigned.length} bytes` },
    { label: 'TXID', value: parsed.txid, note: tx.isFinal ? '' : 'For segwit inputs the TXID will not change when signed' },
    { label: 'PSBT (base64)', value: base64.encode(tx.toPSBT()) },
    { label: 'Totals', value: `in ${allAmounts ? formatSats(inTotal) : '?'} · out ${formatSats(outTotal)}${allAmounts ? ` · fee ${formatSats(inTotal - outTotal)}` : ''}`, copy: false },
  ];
  if (allAmounts && inTotal < outTotal) throw new InputError(`Outputs (${outTotal}) exceed inputs (${inTotal})`);
  if (signer) {
    const signedCount = tx.sign(signer.priv);
    if (!signedCount) throw new InputError('No input could be signed with this key');
    tx.finalize();
    const raw = tx.extract();
    const s = parseTx(raw);
    out.push({ label: 'Signed transaction', value: bytesToHex(raw), note: `${s.vsize} vbytes${allAmounts ? `, ${(Number(inTotal - outTotal) / s.vsize).toFixed(2)} sat/vB` : ''}` },
      { label: 'Signed TXID', value: s.txid });
  }
  return out;
}

function mount() {
  $('net').innerHTML = networkOptions('mainnet');

  function addRow(container, kind, v = {}) {
    const el = document.createElement('div');
    el.className = 'rowbox';
    el.innerHTML = kind === 'in'
      ? `<div class="field"><span>Previous TXID</span><input class="mono" data-k="txid" spellcheck="false" value="${esc(v.txid || '')}"></div>
         <div class="grid2"><div class="field"><span>Output index</span><input class="mono" data-k="vout" inputmode="numeric" value="${esc(v.vout || '0')}"></div>
         <div class="field"><span>Sequence</span><input class="mono" data-k="seq" value="${esc(v.seq || '0xfffffffd')}"></div>
         <div class="field"><span>Amount (sats, for signing and fee)</span><input class="mono" data-k="amount" value="${esc(v.amount || '')}"></div></div>
         <button type="button" class="icon-btn" data-remove>Remove input</button>`
      : `<div class="field"><span>Address or scriptPubKey hex</span><input class="mono" data-k="to" spellcheck="false" value="${esc(v.to || '')}"></div>
         <div class="grid2"><div class="field"><span>Amount (sats, or e.g. 0.001 BTC)</span><input class="mono" data-k="amount" value="${esc(v.amount || '')}"></div></div>
         <button type="button" class="icon-btn" data-remove>Remove output</button>`;
    container.append(el);
  }
  const rows = c => [...$(c).children].map(el => Object.fromEntries([...el.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.value.trim()])));

  function run() {
    showError($('err'), null);
    try {
      renderRows($('out'), buildTx({ version: $('version').value, locktime: $('locktime').value, key: $('key').value, spend: $('spend').value, inputs: rows('inputs'), outputs: rows('outputs') }));
    } catch (e) {
      $('out').innerHTML = '';
      showError($('err'), e);
    }
  }

  $('addIn').onclick = () => { addRow($('inputs'), 'in'); run(); };
  $('addOut').onclick = () => { addRow($('outputs'), 'out'); run(); };
  for (const c of ['inputs', 'outputs']) $(c).addEventListener('click', e => { if (e.target.closest('[data-remove]')) { e.target.closest('.rowbox').remove(); run(); } });
  document.querySelector('main').addEventListener('input', run);
  addRow($('inputs'), 'in', SAMPLE_IN);
  addRow($('outputs'), 'out', SAMPLE_OUT);
  run();
  const exSet = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  // Spend 100,000 sats received by the BIP84 test wallet's first address to its second address (1,000 sat fee), unsigned.
  $('example').onclick = () => {
    $('inputs').innerHTML = ''; $('outputs').innerHTML = '';
    for (const v of EXAMPLE.inputs) addRow($('inputs'), 'in', v);
    for (const v of EXAMPLE.outputs) addRow($('outputs'), 'out', v);
    exSet('version', EXAMPLE.version); exSet('locktime', EXAMPLE.locktime); exSet('net', EXAMPLE.net); exSet('key', EXAMPLE.key); exSet('spend', EXAMPLE.spend);
    run();
  };
}

if (globalThis.document) mount();
