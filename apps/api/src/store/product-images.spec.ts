import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../app.module';
import { testDatabase } from './test-database';
import { normalizeProductImages } from './product-images';

test('product images require a main photo, limit galleries to four and preserve empty optional slots', () => {
  for (const input of [{}, { imageUrl: '' }, { imageUrls: [] }, { imageUrls: ['', '/two.webp'] }])
    assert.throws(() => normalizeProductImages(input), /main product image/);
  for (const imageUrls of [null, '/one.webp', Array(5).fill('/one.webp'), ['/one.webp', null], ['/one.webp', '//external/image.png'],
    ['javascript:alert(1)'], ['/image\n.webp'], ['/one.webp', 'data:image/png;base64,abc']])
    assert.throws(() => normalizeProductImages({ imageUrls } as any));
  assert.deepEqual(normalizeProductImages({ imageUrl: ' /old.jpg ' }), { imageUrl: '/old.jpg', imageUrls: ['/old.jpg'] });
  assert.deepEqual(normalizeProductImages({ imageUrls: ['/main.webp', '', '/three.webp', ''] }), { imageUrl: '/main.webp', imageUrls: ['/main.webp', '', '/three.webp'] });
  assert.deepEqual(normalizeProductImages({ imageUrl: '/replacement.webp' }, { imageUrl: '/old.webp', imageUrls: ['/old.webp', '/two.webp'] } as any),
    { imageUrl: '/replacement.webp', imageUrls: ['/replacement.webp', '/two.webp'] });
  assert.deepEqual(normalizeProductImages({ name: 'Updated' }, { imageUrl: '/legacy.jpg' } as any), {});
});

test('one or four product photos work without colors; optional variants retain stock, prices and order behavior', async (t) => {
  const { database, store, close } = await testDatabase(); t.after(close);
  await database.run(() => {
    store.updateShop({ minimumOrder: 0, gstRate: 18, gstInclusive: true });
    for (const images of [['/main.webp'], ['/main.webp', '/two.webp', '/three.webp', '/four.webp']]) {
      for (const variants of [undefined, [], [{ id: 'blue', name: 'Blue', color: '#00f', price: 236, stock: 5 }]]) {
        const product = store.createProduct({ name: 'Gallery product', categoryId: 'wires', imageUrls: images, price: 118, originalPrice: 400, stock: 5, variants });
        const inventory = structuredClone({ stock: product.stock, price: product.price, variants: product.variants, originalPrice: product.originalPrice });
        store.updateProduct(product.id, { imageUrls: ['/new-main.webp', '', '/new-third.webp'] });
        assert.equal(product.imageUrl, '/new-main.webp');
        assert.deepEqual({ stock: product.stock, price: product.price, variants: product.variants, originalPrice: product.originalPrice }, inventory);
        const snapshot = structuredClone(product);
        assert.throws(() => store.updateProduct(product.id, { imageUrls: ['', '/two.webp'] }), /main product image/);
        assert.deepEqual(product, snapshot, 'Invalid image edits do not change inventory or saved photos');
        const order = store.createOrder({ customerCategoryId: 'customer', customer: { name: 'Gallery Customer', phone: '9876543210', address: '1 Test Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' },
          items: [{ productId: product.id, quantity: 1, ...(variants?.length ? { variantId: 'blue' } : {}) }] });
        assert.equal(order.items[0].price, variants?.length ? 236 : 118);
        assert.equal(order.items[0].shade, variants?.length ? 'Blue' : undefined);
        assert.equal(order.gst, variants?.length ? 36 : 18);
        store.updateStatus(order.id, 'Cancelled');
        assert.equal(variants?.length ? product.variants![0].stock : product.stock, 5);
      }
    }
    const plainWire = store.createProduct({ imageUrl: '/wire.webp', name: 'Wire without colors', categoryId: 'wires', price: 118, stock: 9 });
    store.updateProductColors(plainWire.id, { variants: [], expected: { variants: [], stock: 9, price: 118 } });
    assert.equal(plainWire.stock, 9); assert.equal(plainWire.price, 118);
    const colored = store.createProduct({ imageUrl: '/wire.webp', name: 'Wire', categoryId: 'wires', price: 118, stock: 10,
      variants: [{ id: 'black', name: 'Black', color: '#000', price: 118, stock: 2 }, { id: 'blue', name: 'Blue', color: '#00f', price: 236, stock: 3 }] });
    store.updateProductColors(colored.id, { variants: [], expected: { variants: structuredClone(colored.variants), price: colored.price, stock: colored.stock } });
    assert.equal(colored.stock, 5); assert.equal(colored.price, 118); assert.deepEqual(colored.variants, []);
  });
});

