import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { testDatabase } from './test-database';
import { StoreDatabase } from './store.database';
import { StoreService } from './store.service';

const customer = { name: 'Shade Test', phone: '9876543210', address: '1 Test Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' };

test('custom codes stay separate, retain selected colors and prices, and survive order reload', async (t) => {
  const { database, store, close } = await testDatabase();
  t.after(close);
  const order = await database.run(() => {
    const product = store.createProduct({ imageUrl: '/test-product.webp', name: 'Paint', categoryId: 'paints', price: 118, stock: 5,
      variants: [{ id: 'base', name: 'Dawn', color: '#abc', price: 118, stock: 5 }] });
    store.updateShop({ minimumOrder: 0, gstRate: 18, gstInclusive: true });
    const line = { productId: product.id, variantId: 'base', quantity: 1 };
    const result = store.createOrder({ customer, customerCategoryId: 'customer', items: [
      { ...line, customShadeCode: ' #H10873 ' }, { ...line, customShadeCode: '#H10873' },
      { ...line, customShadeCode: 'Birla Opus / WW 0029 / Jasmine' }, line,
    ] });
    assert.equal(result.items.length, 3);
    assert.deepEqual(result.items.map((item) => [item.customShadeCode, item.quantity, item.shade, item.price]), [
      ['#H10873', 2, 'Dawn', 118], ['Birla Opus / WW 0029 / Jasmine', 1, 'Dawn', 118], [undefined, 1, 'Dawn', 118],
    ]);
    assert.equal(result.total, 472);
    assert.equal(result.gst, 72);
    assert.equal(product.variants![0].stock, 1);
    return result;
  });
  const second = new StoreDatabase();
  await second.onModuleInit();
  t.after(() => second.onModuleDestroy());
  await second.run(() => {
    const restored = new StoreService(second).getOrder(order.id);
    assert.deepEqual(restored.items, JSON.parse(JSON.stringify(order.items)));
    assert.equal(restored.items[0].customShadeCode, '#H10873');
  });
  await database.run(() => {
    store.updateStatus(order.id, 'Cancelled');
    assert.equal(store.products.find((item) => item.id === order.items[0].productId)!.variants![0].stock, 5);
  });
});

test('different custom codes share real stock and cannot bypass reservation limits', async (t) => {
  const { database, store, close } = await testDatabase();
  t.after(close);
  await database.run(() => {
    store.updateShop({ minimumOrder: 0 });
    for (const variants of [undefined, [{ id: 'blue', name: 'Blue', color: '#00f', price: 100, stock: 3 }]]) {
      const product = store.createProduct({ imageUrl: '/test-product.webp', name: 'Paint', categoryId: 'paints', price: 100, stock: 3, variants });
      const line = { productId: product.id, variantId: variants?.[0].id, quantity: 2 };
      assert.throws(() => store.createOrder({ customer, customerCategoryId: 'customer', items: [
        { ...line, customShadeCode: 'A' }, { ...line, customShadeCode: 'B' },
      ] }), /Only 3 units/);
      assert.equal(variants ? product.variants![0].stock : product.stock, 3);
      assert.equal(store.orders.length, 0);
    }
  });
});

test('custom code validation and per-product controls preserve existing orders without codes', async (t) => {
  const { database, store, close } = await testDatabase();
  t.after(close);
  await database.run(() => {
    const product = store.createProduct({ imageUrl: '/test-product.webp', name: 'Paint', categoryId: 'paints', price: 100, stock: 5 });
    const line = { productId: product.id, quantity: 1 };
    for (const customShadeCode of [null, 123, {}, 'x'.repeat(81), 'code\nother', 'a\u0000b'])
      assert.throws(() => store.resolve([{ ...line, customShadeCode } as any]), /Custom shade code/);
    assert.equal(store.resolve([{ ...line, customShadeCode: '  ' }])[0].customShadeCode, undefined);
    assert.equal(store.resolve([{ ...line, customShadeCode: '#H10873' }])[0].price, 100);
    assert.throws(() => store.updateProduct(product.id, { customShadeEnabled: 'yes' } as any), /customShadeEnabled/);
    store.updateProduct(product.id, { customShadeEnabled: false });
    assert.throws(() => store.resolve([{ ...line, customShadeCode: '#H10873' }]), /Custom shades are not available/);
    assert.equal(store.resolve([line])[0].price, 100);
    store.updateProduct(product.id, { categoryId: 'electrical', customShadeEnabled: true });
    assert.equal(store.resolve([{ ...line, customShadeCode: 'RAL 9001' }])[0].customShadeCode, 'RAL 9001');
  });
});
