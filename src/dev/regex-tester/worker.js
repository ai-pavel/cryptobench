// Runs the regular expression off the main thread so a runaway pattern can be stopped.
const MAX_MATCHES = 5000;
onmessage = ({ data: { id, pattern, flags, text, replacement } }) => {
  let re;
  try { re = new RegExp(pattern, flags); } catch (e) { postMessage({ id, error: e.message }); return; }
  const matches = [];
  let truncated = false;
  if (flags.includes('g') || flags.includes('y')) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push({ index: m.index, text: m[0], groups: m.slice(1), named: m.groups || null });
      if (m[0] === '') re.lastIndex += flags.includes('u') || flags.includes('v') ? (text.codePointAt(re.lastIndex) > 0xffff ? 2 : 1) : 1;
      if (matches.length >= MAX_MATCHES) { truncated = true; break; }
    }
  } else {
    const m = re.exec(text);
    if (m) matches.push({ index: m.index, text: m[0], groups: m.slice(1), named: m.groups || null });
  }
  let replaced = null;
  if (replacement !== null) { try { replaced = text.replace(re, replacement); } catch (e) { replaced = 'Error: ' + e.message; } }
  postMessage({ id, matches, truncated, replaced, groupNames: groupNames(re.source) });
};

/** Name (or null) of each capturing group in order, skipping escapes and character classes. */
function groupNames(src) {
  const names = [];
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c !== '(') continue;
    if (src[i + 1] !== '?') { names.push(null); continue; }
    const m = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(src.slice(i));
    if (m) names.push(m[1]);
  }
  return names;
}
