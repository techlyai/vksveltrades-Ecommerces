import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import load from './load-source.cjs';

const { paintShades, shadeFamilies, findPaintShade, filterPaintShades, paintShadeRequest } = load('../lib/paint-shades.ts');

test('the supplied card contains all 133 unique verified codes and usable screen colors', () => {
  assert.equal(paintShades.length, 133);
  assert.equal(new Set(paintShades.map((shade) => shade.code)).size, 133);
  assert.equal(shadeFamilies.length, 6);
  assert.deepEqual(shadeFamilies.map((family) => paintShades.filter((shade) => shade.family === family).length), [21, 21, 21, 21, 21, 28]);
  const sources = JSON.parse(readFileSync(new URL('../docs/shade-card-sources.json', import.meta.url)));
  for (const shade of paintShades) {
    assert.match(shade.code, /^[A-Z]{2} \d{4}$/);
    assert.match(shade.color, /^#[0-9a-f]{6}$/);
    assert.ok(shade.name.trim());
    const source = sources.shades.find((entry) => entry.code === shade.code);
    assert.equal(source.name, shade.name);
    assert.equal(source.color, shade.color);
    assert.ok(source.source.startsWith('https://www.birlaopus.com/colour-catalogue/'));
    assert.ok(paintShadeRequest(shade.code).length <= 80, 'Complete shade names must fit the server annotation limit');
  }
  // These small codes are blurred in the photographs; assert the verified catalogue values.
  assert.equal(findPaintShade('BB 5000').name, 'Into the Light');
  assert.equal(findPaintShade('BB 5165').name, 'TGIF');
  assert.equal(findPaintShade('WW 0176').name, '42 Watt Smiles');
  assert.equal(findPaintShade('NN 9192').name, 'She Talks in Proverbs');
  assert.equal(findPaintShade('RR 3801').name, 'Home for Holidays');
});

test('customers can find a shade using names, partial codes and familiar code formats', () => {
  assert.equal(findPaintShade(' #ww-0029 ').name, 'Jasmine');
  assert.equal(filterPaintShades('jasmine')[0].code, 'WW 0029');
  assert.equal(filterPaintShades('bb5046')[0].name, 'Kutchi Night');
  assert.equal(filterPaintShades('5046')[0].code, 'BB 5046');
  assert.equal(filterPaintShades('jasmine', 'Reds and Purples').length, 0);
  assert.equal(filterPaintShades('', 'Reds and Purples').length, 21);
  assert.deepEqual(filterPaintShades('no matching color'), []);
  assert.equal(findPaintShade('WW 00'), undefined, 'A partial code must not silently select another shade');
});

test('orders receive the full brand, shade name and code while unlisted custom requests remain intact', () => {
  assert.equal(paintShadeRequest('bb-5046'), 'Birla Opus / BB 5046 / Kutchi Night');
  assert.equal(paintShadeRequest(' #H10873 '), '#H10873');
  assert.equal(paintShadeRequest(''), '');
  const saved = paintShadeRequest('WW 0029');
  assert.equal(paintShadeRequest(saved), saved, 'Existing saved order annotations remain readable');
});

test('saved admin shade changes replace defaults and customer code edits do not retain the previous shade name', () => {
  const card = [{ id: 'one', code: 'SHOP 77', name: 'Uploaded blue', brand: 'Shop card', family: 'Blue', color: '#225588', imageUrl: '/api/media/uploads/test.webp', enabled: true },
    { ...paintShades[0], enabled: false }];
  assert.equal(findPaintShade('shop-77', card).imageUrl, card[0].imageUrl);
  assert.equal(paintShadeRequest('shop77', card), 'Shop card / SHOP 77 / Uploaded blue');
  assert.equal(paintShadeRequest('SHOP 78', card), 'SHOP 78');
  assert.equal(findPaintShade('WW 0029', card), undefined);
  assert.equal(filterPaintShades('', 'all', card).length, 1);
  assert.equal(filterPaintShades('Shop card', 'all', card).length, 1);
  assert.deepEqual(filterPaintShades('', 'all', []), []);
  assert.equal(paintShadeRequest('WW 0029', []), 'WW 0029', 'An empty live card must not restore removed defaults');
});
