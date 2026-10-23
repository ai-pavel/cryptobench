// SCALE codec driven by a small type language, e.g.
//   struct { who: AccountId32, amount: Compact<u128>, memo: Option<String> }
//   enum { Transfer { to: AccountId32, value: u128 }, Burn(u64), Noop }
import { compact, readCompact, uintLE, readUintLE, concat, utf8, utf8Decode, fromHex, toHex, accountIdFrom } from './dot.js';

// ---------- parser ----------
const INTS = { u8: 1, u16: 2, u32: 4, u64: 8, u128: 16, u256: 32, i8: 1, i16: 2, i32: 4, i64: 8, i128: 16, i256: 32 };
const FIXED = { AccountId32: 32, AccountId: 32, H160: 20, H256: 32, H512: 64 };

function tokenize(src) {
  const re = /\s*(\/\/[^\n]*|[A-Za-z_][A-Za-z0-9_]*|\d+|[<>\[\];,(){}:])/y;
  const out = [];
  let m, i = 0;
  src = src.trim();
  while (i < src.length) {
    re.lastIndex = i;
    if (!(m = re.exec(src))) throw new Error(`Unexpected character "${src[i]}" at position ${i}.`);
    i = re.lastIndex;
    if (!m[1].startsWith('//')) out.push(m[1]);
    while (i < src.length && /\s/.test(src[i])) i++;
  }
  return out;
}

export function parseType(src) {
  const t = tokenize(src);
  let p = 0;
  const peek = () => t[p];
  const take = v => {
    if (v !== undefined && t[p] !== v) throw new Error(`Expected "${v}" but found ${t[p] === undefined ? 'end of input' : `"${t[p]}"`}.`);
    if (t[p] === undefined) throw new Error('Unexpected end of the type.');
    return t[p++];
  };
  const fields = () => {
    take('{'); const fs = [];
    while (peek() !== '}') {
      const name = take();
      if (!/^[A-Za-z_]\w*$/.test(name)) throw new Error(`Bad field name "${name}".`);
      take(':'); fs.push({ name, type: type() });
      if (peek() === ',') take(','); else break;
    }
    take('}'); return fs;
  };
  const type = () => {
    const tok = take();
    if (tok === '[') { const of = type(); take(';'); const n = take(); if (!/^\d+$/.test(n)) throw new Error('Array length must be a number.'); take(']'); return { kind: 'array', of, len: +n }; }
    if (tok === '(') {
      const items = [];
      while (peek() !== ')') { items.push(type()); if (peek() === ',') take(','); else break; }
      take(')'); return items.length ? { kind: 'tuple', items } : { kind: 'unit' };
    }
    if (tok === 'struct' || tok === '{') { if (tok === '{') p--; return { kind: 'struct', fields: fields() }; }
    if (tok === 'enum') {
      take('{'); const variants = [];
      while (peek() !== '}') {
        const name = take(); let v = { name, kind: 'unit' };
        if (peek() === '(') { take('('); const items = []; while (peek() !== ')') { items.push(type()); if (peek() === ',') take(','); else break; } take(')'); v = { name, kind: 'tuple', items }; }
        else if (peek() === '{') v = { name, kind: 'struct', fields: fields() };
        variants.push(v);
        if (peek() === ',') take(','); else break;
      }
      take('}');
      if (!variants.length) throw new Error('An enum needs at least one variant.');
      if (variants.length > 256) throw new Error('An enum can have at most 256 variants.');
      return { kind: 'enum', variants };
    }
    const generic = n => { take('<'); const a = []; for (let i = 0; i < n; i++) { if (i) take(','); a.push(type()); } take('>'); return a; };
    if (tok in INTS) return { kind: 'int', bytes: INTS[tok], signed: tok[0] === 'i', name: tok };
    if (tok === 'bool') return { kind: 'bool' };
    if (tok === 'String' || tok === 'str' || tok === 'Text') return { kind: 'string' };
    if (tok === 'Bytes') return { kind: 'bytes' };
    if (tok in FIXED) return { kind: 'fixed', bytes: FIXED[tok], account: tok.startsWith('Account'), name: tok };
    if (tok === 'Compact') { const [of] = generic(1); if (of.kind !== 'int' || of.signed) throw new Error('Compact<T> needs an unsigned integer type.'); return { kind: 'compact', of }; }
    if (tok === 'Vec') { const [of] = generic(1); return of.kind === 'int' && of.bytes === 1 && !of.signed ? { kind: 'bytes' } : { kind: 'vec', of }; }
    if (tok === 'Option') return { kind: 'option', of: generic(1)[0] };
    if (tok === 'Result') { const [ok, err] = generic(2); return { kind: 'result', ok, err }; }
    if (tok === 'Box') return generic(1)[0];
    throw new Error(`Unknown type "${tok}". Supported: u8–u256, i8–i256, bool, String, Bytes, AccountId32, H160/H256/H512, Compact<T>, Vec<T>, Option<T>, Result<T, E>, [T; N], tuples, struct { … }, enum { … }.`);
  };
  const root = type();
  if (p < t.length) throw new Error(`Unexpected "${t[p]}" after the end of the type.`);
  return root;
}

