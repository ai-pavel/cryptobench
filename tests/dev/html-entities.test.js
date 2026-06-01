import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAMED, entity, escapeHtml } from '../../src/dev/html-entities/html-entities.js';

const EXAMPLE = '<a href="/?q=1&x=2">Café “quotes” © 2024 — ok</a>';

test('named entities match the HTML spec', () => {
  // Spot checks against the HTML named character references table.
  assert.equal(NAMED[169], 'copy');
  assert.equal(NAMED[0xa0], 'nbsp');
  assert.equal(NAMED[0x2014], 'mdash');
  assert.equal(NAMED[0x201c], 'ldquo');
  assert.equal(NAMED[0x20ac], 'euro');
  assert.equal(NAMED[0x3a9], 'Omega');
});

test('entity styles', () => {
  assert.equal(entity(169, 'named'), '&copy;');
  assert.equal(entity(169, 'dec'), '&#169;');
  assert.equal(entity(169, 'hex'), '&#xA9;');
  assert.equal(entity(0x1f600, 'named'), '&#128512;');
  assert.equal(entity(39, 'named'), '&apos;');
});

test('example: minimal escaping', () => {
  assert.equal(escapeHtml(EXAMPLE, 'min', 'named'), '&lt;a href=&quot;/?q=1&amp;x=2&quot;&gt;Café “quotes” © 2024 — ok&lt;/a&gt;');
  assert.equal(escapeHtml("'", 'min', 'dec'), '&#39;');
});

test('example: escaping non-ASCII too', () => {
  assert.equal(escapeHtml(EXAMPLE, 'nonascii', 'named'),
    '&lt;a href=&quot;/?q=1&amp;x=2&quot;&gt;Caf&eacute; &ldquo;quotes&rdquo; &copy; 2024 &mdash; ok&lt;/a&gt;');
  assert.equal(escapeHtml('é😀', 'nonascii', 'hex'), '&#xE9;&#x1F600;');
});

test('escaping everything but letters, digits and spaces', () => {
  assert.equal(escapeHtml('a-b c/1\n', 'all', 'dec'), 'a&#45;b c&#47;1\n');
  assert.equal(escapeHtml('', 'all', 'named'), '');
});
