import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { uaRows, hintRows } from '../../src/dev/user-agent/user-agent.js';

// The page loads this UMD bundle as a classic script (window.UAParser).
const UAParser = createRequire(import.meta.url)('../../src/assets/vendor/ua-parser-js@1.0.41/dist/ua-parser.min.js');
const values = rows => Object.fromEntries(rows.filter(Boolean).map(r => [r.label, r.value]));

test('example: iPhone Safari', () => {
  assert.deepEqual(values(uaRows(UAParser, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1')), {
    Browser: 'Mobile Safari 17.4', Engine: 'WebKit 605.1.15', 'Operating system': 'iOS 17.4', Device: 'Apple iPhone (mobile)', CPU: '—',
  });
});

test('example: Android Chrome', () => {
  assert.deepEqual(values(uaRows(UAParser, 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36')), {
    Browser: 'Chrome 124.0.0.0', Engine: 'Blink 124.0.0.0', 'Operating system': 'Android 14', Device: 'Google Pixel 8 (mobile)', CPU: '—',
  });
});

test('example: Windows Firefox', () => {
  assert.deepEqual(values(uaRows(UAParser, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0')), {
    Browser: 'Firefox 125.0', Engine: 'Gecko 125.0', 'Operating system': 'Windows 10', Device: 'Desktop (or unknown)', CPU: 'amd64',
  });
});

test('example: Googlebot is flagged as a bot', () => {
  const v = values(uaRows(UAParser, 'Googlebot/2.1 (+http://www.google.com/bot.html)'));
  assert.equal(v.Bot, 'Looks like a crawler or bot');
  assert.equal(v.Browser, '—');
  assert.equal(values(uaRows(UAParser, 'facebookexternalhit/1.1')).Bot, 'Looks like a crawler or bot');
});

test('empty input', () => {
  assert.equal(uaRows(UAParser, '   '), null);
});

test('client hint rows', () => {
  const d = { brands: [{ brand: 'Chromium', version: '124' }], platform: 'macOS', mobile: false };
  assert.deepEqual(values(hintRows(d)), { Brands: 'Chromium 124', Platform: 'macOS', Mobile: 'No' });
  const high = { fullVersionList: [{ brand: 'Chromium', version: '124.0.6367.60' }, { brand: 'Google Chrome', version: '124.0.6367.60' }], platformVersion: '14.4.0', architecture: 'arm', bitness: '64', model: '' };
  assert.deepEqual(values(hintRows({ ...d, mobile: true }, high)), {
    Brands: 'Chromium 124.0.6367.60, Google Chrome 124.0.6367.60', Platform: 'macOS 14.4.0', Mobile: 'Yes', Architecture: 'arm (64-bit)',
  });
});