// ---------- encoding ----------
const at = (path, msg) => new Error(`${path || 'value'}: ${msg}`);
function toBig(v, path) {
  if (typeof v === 'number') { if (!Number.isInteger(v)) throw at(path, `${v} is not an integer.`); if (!Number.isSafeInteger(v)) throw at(path, 'number is too large for JSON; put it in quotes as a string.'); return BigInt(v); }
  if (typeof v === 'string' && /^-?(\d+|0x[0-9a-fA-F]+)$/.test(v.trim())) { const s = v.trim(); return s.startsWith('-') ? -BigInt(s.slice(1)) : BigInt(s); }
  if (typeof v === 'bigint') return v;
  throw at(path, `expected an integer, got ${JSON.stringify(v)}.`);
}

export function encode(type, value, path = '') {
  switch (type.kind) {
    case 'int': {
      let v = toBig(value, path);
      const bits = BigInt(type.bytes * 8);
      if (type.signed) {
        const lim = 1n << (bits - 1n);
        if (v < -lim || v >= lim) throw at(path, `${v} is out of range for ${type.name}.`);
        if (v < 0n) v += 1n << bits;
      } else if (v < 0n || v >= 1n << bits) throw at(path, `${v} is out of range for ${type.name}.`);
      return uintLE(v, type.bytes);
    }
    case 'compact': {
      const v = toBig(value, path);
      if (v < 0n || v >= 1n << BigInt(type.of.bytes * 8)) throw at(path, `${v} is out of range for Compact<${type.of.name}>.`);
      return compact(v);
    }
    case 'bool': if (typeof value !== 'boolean') throw at(path, 'expected true or false.'); return new Uint8Array([value ? 1 : 0]);
    case 'string': if (typeof value !== 'string') throw at(path, 'expected a string.'); { const b = utf8(value); return concat(compact(b.length), b); }
    case 'bytes': { const b = bytesOf(value, path); return concat(compact(b.length), b); }
    case 'fixed': {
      if (type.account && typeof value === 'string' && !/^0x/i.test(value.trim())) { try { return accountIdFrom(value); } catch (e) { throw at(path, e.message); } }
      const b = bytesOf(value, path);
      if (b.length !== type.bytes) throw at(path, `${type.name} must be ${type.bytes} bytes (got ${b.length}).`);
      return b;
    }
    case 'unit': return new Uint8Array(0);
    case 'array': {
      if (type.of.kind === 'int' && type.of.bytes === 1 && typeof value === 'string') { const b = bytesOf(value, path); if (b.length !== type.len) throw at(path, `expected ${type.len} bytes.`); return b; }
      if (!Array.isArray(value) || value.length !== type.len) throw at(path, `expected an array of ${type.len} items.`);
      return concat(...value.map((v, i) => encode(type.of, v, `${path}[${i}]`)));
    }
    case 'vec': if (!Array.isArray(value)) throw at(path, 'expected an array.'); return concat(compact(value.length), ...value.map((v, i) => encode(type.of, v, `${path}[${i}]`)));
    case 'tuple': if (!Array.isArray(value) || value.length !== type.items.length) throw at(path, `expected an array of ${type.items.length} items.`); return concat(...type.items.map((t, i) => encode(t, value[i], `${path}[${i}]`)));
    case 'struct': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw at(path, 'expected an object.');
      for (const k of Object.keys(value)) if (!type.fields.some(f => f.name === k)) throw at(path, `unknown field "${k}".`);
      return concat(...type.fields.map(f => { if (!(f.name in value)) throw at(path, `missing field "${f.name}".`); return encode(f.type, value[f.name], path ? `${path}.${f.name}` : f.name); }));
    }
    case 'option':
      if (value === null || value === undefined) return new Uint8Array([0]);
      if (type.of.kind === 'bool') { if (typeof value !== 'boolean') throw at(path, 'expected true, false or null.'); return new Uint8Array([value ? 1 : 2]); }
      return concat(new Uint8Array([1]), encode(type.of, value, path));
    case 'result': {
      if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 || !('Ok' in value || 'Err' in value)) throw at(path, 'expected {"Ok": …} or {"Err": …}.');
      return 'Ok' in value ? concat(new Uint8Array([0]), encode(type.ok, value.Ok, path + '.Ok')) : concat(new Uint8Array([1]), encode(type.err, value.Err, path + '.Err'));
    }
    case 'enum': {
      let name, inner;
      if (typeof value === 'string') name = value;
      else if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1) [[name, inner]] = Object.entries(value);
      else throw at(path, 'expected "Variant" or {"Variant": value}.');
      const idx = type.variants.findIndex(v => v.name === name);
      if (idx < 0) throw at(path, `unknown variant "${name}" (expected ${type.variants.map(v => v.name).join(', ')}).`);
      const v = type.variants[idx];
      const tag = new Uint8Array([idx]);
      if (v.kind === 'unit') { if (inner !== undefined && inner !== null) throw at(path, `${name} has no data.`); return tag; }
      if (v.kind === 'tuple') { const items = v.items.length === 1 ? [inner] : inner; return concat(tag, encode({ kind: 'tuple', items: v.items }, items, `${path}.${name}`)); }
      return concat(tag, encode({ kind: 'struct', fields: v.fields }, inner, `${path}.${name}`));
    }
  }
  throw new Error('Unsupported type.');
}

