import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import load from './load-source.cjs';

const { productImageSlots, productImages } = load('../lib/product-images.ts');

test('legacy single photos occupy only the main slot; optional gaps retain their positions', () => {
  assert.deepEqual(productImageSlots({ imageUrl: '/legacy.jpg' }), ['/legacy.jpg', '', '', '']);
  assert.deepEqual(productImageSlots({ imageUrls: ['/main.webp', '', '/third.webp'] }), ['/main.webp', '', '/third.webp', '']);
  assert.deepEqual(productImages({ imageUrls: ['/main.webp', '', '/third.webp'] }), ['/main.webp', '/third.webp']);
  assert.deepEqual(productImageSlots({}), ['', '', '', '']);
});

test('removing the main photo cannot silently promote an optional photo or restore the old main alias', () => {
  const product = { imageUrl: '/old.webp', imageUrls: ['', '/second.webp', '', '/fourth.webp'] };
  assert.equal(productImageSlots(product)[0], '');
  assert.deepEqual(productImages(product), ['/second.webp', '/fourth.webp']);
  assert.deepEqual(productImageSlots({ imageUrl: '/old.webp', imageUrls: [] }), ['', '', '', '']);
});
