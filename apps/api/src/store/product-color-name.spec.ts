import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { testDatabase } from './test-database';
import { StoreDatabase } from './store.database';
import { StoreService } from './store.service';

const customer = { name: 'Color Test', phone: '9876543210', address: '1 Test Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' };

test('optional plain color names work in every category, validate atomically and persist without adding variants', async (t) => {
  const { database, store, close } = await testDatabase(); t.after(close);
  const ids = await database.run(() => {
    const saved = store.categories.map((category) => store.createProduct({ name: `Color ${category.name}`, categoryId: category.id,
      imageUrls: ['/main.webp', '/extra.webp'], price: 118, originalPrice: 150, stock: 5, colorName: ' Dark Red ' }));
    for (const product of saved) {
      assert.equal(product.colorName, 'Dark Red'); assert.equal(product.variants, undefined);
      assert.equal(product.price, 118); assert.equal(product.stock, 5);
      const snapshot = structuredClone(product);
      for (const colorName of [null, 3, [], {}, 'x'.repeat(81), 'Red\nBlue', 'Red\u0000']) {
        assert.throws(() => store.updateProduct(product.id, { colorName } as any), /Product color name/);
        assert.deepEqual(product, snapshot);
      }
      store.updateProduct(product.id, { description: 'Updated description' });
      assert.equal(product.colorName, 'Dark Red');
      assert.deepEqual(product.imageUrls, ['/main.webp', '/extra.webp']);
    }
    const blank = store.createProduct({ name: 'No color', categoryId: 'wires', imageUrl: '/plain.webp', price: 50, stock: 3 });
    assert.equal(store.resolve([{ productId: blank.id, quantity: 1 }])[0].shade, undefined);
    store.updateProduct(blank.id, { colorName: '   ' });
    assert.equal(blank.colorName, ''); assert.equal(blank.price, 50); assert.equal(blank.stock, 3);
    return saved.map((product) => product.id);
  });
  const second = new StoreDatabase(); await second.onModuleInit(); t.after(() => second.onModuleDestroy());
  await second.run(() => {
    const catalog = new StoreService(second).catalog();
    for (const id of ids) assert.equal(catalog.products.find((product) => product.id === id)?.colorName, 'Dark Red');
  });
});

test('plain color names follow orders without changing pricing or stock; selected variants and historical snapshots stay authoritative', async (t) => {
  const { database, store, close } = await testDatabase(); t.after(close);
  await database.run(() => {
    store.updateShop({ minimumOrder: 0, gstRate: 18, gstInclusive: true });
    const product = store.createProduct({ name: 'Plain color product', categoryId: 'hardware', imageUrl: '/main.webp', price: 118, stock: 5, colorName: 'Dark Red' });
    const order = store.createOrder({ customer, customerCategoryId: 'customer', items: [{ productId: product.id, quantity: 2, colorName: 'Forged', shade: 'Forged', price: 1 } as any] });
    assert.equal(order.items[0].shade, 'Dark Red'); assert.equal(order.items[0].color, undefined);
    assert.equal(order.total, 236); assert.equal(order.gst, 36); assert.equal(product.stock, 3);
    store.updateProduct(product.id, { colorName: 'Military Green' });
    assert.equal(order.items[0].shade, 'Dark Red');
    store.updateStatus(order.id, 'Cancelled'); assert.equal(product.stock, 5);
    store.updateProduct(product.id, { colorName: '' });
    assert.equal(store.resolve([{ productId: product.id, quantity: 1 }])[0].shade, undefined);
    const colored = store.createProduct({ name: 'Variant product', categoryId: 'wires', imageUrl: '/wire.webp', price: 118, stock: 5, colorName: 'Base color',
      variants: [{ id: 'blue', name: 'Blue', color: '#00f', price: 236, stock: 3 }] });
    const variantSnapshot = structuredClone(colored.variants);
    store.updateProduct(colored.id, { colorName: 'New description' });
    assert.deepEqual(colored.variants, variantSnapshot); assert.equal(colored.price, 236); assert.equal(colored.stock, 3);
    const line = store.resolve([{ productId: colored.id, variantId: 'blue', quantity: 1 }])[0];
    assert.equal(line.shade, 'Blue'); assert.equal(line.color, '#00f'); assert.equal(line.price, 236);
    assert.throws(() => store.resolve([{ productId: colored.id, quantity: 1 }]), /Choose a color/);
  });
});
