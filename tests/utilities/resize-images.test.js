import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HINTS, targetSize, halvingSteps, outName, uniqueName, sizeChange, totalText, isImageFile, fmtBytes, esc,
} from '../../src/utilities/resize-images/resize-images.js';

const DEFAULTS = { width: '1920', height: '1920', pct: '50' };

test('fit within: scales down keeping proportions, never enlarges', () => {
  assert.deepEqual(targetSize(4000, 3000, { ...DEFAULTS, mode: 'fit' }), [1920, 1440]);
  assert.deepEqual(targetSize(3000, 4000, { ...DEFAULTS, mode: 'fit' }), [1440, 1920]);
  assert.deepEqual(targetSize(800, 600, { ...DEFAULTS, mode: 'fit' }), [800, 600]);
  assert.deepEqual(targetSize(4000, 3000, { mode: 'fit', width: '1000', height: '' }), [1000, 750]); // empty side is unconstrained
  assert.deepEqual(targetSize(10000, 10, { mode: 'fit', width: '100', height: '100' }), [100, 1]); // at least 1 px
});

test('by percentage', () => {
  assert.deepEqual(targetSize(4000, 3000, { ...DEFAULTS, mode: 'percent' }), [2000, 1500]);
  assert.deepEqual(targetSize(101, 51, { ...DEFAULTS, mode: 'percent' }), [51, 26]);
  assert.deepEqual(targetSize(100, 80, { ...DEFAULTS, mode: 'percent', pct: '200' }), [200, 160]);
  assert.deepEqual(targetSize(100, 80, { ...DEFAULTS, mode: 'percent', pct: '' }), [100, 80]); // empty = 100%
  assert.deepEqual(targetSize(100, 80, { ...DEFAULTS, mode: 'percent', pct: '0.1' }), [1, 1]); // floor of 1%
});

test('exact size stretches; keep size does nothing', () => {
  assert.deepEqual(targetSize(4000, 3000, { mode: 'exact', width: '512', height: '512.4', pct: '' }), [512, 512]);
  assert.deepEqual(targetSize(400, 300, { mode: 'exact', width: '', height: '600', pct: '' }), [400, 600]);
  assert.deepEqual(targetSize(4000, 3000, { ...DEFAULTS, mode: 'none' }), [4000, 3000]);
});

test('halving steps before the final draw', () => {
  assert.deepEqual(halvingSteps(4000, 3000, 1920, 1440), [[2000, 1500]]);
  assert.deepEqual(halvingSteps(4000, 3000, 500, 375), [[2000, 1500], [1000, 750], [500, 375]]);
  assert.deepEqual(halvingSteps(1001, 999, 300, 300), [[501, 500]]);
  assert.deepEqual(halvingSteps(800, 600, 800, 600), []);
  assert.deepEqual(halvingSteps(800, 600, 1600, 1200), []); // upscaling
});

test('output names and ZIP de-duplication', () => {
  assert.equal(outName('IMG_0001.HEIC', 'image/jpeg'), 'IMG_0001.jpg');
  assert.equal(outName('a.b.png', 'image/webp'), 'a.b.webp');
  assert.equal(outName('logo', 'image/png'), 'logo.png');
  assert.equal(outName('x.jpg', 'image/avif'), 'x.avif');
  const used = new Set();
  assert.deepEqual(['a.jpg', 'a.jpg', 'b.jpg', 'a.jpg'].map(n => uniqueName(n, used)), ['a.jpg', 'a-2.jpg', 'b.jpg', 'a-3.jpg']);
});

test('size change and totals', () => {
  assert.equal(sizeChange(1000, 250), -75);
  assert.equal(sizeChange(1000, 1000), 0);
  assert.equal(sizeChange(1000, 1504), 50);
  assert.equal(totalText([]), '');
  assert.equal(totalText([{ before: 2 * 1048576, after: 512 * 1024 }]), '1 image · 2.00 MB → 512.0 KB');
  assert.equal(totalText([{ before: 1000, after: 500 }, { before: 24, after: 12 }]), '2 images · 1.0 KB → 512 B');
});

test('which files are tried as images', () => {
  assert.equal(isImageFile({ type: 'image/png', name: 'a.png' }), true);
  assert.equal(isImageFile({ type: '', name: 'IMG_1.HEIC' }), true);
  assert.equal(isImageFile({ type: '', name: 'pic.avif' }), true);
  assert.equal(isImageFile({ type: 'application/pdf', name: 'doc.pdf' }), false);
});

test('helpers', () => {
  assert.deepEqual(Object.keys(HINTS), ['fit', 'percent', 'exact', 'none']);
  assert.equal(fmtBytes(1048576), '1.00 MB');
  assert.equal(esc('"x" & <y>'), '&quot;x&quot; &amp; &lt;y&gt;');
});
