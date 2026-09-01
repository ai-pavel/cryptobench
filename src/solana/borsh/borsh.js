// Borsh: encode JSON values to Borsh bytes and decode them back, using a schema written as text.
import { base58, base64, hex, utf8, utf8d, concat, kvTable, wireCopy, showError, esc } from '../lib/sol.js';

// ---------- Schema parser ----------
const INTS = { u8: [1, 0], u16: [2, 0], u32: [4, 0], u64: [8, 0], u128: [16, 0], i8: [1, 1], i16: [2, 1], i32: [4, 1], i64: [8, 1], i128: [16, 1] };
export function tokenize(src) {
  const toks = [], re = /\s+|\/\/[^\n]*|([A-Za-z_][A-Za-z0-9_]*|\d+|[<>{}\[\]();:,])|(.)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[2]) throw new Error(`Unexpected character "${m[2]}" in schema.`);
    if (m[1]) toks.push(m[1]);
  }
  return toks;
}
export function parseSchema(src) {
  const t = tokenize(src);
  let i = 0;
  const peek = () => t[i], next = () => { if (i >= t.length) throw new Error('Schema ends unexpectedly.'); return t[i++]; };
  const expect = s => { const n = next(); if (n !== s) throw new Error(`Expected "${s}" but found "${n}" in schema.`); };
  const ident = () => { const n = next(); if (!/^[A-Za-z_]\w*$/.test(n)) throw new Error(`Expected a name but found "${n}".`); return n; };
  function fields(close) {
    const out = [];
    while (peek() !== close) {
      const name = ident(); expect(':'); out.push([name, type()]);
      if (peek() === ',') next(); else break;
    }
    expect(close);
    return out;
  }
  function type() {
    const n = next();
    if (INTS[n]) return { k: 'int', size: INTS[n][0], signed: !!INTS[n][1], name: n };
    if (['f32', 'f64', 'bool', 'string', 'pubkey', 'bytes'].includes(n)) return { k: n };
    if (n === 'vec' || n === 'option') { expect('<'); const inner = type(); expect('>'); return { k: n, inner }; }
    if (n === '[') { const inner = type(); expect(';'); const len = next(); if (!/^\d+$/.test(len)) throw new Error('Array length must be a number.'); expect(']'); return { k: 'array', inner, len: +len }; }
    if (n === 'struct') { expect('{'); return { k: 'struct', fields: fields('}') }; }
    if (n === 'enum') {
      expect('{');
      const variants = [];
      while (peek() !== '}') {
        const name = ident();
        if (peek() === '{') { next(); variants.push({ name, fields: fields('}') }); }
        else if (peek() === '(') { next(); const types = []; while (peek() !== ')') { types.push(type()); if (peek() === ',') next(); else break; } expect(')'); variants.push({ name, tuple: types }); }
        else variants.push({ name });
        if (peek() === ',') next(); else break;
      }
      expect('}');
      if (!variants.length) throw new Error('An enum needs at least one variant.');
      if (variants.length > 256) throw new Error('Borsh enums have at most 256 variants.');
      return { k: 'enum', variants };
    }
    throw new Error(`Unknown type "${n}".`);
  }
  const root = type();
  if (i < t.length) throw new Error(`Unexpected "${t[i]}" after the end of the schema.`);
  return root;
}

