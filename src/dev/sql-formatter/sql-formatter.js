// SQL Formatter: format SQL for many dialects (uses the vendored sql-formatter, loaded as a classic script).
import { $, live, InputError } from '../lib/ui.js';

/** Dialects the loaded sql-formatter build supports (empty when it doesn't say). */
export function supportedDialects(lib) {
  return new Set(Object.keys(lib.supportedDialects ? Object.fromEntries(lib.supportedDialects.map(d => [d, 1])) : {}));
}

/** Format SQL with sql-formatter `lib`. indent is '2', '4' or 'tab'; kw is 'upper', 'lower' or 'preserve'. */
export function formatSql(lib, text, { dialect = 'sql', kw = 'upper', indent = '2' } = {}) {
  if (!text.trim()) throw new InputError('Paste some SQL.');
  try {
    return lib.format(text, {
      language: dialect, keywordCase: kw,
      tabWidth: indent === 'tab' ? 2 : +indent, useTabs: indent === 'tab',
    });
  } catch (e) { throw new InputError('Could not format: ' + e.message.split('\n')[0]); }
}

async function mount() {
  // Some dialects only exist in newer sql-formatter versions; hide the ones this build lacks.
  await new Promise(r => window.sqlFormatter ? r() : addEventListener('load', r, { once: true }));
  const supported = supportedDialects(window.sqlFormatter);
  if (supported.size) [...$('dialect').options].forEach(o => { if (!supported.has(o.value)) o.remove(); });
  live([$('in'), $('dialect'), $('kw'), $('indent')], () => {
    $('out').value = '';
    $('out').value = formatSql(window.sqlFormatter, $('in').value, { dialect: $('dialect').value, kw: $('kw').value, indent: $('indent').value });
  }, { errEl: $('err') });
}

if (globalThis.document) mount();
