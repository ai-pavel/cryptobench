import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, DEFAULT_PAIR, convert, fmt } from '../../src/utilities/unit-converter/unit-converter.js';

const conv = (v, cat, from, to) => fmt(convert(v, cat, from, to));

test('the default page shows 1 km in miles', () => {
  assert.deepEqual(DEFAULT_PAIR.Length, ['km', 'mi']);
  assert.equal(conv(1, 'Length', 'km', 'mi'), '0.6213711922');
});

test('exact definitions (international yard and pound)', () => {
  assert.equal(conv(1, 'Length', 'in', 'cm'), '2.54');
  assert.equal(conv(1, 'Length', 'mi', 'ft'), '5280');
  assert.equal(conv(1, 'Length', 'nmi', 'm'), '1852');
  assert.equal(conv(1, 'Weight', 'lb', 'oz'), '16');
  assert.equal(conv(1, 'Weight', 'st', 'lb'), '14');
  assert.equal(conv(1, 'Weight', 'lb', 'kg'), '0.45359237');
  assert.equal(conv(1, 'Volume', 'gal', 'cup'), '16');
  assert.equal(conv(1, 'Volume', 'tbsp', 'tsp'), '3');
  assert.equal(conv(1, 'Area', 'mi2', 'ac'), '640');
  assert.equal(conv(1, 'Area', 'ha', 'm2'), '10000');
  assert.equal(conv(100, 'Speed', 'kmh', 'mph'), '62.13711922');
  assert.equal(conv(1, 'Speed', 'kn', 'kmh'), '1.852');
  assert.equal(conv(1, 'Time', 'wk', 'h'), '168');
  assert.equal(conv(1, 'Time', 'yr', 'd'), '365');
  assert.equal(conv(1, 'Data', 'GB', 'GiB'), '0.9313225746');
  assert.equal(conv(1, 'Data', 'KiB', 'bit'), '8192');
});

test('temperature conversions', () => {
  assert.equal(conv(100, 'Temperature', 'c', 'f'), '212');
  assert.equal(conv(-40, 'Temperature', 'f', 'c'), '-40');
  assert.equal(conv(0, 'Temperature', 'k', 'c'), '-273.15');
  assert.equal(conv(98.6, 'Temperature', 'f', 'c'), '37');
  assert.equal(conv(32, 'Temperature', 'f', 'k'), '273.15');
});

test('every unit converts to itself', () => {
  for (const [cat, units] of Object.entries(UNITS)) {
    for (const u of Object.keys(units)) assert.equal(conv(123.5, cat, u, u), '123.5', `${cat} ${u}`);
    const [a, b] = DEFAULT_PAIR[cat];
    assert.ok(units[a] && units[b], cat);
  }
});

test('fmt: 10 significant digits, exponent for very large or small values', () => {
  assert.equal(fmt(0), '0');
  assert.equal(fmt(1 / 3), '0.3333333333');
  assert.equal(fmt(123456789012), '123456789000'); // rounded to 10 digits
  assert.equal(fmt(1e12), '1e+12');
  assert.equal(fmt(1234567890123), '1.234568e+12');
  assert.equal(fmt(1e-7), '1e-7');
  assert.equal(fmt(-2.5e-9), '-2.5e-9');
  assert.equal(fmt(0.000001), '0.000001');
  assert.equal(fmt(Infinity), '');
  assert.equal(fmt(NaN), '');
});
