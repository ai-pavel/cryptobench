import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { qrPayload, wifiEsc, qrSvg, linearValue, linearError, generateError, fileBase, HINTS, SAMPLES } from '../../src/utilities/barcode-generator/barcode-generator.js';

// The page loads qrcode-generator as a classic script that defines the qrcode global; do the same here.
runInThisContext(readFileSync(new URL('../../src/assets/vendor/qrcode-generator@1.4.4/qrcode.js', import.meta.url), 'utf8'));

const empty = { text: '', ssid: '', wpass: '', wsec: 'WPA', whidden: false, eto: '', esub: '', ebody: '', tel: '', smsto: '', smsbody: '' };

test('text template passes the text through', () => {
  assert.equal(qrPayload('text', { ...empty, text: 'https://ai-pavel.github.io/cryptobench/' }), 'https://ai-pavel.github.io/cryptobench/');
  assert.equal(qrPayload('text', empty), '');
});

test('Wi-Fi payload follows the ZXing WIFI: format', () => {
  assert.equal(qrPayload('wifi', { ...empty, ssid: 'mynetwork', wpass: 'mypass' }), 'WIFI:T:WPA;S:mynetwork;P:mypass;;');
  assert.equal(qrPayload('wifi', { ...empty, ssid: 'Cafe', wpass: 'x', wsec: 'nopass', whidden: true }), 'WIFI:T:nopass;S:Cafe;H:true;;');
  assert.equal(qrPayload('wifi', { ...empty, ssid: 'a;b', wpass: 'p:"q",\\', wsec: 'WEP' }), String.raw`WIFI:T:WEP;S:a\;b;P:p\:\"q\"\,\\;;`);
  assert.equal(wifiEsc('plain'), 'plain');
});

test('email payload is a mailto: URI (RFC 6068)', () => {
  assert.equal(qrPayload('email', { ...empty, eto: ' name@example.com ' }), 'mailto:name@example.com');
  assert.equal(qrPayload('email', { ...empty, eto: 'a@b.c', esub: 'Hi there', ebody: 'a&b=c' }), 'mailto:a@b.c?subject=Hi%20there&body=a%26b%3Dc');
  assert.equal(qrPayload('email', { ...empty, eto: 'a@b.c', ebody: 'x' }), 'mailto:a@b.c?body=x');
});

test('phone and SMS payloads keep only digits and +', () => {
  assert.equal(qrPayload('phone', { ...empty, tel: '+1 (555) 123-4567' }), 'tel:+15551234567');
  assert.equal(qrPayload('sms', { ...empty, smsto: '+1 555 123 4567', smsbody: 'On my way: 5 min' }), 'SMSTO:+15551234567:On my way: 5 min');
});

const parseSvg = svg => {
  const [, size, total] = svg.match(/width="(\d+)" height="\1" viewBox="0 0 (\d+) \2"/);
  const dark = new Set([...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(m => m[1] + ',' + m[2]));
  return { size: +size, total: +total, dark };
};

test('QR version grows with data and error correction (ISO/IEC 18004 capacities)', () => {
  // 27 bytes: version 2-L holds 32 bytes, version 2-M only 26, so M needs version 3.
  const url = 'https://ai-pavel.github.io/';
  assert.equal(parseSvg(qrSvg(url, 320, '#000000', '#ffffff', 'L')).total, 25 + 8);
  assert.equal(parseSvg(qrSvg(url, 320, '#000000', '#ffffff', 'M')).total, 29 + 8);
  // Version 1-L holds 17 bytes.
  assert.equal(parseSvg(qrSvg('a'.repeat(17), 100, '#000', '#fff', 'L')).total, 21 + 8);
  assert.equal(parseSvg(qrSvg('a'.repeat(18), 100, '#000', '#fff', 'L')).total, 25 + 8);
});

test('QR SVG has the size, colours, quiet zone and finder patterns', () => {
  const svg = qrSvg('HELLO', 256, '#112233', '#fafafa', 'M');
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="256" height="256"/);
  assert.match(svg, /<rect width="100%" height="100%" fill="#fafafa"\/>/);
  assert.match(svg, /fill="#112233"><\/path>|fill="#112233"\/>/);
  const { total, dark } = parseSvg(svg);
  const n = total - 8;
  // Top-left 7x7 finder: dark ring, light ring, dark 3x3 core; offset by the 4-module quiet zone.
  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      assert.equal(dark.has(`${ox + x + 4},${oy + y + 4}`), ring !== 2, `finder ${ox},${oy} at ${x},${y}`);
    }
  }
  for (const k of dark) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 4 && y >= 4 && x < n + 4 && y < n + 4); }
});

test('QR encodes UTF-8', () => {
  // 'é€' is 5 bytes in UTF-8; with UTF-8 it fits version 1, and differs from the Latin-1 fallback.
  assert.equal(parseSvg(qrSvg('é€'.repeat(3), 100, '#000', '#fff', 'L')).total, 21 + 8); // 15 bytes
  assert.equal(parseSvg(qrSvg('é€'.repeat(4), 100, '#000', '#fff', 'L')).total, 25 + 8); // 20 bytes
});

test('too much data gives the overflow message', () => {
  let err;
  try { qrSvg('x'.repeat(3000), 320, '#000', '#fff', 'H'); } catch (e) { err = e; }
  assert.ok(err);
  assert.equal(generateError(err), 'Too much data for a QR code. Shorten the text or lower the error correction.');
  assert.equal(generateError(new Error('boom')), 'Could not generate: boom');
  assert.equal(generateError('bad'), 'Could not generate: bad');
});

test('linear barcode values and errors', () => {
  assert.equal(linearValue('CODE39', 'code-39'), 'CODE-39');
  assert.equal(linearValue('CODE128', 'Hello'), 'Hello');
  assert.equal(linearError('EAN13', ''), 'Enter a value.');
  assert.match(linearError('EAN13', '5901234123458'), /^Invalid check digit/);
  assert.equal(linearError('EAN13', '123'), 'EAN-13 needs 12 or 13 digits.');
  assert.match(linearError('UPC', '036000291453'), /^Invalid check digit/);
  assert.equal(linearError('UPC', '12ab'), 'UPC-A needs 11 or 12 digits.');
  assert.match(linearError('CODE39', 'a_b'), /^Code 39 supports only/);
  assert.equal(linearError('CODE128', 'é'), 'Code 128 supports only ASCII characters.');
});

test('samples and hints exist for every linear format', () => {
  for (const f of ['CODE128', 'EAN13', 'UPC', 'CODE39']) { assert.ok(SAMPLES[f]); assert.ok(HINTS[f]); }
  assert.equal(SAMPLES.EAN13.length, 12);
  assert.equal(SAMPLES.UPC.length, 11);
});

test('download file names', () => {
  assert.equal(fileBase('QR'), 'qr-code');
  assert.equal(fileBase('EAN13'), 'barcode-ean13');
});
