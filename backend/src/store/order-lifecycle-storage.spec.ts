import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { StoreDatabase } from './store.database';
import { StoreService } from './store.service';
import { testDatabase } from './test-database';

test('checkout retries serialize across API instances and verified/cancelled guest receipts survive reconnect', async (t) => {
  const f = await testDatabase();
  t.after(() => f.close());
  const second = new StoreDatabase();
  await second.onModuleInit();
  t.after(() => second.onModuleDestroy());
  const other = new StoreService(second);
  const product = await f.database.run(() => f.store.createProduct({ name: 'Persistence lamp', categoryId: 'electrical', imageUrl: '/test.webp', price: 100, stock: 5 }));
  const dto = { customer: { name: 'Persistence Test', phone: '9876543210', address: '1 Test Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' }, customerCategoryId: 'customer', items: [{ productId: product.id, quantity: 1 }] };
  const key = 'c'.repeat(64);
  const [a, b] = await Promise.all([f.database.run(() => f.store.createOrder(dto, key)), second.run(() => other.createOrder(dto, key))]);
  assert.equal(a.id, b.id);
  await second.run(() => {
    assert.equal(other.products.find((item) => item.id === product.id)?.stock, 4);
    assert.deepEqual(other.customerOrders([{ id: a.id, token: key }]), []);
    other.submitReference(a.id, '123456789012');
  });
  await f.database.run(() => {
    assert.equal(f.store.track(a.id, '', key).payment.status, 'PENDING_VERIFICATION');
    f.store.updatePayment(a.id, 'PAID');
  });
  await second.run(() => {
    assert.equal(other.track(a.id, '', key).status, 'Confirmed');
    other.cancelOrder(a.id);
  });
  await f.database.run(() => {
    const [order] = f.store.customerOrders([{ id: a.id, token: key }]);
    assert.equal(order.status, 'Cancelled');
    assert.equal(order.payment.status, 'PAID');
    assert.equal(order.refundRequired, true);
    assert.equal(f.store.products.find((item) => item.id === product.id)?.stock, 5);
    assert.throws(() => f.store.updateStatus(a.id, 'Shipped'));
  });
});
