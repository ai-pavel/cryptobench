// BCS: encode JSON to BCS bytes and decode BCS bytes back, using a type you describe.
import { parseHexOrBase64, hex, base64, kvTable, wireCopy, showError } from '../lib/sui.js';
import { parseSchema, encodeValue, decodeAll } from '../lib/bcs.js';
const $ = id => document.getElementById(id);

// Encodes a JSON value with the schema; returns the result rows (hex, base64, length).
export function encodeJson(schema, json) {
  let value;
  try { value = JSON.parse(json); } catch (e) { throw new Error('Value is not valid JSON: ' + e.message); }
  const b = encodeValue(schema, value);
  return [['Hex', '0x' + hex.encode(b)], ['Base64', base64.encode(b)], ['Length', `${b.length} bytes`]];
}

// Decodes hex or base64 BCS bytes with the schema; returns pretty-printed JSON.
export function decodeToJson(schema, input) {
  const v = decodeAll(schema, parseHexOrBase64(input, 'Bytes'));
  return JSON.stringify(v, null, 2);
}

function mount() {
  let schema = null;

  function readSchema() {
    try { schema = parseSchema($('schema').value); showError($('schema-err'), ''); }
    catch (e) { schema = null; showError($('schema-err'), e.message); }
  }

  function enc() {
    showError($('enc-err'), ''); $('enc-out').innerHTML = '';
    if (!schema || !$('json').value.trim()) return;
    try { $('enc-out').innerHTML = kvTable(encodeJson(schema, $('json').value)); }
    catch (e) { showError($('enc-err'), e.message); }
  }

  function dec() {
    showError($('dec-err'), ''); $('dec-out').hidden = true;
    if (!schema || !$('bytes').value.trim()) return;
    try {
      $('dec-out').textContent = decodeToJson(schema, $('bytes').value); $('dec-out').hidden = false;
    } catch (e) { showError($('dec-err'), e.message); }
  }

  $('schema').oninput = () => { readSchema(); enc(); dec(); };
  $('json').oninput = enc; $('bytes').oninput = dec;
  wireCopy();
  readSchema(); enc();
  // Example button(s)
  $('example').onclick = () => { $('schema').value = "struct {\n  amount: u64,\n  recipient: address,\n  memo: option<string>,\n  tags: vector<u8>,\n  big: u256,\n  e: enum { A, B(u16), C { x: bool } },\n  arr: [u32; 2]\n}"; $('json').value = "{\n  \"amount\": \"1000000000\",\n  \"recipient\": \"0x2\",\n  \"memo\": \"hello\",\n  \"tags\": [\n    1,\n    2\n  ],\n  \"big\": \"115792089237316195423570985008687907853269984665640564039457584007913129639935\",\n  \"e\": {\n    \"C\": {\n      \"x\": true\n    }\n  },\n  \"arr\": [\n    1,\n    4294967295\n  ]\n}"; $('bytes').value = "0x00ca9a3b000000000000000000000000000000000000000000000000000000000000000000000002010568656c6c6f020102ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff020101000000ffffffff"; $('schema').oninput(); };
}

if (globalThis.document) mount();
