// A small BCS (Binary Canonical Serialization) codec driven by a text schema, e.g.
//   struct { amount: u64, owner: address, memo: option<string>, tags: vector<u8> }
// Also understands Move names such as 0x1::string::String, 0x2::object::ID and 0x1::option::Option<T>.
import { Reader, Writer, utf8, hex, normalizeAddress, addressBytes } from './sui.js';

const INTS = { u8: 8, u16: 16, u32: 32, u64: 64, u128: 128, u256: 256 };

// ---------- Schema parsing ----------

function tokenize(src) {
  const toks = [];
  const re = /\s*(0x[0-9a-fA-F]+|[A-Za-z_][A-Za-z0-9_]*|\d+|::|[<>{}()[\];:,])/y;
  let m, pos = 0;
  const s = String(src);
  while (pos < s.length) {
    re.lastIndex = pos;
    m = re.exec(s);
    if (!m) { if (/^\s*$/.test(s.slice(pos))) break; throw new Error(`Unexpected "${s.slice(pos).trim()[0]}" at position ${pos} in the schema.`); }
    toks.push({ t: m[1], at: pos + m[0].indexOf(m[1]) });
    pos = re.lastIndex;
  }
  return toks;
}

export function parseSchema(src) {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i] && toks[i].t;
  const next = () => { if (i >= toks.length) throw new Error('The schema ends unexpectedly.'); return toks[i++].t; };
  const expect = t => { const at = toks[i] ? toks[i].at : 'end'; const got = next(); if (got !== t) throw new Error(`Expected "${t}" but found "${got}" (position ${at}) in the schema.`); };
  const ident = what => { const t = next(); if (!/^[A-Za-z_]/.test(t)) throw new Error(`Expected ${what} but found "${t}" in the schema.`); return t; };

  function fields(close) {
    const out = [];
    while (peek() !== close) {
      const name = ident('a field name'); expect(':');
      if (out.some(([n]) => n === name)) throw new Error(`Field "${name}" appears twice.`);
      out.push([name, type()]);
      if (peek() === ',') next(); else break;
    }
    expect(close);
    return out;
  }

  function type() {
    const t = next();
    if (t in INTS || t === 'bool' || t === 'string' || t === 'address') return { kind: t };
    if (t === 'String') return { kind: 'string' };
    if (t === 'vector' || t === 'option' || t === 'Option') { expect('<'); const of = type(); expect('>'); return { kind: t.toLowerCase() === 'option' ? 'option' : 'vector', of }; }
    if (t === '[') { const of = type(); expect(';'); const n = next(); if (!/^\d+$/.test(n)) throw new Error(`Array length must be a number (found "${n}").`); expect(']'); return { kind: 'array', of, len: Number(n) }; }
    if (t === '(') { const items = []; while (peek() !== ')') { items.push(type()); if (peek() === ',') next(); else break; } expect(')'); return { kind: 'tuple', items }; }
    if (t === 'struct') { expect('{'); return { kind: 'struct', fields: fields('}') }; }
    if (t === 'enum') {
      expect('{');
      const variants = [];
      while (peek() !== '}') {
        const name = ident('a variant name');
        let body = null;
        if (peek() === '(') { next(); body = type(); expect(')'); }
        else if (peek() === '{') { next(); body = { kind: 'struct', fields: fields('}') }; }
        variants.push([name, body]);
        if (peek() === ',') next(); else break;
      }
      expect('}');
      if (!variants.length) throw new Error('An enum needs at least one variant.');
      return { kind: 'enum', variants };
    }
    if (/^0x[0-9a-fA-F]+$/.test(t)) {
      expect('::'); const mod = ident('a module name'); expect('::'); const name = ident('a type name');
      const params = [];
      if (peek() === '<') { next(); while (peek() !== '>') { params.push(type()); if (peek() === ',') next(); else break; } expect('>'); }
      return moveStruct(normalizeAddress(t), mod, name, params);
    }
    throw new Error(`Unknown type "${t}". Use u8–u256, bool, string, address, vector<T>, option<T>, [T; N], (A, B), struct { … } or enum { … }.`);
  }

  const root = type();
  if (i !== toks.length) throw new Error(`Unexpected "${toks[i].t}" after the end of the schema.`);
  return root;
}

const ADDR1 = normalizeAddress('0x1'), ADDR2 = normalizeAddress('0x2');
function moveStruct(address, mod, name, params) {
  const id = `${address === ADDR1 ? '0x1' : address === ADDR2 ? '0x2' : address}::${mod}::${name}`;
  if (id === '0x1::string::String' || id === '0x1::ascii::String') return { kind: 'string' };
  if (id === '0x2::object::ID' || id === '0x2::object::UID') return { kind: 'address' };
  if (id === '0x1::option::Option' && params.length === 1) return { kind: 'option', of: params[0] };
  throw new Error(`Unknown Move type ${id}. Describe its fields with struct { … } instead.`);
}

// Move TypeTag (from sui.js parseTypeTag) → schema, for keys of dynamic fields.
export function schemaFromTypeTag(tag) {
  const k = Object.keys(tag)[0];
  if (k in INTS || k === 'bool' || k === 'address') return { kind: k };
  if (k === 'vector') return { kind: 'vector', of: schemaFromTypeTag(tag.vector) };
  if (k === 'struct') { const st = tag.struct; return moveStruct(st.address, st.module, st.name, st.typeParams.map(schemaFromTypeTag)); }
  throw new Error(`Type ${k} cannot be a key.`);
}

// ---------- Encoding ----------