test('all uploaded gallery images are optimized, persist through API restart and remain compatible with single-image clients', async (t) => {
  const fixture = await testDatabase();
  const previous = { ADMIN_PASSWORD: process.env.ADMIN_PASSWORD, AUTH_SECRET: process.env.AUTH_SECRET };
  process.env.ADMIN_PASSWORD = randomUUID(); process.env.AUTH_SECRET = randomUUID();
  const start = async () => { const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1'); return app; };
  let app = await start(), base = `${await app.getUrl()}/api`, token = '';
  t.after(async () => { await app.close(); await fixture.close(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const request = (path: string, method = 'GET', body?: unknown) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const login = await request('/auth/login', 'POST', { username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD });
  token = (await login.json() as { accessToken: string }).accessToken;
  const imageUrls: string[] = [];
  for (const format of ['jpeg', 'png', 'webp', 'png'] as const) {
    const bytes = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: '#325ae0' } }).toFormat(format).toBuffer();
    const form = new FormData(); form.append('file', new Blob([new Uint8Array(bytes)], { type: `image/${format}` }), `photo.${format}`);
    const response = await fetch(base + '/admin/uploads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    assert.equal(response.status, 201); imageUrls.push((await response.json() as { url: string }).url);
  }
  const details = { name: 'Gallery upload', categoryId: 'wires', price: 118, originalPrice: 150, stock: 7, variants: [] };
  assert.equal((await request('/admin/products', 'POST', details)).status, 400);
  assert.equal((await request('/admin/products', 'POST', { ...details, imageUrls: ['', imageUrls[1]] })).status, 400);
  assert.equal((await request('/admin/products', 'POST', { ...details, imageUrls: [...imageUrls, imageUrls[0]] })).status, 400);
  const created = await request('/admin/products', 'POST', { ...details, imageUrls });
  assert.equal(created.status, 201);
  const product = await created.json() as any;
  assert.deepEqual(product.imageUrls, imageUrls); assert.equal(product.imageUrl, imageUrls[0]);
  const legacy = await request('/admin/products', 'POST', { ...details, name: 'Single photo', imageUrl: imageUrls[0] });
  assert.equal(legacy.status, 201); const single = await legacy.json() as any;
  await fixture.database.run(() => { delete fixture.store.products.find((item) => item.id === single.id)!.imageUrls; fixture.store.updateShop({ minimumOrder: 0 }); });
  assert.equal((await request(`/admin/products/${single.id}`, 'PATCH', { name: 'Legacy edited' })).status, 200);
  assert.equal((await request(`/admin/products/${product.id}`, 'PATCH', { imageUrl: imageUrls[3] })).status, 200);
  await app.close(); app = await start(); base = `${await app.getUrl()}/api`;
  const catalog = await (await request('/catalog')).json() as any;
  const restored = catalog.products.find((item: any) => item.id === product.id);
  assert.deepEqual(restored.imageUrls, [imageUrls[3], ...imageUrls.slice(1)]);
  assert.equal(restored.price, 118); assert.equal(restored.originalPrice, 150); assert.equal(restored.stock, 7); assert.deepEqual(restored.variants, []);
  assert.equal(catalog.products.find((item: any) => item.id === single.id).imageUrl, imageUrls[0]);
  for (const url of imageUrls) {
    const photo = await fetch(base.replace(/\/api$/, '') + url);
    assert.equal(photo.status, 200); assert.equal(photo.headers.get('content-type'), 'image/webp');
    const metadata = await sharp(Buffer.from(await photo.arrayBuffer())).metadata();
    assert.equal(metadata.width, 2400); assert.equal(metadata.height, 1200);
  }
});
