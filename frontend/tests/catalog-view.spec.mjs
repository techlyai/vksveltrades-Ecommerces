import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { filterProducts, productAvailability, safeBannerUrl, visibleProducts } from '../lib/catalog-view.ts';

const product = { id: 'one', name: 'LED bulb', short: 'Warm white', hsn: '8539', price: 120, stock: 3, categoryId: 'lighting', enabled: true };

test('shop hides disabled categories and their products', () => {
  assert.deepEqual(visibleProducts({ categories: [{ id: 'lighting', enabled: false }], products: [product] }), []);
  assert.deepEqual(visibleProducts({ categories: [{ id: 'lighting', enabled: true }], products: [product, { ...product, id: 'hidden', enabled: false }] }), [product]);
});
test('search handles HSN, descriptions and whitespace without changing catalog order', () => {
  const products = [{ ...product, id: 'high', price: 500 }, product];
  assert.equal(filterProducts(products, 'all', ' 8539 ', 'featured').length, 2);
  assert.equal(filterProducts(products, 'all', 'warm WHITE', 'featured').length, 2);
  assert.equal(filterProducts(products, 'lighting', '', 'low')[0].id, 'one');
  assert.equal(products[0].id, 'high');
  assert.deepEqual(filterProducts(products, 'paints', '', 'featured'), []);
});
test('stock display distinguishes plain products, shades and manual unavailability', () => {
  assert.deepEqual(productAvailability({ ...product, variants: [] }), { stock: 3, unavailable: false, hasVariants: false });
  assert.deepEqual(productAvailability({ ...product, variants: [{ stock: 2 }, { stock: 4 }] }), { stock: 6, unavailable: false, hasVariants: true });
  assert.equal(productAvailability({ ...product, manualOutOfStock: true }).unavailable, true);
});
test('banner links allow web destinations but never executable protocols', () => {
  assert.equal(safeBannerUrl('https://example.com/catalog'), 'https://example.com/catalog');
  for (const value of ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', '', undefined]) assert.equal(safeBannerUrl(value), null);
});
