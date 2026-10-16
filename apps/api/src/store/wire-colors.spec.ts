import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { testDatabase } from './test-database';
import type { Product } from './models';

const customer = { name: 'Wire Test', phone: '9876543210', address: '1 Test Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' };
const colors = [
  { id: 'black', name: 'Black', color: '#202124', price: 118, stock: 2 },
  { id: 'blue', name: 'Blue', color: '#2563eb', price: 236, stock: 3 },
  { id: 'red', name: 'Red', color: '#dc2626', price: 118, stock: 0 },
];
const expected = (product: Product) => structuredClone({ price: product.price, stock: product.stock, variants: product.variants ?? [] });

test('wire colors retain server prices, separate stock, GST and historical color names', async (t) => {
  const { database, store, close } = await testDatabase(); t.after(close);
  let id = '', orderId = '';
  await database.run(() => {
    const product = store.createProduct({ imageUrl: '/test-product.webp', name: 'Copper wire', categoryId: 'wires', price: 118, stock: 5 }); id = product.id;
    store.updateShop({ minimumOrder: 0, gstInclusive: true, gstRate: 18 });
    store.updateProductColors(id, { expected: expected(product), variants: colors });
    assert.equal(product.stock, 5); assert.equal(product.price, 118);
    assert.throws(() => store.resolve([{ productId: id, quantity: 1 }]), /color/i);
    assert.throws(() => store.resolve([{ productId: id, variantId: 'red', quantity: 1 }]), /Only 0/);
    assert.throws(() => store.resolve([{ productId: id, variantId: 'unknown', quantity: 1 }]), /Invalid variant/);
    const order = store.createOrder({ customer, customerCategoryId: 'customer', items: [
      { productId: id, variantId: 'black', quantity: 1 }, { productId: id, variantId: 'blue', quantity: 2 },
    ] }); orderId = order.id;
    assert.equal(order.total, 590); assert.equal(order.gst, 90);
    assert.deepEqual(order.items.map((item) => [item.shade, item.color, item.price]), [['Black', '#202124', 118], ['Blue', '#2563eb', 236]]);
    assert.deepEqual(product.variants!.map((variant) => variant.stock), [1, 1, 0]);
    assert.throws(() => store.resolve([{ productId: id, variantId: 'black', quantity: 2 }]), /Only 1/);
    const renamed = product.variants!.map((variant) => variant.id === 'blue' ? { ...variant, name: 'Royal blue', color: '#1144aa' } : variant);
    store.updateProductColors(id, { expected: expected(product), variants: renamed });
    assert.equal(store.getOrder(orderId).items[1].shade, 'Blue');
  });
  await database.run(() => {
    const product = store.products.find((item) => item.id === id)!;
    assert.equal(product.variants![1].name, 'Royal blue', 'Colors survive a database reload');
    store.updateStatus(orderId, 'Cancelled');
    assert.deepEqual(product.variants!.map((variant) => variant.stock), [2, 3, 0]);
    store.updateStatus(orderId, 'Cancelled');
    assert.deepEqual(product.variants!.map((variant) => variant.stock), [2, 3, 0], 'Cancellation releases each color only once');
  });
});

test('wire edits reject stale stock, invalid colors and inventory changes that strand open orders', async (t) => {
  const { database, store, close } = await testDatabase(); t.after(close);
  await database.run(() => {
    store.updateShop({ minimumOrder: 0 });
    const product = store.createProduct({ imageUrl: '/test-product.webp', name: 'Wire', categoryId: 'wires', price: 118, stock: 5 });
    const old = expected(product);
    const order = store.createOrder({ customer, customerCategoryId: 'customer', items: [{ productId: product.id, quantity: 1 }] });
    assert.throws(() => store.updateProductColors(product.id, { expected: old, variants: colors }), /changed while/);
    assert.throws(() => store.updateProductColors(product.id, { expected: expected(product), variants: colors }), /open order/);
    assert.throws(() => store.updateProduct(product.id, { variants: colors }), /open order/);
    store.updateStatus(order.id, 'Cancelled');
    for (const variants of [[{ ...colors[0], stock: -1 }], [{ ...colors[0], color: 'red' }], [{ ...colors[0], price: -1 }],
      [colors[0], { ...colors[1], id: 'black' }], [colors[0], { ...colors[1], name: ' BLACK ' }]])
      assert.throws(() => store.updateProductColors(product.id, { expected: expected(product), variants }));
    store.updateProductColors(product.id, { expected: expected(product), variants: colors });
    const beforeSale = expected(product);
    store.createOrder({ customer, customerCategoryId: 'customer', items: [{ productId: product.id, variantId: 'blue', quantity: 1 }] });
    assert.throws(() => store.updateProductColors(product.id, { expected: beforeSale, variants: colors }), /changed while/);
    assert.throws(() => store.updateProductColors(product.id, { expected: expected(product), variants: [colors[0]] }), /open order/);
    assert.equal(product.variants![1].stock, 2);
  });
});

test('wire color endpoint requires admin login, rejects malformed input and persists across API restart', async (t) => {
  const fixture = await testDatabase();
  const previous = { ADMIN_PASSWORD: process.env.ADMIN_PASSWORD, AUTH_SECRET: process.env.AUTH_SECRET };
  process.env.ADMIN_PASSWORD = randomUUID(); process.env.AUTH_SECRET = randomUUID();
  const start = async () => { const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1'); return app; };
  let app = await start(), base = `${await app.getUrl()}/api`;
  t.after(async () => { await app.close(); await fixture.close(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const product = await fixture.database.run(() => fixture.store.createProduct({ imageUrl: '/test-product.webp', name: 'Wire', categoryId: 'wires', price: 118, stock: 5 }));
  const payload = { expected: expected(product), variants: colors };
  const path = `/admin/products/${product.id}/colors`;
  const request = (token: string, body: unknown) => fetch(base + path, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await request('', payload)).status, 401);
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD }) });
  const { accessToken } = await login.json() as { accessToken: string };
  for (const invalid of [null, [], {}, { variants: colors }, { expected: {}, variants: colors }]) assert.equal((await request(accessToken, invalid)).status, 400);
  assert.equal((await request(accessToken, payload)).status, 200);
  assert.equal((await request(accessToken, payload)).status, 409, 'An old editor cannot overwrite saved inventory');
  await app.close(); app = await start(); base = `${await app.getUrl()}/api`;
  const catalog = await (await fetch(base + '/catalog')).json() as { products: Product[] };
  assert.deepEqual(catalog.products.find((item) => item.id === product.id)!.variants, colors);
});
