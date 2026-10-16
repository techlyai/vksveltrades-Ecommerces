import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { testDatabase } from './test-database';
import { StoreDatabase } from './store.database';
import { StoreService } from './store.service';

const customer = { name: 'Product Test', phone: '9876543210', address: '1 Test Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' };
const blue = { id: 'blue', name: ' Blue ', color: '#0000ff', price: 118, stock: 4 };

test('specifications and colors persist and selected colors control price, reservation and release', async (t) => {
  const { database, store, close } = await testDatabase();
  t.after(close);
  const product = await database.run(() => store.createProduct({ imageUrl: '/test-product.webp', name: 'Wire', categoryId: 'electrical', price: 100, stock: 100,
    specifications: [{ label: ' Material ', value: ' Copper ' }],
    variants: [blue, { ...blue, id: 'white', name: 'White', color: '#fff', stock: 0, price: 125 }],
  }));
  const second = new StoreDatabase();
  await second.onModuleInit();
  t.after(() => second.onModuleDestroy());
  await second.run(() => {
    const restored = new StoreService(second).catalog().products.find((item) => item.id === product.id)!;
    assert.deepEqual(restored.specifications, [{ label: 'Material', value: 'Copper' }]);
    assert.equal(restored.variants?.[0].name, 'Blue');
    assert.equal(restored.price, 118);
    assert.equal(restored.stock, 4);
  });
  await database.run(() => {
    const dto = { customer, customerCategoryId: 'customer', items: [{ productId: product.id, variantId: 'blue', quantity: 3 }] };
    store.updateShop({ minimumOrder: 0, gstRate: 18, gstInclusive: true });
    assert.throws(() => store.resolve([{ productId: product.id, quantity: 1 }]), /Choose a color/);
    assert.throws(() => store.resolve([{ productId: product.id, variantId: 'white', quantity: 1 }]), /Only 0 units/);
    assert.throws(() => store.resolve([{ productId: product.id, variantId: 'unknown', quantity: 1 }]), /Invalid variant/);
    const order = store.createOrder(dto);
    assert.equal(order.subtotal, 354);
    assert.equal(order.items[0].shade, 'Blue');
    assert.equal(store.products.find((item) => item.id === product.id)!.variants![0].stock, 1);
    store.updateStatus(order.id, 'Cancelled');
    assert.equal(store.products.find((item) => item.id === product.id)!.variants![0].stock, 4);
  });
});

test('invalid specifications and colors are rejected without changing saved products', async (t) => {
  const { database, store, close } = await testDatabase();
  t.after(close);
  await database.run(() => {
    const product = store.createProduct({ imageUrl: '/test-product.webp', name: 'Wire', categoryId: 'electrical', price: 10, stock: 1 });
    for (const specifications of [null, {}, [{ label: '', value: 'Copper' }], [{ label: 'Material', value: 3 }], Array(41).fill({ label: 'a', value: 'b' })]) {
      assert.throws(() => store.updateProduct(product.id, { specifications } as any), /specification/i);
    }
    for (const variants of [null, {}, [blue, blue], [{ ...blue, stock: -1 }], [{ ...blue, price: '10' }], [{ ...blue, color: 'red;display:none' }], [{ ...blue, name: '' }]]) {
      assert.throws(() => store.updateProduct(product.id, { variants } as any), /color/i);
    }
    assert.equal(product.variants, undefined);
    assert.equal(product.specifications, undefined);
    store.updateProduct(product.id, { variants: [blue], specifications: [{ label: 'Material', value: 'Copper' }] });
    store.updateProduct(product.id, { variants: [], specifications: [], price: 10, stock: 1 });
    assert.deepEqual(product.variants, []);
    assert.deepEqual(product.specifications, []);
    assert.equal(store.resolve([{ productId: product.id, quantity: 1 }])[0].price, 10);
  });
});

test('GST modes, discounts and persisted receipts use the server configuration', async (t) => {
  const { database, store, close } = await testDatabase();
  t.after(close);
  await database.run(() => {
    const product = store.createProduct({ imageUrl: '/test-product.webp', name: 'Tax test', categoryId: 'electrical', price: 6000, stock: 10 });
    const dto = { customer, customerCategoryId: 'engineers', items: [{ productId: product.id, quantity: 1 }] };
    store.updateShop({ gstRate: 18, gstInclusive: false, minimumOrder: 0, maduraiFree: false, defaultDeliveryCharge: 60 });
    const quote = store.quote(dto);
    assert.equal(quote.discount, 300);
    assert.equal(quote.gst, 1026);
    assert.equal(quote.total, 6786);
    assert.equal(quote.gstRate, 18);
    assert.equal(quote.gstInclusive, false);
    const order = store.createOrder(dto);
    store.updateShop({ gstRate: 5, gstInclusive: true });
    assert.equal(store.getOrder(order.id).gstRate, 18);
    assert.equal(store.getOrder(order.id).gstInclusive, false);
    assert.equal(store.getOrder(order.id).total, 6786);
    const included = store.quote(dto);
    assert.equal(included.total, 5760);
    assert.equal(included.gst, 271.43);
    store.updateShop({ gstRate: 0, gstInclusive: false });
    assert.equal(store.quote(dto).gst, 0);
    assert.equal(store.quote(dto).total, 5760);
    for (const gstRate of [-1, 101, '18', null, NaN]) assert.throws(() => store.updateShop({ gstRate } as any), /GST rate/);
    assert.throws(() => store.updateShop({ gstInclusive: 'true' } as any), /GST inclusive/);
  });
});
