import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { testDatabase } from './test-database';
import { StoreDatabase } from './store.database';
import { StoreService } from './store.service';
import { OrdersController } from './orders.controller';
import { StoreTransactionInterceptor } from './store-transaction.interceptor';
import { defaultCheckoutTiers } from './checkout-tiers';

const customer = { name: 'Pricing Test', phone: '9876543210', address: '1 Test Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' };

test('quote, order and tracking APIs agree for all three types below, at and above 5000', async (t) => {
  const fixture = await testDatabase();
  t.after(() => fixture.close());
  const { database, store } = fixture;
  const product = await database.run(() => {
    store.updateShop({ gstRate: 18, defaultDeliveryCharge: 60, maduraiFree: false });
    store.createCustomerCategory({ id: 'private-legacy-tier', name: 'Legacy trade', discountPercent: 90, minimum: 0 });
    return store.createProduct({ imageUrl: '/test-product.webp', name: 'Test product', categoryId: 'electrical', price: 5000, stock: 50 });
  });
  @Module({ controllers: [OrdersController], providers: [StoreDatabase, StoreService, StoreTransactionInterceptor] }) class PricingApp {}
  const app = await NestFactory.create(PricingApp, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const url = `${await app.getUrl()}/api/orders`;
  const post = (path: string, body: unknown) => fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  for (const tier of defaultCheckoutTiers) {
    for (const subtotal of [4999, 5000, 5001]) {
      await database.run(() => store.updateProduct(product.id, { price: subtotal }));
      // Browser-supplied amounts must never become authoritative or stack discounts.
      const dto = { customer, customerCategoryId: tier.id, items: [{ productId: product.id, quantity: 1, price: 1, discount: 100 }], discount: 9999, discountPercent: 100, subtotal: 1, total: 0, customerCategoryIds: ['engineers', 'electricians'] };
      const response = await post('/quote', dto);
      assert.equal(response.status, 201);
      const quote = await response.json() as any;
      const rate = subtotal > 5000 ? tier.discountPercent : 0;
      const discount = Math.round(subtotal * rate) / 100;
      const total = Math.round((subtotal - discount + 60) * 100) / 100;
      assert.equal(quote.subtotal, subtotal);
      assert.equal(quote.discountPercent, rate);
      assert.equal(quote.discount, discount);
      assert.equal(quote.total, total);
      assert.equal(quote.gst, Math.round((subtotal - discount - (subtotal - discount) / 1.18) * 100) / 100);
      const created = await post('', dto);
      assert.equal(created.status, 201);
      const order = await created.json() as any;
      for (const key of ['subtotal', 'discount', 'discountPercent', 'delivery', 'gst', 'total', 'customerCategoryId']) assert.equal(order[key], quote[key], `${tier.id}/${subtotal}/${key}`);
      const tracked = await fetch(`${url}/${order.id}`, { headers: { 'x-order-token': order.trackingToken } });
      assert.equal(tracked.status, 200);
      const receipt = await tracked.json() as any;
      assert.equal(receipt.discountPercent, rate);
      assert.equal(receipt.total, total);
      assert.equal(receipt.total.toFixed(2), total.toFixed(2)); // UPI uses this persisted total.
    }
  }
  await database.run(() => { assert.equal(store.orders.length, 9); assert.equal(store.products[0].stock, 41); });
  for (const categoryId of ['unknown', 'private-legacy-tier', '', undefined, null, ['engineers', 'electricians'], { id: 'electricians' }]) {
    for (const path of ['/quote', '']) {
      const response = await post(path, { customer, customerCategoryId: categoryId, items: [{ productId: product.id, quantity: 1 }] });
      assert.equal(response.status, 400);
      assert.match((await response.json() as any).message, /valid Customer Type/);
    }
  }
  await database.run(() => { assert.equal(store.orders.length, 9); assert.equal(store.products[0].stock, 41); });
});

test('variant prices, paise rounding, quantity changes and repeat quotes apply one discount only', async (t) => {
  const { database, store, close } = await testDatabase();
  t.after(close);
  await database.run(() => {
    const product = store.createProduct({ imageUrl: '/test-product.webp', name: 'Variant test', categoryId: 'paints', price: 10, stock: 50, variants: [{ id: 'shade', name: 'White', color: '#fff', price: 2500.01, stock: 50 }] });
    const quote = (id: string, items: Array<{ productId: string; variantId?: string; quantity: number }>) => store.quote({ customer, customerCategoryId: id, items });
    const items = [{ productId: product.id, variantId: 'shade', quantity: 1 }];
    assert.equal(quote('engineers', items).discount, 0);
    const two = [...items, ...items]; // Duplicate lines are merged, not separately discounted.
    const discounted = quote('engineers', two);
    assert.equal(discounted.items.length, 1);
    assert.equal(discounted.subtotal, 5000.02);
    assert.equal(discounted.discount, 250);
    assert.equal(discounted.total, 4750.02);
    assert.deepEqual(quote('engineers', two), discounted);
    assert.equal(quote('electricians', two).discount, 500);
    assert.equal(quote('customer', two).total, 5000.02);
    store.updateCustomerCategory('customer', { discountPercent: 99, minimum: 0 });
    assert.equal(quote('customer', two).discount, 0);
    assert.equal(store.catalog().customerCategories[0].discountPercent, 0);
    store.updateCustomerCategory('engineers', { discountPercent: 101 });
    assert.throws(() => quote('engineers', two), /discount settings are invalid/);
    store.updateCustomerCategory('engineers', { discountPercent: 5, minimum: -1 });
    assert.throws(() => quote('engineers', two), /discount settings are invalid/);
    const final = store.createOrder({ customer, customerCategoryId: 'electricians', items: two });
    const savedTotal = final.total;
    store.updateCustomerCategory('electricians', { discountPercent: 25, minimum: 0 });
    assert.equal(store.getOrder(final.id).total, savedTotal);
    assert.equal(store.getOrder(final.id).discountPercent, 10);
  });
});

test('one-time tier upgrade retains existing IDs, unrelated categories and historical receipts', async (t) => {
  const { database, store, schema, close } = await testDatabase();
  t.after(close);
  const historical = await database.run(() => {
    store.deleteCustomerCategory('engineers');
    store.deleteCustomerCategory('electricians');
    store.createCustomerCategory({ id: 'legacy-engineer', name: 'Engineer', discountPercent: 2, minimum: 1000 });
    store.createCustomerCategory({ id: 'custom-trade', name: 'Other trade', discountPercent: 3, minimum: 100 });
    const product = store.createProduct({ imageUrl: '/test-product.webp', name: 'Existing product', categoryId: 'electrical', price: 6000, stock: 3 });
    const order = store.createOrder({ customer, customerCategoryId: 'legacy-engineer', items: [{ productId: product.id, quantity: 1 }] });
    store.updateShop({ defaultDeliveryCharge: 90 });
    return JSON.parse(JSON.stringify(store.getOrder(order.id)));
  });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await pool.query(`DELETE FROM "${schema}".vks_migrations WHERE name = 'checkout-trade-tiers-v1'`); }
  finally { await pool.end(); }
  const second = new StoreDatabase();
  try {
    await Promise.all([database.onModuleInit(), second.onModuleInit()]);
    await database.run(() => {
      const tiers = store.catalog().customerCategories;
      assert.deepEqual(tiers.map((tier) => [tier.id, tier.name, tier.discountPercent, tier.minimum]), [
        ['customer', 'Customer', 0, 0], ['legacy-engineer', 'Engineers', 5, 5000], ['electricians', 'Electricians', 10, 5000],
      ]);
      assert.equal(store.customerCategories.length, 4);
      assert.equal(store.customerCategories.find((tier) => tier.id === 'custom-trade')?.discountPercent, 3);
      assert.equal(store.shop.defaultDeliveryCharge, 90);
      assert.deepEqual(store.getOrder(historical.id), historical);
      store.updateCustomerCategory('legacy-engineer', { discountPercent: 4 });
    });
    await database.onModuleInit();
    await database.run(() => assert.equal(store.customerCategories.find((tier) => tier.id === 'legacy-engineer')?.discountPercent, 4));
  } finally { await second.onModuleDestroy(); }
});