function bytesOf(v, path) {
  if (typeof v !== 'string') throw at(path, 'expected a 0x-prefixed hex string.');
  try { return fromHex(v); } catch (e) { throw at(path, e.message); }
}

// ---------- decoding ----------
const num = v => (v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString());

export function decode(type, bytes) {
  let off = 0;
  const take = (n, path) => {
    if (off + n > bytes.length) throw new Error(`${path || 'value'}: needs ${n} bytes at offset ${off}, but only ${bytes.length - off} remain.`);
    const b = bytes.subarray(off, off + n); off += n; return b;
  };
  const len = path => {
    const { value, size } = readCompactAt(path);
    if (value > BigInt(bytes.length)) throw new Error(`${path || 'value'}: length ${value} at offset ${off - size} is larger than the data.`);
    return Number(value);
  };
  const readCompactAt = path => { try { const r = readCompact(bytes, off); off += r.size; return r; } catch (e) { throw new Error(`${path || 'value'}: ${e.message}`); } };
  const d = (t, path) => {
    switch (t.kind) {
      case 'int': {
        let v = readUintLE(take(t.bytes, path));
        if (t.signed && v >= 1n << BigInt(t.bytes * 8 - 1)) v -= 1n << BigInt(t.bytes * 8);
        return num(v);
      }
      case 'compact': return num(readCompactAt(path).value);
      case 'bool': { const b = take(1, path)[0]; if (b > 1) throw new Error(`${path || 'value'}: invalid bool byte ${b} at offset ${off - 1}.`); return b === 1; }
      case 'string': { const n = len(path); const start = off; try { return utf8Decode(take(n, path)); } catch (e) { if (/needs/.test(e.message)) throw e; throw new Error(`${path || 'value'}: invalid UTF-8 at offset ${start}.`); } }
      case 'bytes': return toHex(take(len(path), path));
      case 'fixed': return toHex(take(t.bytes, path));
      case 'unit': return null;
      case 'array': if (t.of.kind === 'int' && t.of.bytes === 1 && !t.of.signed) return toHex(take(t.len, path)); return Array.from({ length: t.len }, (_, i) => d(t.of, `${path}[${i}]`));
      case 'vec': { const n = len(path); return Array.from({ length: n }, (_, i) => d(t.of, `${path}[${i}]`)); }
      case 'tuple': return t.items.map((it, i) => d(it, `${path}[${i}]`));
      case 'struct': return Object.fromEntries(t.fields.map(f => [f.name, d(f.type, path ? `${path}.${f.name}` : f.name)]));
      case 'option': {
        const b = take(1, path)[0];
        if (t.of.kind === 'bool') { if (b > 2) throw new Error(`${path || 'value'}: invalid Option<bool> byte ${b}.`); return b === 0 ? null : b === 1; }
        if (b === 0) return null; if (b !== 1) throw new Error(`${path || 'value'}: invalid Option tag ${b} at offset ${off - 1}.`);
        return d(t.of, path);
      }
      case 'result': { const b = take(1, path)[0]; if (b > 1) throw new Error(`${path || 'value'}: invalid Result tag ${b}.`); return b === 0 ? { Ok: d(t.ok, path + '.Ok') } : { Err: d(t.err, path + '.Err') }; }
      case 'enum': {
        const i = take(1, path)[0];
        const v = t.variants[i];
        if (!v) throw new Error(`${path || 'value'}: variant index ${i} at offset ${off - 1} is out of range (${t.variants.length} variants).`);
        if (v.kind === 'unit') return v.name;
        if (v.kind === 'tuple') { const items = v.items.map((it, k) => d(it, `${path}.${v.name}[${k}]`)); return { [v.name]: items.length === 1 ? items[0] : items }; }
        return { [v.name]: Object.fromEntries(v.fields.map(f => [f.name, d(f.type, `${path}.${v.name}.${f.name}`)])) };
      }
    }
    throw new Error('Unsupported type.');
  };
  const value = d(type, '');
  return { value, used: off, rest: bytes.length - off };
}

export const stringify = v => JSON.stringify(v, null, 2);
