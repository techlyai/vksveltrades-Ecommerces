import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { assetUrl, shopLogoUrl } from '../lib/assets.ts';

test('default shop logo uses the reference artwork, without a mock catalog', () => {
  assert.equal(shopLogoUrl('/api/media/logo.svg'), '/brand/reference-logo.svg');
  assert.equal(shopLogoUrl(), '/brand/reference-logo.svg');
});

test('admin uploaded and externally hosted logos take precedence', () => {
  assert.equal(shopLogoUrl('/api/uploads/custom-logo.png'), assetUrl('/api/uploads/custom-logo.png'));
  assert.equal(shopLogoUrl('https://example.com/shop.png'), 'https://example.com/shop.png');
});

test('bundled banner artwork stays on the frontend origin', () => {
  assert.equal(assetUrl('/banners/finolex.jpeg'), '/banners/finolex.jpeg');
  assert.equal(assetUrl('/brand/reference-logo.svg'), '/brand/reference-logo.svg');
});

test('only the bundled tank banner uses transparent artwork without changing custom uploads', () => {
  assert.equal(assetUrl('/banners/astral.jpeg'), '/banners/astral-transparent.webp');
  assert.equal(assetUrl('/banners/astral-white.webp'), '/banners/astral-transparent.webp');
  assert.equal(assetUrl('/banners/astral-transparent.webp'), '/banners/astral-transparent.webp');
  for (const name of ['finolex', 'kundan', 'cera', 'pvc-taps', 'leo', 'roff', 'araldite', 'ramco', 'dulux', 'philips', 'surya', 'polycab']) {
    assert.equal(assetUrl(`/banners/${name}.jpeg`), `/banners/${name}.jpeg`);
  }
  assert.equal(assetUrl('https://example.com/banners/astral.jpeg'), 'https://example.com/banners/astral.jpeg');
  assert.equal(assetUrl('/api/uploads/astral.jpeg'), `${(process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/api\/?$/, '')}/api/uploads/astral.jpeg`);
});
