import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMAT_NAMES, formatName, isUrl, esc, isRepeat, resultsHtml, cameraError } from '../../src/utilities/barcode-reader/barcode-reader.js';

test('format names cover the Barcode Detection API formats', () => {
  // The formats listed in the WICG Shape Detection API spec.
  for (const f of ['aztec', 'code_128', 'code_39', 'code_93', 'codabar', 'data_matrix', 'ean_13', 'ean_8', 'itf', 'pdf417', 'qr_code', 'upc_a', 'upc_e']) {
    assert.ok(FORMAT_NAMES[f], f);
  }
  assert.equal(formatName('qr_code'), 'QR code');
  assert.equal(formatName('ean_13'), 'EAN-13');
  assert.equal(formatName('maxi_code'), 'maxi_code'); // unknown formats show as is
});

test('isUrl accepts only http and https links', () => {
  assert.equal(isUrl('https://example.com/a?b=c'), true);
  assert.equal(isUrl('http://localhost:8080'), true);
  assert.equal(isUrl('javascript:alert(1)'), false);
  assert.equal(isUrl('mailto:a@b.c'), false);
  assert.equal(isUrl('WIFI:T:WPA;S:x;P:y;;'), false);
  assert.equal(isUrl('example.com'), false);
  assert.equal(isUrl('5901234123457'), false);
});

test('repeated camera reads are ignored for 3 seconds', () => {
  const last = { value: 'abc', at: 10000 };
  assert.equal(isRepeat(last, 'abc', 12999), true);
  assert.equal(isRepeat(last, 'abc', 13000), false);
  assert.equal(isRepeat(last, 'xyz', 10001), false);
  assert.equal(isRepeat({ value: null, at: 0 }, 'abc', 1), false);
});

test('results are escaped, with a link only for web URLs', () => {
  const time = new Date(2025, 0, 1, 9, 5, 7);
  const html = resultsHtml([
    { value: 'https://example.com/?a=1&b=2', format: 'QR code', time },
    { value: '<img src=x onerror=alert(1)>', format: 'Code 128', time },
  ]);
  assert.match(html, /QR code · 09:05:07/);
  assert.match(html, /<a class="btn" href="https:\/\/example.com\/\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">Open link<\/a>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.ok(!html.includes('<img'));
  assert.equal((html.match(/Open link/g) || []).length, 1);
  assert.match(html, /data-copy="0"[\s\S]*data-copy="1"/);
  assert.equal(resultsHtml([]), '');
});

test('esc and camera errors', () => {
  assert.equal(esc(`"'<>&`), '&quot;&#39;&lt;&gt;&amp;');
  assert.equal(cameraError({ name: 'NotAllowedError' }), 'Camera access was denied. Allow it in your browser settings and try again.');
  assert.equal(cameraError({ name: 'NotFoundError' }), 'Could not start the camera.');
});
