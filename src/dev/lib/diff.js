// Myers O(ND) diff over arrays, used for line and word diffs.

/**
 * Diff two arrays. Returns ops: { op: 'equal' | 'del' | 'ins', a?: index in A, b?: index in B }.
 * `key` maps items to comparable strings (e.g. for ignoring case or whitespace).
 */
export function diff(A, B, key = x => x) {
  const a = A.map(key), b = B.map(key);
  // Trim common prefix and suffix to keep the core small.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ op: 'equal', a: i, b: i });
  ops.push(...core(a, b, start, endA, start, endB));
  for (let i = 0; i < a.length - endA; i++) ops.push({ op: 'equal', a: endA + i, b: endB + i });
  return ops;
}

function core(a, b, a0, a1, b0, b1) {
  const n = a1 - a0, m = b1 - b0, max = n + m;
  if (!n) return Array.from({ length: m }, (_, j) => ({ op: 'ins', b: b0 + j }));
  if (!m) return Array.from({ length: n }, (_, i) => ({ op: 'del', a: a0 + i }));
  const offset = max;
  let v = new Int32Array(2 * max + 2);
  const trace = [];
  const budget = 1e7; // stored frontier entries; beyond this, give up on a minimal diff
  outer: for (let d = 0; d <= max; d++) {
    if ((d + 1) * v.length > budget) {
      return [...Array.from({ length: n }, (_, i) => ({ op: 'del', a: a0 + i })), ...Array.from({ length: m }, (_, j) => ({ op: 'ins', b: b0 + j }))];
    }
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[a0 + x] === b[b0 + y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) { trace.push(v.slice()); break outer; }
    }
  }
  // Backtrack through the saved frontiers.
  const ops = [];
  let x = n, y = m;
  for (let d = trace.length - 2; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d], k = x - y;
    const prevK = (k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1])) ? k + 1 : k - 1;
    const prevX = vd[offset + prevK], prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x--; y--; ops.push({ op: 'equal', a: a0 + x, b: b0 + y }); }
    if (d === 0) break;
    if (x === prevX) { y--; ops.push({ op: 'ins', b: b0 + y }); } else { x--; ops.push({ op: 'del', a: a0 + x }); }
  }
  while (x > 0 && y > 0) { x--; y--; ops.push({ op: 'equal', a: a0 + x, b: b0 + y }); }
  return ops.reverse();
}

/** Split text into words, whitespace runs and punctuation for word-level diffs. */
export const tokens = s => s.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || [];