// ---------- Encoder ----------
export function intBytes(v, size, signed, path) {
  let n;
  if (typeof v === 'number') { if (!Number.isInteger(v)) throw new Error(`${path}: expected an integer.`); n = BigInt(v); }
  else if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) n = BigInt(v.trim());
  else throw new Error(`${path}: expected an integer.`);
  const bits = BigInt(size * 8), min = signed ? -(1n << (bits - 1n)) : 0n, max = signed ? (1n << (bits - 1n)) - 1n : (1n << bits) - 1n;
  if (n < min || n > max) throw new Error(`${path}: ${n} is out of range for this type.`);
  if (n < 0n) n += 1n << bits;
  const out = new Uint8Array(size);
  for (let k = 0; k < size; k++) { out[k] = Number(n & 255n); n >>= 8n; }
  return out;
}
const u32 = n => intBytes(n, 4, false, 'length');
export function encode(ty, v, path = 'value') {
  switch (ty.k) {
    case 'int': return intBytes(v, ty.size, ty.signed, path);
    case 'bool': if (typeof v !== 'boolean') throw new Error(`${path}: expected true or false.`); return Uint8Array.of(v ? 1 : 0);
    case 'f32': case 'f64': {
      if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`${path}: expected a number (Borsh forbids NaN).`);
      const b = new Uint8Array(ty.k === 'f32' ? 4 : 8), dv = new DataView(b.buffer);
      ty.k === 'f32' ? dv.setFloat32(0, v, true) : dv.setFloat64(0, v, true);
      return b;
    }
    case 'string': { if (typeof v !== 'string') throw new Error(`${path}: expected a string.`); const b = utf8.encode(v); return concat(u32(b.length), b); }
    case 'pubkey': {
      if (typeof v !== 'string') throw new Error(`${path}: expected a base58 public key.`);
      let b; try { b = base58.decode(v.trim()); } catch { throw new Error(`${path}: not valid base58.`); }
      if (b.length !== 32) throw new Error(`${path}: a public key is 32 bytes (got ${b.length}).`);
      return b;
    }
    case 'bytes': { const b = hexValue(v, path); return concat(u32(b.length), b); }
    case 'vec': if (!Array.isArray(v)) throw new Error(`${path}: expected an array.`); return concat(u32(v.length), ...v.map((x, k) => encode(ty.inner, x, `${path}[${k}]`)));
    case 'array': {
      if (ty.inner.k === 'int' && ty.inner.size === 1 && !ty.inner.signed && typeof v === 'string') {
        const b = hexValue(v, path); if (b.length !== ty.len) throw new Error(`${path}: expected ${ty.len} bytes (got ${b.length}).`); return b;
      }
      if (!Array.isArray(v) || v.length !== ty.len) throw new Error(`${path}: expected an array of exactly ${ty.len} items.`);
      return concat(...v.map((x, k) => encode(ty.inner, x, `${path}[${k}]`)));
    }
    case 'option': return v === null || v === undefined ? Uint8Array.of(0) : concat(Uint8Array.of(1), encode(ty.inner, v, path));
    case 'struct': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${path}: expected an object.`);
      const extra = Object.keys(v).filter(k => !ty.fields.some(([f]) => f === k));
      if (extra.length) throw new Error(`${path}: unknown field "${extra[0]}".`);
      return concat(...ty.fields.map(([f, ft]) => { if (!(f in v) && ft.k !== 'option') throw new Error(`${path}.${f}: missing.`); return encode(ft, v[f], `${path}.${f}`); }));
    }
    case 'enum': {
      let name, inner;
      if (typeof v === 'string') name = v;
      else if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1) [name, inner] = Object.entries(v)[0];
      else throw new Error(`${path}: expected "Variant" or {"Variant": …}.`);
      const idx = ty.variants.findIndex(x => x.name === name);
      if (idx < 0) throw new Error(`${path}: unknown variant "${name}". Options: ${ty.variants.map(x => x.name).join(', ')}.`);
      const vt = ty.variants[idx];
      if (vt.fields) return concat(Uint8Array.of(idx), encode({ k: 'struct', fields: vt.fields }, inner, `${path}.${name}`));
      if (vt.tuple) {
        const arr = vt.tuple.length === 1 && !Array.isArray(inner) ? [inner] : inner;
        if (!Array.isArray(arr) || arr.length !== vt.tuple.length) throw new Error(`${path}.${name}: expected ${vt.tuple.length} values.`);
        return concat(Uint8Array.of(idx), ...vt.tuple.map((tt, k) => encode(tt, arr[k], `${path}.${name}[${k}]`)));
      }
      return Uint8Array.of(idx);
    }
  }
}
export function hexValue(v, path) {
  if (Array.isArray(v) && v.every(n => Number.isInteger(n) && n >= 0 && n < 256)) return Uint8Array.from(v);
  if (typeof v !== 'string') throw new Error(`${path}: expected a hex string.`);
  const h = v.trim().replace(/^0x/, '');
  if (h.length % 2 || !/^[0-9a-fA-F]*$/.test(h)) throw new Error(`${path}: not valid hex.`);
  return hex.decode(h.toLowerCase());
}

// ---------- Decoder ----------
export function decode(ty, bytes) {
  let o = 0;
  const take = n => { if (o + n > bytes.length) throw new Error(`Not enough bytes: needed ${n} more at offset ${o}.`); const s = bytes.subarray(o, o + n); o += n; return s; };
  const readInt = (size, signed) => {
    const b = take(size); let n = 0n;
    for (let k = size - 1; k >= 0; k--) n = (n << 8n) | BigInt(b[k]);
    if (signed && b[size - 1] & 0x80) n -= 1n << BigInt(size * 8);
    return size <= 4 ? Number(n) : n.toString();
  };
  const readLen = () => { const n = readInt(4, false); if (n > bytes.length) throw new Error(`Length ${n} at offset ${o - 4} is larger than the input.`); return n; };
  function rd(t) {
    switch (t.k) {
      case 'int': return readInt(t.size, t.signed);
      case 'bool': { const b = take(1)[0]; if (b > 1) throw new Error(`Invalid bool byte ${b} at offset ${o - 1}.`); return b === 1; }
      case 'f32': return new DataView(take(4).slice().buffer).getFloat32(0, true);
      case 'f64': return new DataView(take(8).slice().buffer).getFloat64(0, true);
      case 'string': { const n = readLen(); try { return utf8d.decode(take(n)); } catch { throw new Error(`String at offset ${o - n} is not valid UTF-8.`); } }
      case 'pubkey': return base58.encode(take(32));
      case 'bytes': return hex.encode(take(readLen()));
      case 'vec': { const n = readLen(); return Array.from({ length: n }, () => rd(t.inner)); }
      case 'array': return t.inner.k === 'int' && t.inner.size === 1 && !t.inner.signed ? hex.encode(take(t.len)) : Array.from({ length: t.len }, () => rd(t.inner));
      case 'option': { const tag = take(1)[0]; if (tag > 1) throw new Error(`Invalid option tag ${tag} at offset ${o - 1}.`); return tag ? rd(t.inner) : null; }
      case 'struct': return Object.fromEntries(t.fields.map(([f, ft]) => [f, rd(ft)]));
      case 'enum': {
        const idx = take(1)[0], vt = t.variants[idx];
        if (!vt) throw new Error(`Enum variant index ${idx} at offset ${o - 1} does not exist (${t.variants.length} variants).`);
        if (vt.fields) return { [vt.name]: rd({ k: 'struct', fields: vt.fields }) };
        if (vt.tuple) return { [vt.name]: vt.tuple.map(rd) };
        return vt.name;
      }
    }
  }
  const value = rd(ty);
  if (o !== bytes.length) throw new Error(`Decoded ${o} bytes but the input has ${bytes.length}: ${bytes.length - o} trailing bytes.`);
  return value;
}
export function parseInputBytes(s, enc) {
  const t = s.trim().replace(/\s+/g, '');
  const tryHex = () => { const h = t.replace(/^0x/, ''); if (h.length % 2 || !/^[0-9a-fA-F]*$/.test(h)) throw 0; return hex.decode(h.toLowerCase()); };
  const tryB64 = () => base64.decode(t), tryB58 = () => base58.decode(t);
  const order = enc === 'hex' ? [tryHex] : enc === 'base64' ? [tryB64] : enc === 'base58' ? [tryB58] : [tryHex, tryB64, tryB58];
  for (const f of order) { try { return f(); } catch {} }
  throw new Error(enc === 'auto' ? 'Bytes are not valid hex, base64 or base58.' : `Bytes are not valid ${enc}.`);
}

// Examples: [schema, value].
export const EX = {
  ex1: ['struct {\n  amount: u64,\n  name: string,\n  owner: pubkey,\n  tags: vec<u8>,\n  delegate: option<pubkey>,\n}',
    '{\n  "amount": "1000000000",\n  "name": "Alice",\n  "owner": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",\n  "tags": [1, 2, 3],\n  "delegate": null\n}'],
  ex2: ['enum {\n  Initialize { decimals: u8 },\n  Transfer(u64),\n  Close,\n}', '{ "Transfer": "42" }'],
};

// ---------- UI ----------
function mount() {
  const $ = id => document.getElementById(id);
  let schema = null;
  function readSchema() {
    try { schema = parseSchema($('schema').value); showError($('schema-err')); } catch (e) { schema = null; showError($('schema-err'), e.message); }
    encodeNow(); decodeNow();
  }
  function encodeNow() {
    $('enc-out').innerHTML = '';
    if (!schema || !$('json').value.trim()) return showError($('enc-err'));
    let v;
    try { v = JSON.parse($('json').value); } catch (e) { return showError($('enc-err'), 'Value is not valid JSON: ' + e.message); }
    try {
      const b = encode(schema, v);
      showError($('enc-err'));
      $('enc-out').innerHTML = kvTable([['Hex', hex.encode(b)], ['Base64', base64.encode(b)], ['Base58', base58.encode(b)], ['Length', `${b.length} bytes`]]);
    } catch (e) { showError($('enc-err'), e.message); }
  }
  function decodeNow() {
    $('dec-out').innerHTML = '';
    if (!schema || !$('bytes').value.trim()) return showError($('dec-err'));
    try {
      const v = decode(schema, parseInputBytes($('bytes').value, $('enc').value));
      const json = JSON.stringify(v, null, 2);
      showError($('dec-err'));
      $('dec-out').innerHTML = `<pre class="json" id="decoded">${esc(json)}</pre><div class="row" style="margin-top:8px"><button class="icon-btn" data-copy="${esc(json)}">Copy</button></div>`;
    } catch (e) { showError($('dec-err'), e.message); }
  }
  $('schema').oninput = readSchema;
  $('json').oninput = encodeNow;
  $('bytes').oninput = decodeNow;
  $('enc').onchange = decodeNow;
  // Examples fill both tabs: the value to encode, and its encoded bytes to decode.
  for (const id of ['ex1', 'ex2']) $(id).onclick = () => {
    $('schema').value = EX[id][0]; $('json').value = EX[id][1];
    try { $('bytes').value = hex.encode(encode(parseSchema(EX[id][0]), JSON.parse(EX[id][1]))); $('enc').value = 'auto'; } catch {}
    readSchema();
  };
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $('tab-encode').hidden = b.dataset.tab !== 'encode'; $('tab-decode').hidden = b.dataset.tab !== 'decode';
  });
  $('schema').value = EX.ex1[0]; $('json').value = EX.ex1[1];
  readSchema();
  wireCopy();
}

if (globalThis.document) mount();
