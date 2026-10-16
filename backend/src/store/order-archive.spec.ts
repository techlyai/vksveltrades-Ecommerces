import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { testDatabase } from './test-database';

const customer = { name: 'History test', phone: '9876543210', address: '1 Test Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' };

test('admin can archive only selected orders atomically, retaining stock, payments, receipts, IDs and notification history', async (t) => {
  const fixture = await testDatabase();
  const { database, store } = fixture;
  const previous = { ADMIN_PASSWORD: process.env.ADMIN_PASSWORD, AUTH_SECRET: process.env.AUTH_SECRET };
  process.env.ADMIN_PASSWORD = randomUUID(); process.env.AUTH_SECRET = randomUUID();
  const start = async () => {
    const server = await NestFactory.create(AppModule, { logger: false });
    await server.listen(0, '127.0.0.1'); return server;
  };
  let app = await start(), base = await app.getUrl(), token = '';
  t.after(async () => {
    await app.close(); await fixture.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const request = (path: string, method = 'GET', body?: unknown, authenticated = true) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const login = await request('/auth/login', 'POST', { username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD }, false);
  assert.equal(login.status, 201); token = (await login.json() as any).accessToken;
  const receipts = await database.run(() => {
    store.updateShop({ minimumOrder: 0 });
    const product = store.createProduct({ name: 'History fixture', categoryId: 'wires', imageUrl: '/test.webp', price: 100, stock: 20 });
    return Array.from({ length: 5 }, (_, index) => {
      const receipt = store.createOrder({ customer, customerCategoryId: 'customer', items: [{ productId: product.id, quantity: 1 }] });
      store.submitReference(receipt.id, String(123456789010 + index));
      if (index === 1) { store.updateStatus(receipt.id, 'Cancelled'); }
      else if (index < 4) { store.updatePayment(receipt.id, 'Paid'); store.updateStatus(receipt.id, index === 0 ? 'Processing' : index === 2 ? 'Delivered' : 'Confirmed'); }
      return receipt;
    });
  });
  const ids = receipts.slice(0, 4).map((order) => order.id);
  const snapshot = await database.run(() => structuredClone({ orders: store.orders, products: store.products }));
  const eventCount = async () => (await database.notificationQuery('SELECT count(*) FROM @schema.vks_order_events')).rows[0].count;
  const events = await eventCount();
  assert.equal((await request('/admin/orders/archive', 'PUT', { orderIds: ids, archived: true }, false)).status, 401);
  for (const body of [null, {}, { orderIds: [], archived: true }, { orderIds: [ids[0], ids[0]], archived: true },
    { orderIds: ids, archived: 'true' }, { orderIds: ['*'], archived: true }, { orderIds: Array.from({ length: 101 }, (_, n) => `VKST-${n}`), archived: true }]) {
    assert.equal((await request('/admin/orders/archive', 'PUT', body)).status, 400);
  }
  assert.equal((await request('/admin/orders/archive', 'PUT', { orderIds: [ids[0], 'VKST-9999'], archived: true })).status, 404);
  assert.equal((await request('/admin/orders/archive', 'PUT', { orderIds: [ids[0], receipts[4].id], archived: true })).status, 409);
  await database.run(() => assert.deepEqual({ orders: store.orders, products: store.products }, snapshot));
  const archive = await request('/admin/orders/archive', 'PUT', { orderIds: ids, archived: true });
  assert.equal(archive.status, 200); assert.deepEqual(await archive.json(), { orderIds: ids, archived: true });
  const archivedOrders = await (await request('/admin/orders?includeArchived=true')).json() as any[];
  assert.equal(archivedOrders.length, 5);
  assert.deepEqual((await (await request('/admin/orders')).json() as any[]).map((order) => order.id), [receipts[4].id]);
  assert.equal((await (await request('/admin/order-alerts')).json() as any).activeOrders, 1);
  assert.equal((await (await request('/admin/dashboard')).json() as any).orders, 1);
  await database.run(() => {
    assert.deepEqual(store.products, snapshot.products);
    assert.deepEqual(store.orders.map(({ adminArchivedAt, ...order }) => order), snapshot.orders);
    assert.equal(store.getOrder(receipts[4].id).adminArchivedAt, undefined);
    const visibleReceipt = store.track(ids[0], '', receipts[0].trackingToken);
    assert.equal(visibleReceipt.id, ids[0]); assert.equal('adminArchivedAt' in visibleReceipt, false);
  });
  assert.equal(await eventCount(), events);
  await request('/admin/orders/archive', 'PUT', { orderIds: ids, archived: true });
  assert.deepEqual(await (await request('/admin/orders?includeArchived=true')).json(), archivedOrders);
  await app.close(); app = await start(); base = await app.getUrl();
  assert.deepEqual(await (await request('/admin/orders?includeArchived=true')).json(), archivedOrders);
  assert.equal((await request('/admin/orders/archive', 'PUT', { orderIds: [ids[0]], archived: false })).status, 200);
  assert.equal((await (await request('/admin/orders')).json() as any[]).length, 2);
  assert.equal(await eventCount(), events);
  await database.run(() => assert.deepEqual(store.products, snapshot.products));
});

test('archiving the entire history never reuses order numbers or releases stock twice', async (t) => {
  const { database, store, close } = await testDatabase(); t.after(close);
  await database.run(() => {
    store.updateShop({ minimumOrder: 0 });
    const product = store.createProduct({ name: 'Numbering fixture', categoryId: 'wires', imageUrl: '/test.webp', price: 100, stock: 10 });
    const order = () => store.createOrder({ customer, customerCategoryId: 'customer', items: [{ productId: product.id, quantity: 1 }] });
    const ids = Array.from({ length: 4 }, (_, index) => { const created = order(); store.submitReference(created.id, String(123456789010 + index)); store.updateStatus(created.id, 'Cancelled'); return created.id; });
    store.archiveOrders({ orderIds: ids, archived: true });
    assert.equal(store.adminOrders().length, 0); assert.equal(product.stock, 10);
    const next = order(); assert.equal(next.id, 'VKST-1005'); assert.equal(product.stock, 9);
    store.submitReference(next.id, '123456789099');
    store.archiveOrders({ orderIds: ids, archived: false });
    assert.equal(product.stock, 9); assert.equal(store.adminOrders().length, 5);
  });
});
