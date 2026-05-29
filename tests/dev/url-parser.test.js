import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUrl, safeDecode, buildSearch, componentRows } from '../../src/dev/url-parser/url-parser.js';

const values = rows => Object.fromEntries(rows.filter(Boolean).map(r => [r.label, r.value]));
const EXAMPLE = 'https://user:pass@example.com:8080/path/to/page.html?q=hello%20world&lang=en&tag=a&tag=b#section-2';

test('example URL is split into its parts', () => {
  const r = parseUrl(EXAMPLE);
  assert.deepEqual(values(r.rows), {
    Protocol: 'https:', Username: 'user', Password: 'pass', Host: 'example.com:8080', Hostname: 'example.com', Port: '8080',
    Origin: 'https://example.com:8080', Path: '/path/to/page.html', 'Path (decoded)': '/path/to/page.html',
    Query: '?q=hello%20world&lang=en&tag=a&tag=b', Fragment: '#section-2', 'Normalized URL': EXAMPLE,
  });
  assert.deepEqual([...r.url.searchParams], [['q', 'hello world'], ['lang', 'en'], ['tag', 'a'], ['tag', 'b']]);
});

test('default ports, missing parts and normalization (WHATWG URL)', () => {
  const v = values(parseUrl('HTTPS://Example.COM/a/../b%20c').rows);
  assert.equal(v.Port, '(default 443)');
  assert.equal(v.Hostname, 'example.com');
  assert.equal(v.Path, '/b%20c');
  assert.equal(v['Path (decoded)'], '/b c');
  assert.equal(v.Username, undefined);
  assert.equal(v.Query, undefined);
  assert.equal(v['Normalized URL'], 'https://example.com/b%20c');
  assert.equal(values(parseUrl('http://x.org').rows).Port, '(default 80)');
  assert.equal(values(parseUrl('ftp://x.org').rows).Port, '(default)');
  assert.equal(parseUrl('http://x.org:80').rows[5].copy, false);
});

test('empty and relative URLs', () => {
  assert.equal(parseUrl(' '), null);
  assert.throws(() => parseUrl('/just/a/path'), /Not a valid absolute URL/);
});

test('safeDecode leaves malformed escapes alone', () => {
  assert.equal(safeDecode('%E2%82%AC'), '€');
  assert.equal(safeDecode('%E2%82'), '%E2%82');
});

test('rebuilding the query from edited parameters', () => {
  assert.equal(buildSearch([['q', 'hello world'], ['', ''], ['a&b', '=']]), 'q=hello+world&a%26b=%3D');
  assert.equal(buildSearch([['', 'v']]), '=v');
  assert.equal(buildSearch([]), '');
});

test('encoding a component', () => {
  assert.deepEqual(values(componentRows('a b&c=d/é')), {
    encodeURIComponent: 'a%20b%26c%3Dd%2F%C3%A9',
    encodeURI: 'a%20b&c=d/%C3%A9',
    'Form encoding': 'a+b%26c%3Dd%2F%C3%A9',
    Decoded: 'a b&c=d/é',
  });
  assert.equal(values(componentRows('a+b%20c')).Decoded, 'a b c');
  assert.equal(values(componentRows('%zz')).Decoded, '(not valid percent-encoding)');
});
