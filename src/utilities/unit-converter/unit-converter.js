// Unit Converter: convert between units of length, weight, temperature and more.
// Factor = how many base units one unit is.
export const UNITS = {
  Length: { m: ['Meter', 1], km: ['Kilometer', 1000], cm: ['Centimeter', 0.01], mm: ['Millimeter', 0.001],
    mi: ['Mile', 1609.344], yd: ['Yard', 0.9144], ft: ['Foot', 0.3048], in: ['Inch', 0.0254], nmi: ['Nautical mile', 1852] },
  Weight: { kg: ['Kilogram', 1], g: ['Gram', 0.001], mg: ['Milligram', 1e-6], t: ['Tonne', 1000],
    lb: ['Pound', 0.45359237], oz: ['Ounce', 0.028349523125], st: ['Stone', 6.35029318] },
  Temperature: { c: ['Celsius'], f: ['Fahrenheit'], k: ['Kelvin'] },
  Volume: { l: ['Liter', 1], ml: ['Milliliter', 0.001], m3: ['Cubic meter', 1000], gal: ['US gallon', 3.785411784],
    qt: ['US quart', 0.946352946], pt: ['US pint', 0.473176473], cup: ['US cup', 0.2365882365], floz: ['US fluid ounce', 0.0295735295625],
    tbsp: ['Tablespoon', 0.01478676478125], tsp: ['Teaspoon', 0.00492892159375] },
  Area: { m2: ['Square meter', 1], km2: ['Square kilometer', 1e6], ha: ['Hectare', 1e4], ac: ['Acre', 4046.8564224],
    ft2: ['Square foot', 0.09290304], mi2: ['Square mile', 2589988.110336] },
  Speed: { ms: ['Meters per second', 1], kmh: ['Kilometers per hour', 1 / 3.6], mph: ['Miles per hour', 0.44704], kn: ['Knot', 1852 / 3600] },
  Time: { s: ['Second', 1], min: ['Minute', 60], h: ['Hour', 3600], d: ['Day', 86400], wk: ['Week', 604800], yr: ['Year (365 days)', 31536000] },
  Data: { B: ['Byte', 1], KB: ['Kilobyte', 1e3], MB: ['Megabyte', 1e6], GB: ['Gigabyte', 1e9], TB: ['Terabyte', 1e12],
    KiB: ['Kibibyte', 1024], MiB: ['Mebibyte', 1024 ** 2], GiB: ['Gibibyte', 1024 ** 3], bit: ['Bit', 0.125] },
};
export const DEFAULT_PAIR = { Length: ['km', 'mi'], Weight: ['kg', 'lb'], Temperature: ['c', 'f'], Volume: ['l', 'gal'],
  Area: ['m2', 'ft2'], Speed: ['kmh', 'mph'], Time: ['h', 'min'], Data: ['GB', 'GiB'] };

const $ = id => document.getElementById(id);
const toC = { c: v => v, f: v => (v - 32) * 5 / 9, k: v => v - 273.15 };
const fromC = { c: v => v, f: v => v * 9 / 5 + 32, k: v => v + 273.15 };

export function convert(v, cat, from, to) {
  if (cat === 'Temperature') return fromC[to](toC[from](v));
  const u = UNITS[cat];
  return v * u[from][1] / u[to][1];
}
export function fmt(n) {
  if (!isFinite(n)) return '';
  if (n !== 0 && (Math.abs(n) >= 1e12 || Math.abs(n) < 1e-6)) return n.toExponential(6).replace(/\.?0+e/, 'e');
  return String(+n.toPrecision(10));
}

function mount() {
  function fillUnits() {
    const u = UNITS[$('cat').value], opts = Object.entries(u).map(([k, [name]]) => `<option value="${k}">${name}</option>`).join('');
    $('ua').innerHTML = $('ub').innerHTML = opts;
    [$('ua').value, $('ub').value] = DEFAULT_PAIR[$('cat').value];
  }
  function update(from = 'a') {
    const [src, dst, us, ud] = from === 'a' ? ['a', 'b', 'ua', 'ub'] : ['b', 'a', 'ub', 'ua'];
    const v = parseFloat($(src).value);
    $(dst).value = isNaN(v) ? '' : fmt(convert(v, $('cat').value, $(us).value, $(ud).value));
    renderAll();
  }
  function renderAll() {
    const v = parseFloat($('a').value), u = UNITS[$('cat').value];
    $('all').tBodies[0].innerHTML = isNaN(v) ? '' : Object.entries(u).map(([k, [name]]) =>
      `<tr><td>${name}</td><td class="mono">${fmt(convert(v, $('cat').value, $('ua').value, k))}</td></tr>`).join('');
  }

  $('cat').innerHTML = Object.keys(UNITS).map(c => `<option>${c}</option>`).join('');
  $('cat').onchange = () => { fillUnits(); update('a'); };
  $('a').oninput = () => update('a');
  $('b').oninput = () => update('b');
  $('ua').onchange = () => update('a');
  $('ub').onchange = () => update('a');
  $('swap').onclick = () => { [$('ua').value, $('ub').value] = [$('ub').value, $('ua').value]; update('a'); };
  fillUnits(); update('a');
}

if (globalThis.document) mount();
