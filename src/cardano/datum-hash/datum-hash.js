// Datum Hash: compute the Blake2b-256 hash of a Plutus datum given as CBOR hex or cardano-cli JSON.
import { blake2b256, encode, decode, fromHex, toHex, Tag, CborMap } from '../lib/cardano.js';
import { Indefinite } from '../lib/cbor.js';
import { $, row, esc, showError } from '../lib/ui.js';

export const TEMPLATES = {
  unit: { constructor: 0, fields: [] },
  int: { int: 42 },
  nested: { constructor: 1, fields: [{ int: 1 }, { bytes: '00ff' }, { list: [{ int: -5 }, { int: 7 }] }, { map: [{ k: { bytes: 'aa' }, v: { int: 7 } }] }] },
};
export const CBOR_EXAMPLE = 'd87a9f014200ff9f24c249010000000000000180ffa141aa07ff';

// cardano-cli detailed-schema JSON -> CBOR value, encoded like the Haskell node.
export function fromJSON(j, path = 'datum') {
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error(`${path}: expected an object like {"int": …}, {"bytes": …}, {"list": …}, {"map": …} or {"constructor": …, "fields": …}.`);
  const list = items => items.length ? new Indefinite(items) : [];
  if ('int' in j) {
    const v = j.int;
    if (!(typeof v === 'number' || (typeof v === 'string' && /^-?\d+$/.test(v)))) throw new Error(`${path}.int must be an integer.`);
    return BigInt(v);
  }
  if ('bytes' in j) {
    const b = fromHex(String(j.bytes));
    return b.length > 64 ? new Indefinite(b) : b;
  }
  if ('list' in j) {
    if (!Array.isArray(j.list)) throw new Error(`${path}.list must be an array.`);
    return list(j.list.map((x, i) => fromJSON(x, `${path}.list[${i}]`)));
  }
  if ('map' in j) {
    if (!Array.isArray(j.map)) throw new Error(`${path}.map must be an array of {"k": …, "v": …}.`);
    return new CborMap(j.map.map((e, i) => [fromJSON(e.k, `${path}.map[${i}].k`), fromJSON(e.v, `${path}.map[${i}].v`)]));
  }
  if ('constructor' in j) {
    const n = j.constructor;
    if (!Number.isInteger(n) || n < 0) throw new Error(`${path}.constructor must be a non-negative integer.`);
    if (!Array.isArray(j.fields)) throw new Error(`${path}.fields must be an array.`);
    const fields = list(j.fields.map((x, i) => fromJSON(x, `${path}.fields[${i}]`)));
    if (n <= 6) return new Tag(121 + n, fields);
    if (n <= 127) return new Tag(1280 + n - 7, fields);
    return new Tag(102, [BigInt(n), fields]);
  }
  throw new Error(`${path}: unknown key. Use int, bytes, list, map or constructor.`);
}

// Decoded CBOR -> detailed-schema JSON (for display).
export function toJSON(v) {
  if (typeof v === 'number' || typeof v === 'bigint') return { int: typeof v === 'bigint' ? v.toString() : v };
  if (v instanceof Uint8Array) return { bytes: toHex(v) };
  if (Array.isArray(v)) return { list: v.map(toJSON) };
  if (v instanceof CborMap) return { map: v.entries.map(([k, x]) => ({ k: toJSON(k), v: toJSON(x) })) };
  if (v instanceof Tag) {
    if (v.tag >= 121 && v.tag <= 127) return { constructor: v.tag - 121, fields: v.value.map(toJSON) };
    if (v.tag >= 1280 && v.tag <= 1400) return { constructor: v.tag - 1280 + 7, fields: v.value.map(toJSON) };
    if (v.tag === 102) return { constructor: Number(v.value[0]), fields: v.value[1].map(toJSON) };
  }
  throw new Error('This CBOR is not valid Plutus data (only integers, bytes, lists, maps and constructors are allowed).');
}

/**
 * Hash a datum given as JSON (starts with "{") or CBOR hex. Returns null for empty
 * input, otherwise { hash, cbor, bytes, source, json } (hex strings, byte count,
 * the note on how it was hashed, detailed-schema JSON). Throws on invalid input.
 */
export function datumHash(input) {
  const v = input.trim();
  if (!v) return null;
  let bytes, json, source;
  if (v.startsWith('{')) {
    // Keep big integers exact: JSON numbers lose precision beyond 2^53, so quote them before parsing.
    const exact = v.replace(/("int"\s*:\s*)(-?\d{16,})/g, '$1"$2"');
    let obj; try { obj = JSON.parse(exact); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    bytes = encode(fromJSON(obj)); json = toJSON(decode(bytes)); source = 'Encoded from JSON the way cardano-cli does.';
  } else {
    bytes = fromHex(v); json = toJSON(decode(bytes)); source = 'Hashed exactly as given.';
  }
  return { hash: toHex(blake2b256(bytes)), cbor: toHex(bytes), bytes: bytes.length, source, json };
}

function mount() {
  function render() {
    $('out').innerHTML = '';
    try {
      const r = datumHash($('datum').value);
      showError($('err'));
      if (!r) return;
      $('out').innerHTML = [
        row('Datum hash', r.hash, r.source),
        row('Datum CBOR', r.cbor, r.bytes + ' bytes'),
      ].join('') + `<div class="kv-row"><div class="kv-label">Datum JSON</div><pre class="json" style="grid-column:1/-1;margin:0">${esc(JSON.stringify(r.json, null, 2))}</pre></div>`;
    } catch (e) { showError($('err'), e); }
  }
  $('datum').addEventListener('input', render);
  document.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => {
    $('datum').value = b.dataset.tpl === 'cbor' ? CBOR_EXAMPLE : JSON.stringify(TEMPLATES[b.dataset.tpl], null, 2);
    render();
  });
}

if (globalThis.document) mount();
