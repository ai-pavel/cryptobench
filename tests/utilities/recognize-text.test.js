import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, statusText, langsHtml, resultMessages, failureMessage } from '../../src/utilities/recognize-text/recognize-text.js';

test('languages use Tesseract traineddata codes (ISO 639-2/T)', () => {
  const codes = LANGS.map(([c]) => c);
  assert.equal(new Set(codes).size, codes.length);
  for (const c of codes) assert.match(c, /^[a-z]{3}(_[a-z]+)?$/);
  assert.deepEqual(LANGS[0], ['eng', 'English']);
  assert.ok(codes.includes('deu') && codes.includes('chi_sim') && codes.includes('jpn'));
});

test('language checkboxes tick the saved languages', () => {
  const html = langsHtml(['eng', 'jpn']);
  assert.equal((html.match(/<label>/g) || []).length, LANGS.length);
  assert.match(html, /<input type="checkbox" value="eng" checked> English/);
  assert.match(html, /<input type="checkbox" value="jpn" checked> Japanese/);
  assert.match(html, /<input type="checkbox" value="rus" > Russian/);
  assert.equal((html.match(/checked/g) || []).length, 2);
});

test('progress messages map to status text', () => {
  assert.equal(statusText({ status: 'loading language traineddata', progress: 0.5 }), 'Downloading language data…');
  assert.equal(statusText({ status: 'recognizing text', progress: 1 }), 'Recognizing text…');
  assert.equal(statusText({ status: 'loaded language traineddata' }), '');
});

test('result messages', () => {
  assert.deepEqual(resultMessages('  Hello world\n', 91.6), { text: 'Hello world', status: 'Done · 92% confidence', error: '' });
  assert.deepEqual(resultMessages(' \n ', 0), { text: '', status: '', error: 'No text was found. Try a sharper image or a different language.' });
  assert.equal(failureMessage(new Error('network down')), 'Recognition failed: network down');
  assert.equal(failureMessage('oops'), 'Recognition failed: oops');
});
