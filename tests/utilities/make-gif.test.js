import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FRAMES, esc, fmtBytes, workerSource, videoRange, videoHint, gifWidth, gifHeight,
  frameDelay, containRect, repeatFor, resultInfo,
} from '../../src/utilities/make-gif/make-gif.js';

const GIFENC_URL = new URL('../../src/assets/vendor/gifenc@1.0.3/dist/gifenc.esm.js', import.meta.url).href;

// Run the worker's source as a module in this process and drive it with messages.
let n = 0;
async function runWorker(messages) {
  const out = [];
  globalThis.postMessage = msg => out.push(msg);
  globalThis.onmessage = null; // a worker global, so the module can assign it
  await import('data:text/javascript,' + encodeURIComponent(workerSource(GIFENC_URL) + `\n// ${n++}`));
  for (const data of messages) globalThis.onmessage({ data });
  delete globalThis.onmessage; delete globalThis.postMessage;
  return out;
}

const solid = (w, h, [r, g, b]) => {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([r, g, b, 255], i);
  return rgba.buffer;
};
const has = (bytes, ascii) => Buffer.from(bytes).includes(Buffer.from(ascii, 'latin1'));

test('worker encodes a valid looping GIF', async () => {
  const out = await runWorker([
    { type: 'start' },
    { type: 'frame', i: 0, width: 4, height: 3, delay: 500, repeat: repeatFor(true), buffer: solid(4, 3, [255, 0, 0]) },
    { type: 'frame', i: 1, width: 4, height: 3, delay: 500, repeat: repeatFor(true), buffer: solid(4, 3, [0, 0, 255]) },
    { type: 'finish' },
  ]);
  assert.deepEqual(out.slice(0, 2), [{ type: 'progress', i: 0 }, { type: 'progress', i: 1 }]);
  assert.equal(out[2].type, 'done');
  const b = out[2].bytes;
  assert.equal(Buffer.from(b.slice(0, 6)).toString('latin1'), 'GIF89a');
  assert.equal(b[6] | b[7] << 8, 4); // logical screen width
  assert.equal(b[8] | b[9] << 8, 3); // logical screen height
  assert.ok(has(b, 'NETSCAPE2.0')); // loop extension
  // Graphic control extensions (21 F9 04) carry the delay in hundredths of a second.
  const gce = [];
  for (let i = 0; i < b.length - 5; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 4) gce.push(b[i + 4] | b[i + 5] << 8);
  assert.deepEqual(gce, [50, 50]);
  assert.equal(b[b.length - 1], 0x3b); // trailer
});

test('worker leaves out the loop extension when looping is off', async () => {
  const out = await runWorker([
    { type: 'start' },
    { type: 'frame', i: 0, width: 2, height: 2, delay: 100, repeat: repeatFor(false), buffer: solid(2, 2, [0, 255, 0]) },
    { type: 'finish' },
  ]);
  const b = out.at(-1).bytes;
  assert.equal(Buffer.from(b.slice(0, 6)).toString('latin1'), 'GIF89a');
  assert.equal(has(b, 'NETSCAPE2.0'), false);
});

test('video range: frame count from start, end and fps', () => {
  assert.deepEqual(videoRange('0', '3', '10', 12.5), { start: 0, end: 3, fps: 10, count: 30 });
  assert.equal(videoRange('1.5', '2', '15', 10).count, 7); // floor(0.5 × 15)
  assert.equal(videoRange('-4', '1', '5', 10).start, 0);
  assert.deepEqual(videoRange('0', '30', '10', 4.2), { start: 0, end: 4.2, fps: 10, count: 42 }); // end clamped to duration
  assert.equal(videoRange('5', '2', '10', 10).count, 0); // end before start
  assert.equal(videoRange('', '', '10', NaN).count, 0); // no video yet
});

test('video hint and the frame limit', () => {
  assert.equal(videoHint(30), '30 frames. Longer clips and larger widths make bigger files.');
  assert.equal(videoHint(MAX_FRAMES), '300 frames. Longer clips and larger widths make bigger files.');
  assert.equal(videoHint(301), "That's 301 frames — the limit is 300. Shorten the clip or lower the frame rate.");
});

test('output size', () => {
  assert.equal(gifWidth('320'), 320);
  assert.equal(gifWidth(''), 480);
  assert.equal(gifWidth('5000'), 1920);
  assert.equal(gifHeight(480, 1920, 1080), 270);
  assert.equal(gifHeight(480, 1080, 1920), 853);
  assert.equal(gifHeight(16, 10000, 10), 1); // never zero
});

test('frame delays are at least 20 ms', () => {
  assert.equal(frameDelay('500'), 500);
  assert.equal(frameDelay('5'), 20);
  assert.equal(frameDelay(''), 20);
});

test('images are contained and centered', () => {
  assert.deepEqual(containRect(480, 270, 1920, 1080), { x: 0, y: 0, w: 480, h: 270 });
  assert.deepEqual(containRect(400, 300, 100, 100), { x: 50, y: 0, w: 300, h: 300 }); // pillarbox
  assert.deepEqual(containRect(400, 300, 800, 200), { x: 0, y: 100, w: 400, h: 100 }); // letterbox
});

test('formatting', () => {
  assert.equal(resultInfo(480, 270, 30, 2 * 1048576), '480×270 · 30 frames · 2.00 MB');
  assert.equal(fmtBytes(1023), '1023 B');
  assert.equal(fmtBytes(1536), '1.5 KB');
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});
