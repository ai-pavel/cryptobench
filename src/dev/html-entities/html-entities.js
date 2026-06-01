// HTML Entities: escape and unescape HTML entities.
import { $, segmented } from '../lib/ui.js';

// Common named entities (HTML 4 set plus a few HTML5 favourites).
export const NAMED = { 34: 'quot', 38: 'amp', 39: 'apos', 60: 'lt', 62: 'gt', 160: 'nbsp', 161: 'iexcl', 162: 'cent', 163: 'pound', 164: 'curren', 165: 'yen',
  166: 'brvbar', 167: 'sect', 168: 'uml', 169: 'copy', 170: 'ordf', 171: 'laquo', 172: 'not', 173: 'shy', 174: 'reg', 175: 'macr', 176: 'deg',
  177: 'plusmn', 178: 'sup2', 179: 'sup3', 180: 'acute', 181: 'micro', 182: 'para', 183: 'middot', 184: 'cedil', 185: 'sup1', 186: 'ordm',
  187: 'raquo', 188: 'frac14', 189: 'frac12', 190: 'frac34', 191: 'iquest', 192: 'Agrave', 193: 'Aacute', 194: 'Acirc', 195: 'Atilde',
  196: 'Auml', 197: 'Aring', 198: 'AElig', 199: 'Ccedil', 200: 'Egrave', 201: 'Eacute', 202: 'Ecirc', 203: 'Euml', 204: 'Igrave', 205: 'Iacute',
  206: 'Icirc', 207: 'Iuml', 208: 'ETH', 209: 'Ntilde', 210: 'Ograve', 211: 'Oacute', 212: 'Ocirc', 213: 'Otilde', 214: 'Ouml', 215: 'times',
  216: 'Oslash', 217: 'Ugrave', 218: 'Uacute', 219: 'Ucirc', 220: 'Uuml', 221: 'Yacute', 222: 'THORN', 223: 'szlig', 224: 'agrave',
  225: 'aacute', 226: 'acirc', 227: 'atilde', 228: 'auml', 229: 'aring', 230: 'aelig', 231: 'ccedil', 232: 'egrave', 233: 'eacute',
  234: 'ecirc', 235: 'euml', 236: 'igrave', 237: 'iacute', 238: 'icirc', 239: 'iuml', 240: 'eth', 241: 'ntilde', 242: 'ograve', 243: 'oacute',
  244: 'ocirc', 245: 'otilde', 246: 'ouml', 247: 'divide', 248: 'oslash', 249: 'ugrave', 250: 'uacute', 251: 'ucirc', 252: 'uuml', 253: 'yacute',
  254: 'thorn', 255: 'yuml', 338: 'OElig', 339: 'oelig', 352: 'Scaron', 353: 'scaron', 376: 'Yuml', 402: 'fnof', 710: 'circ', 732: 'tilde',
  913: 'Alpha', 914: 'Beta', 915: 'Gamma', 916: 'Delta', 937: 'Omega', 945: 'alpha', 946: 'beta', 947: 'gamma', 948: 'delta', 955: 'lambda',
  956: 'mu', 960: 'pi', 963: 'sigma', 969: 'omega', 8194: 'ensp', 8195: 'emsp', 8201: 'thinsp', 8204: 'zwnj', 8205: 'zwj', 8211: 'ndash',
  8212: 'mdash', 8216: 'lsquo', 8217: 'rsquo', 8218: 'sbquo', 8220: 'ldquo', 8221: 'rdquo', 8222: 'bdquo', 8224: 'dagger', 8225: 'Dagger',
  8226: 'bull', 8230: 'hellip', 8240: 'permil', 8242: 'prime', 8243: 'Prime', 8249: 'lsaquo', 8250: 'rsaquo', 8364: 'euro', 8482: 'trade',
  8592: 'larr', 8593: 'uarr', 8594: 'rarr', 8595: 'darr', 8596: 'harr', 8656: 'lArr', 8658: 'rArr', 8704: 'forall', 8706: 'part', 8707: 'exist',
  8712: 'isin', 8721: 'sum', 8722: 'minus', 8730: 'radic', 8734: 'infin', 8745: 'cap', 8746: 'cup', 8747: 'int', 8776: 'asymp', 8800: 'ne',
  8801: 'equiv', 8804: 'le', 8805: 'ge', 8834: 'sub', 8835: 'sup', 9824: 'spades', 9827: 'clubs', 9829: 'hearts', 9830: 'diams' };

/** Entity for a code point in the preferred style ('named', 'dec' or 'hex'). */
export function entity(cp, style) {
  if (style === 'named' && NAMED[cp]) return `&${NAMED[cp]};`;
  if (cp === 39 && style === 'named') return '&#39;';
  return style === 'hex' ? `&#x${cp.toString(16).toUpperCase()};` : `&#${cp};`;
}
/** Escape text; scope is 'min' (only & < > " '), 'nonascii' or 'all'. */
export function escapeHtml(s, scope, style) {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const special = '&<>"\''.includes(ch);
    const need = special || (scope !== 'min' && cp > 126) || (scope === 'all' && !/[A-Za-z0-9 \n\t]/.test(ch));
    out += need ? entity(cp, style) : ch;
  }
  return out;
}
/** Decode entities (browser only: uses the DOM's HTML parser). */
export function unescapeHtml(s) {
  // A detached <textarea> decodes entities without creating elements or running scripts.
  const t = document.createElement('textarea');
  t.innerHTML = s.replace(/</g, '&lt;');
  return t.value;
}

function mount() {
  const mode = segmented($('mode'), m => { $('opts').hidden = m !== 'escape'; run(); });
  function run() {
    const s = $('in').value;
    $('outText').value = mode() === 'escape' ? escapeHtml(s, $('scope').value, $('style').value) : unescapeHtml(s);
  }
  for (const id of ['in', 'scope', 'style']) $(id).addEventListener('input', run);
  $('swap').onclick = () => { $('in').value = $('outText').value; run(); };
  run();
}

if (globalThis.document) mount();
