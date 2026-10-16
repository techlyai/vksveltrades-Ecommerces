import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { StoreDatabase } from './store.database';
import { StoreService } from './store.service';
import { testDatabase } from './test-database';
import { ImageStorage } from './image-storage.service';
import { Pool } from 'pg';
import { shopCategories } from './shop-categories';

const customer = { name: 'Test Customer', phone: '9876543210', address: '1 Test Street',
  area: 'Test Area', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625020' };

test('shop category import is explicit, repeatable and preserves existing edits', async (t) => {
  const fixture = await testDatabase();
  t.after(() => fixture.close());
  const { database: db, store } = fixture;
  await db.run(() => {
    store.categories.splice(0);
    db.markChanged();
    const custom = store.createCategory({ name: 'Paints', icon: 'custom', enabled: false });
    assert.equal(store.importShopCategories().added, 10);
    assert.equal(store.categories.length, 11);
    assert.equal(store.importShopCategories().added, 0);
    assert.equal(store.categories.find((item) => item.id === custom.id)?.enabled, false);
    assert.equal(store.catalog().categories.length, 10);
    assert.equal(store.products.length, 0);
    assert.throws(() => store.createCategory({ name: ' PAINTS ' }), /already exists/);
    assert.throws(() => store.updateCategory(custom.id, { name: 'Fans' }), /already exists/);
  });
  await db.run(() => assert.equal(store.categories.length, 11));
});

test('category initialization upgrades an existing shop once and preserves admin edits and deletions', async (t) => {
  const fixture = await testDatabase();
  t.after(() => fixture.close());
  const { database: db, store, schema } = fixture;
  // Model the previous release: existing edited categories, no migration marker.
  await db.run(() => {
    store.categories.splice(1);
    store.updateCategory('electrical', { name: 'Custom Electrical', enabled: false });
    const paints = store.createCategory({ name: ' PAINTS ', icon: 'custom', enabled: false });
    store.createProduct({ imageUrl: '/test-product.webp', name: 'Existing item', categoryId: paints.id, price: 25, stock: 7 });
  });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`DELETE FROM "${schema}".vks_migrations WHERE name = 'shop-categories-v1'`);
  } finally { await pool.end(); }
  const second = new StoreDatabase();
  const third = new StoreDatabase();
  try {
    await Promise.all([second.onModuleInit(), third.onModuleInit()]);
    await db.run(() => {
      assert.equal(store.categories.length, 11);
      assert.equal(store.categories.find((item) => item.id === 'electrical')?.name, 'Custom Electrical');
      assert.equal(store.categories.find((item) => item.name === 'PAINTS')?.enabled, false);
      assert.equal(store.products.length, 1);
      assert.equal(store.products[0].stock, 7);
      assert.equal(store.catalog().categories.length, 9);
      store.deleteCategory('fans');
    });
    await second.onModuleInit();
    await db.run(() => assert.equal(store.categories.some((item) => item.id === 'fans'), false));
    await db.run(() => {
      store.products.splice(0);
      for (const category of [...store.categories]) store.deleteCategory(category.id);
    });
    await third.onModuleInit();
    await db.run(() => assert.equal(store.categories.length, 0));
  } finally {
    await second.onModuleDestroy();
    await third.onModuleDestroy();
  }
});

test('storage configuration is mandatory; file fallback is never used', () => {
  const url = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try { assert.throws(() => new StoreDatabase(), /DATABASE_URL is required/); }
  finally { process.env.DATABASE_URL = url; }
  const endpoint = process.env.S3_ENDPOINT;
  delete process.env.S3_ENDPOINT;
  try { assert.throws(() => new ImageStorage(), /S3_ENDPOINT is required/); }
  finally { process.env.S3_ENDPOINT = endpoint; }
});

test('missing Garage bucket fails readiness instead of accepting local uploads', async () => {
  const bucket = process.env.S3_BUCKET;
  process.env.S3_BUCKET = 'missing-bucket-for-readiness-test';
  const storage = new ImageStorage();
  try { await assert.rejects(storage.health(), /Image storage is unavailable/); }
  finally { storage.onModuleDestroy(); process.env.S3_BUCKET = bucket; }
});

test('empty fixture saves catalog, configuration and stock across PostgreSQL instances', async (t) => {
  const fixture = await testDatabase();
  t.after(() => fixture.close());
  const { database: db, store } = fixture;
  const product = await db.run(() => {
    assert.equal(store.products.length, 0);
    assert.deepEqual(store.categories, shopCategories);
    const category = store.createCategory({ name: ' Test Lighting ', enabled: true });
    assert.equal(category.name, 'Test Lighting');
    return store.createProduct({ imageUrl: '/test-product.webp', name: ' Panel light ', categoryId: category.id, price: 120.5, stock: 3 });
  });
  assert.equal(product.name, 'Panel light');
  await db.run(() => { store.adjustStock(product.id, 12); store.updateShop({ name: 'Saved shop' }); });
  const second = new StoreDatabase();
  await second.onModuleInit();
  try {
    const loaded = new StoreService(second);
    await second.run(() => {
      assert.equal(loaded.products[0].stock, 12);
      assert.equal(loaded.shop.name, 'Saved shop');
    });
  } finally { await second.onModuleDestroy(); }
});

