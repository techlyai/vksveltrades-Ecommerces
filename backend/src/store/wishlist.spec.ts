import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { StoreDatabase } from './store.database';
import { testDatabase } from './test-database';
import { WishlistController, wishlistOwner } from './wishlist.controller';

test('wishlist credentials require a random capability, not an admin token or product ID', () => {
  for (const invalid of [undefined, '', 'Bearer admin', 'Wishlist short', `Wishlist ${'g'.repeat(64)}`]) {
    assert.throws(() => wishlistOwner(invalid));
  }
  const key = randomBytes(32).toString('hex');
  assert.notEqual(wishlistOwner(`Wishlist ${key}`), key);
  assert.equal(wishlistOwner(`Wishlist ${key}`), wishlistOwner(`Wishlist ${key}`));
});

test('wishlist add/remove API is isolated, idempotent and persistent across API instances', async (t) => {
  const fixture = await testDatabase();
  t.after(() => fixture.close());
  const product = await fixture.database.run(() => fixture.store.createProduct({ imageUrl: '/test-product.webp', name: 'Test fan', categoryId: 'fans', price: 100, stock: 5 }));
  @Module({ controllers: [WishlistController], providers: [StoreDatabase] })
  class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = `${await app.getUrl()}/api/wishlist`;
  const token = randomBytes(32).toString('hex');
  const headers = { Authorization: `Wishlist ${token}` };
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(`${base}/missing`, { method: 'PUT', headers })).status, 404);
  const changes = await Promise.all(Array.from({ length: 4 }, () => fetch(`${base}/${product.id}`, { method: 'PUT', headers })));
  assert.ok(changes.every((response) => response.status === 200));
  assert.deepEqual(await (await fetch(base, { headers })).json(), { productIds: [product.id] });
  assert.deepEqual(await fixture.database.wishlist(wishlistOwner(headers.Authorization)), { productIds: [product.id] });
  assert.deepEqual(await (await fetch(base, { headers: { Authorization: `Wishlist ${randomBytes(32).toString('hex')}` } })).json(), { productIds: [] });
  const second = new StoreDatabase();
  await second.onModuleInit();
  try { assert.deepEqual(await second.wishlist(wishlistOwner(headers.Authorization)), { productIds: [product.id] }); }
  finally { await second.onModuleDestroy(); }
  assert.equal((await fetch(`${base}/${product.id}`, { method: 'DELETE', headers })).status, 200);
  assert.equal((await fetch(`${base}/${product.id}`, { method: 'DELETE', headers })).status, 200);
  assert.deepEqual(await (await fetch(base, { headers })).json(), { productIds: [] });
});

test('wishlist excludes disabled categories/products and deleted items, even after saving', async (t) => {
  const { database, store, close } = await testDatabase();
  t.after(close);
  const owner = wishlistOwner(`Wishlist ${randomBytes(32).toString('hex')}`);
  const product = await database.run(() => store.createProduct({ imageUrl: '/test-product.webp', name: 'Lamp', categoryId: 'lighting', price: 10, stock: 0 }));
  await database.changeWishlist(owner, product.id, true);
  await database.run(() => store.updateCategory('lighting', { enabled: false }));
  assert.deepEqual(await database.wishlist(owner), { productIds: [] });
  await assert.rejects(database.changeWishlist(owner, product.id, true));
  await database.run(() => { store.updateCategory('lighting', { enabled: true }); store.updateProduct(product.id, { enabled: false }); });
  assert.deepEqual(await database.wishlist(owner), { productIds: [] });
  await assert.rejects(database.changeWishlist(owner, product.id, true));
  await database.run(() => store.deleteProduct(product.id));
  assert.deepEqual(await database.wishlist(owner), { productIds: [] });
  await database.changeWishlist(owner, product.id, false);
});

test('concurrent wishlist changes keep different products and enforce the 200-item limit', async (t) => {
  const { database, store, close } = await testDatabase();
  t.after(close);
  const owner = wishlistOwner(`Wishlist ${randomBytes(32).toString('hex')}`);
  const products = await database.run(() => Array.from({ length: 201 }, (_, index) => store.createProduct({ imageUrl: '/test-product.webp', name: `Product ${index}`, categoryId: 'hardware', price: 10, stock: 1 })));
  await Promise.all(products.slice(0, 200).map((product) => database.changeWishlist(owner, product.id, true)));
  assert.equal((await database.wishlist(owner)).productIds.length, 200);
  await assert.rejects(database.changeWishlist(owner, products[200].id, true), /wishlist is full/);
  await database.changeWishlist(owner, products[0].id, false);
  await database.changeWishlist(owner, products[200].id, true);
  assert.equal((await database.wishlist(owner)).productIds.length, 200);
  await database.run(() => store.deleteProduct(products[1].id));
  await database.changeWishlist(owner, products[0].id, true);
  assert.equal((await database.wishlist(owner)).productIds.length, 200);
});

test('sample migration upgrades an existing catalog without overwriting its products or banners', async (t) => {
  const { database, store, schema, close } = await testDatabase();
  t.after(close);
  const existing = await database.run(() => {
    const product = store.createProduct({ imageUrl: '/test-product.webp', name: 'Real lamp', categoryId: 'lighting', price: 399, stock: 9 });
    const banner = store.createBanner({ label: 'Lighting', title: 'Admin promotion', description: 'Original admin copy', categoryId: 'lighting', duration: 8 });
    return { product, banner };
  });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await pool.query(`DELETE FROM "${schema}".vks_migrations WHERE name = 'requested-display-samples-v1'`); }
  finally { await pool.end(); }
  await database.onModuleInit();
  await database.run(() => {
    assert.equal(store.products.length, 12);
    assert.deepEqual(store.products.find((product) => product.id === existing.product.id), existing.product);
    assert.deepEqual(store.banners.find((banner) => banner.id === existing.banner.id), existing.banner);
  });
});

test('requested sample catalog adds one safe sample per category and does not restore admin deletions', async (t) => {
  const { database, store, close } = await testDatabase({ samples: true });
  t.after(close);
  await database.run(() => {
    assert.equal(store.products.length, 11);
    for (const category of store.categories) assert.equal(store.products.filter((product) => product.categoryId === category.id).length, 1);
    assert.ok(store.products.every((product) => product.stock === 0 && product.name.startsWith('Sample ')));
    assert.equal(store.banners.filter((banner) => banner.id.startsWith('sample-banner-')).length, 3);
    assert.ok(store.banners.filter((banner) => banner.id.startsWith('sample-banner-')).every((banner) => banner.duration === 2));
    store.updateProduct('sample-fans', { name: 'Admin edited product', price: 250 });
    store.deleteProduct('sample-electrical');
    store.deleteBanner('sample-banner-electrical');
  });
  await database.onModuleInit();
  await database.run(() => {
    assert.equal(store.products.length, 10);
    assert.equal(store.products.find((product) => product.id === 'sample-fans')?.name, 'Admin edited product');
    assert.equal(store.banners.filter((banner) => banner.id.startsWith('sample-banner-')).length, 2);
  });
});
