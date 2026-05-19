// Schema-less Protocol Buffers wire-format decoder with heuristic interpretations.
import { InputError } from './ui.js';
import { utf8OrNull, printable, toHex } from './bytes.js';

const WIRE = { 0: 'varint', 1: 'fixed64', 2: 'length-delimited', 3: 'start group', 4: 'end group', 5: 'fixed32' };

function varint(b, i, end = b.length) {
  let v = 0n, shift = 0n, start = i;
  for (;;) {
    if (i >= end) throw new Error(`varint runs past the end at offset ${start}`);
    const x = b[i++];
    v |= BigInt(x & 0x7f) << shift;
    if (!(x & 0x80)) break;
    shift += 7n;
    if (shift > 63n) throw new Error(`varint longer than 10 bytes at offset ${start}`);
  }
  return [v, i];
}
const zigzag = v => (v & 1n) ? -((v + 1n) >> 1n) : v >> 1n;
const toSigned64 = v => v >= 1n << 63n ? v - (1n << 64n) : v;

/** Strictly parse bytes as a message; throws if it isn't one. */
function parseMessage(b, start, end, depth) {
  if (depth > 64) throw new Error('nesting too deep');
  const fields = [];
  let i = start;
  while (i < end) {
    const fieldStart = i;
    let key;
    [key, i] = varint(b, i, end);
    const wire = Number(key & 7n), num = key >> 3n;
    if (num < 1n || num > 536870911n) throw new Error(`invalid field number ${num} at offset ${fieldStart}`);
    const f = { num: Number(num), wire, wireName: WIRE[wire], start: fieldStart };
    if (wire === 0) {
      let v; [v, i] = varint(b, i, end);
      Object.assign(f, { raw: v });
    } else if (wire === 1) {
      if (i + 8 > end) throw new Error(`fixed64 runs past the end at offset ${i}`);
      f.bytes = b.subarray(i, i + 8); i += 8;
    } else if (wire === 5) {
      if (i + 4 > end) throw new Error(`fixed32 runs past the end at offset ${i}`);
      f.bytes = b.subarray(i, i + 4); i += 4;
    } else if (wire === 2) {
      let len; [len, i] = varint(b, i, end);
      if (BigInt(i) + len > BigInt(end)) throw new Error(`length ${len} runs past the end at offset ${i}`);
      f.bytes = b.subarray(i, i + Number(len)); f.dataStart = i; i += Number(len);
      f.interp = interpretLD(b, f.dataStart, i, depth);
    } else if (wire === 3 || wire === 4) {
      throw new Error(`deprecated group (wire type ${wire}) at offset ${fieldStart} isn't supported`);
    } else throw new Error(`invalid wire type ${wire} at offset ${fieldStart}`);
    f.end = i;
    fields.push(f);
  }
  if (i !== end) throw new Error('trailing bytes');
  return fields;
}

function packedVarints(b, start, end) {
  const out = [];
  let i = start;
  while (i < end) { let v; [v, i] = varint(b, i, end); out.push(v); }
  return out;
}

/** Decide how to show a length-delimited value: nested message, string, packed numbers, or bytes. */
function interpretLD(b, start, end, depth) {
  const bytes = b.subarray(start, end);
  const text = utf8OrNull(bytes);
  const isText = text !== null && bytes.length > 0 && printable(text);
  let message = null;
  if (bytes.length) { try { message = parseMessage(b, start, end, depth + 1); } catch { message = null; } }
  let packed = null;
  if (bytes.length && !isText) { try { packed = packedVarints(b, start, end); } catch { packed = null; } }
  // Prefer readable text when it's clearly text; otherwise prefer a nested message.
  const textScore = isText ? (/^[\x20-\x7e\s]*$/.test(text) ? 2 : 1) : 0;
  let kind;
  if (!bytes.length) kind = 'empty';
  else if (textScore === 2 && (!message || message.some(f => f.num > 1000))) kind = 'string';
  else if (message) kind = 'message';
  else if (isText) kind = 'string';
  else if (packed && packed.length > 1) kind = 'packed';
  else kind = 'bytes';
  return { kind, text: isText ? text : null, message, packed: packed && packed.length > 1 ? packed : null };
}

export function decodeProtobuf(bytes) {
  if (!bytes.length) throw new InputError('No data.');
  try { return parseMessage(bytes, 0, bytes.length, 0); }
  catch (e) { throw new InputError(`Not a valid protobuf message: ${e.message}.`); }
}

const dv = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Human-readable interpretations of a scalar field. */
export function scalarViews(f) {
  if (f.wire === 0) {
    const v = f.raw, views = [`uint: ${v}`];
    const s = toSigned64(v);
    if (s !== v) views.push(`int64: ${s}`);
    views.push(`sint (zigzag): ${zigzag(v)}`);
    if (v === 0n || v === 1n) views.push(`bool: ${v === 1n}`);
    return views;
  }
  // Put the float view first when the value looks like an ordinary float (see bestScalar).
  if (f.wire === 5) {
    const d = dv(f.bytes);
    const v = [`fixed32: ${d.getUint32(0, true)}`, `sfixed32: ${d.getInt32(0, true)}`, `float: ${+d.getFloat32(0, true).toPrecision(9)}`];
    return isFloatish(f) ? [v[2], v[0], v[1]] : v;
  }
  if (f.wire === 1) {
    const d = dv(f.bytes);
    const v = [`fixed64: ${d.getBigUint64(0, true)}`, `sfixed64: ${d.getBigInt64(0, true)}`, `double: ${d.getFloat64(0, true)}`];
    return isFloatish(f) ? [v[2], v[0], v[1]] : v;
  }
  return [];
}
function isFloatish(f) {
  const d = dv(f.bytes);
  const fl = f.wire === 5 ? d.getFloat32(0, true) : d.getFloat64(0, true);
  return fl !== 0 && Number.isFinite(fl) && Math.abs(fl) >= 1e-6 && Math.abs(fl) < 1e15;
}

/** Most likely JSON value of a scalar field: floats when they look like ordinary numbers, else integers. */
export function bestScalar(f) {
  if (f.wire === 0) return f.raw <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(f.raw) : f.raw.toString();
  const d = dv(f.bytes);
  const fl = f.wire === 5 ? d.getFloat32(0, true) : d.getFloat64(0, true);
  if (isFloatish(f)) return f.wire === 5 ? +fl.toPrecision(9) : fl;
  if (f.wire === 5) return d.getUint32(0, true);
  const u = d.getBigUint64(0, true);
  return u <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(u) : u.toString();
}
export { toHex };