test('validation and transaction errors roll back without changing persisted stock', async (t) => {
  const fixture = await testDatabase();
  t.after(() => fixture.close());
  const { database: db, store } = fixture;
  const product = await db.run(() => {
    const category = store.createCategory({ name: 'Test Lighting' });
    return store.createProduct({ imageUrl: '/test-product.webp', name: 'Lamp', categoryId: category.id, price: 50, stock: 4 });
  });
  await assert.rejects(db.run(() => store.adjustStock(product.id, -1)));
  await assert.rejects(db.run(() => store.adjustStock(product.id, 1.5)));
  await assert.rejects(db.run(() => store.updateProduct(product.id, { imageUrl: 'javascript:alert(1)' })));
  await assert.rejects(db.run(() => {
    store.adjustStock(product.id, 100);
    throw new Error('Abort this transaction');
  }));
  await db.run(() => assert.equal(store.products[0].stock, 4));
});

test('simultaneous orders on separate API instances cannot oversell the last unit', async (t) => {
  const fixture = await testDatabase();
  t.after(() => fixture.close());
  const { database: db, store } = fixture;
  const product = await db.run(() => {
    const category = store.createCategory({ name: 'Test Hardware' });
    return store.createProduct({ imageUrl: '/test-product.webp', name: 'Last unit', categoryId: category.id, price: 100, stock: 1 });
  });
  const second = new StoreDatabase();
  await second.onModuleInit();
  try {
    const other = new StoreService(second);
    const dto = { items: [{ productId: product.id, quantity: 1 }], customer, customerCategoryId: 'customer' };
    const results = await Promise.allSettled([
      db.run(() => store.createOrder(dto)),
      second.run(() => other.createOrder(dto)),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    await db.run(() => { assert.equal(store.products[0].stock, 0); assert.equal(store.orders.length, 1); });
  } finally { await second.onModuleDestroy(); }
});

test('duplicate cart lines are combined before checking stock', async (t) => {
  const fixture = await testDatabase();
  t.after(() => fixture.close());
  const { database: db, store } = fixture;
  const product = await db.run(() => {
    const category = store.createCategory({ name: 'Test Hardware' });
    return store.createProduct({ imageUrl: '/test-product.webp', name: 'Screw', categoryId: category.id, price: 10, stock: 2 });
  });
  await assert.rejects(db.run(() => store.createOrder({ customer, customerCategoryId: 'customer',
    items: [{ productId: product.id, quantity: 2 }, { productId: product.id, quantity: 1 }] })));
  await db.run(() => { assert.equal(store.products[0].stock, 2); assert.equal(store.orders.length, 0); });
});

test('cancelled reservations are released once, including after payment expiry', async (t) => {
  const fixture = await testDatabase();
  t.after(() => fixture.close());
  const { database: db, store } = fixture;
  const order = await db.run(() => {
    const category = store.createCategory({ name: 'Test Hardware' });
    const product = store.createProduct({ imageUrl: '/test-product.webp', name: 'Screw', categoryId: category.id, price: 10, stock: 2 });
    store.updateShop({ paymentWindowMinutes: 0 });
    return store.createOrder({ customer, customerCategoryId: 'customer', items: [{ productId: product.id, quantity: 1 }] });
  });
  await db.run(() => store.updateStatus(order.id, 'Cancelled'));
  await db.run(() => { store.sweepExpired(); store.sweepExpired(); assert.equal(store.products[0].stock, 2); });
  await assert.rejects(db.run(() => store.updateStatus(order.id, 'Confirmed')));
});

test('delivery and customer discounts are calculated from saved configuration', async (t) => {
  const fixture = await testDatabase();
  t.after(() => fixture.close());
  const { database: db, store } = fixture;
  await db.run(() => {
    store.updateShop({ maduraiFree: false, defaultDeliveryCharge: 60 });
    assert.equal(store.delivery(customer), 60);
    store.updateShop({ maduraiFree: true });
    assert.equal(store.delivery(customer), 0);
    const category = store.createCategory({ name: 'Test Hardware' });
    const product = store.createProduct({ imageUrl: '/test-product.webp', name: 'Screw', categoryId: category.id, price: 100, stock: 3 });
    const tier = store.updateCustomerCategory('engineers', { minimum: 100, discountPercent: 10 });
    const quote = store.quote({ customer, customerCategoryId: tier.id, items: [{ productId: product.id, quantity: 2 }] });
    assert.equal(quote.discount, 20);
    assert.equal(quote.total, 180);
  });
});