function toBigInt(v, path) {
  if (typeof v === 'number') { if (!Number.isInteger(v)) throw new Error(`${path}: ${v} is not a whole number.`); if (!Number.isSafeInteger(v)) throw new Error(`${path}: ${v} is too large for a JSON number; write it as a string.`); return BigInt(v); }
  if (typeof v === 'string' && /^\s*(0x[0-9a-fA-F]+|\d+)\s*$/.test(v)) return BigInt(v.trim());
  if (typeof v === 'bigint') return v;
  throw new Error(`${path}: expected an integer, got ${JSON.stringify(v)}.`);
}

function isBytes(t) { return t.kind === 'vector' && t.of.kind === 'u8'; }

export function encode(type, value, w = new Writer(), path = '$') {
  const k = type.kind;
  if (k in INTS) {
    const v = toBigInt(value, path), bits = INTS[k];
    if (v < 0n || v >= 1n << BigInt(bits)) throw new Error(`${path}: ${v} is out of range for ${k}.`);
    w.uint(bits, v);
  } else if (k === 'bool') {
    if (typeof value !== 'boolean') throw new Error(`${path}: expected true or false.`);
    w.u8(value ? 1 : 0);
  } else if (k === 'string') {
    if (typeof value !== 'string') throw new Error(`${path}: expected a string.`);
    const b = utf8.encode(value); w.uleb(b.length).push(b);
  } else if (k === 'address') {
    if (typeof value !== 'string') throw new Error(`${path}: expected an address string (0x…).`);
    try { w.push(addressBytes(value)); } catch (e) { throw new Error(`${path}: ${e.message}`); }
  } else if (k === 'vector' || k === 'array') {
    let items = value;
    if (isBytes(type) || (k === 'array' && type.of.kind === 'u8')) {
      if (typeof value === 'string') {
        const h = value.trim().replace(/^0x/i, '');
        if (!/^([0-9a-fA-F]{2})*$/.test(h)) throw new Error(`${path}: bytes must be a hex string like "0x0a1b" or an array of numbers.`);
        items = Array.from(hex.decode(h.toLowerCase()));
      }
    }
    if (!Array.isArray(items)) throw new Error(`${path}: expected an array.`);
    if (k === 'array' && items.length !== type.len) throw new Error(`${path}: expected exactly ${type.len} items, got ${items.length}.`);
    if (k === 'vector') w.uleb(items.length);
    items.forEach((it, i) => encode(type.of, it, w, `${path}[${i}]`));
  } else if (k === 'option') {
    if (value === null || value === undefined) w.u8(0);
    else { w.u8(1); encode(type.of, value, w, path); }
  } else if (k === 'tuple') {
    if (!Array.isArray(value) || value.length !== type.items.length) throw new Error(`${path}: expected an array of ${type.items.length} items.`);
    type.items.forEach((t, i) => encode(t, value[i], w, `${path}[${i}]`));
  } else if (k === 'struct') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected an object with fields ${type.fields.map(f => f[0]).join(', ')}.`);
    const extra = Object.keys(value).filter(n => !type.fields.some(([f]) => f === n));
    if (extra.length) throw new Error(`${path}: unknown field "${extra[0]}".`);
    for (const [name, t] of type.fields) {
      if (!(name in value)) throw new Error(`${path}: missing field "${name}".`);
      encode(t, value[name], w, `${path}.${name}`);
    }
  } else if (k === 'enum') {
    let name, body;
    if (typeof value === 'string') { name = value; body = undefined; }
    else if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1) { name = Object.keys(value)[0]; body = value[name]; }
    else throw new Error(`${path}: expected "Variant" or { "Variant": value }.`);
    const idx = type.variants.findIndex(([n]) => n === name);
    if (idx < 0) throw new Error(`${path}: unknown variant "${name}" (expected ${type.variants.map(v => v[0]).join(', ')}).`);
    w.uleb(idx);
    const vt = type.variants[idx][1];
    if (vt) { if (body === undefined) throw new Error(`${path}: variant ${name} needs a value.`); encode(vt, body, w, `${path}.${name}`); }
  }
  return w;
}

// ---------- Decoding ----------

export function decode(type, r, path = '$') {
  const k = type.kind;
  if (k in INTS) {
    const v = r.uint(INTS[k], `${k} at ${path}`);
    return INTS[k] <= 32 ? Number(v) : v.toString();
  }
  if (k === 'bool') return r.bool(`bool at ${path}`);
  if (k === 'string') return r.string(`string at ${path}`);
  if (k === 'address') return r.address(`address at ${path}`);
  if (k === 'vector' || k === 'array') {
    const n = k === 'vector' ? r.uleb(`length of ${path}`) : type.len;
    if (type.of.kind === 'u8') return '0x' + hex.encode(r.bytes(n, `bytes at ${path}`));
    const out = [];
    for (let i = 0; i < n; i++) out.push(decode(type.of, r, `${path}[${i}]`));
    return out;
  }
  if (k === 'option') return r.option(() => decode(type.of, r, path), `option tag at ${path}`);
  if (k === 'tuple') return type.items.map((t, i) => decode(t, r, `${path}[${i}]`));
  if (k === 'struct') { const o = {}; for (const [name, t] of type.fields) o[name] = decode(t, r, `${path}.${name}`); return o; }
  if (k === 'enum') {
    const at = r.pos, idx = r.uleb(`variant of ${path}`);
    if (idx >= type.variants.length) throw new Error(`Variant index ${idx} at byte ${at} (${path}) is out of range; the enum has ${type.variants.length} variant(s).`);
    const [name, vt] = type.variants[idx];
    return vt ? { [name]: decode(vt, r, `${path}.${name}`) } : name;
  }
  throw new Error(`Cannot decode ${k}.`);
}

export function decodeAll(type, bytes) {
  const r = new Reader(bytes);
  const v = decode(type, r);
  r.done('the value');
  return v;
}

export const encodeValue = (type, value) => encode(type, value).toBytes();
