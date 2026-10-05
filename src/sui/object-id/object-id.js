// Object ID: derive object IDs of objects created by a transaction, dynamic fields and derived objects.
import { base58, hex, blake2b, addressBytes, normalizeAddress, parseTypeTag, typeTagToString, writeTypeTag, Writer, parseHex, addr, kvTable, wireCopy, showError } from '../lib/sui.js';
import { schemaFromTypeTag, encodeValue } from '../lib/bcs.js';
const $ = id => document.getElementById(id);

export const HELP = {
  field: 'Dynamic field ID = BLAKE2b-256(0xf0 ‖ parent ‖ key length as u64 LE ‖ BCS(key) ‖ BCS(key type)). For dynamic object fields, use the key type 0x2::dynamic_object_field::Wrapper<T>.',
  derived: 'Objects made with sui::derived_object get the ID of a dynamic field on the parent whose key type is 0x2::derived_object::DerivedObjectKey<T>, with the same key bytes.',
};

// IDs created by a transaction: returns null for no digest, otherwise [label, id] rows.
export function createdIds(digestInput, indexInput, countInput) {
  const d = digestInput.trim();
  if (!d) return null;
  let digest;
  try { digest = base58.decode(d); } catch { throw new Error('Transaction digest is not valid base58.'); }
  if (digest.length !== 32) throw new Error(`A transaction digest is 32 bytes (got ${digest.length}).`);
  const idx = indexInput.trim(), cnt = countInput.trim() || '1';
  if (!/^\d+$/.test(idx)) throw new Error('Creation index must be a whole number.');
  if (!/^\d+$/.test(cnt) || +cnt < 1 || +cnt > 100) throw new Error('How many must be between 1 and 100.');
  const rows = [];
  for (let i = 0n; i < BigInt(cnt); i++) {
    const n = BigInt(idx) + i;
    const pre = new Writer().u8(0xf1).push(digest).uint(64, n).toBytes();
    rows.push([`Index ${n}`, addr(blake2b(pre, { dkLen: 32 }))]);
  }
  return rows;
}

// Dynamic field ('field') or derived object ('derived') ID: returns null for no parent, otherwise result rows.
export function fieldId({ parent: parentInput, keytype, keyval, raw }, mode) {
  if (!parentInput.trim()) return null;
  const parent = addressBytes(parentInput, 'Parent object ID');
  let tag;
  try { tag = parseTypeTag(keytype); } catch (e) { throw new Error('Key type: ' + e.message); }
  let key;
  if (raw) key = parseHex(keyval, 'Key bytes');
  else {
    let schema, value;
    try { schema = schemaFromTypeTag(tag); } catch (e) { throw new Error(`${e.message} Or tick “raw BCS hex” and paste the key’s bytes.`); }
    try { value = JSON.parse(keyval); } catch { throw new Error('Key value is not valid JSON. Strings need quotes, e.g. "name"; big numbers can be strings.'); }
    key = encodeValue(schema, value);
  }
  if (mode === 'derived') tag = { struct: { address: normalizeAddress('0x2'), module: 'derived_object', name: 'DerivedObjectKey', typeParams: [tag] } };
  const tw = new Writer(); writeTypeTag(tw, tag);
  const pre = new Writer().u8(0xf0).push(parent).uint(64, key.length).push(key).push(tw.toBytes()).toBytes();
  return [
    [mode === 'derived' ? 'Derived object ID' : 'Dynamic field ID', addr(blake2b(pre, { dkLen: 32 }))],
    ['Key type used', typeTagToString(tag)],
    ['Key bytes (BCS)', '0x' + hex.encode(key)],
  ];
}

function mount() {
  let mode = 'created';

  function setMode(m) {
    mode = m;
    for (const k of ['created', 'field', 'derived']) $('m-' + k).setAttribute('aria-pressed', String(k === m));
    $('created').hidden = m !== 'created';
    $('field').hidden = m === 'created';
    $('field-help').textContent = HELP[m] || '';
    render();
  }

  function render() {
    showError($('err'), '');
    try {
      const rows = mode === 'created'
        ? createdIds($('digest').value, $('index').value, $('count').value)
        : fieldId({ parent: $('parent').value, keytype: $('keytype').value, keyval: $('keyval').value, raw: $('raw').checked }, mode);
      $('out').innerHTML = rows ? kvTable(rows) : '';
    }
    catch (e) { $('out').innerHTML = ''; showError($('err'), e.message); }
  }
  for (const k of ['created', 'field', 'derived']) $('m-' + k).onclick = () => setMode(k);
  for (const id of ['digest', 'index', 'count', 'parent', 'keytype', 'keyval', 'raw']) $(id).addEventListener('input', render);
  wireCopy();
  setMode('created');
  // Example button(s)
  $('example-created').onclick = () => { $('digest').value = "6wugsseErMNUqFfF9tCEkkKFvJMmQtRQATK7fpo6d4Cp"; $('index').value = '0'; $('count').value = '1'; setMode('created'); };
  $('example-field').onclick = () => { $('parent').value = "0xabababababababababababababababababababababababababababababababab"; $('keytype').value = "u64"; $('keyval').value = "7"; $('raw').checked = false; setMode('field'); };
  $('example-derived').onclick = () => { $('parent').value = "0xabababababababababababababababababababababababababababababababab"; $('keytype').value = "u64"; $('keyval').value = "42"; $('raw').checked = false; setMode('derived'); };
}

if (globalThis.document) mount();
