import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import webpush from 'web-push';
import { testDatabase } from './test-database';
import { StoreDatabase } from './store.database';
import { StoreService } from './store.service';
import { OrderNotifications } from './order-notifications.service';
import { OrdersController } from './orders.controller';
import { PushController } from './push.controller';
import { AdminController } from './admin.controller';
import { StoreTransactionInterceptor } from './store-transaction.interceptor';
import { AuthGuard, signAdmin } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { decryptSubscription, encryptSubscription, validateSubscription } from './push-security';

const customer = { name: 'Push test', phone: '9876543210', address: 'Test street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' };
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-capability', keys: { p256dh: Buffer.concat([Buffer.from([4]), randomBytes(64)]).toString('base64url'), auth: randomBytes(16).toString('base64url') } };
const success = { statusCode: 201, body: '', headers: {} };
function configure() {
  const names = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'PUSH_ENCRYPTION_KEY', 'AUTH_SECRET'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const keys = webpush.generateVAPIDKeys();
  Object.assign(process.env, { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: 'mailto:test@example.com', PUSH_ENCRYPTION_KEY: randomBytes(32).toString('hex'), AUTH_SECRET: randomBytes(32).toString('hex') });
  return () => { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } };
}
async function fixture() {
  const restore = configure();
  const state = await testDatabase();
  const product = await state.database.run(() => state.store.createProduct({ imageUrl: '/test-product.webp', name: 'Test lamp', categoryId: 'lighting', price: 120, stock: 30 }));
  const create = () => state.database.run(() => state.store.createOrder({ items: [{ productId: product.id, quantity: 1 }], customer, customerCategoryId: 'customer' }));
  const notifications = new OrderNotifications(state.database);
  return { ...state, product, create, notifications, async cleanup() { notifications.onModuleDestroy(); await state.close(); restore(); } };
}

test('all statuses persist, queue once, and Web Push targets the exact secure order link', async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const order = await f.create();
  await f.notifications.subscribe(order.id, order.trackingToken, subscription);
  await f.notifications.subscribe(order.id, order.trackingToken, subscription);
  const sent: any[] = [];
  const send: typeof webpush.sendNotification = async (_sub, body) => { sent.push(JSON.parse(String(body))); return success; };
  await f.notifications.flush(send);
  await f.database.run(() => f.store.submitReference(order.id, '123456789012'));
  const statuses = ['Confirmed', 'Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'] as const;
  for (const status of statuses) {
    await f.database.run(() => status === 'Confirmed' ? f.store.updatePayment(order.id, 'Paid') : f.store.updateStatus(order.id, status));
    await f.database.run(() => f.store.updateStatus(order.id, status));
    await Promise.all([f.notifications.flush(send), new OrderNotifications(f.database).flush(send)]);
    await f.database.run(() => assert.equal(f.store.getOrder(order.id).status, status));
  }
  assert.deepEqual(sent.map((item) => item.status), ['Pending Payment', 'Pending Verification', ...statuses]);
  for (const payload of sent) {
    assert.equal(payload.title, 'VKS VEL TRADERS');
    assert.ok(payload.body.includes(order.id));
    assert.equal(payload.path, `/orders/${order.id}#token=${order.trackingToken}`);
  }
  const encrypted = await f.database.notificationQuery('SELECT encrypted FROM @schema.vks_push_subscriptions');
  assert.ok(!encrypted.rows[0].encrypted.includes(order.trackingToken));
  assert.deepEqual(decryptSubscription(encrypted.rows[0].encrypted).subscription, subscription);
  await f.database.onModuleInit();
  await f.notifications.flush(send);
  assert.equal(sent.length, 8);
  await f.database.run(() => assert.equal(f.store.getOrder(order.id).history?.length, 8));
});

test('order tokens prevent cross-customer reads and mutations; admin status API is guarded', async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  @Module({ controllers: [OrdersController, PushController, AdminController], providers: [
    StoreDatabase, StoreService, AuthService,
    { provide: OrderNotifications, useFactory: (database: StoreDatabase) => {
      const service = new OrderNotifications(database); service.onModuleInit = () => {}; return service;
    }, inject: [StoreDatabase] }, StoreTransactionInterceptor, AuthGuard,
  ] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); });
  const url = `${await app.getUrl()}/api`;
  const a = await f.create(), b = await f.create();
  const get = (id: string, token?: string, phone = '') => fetch(`${url}/orders/${id}?phone=${phone}`, { headers: token ? { 'x-order-token': token } : {} });
  assert.equal((await get(a.id)).status, 404);
  assert.equal((await get(a.id, undefined, customer.phone)).status, 404);
  assert.equal((await get(a.id, b.trackingToken)).status, 404);
  const own = await get(a.id, a.trackingToken);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('cache-control'), 'private, no-store');
  assert.equal('trackingHash' in await own.json(), false);
  const post = (path: string, body: unknown, token = '') => fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-order-token': token }, body: JSON.stringify(body) });
  assert.equal((await post(`/push/orders/${a.id}`, subscription, b.trackingToken)).status, 404);
  assert.equal((await post(`/orders/${a.id}/payment-reference`, { reference: '123456789012' }, b.trackingToken)).status, 404);
  assert.equal((await post(`/orders/${a.id}/payment-reference`, { reference: '123456789012' }, a.trackingToken)).status, 201);
  const list = await post('/orders/lookup', { credentials: [{ id: a.id, token: a.trackingToken }, { id: b.id, token: a.trackingToken }] });
  assert.deepEqual((await list.json() as any[]).map((order) => order.id), [a.id]);
  const patch = (auth = '') => fetch(`${url}/admin/orders/${a.id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json', Authorization: auth }, body: JSON.stringify({ status: 'Packed' }) });
  assert.equal((await patch()).status, 401);
  assert.equal((await patch(`Bearer ${signAdmin('admin')}`)).status, 400);
  await f.database.run(() => f.store.updatePayment(a.id, 'Paid'));
  assert.equal((await patch(`Bearer ${signAdmin('admin')}`)).status, 200);
});

test('legacy recovery rejects phone suffixes, issues a token once, and then requires it', async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const order = await f.create();
  await f.database.run(() => { delete f.store.getOrder(order.id).trackingHash; f.database.markChanged(); });
  await f.database.run(() => {
    for (const phone of ['', '0', '3210', '1111111111']) assert.throws(() => f.store.track(order.id, phone));
    const recovered = f.store.track(order.id, customer.phone) as { trackingToken: string };
    assert.match(recovered.trackingToken, /^[a-f0-9]{64}$/);
    assert.throws(() => f.store.track(order.id, customer.phone));
    assert.equal(f.store.track(order.id, '', recovered.trackingToken).id, order.id);
  });
});

test('failed transactions emit nothing, transient sends retry, gone subscriptions are removed', async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const order = await f.create();
  await f.database.run(() => { f.store.submitReference(order.id, '123456789012'); f.store.updatePayment(order.id, 'Paid'); });
  await f.notifications.subscribe(order.id, order.trackingToken, subscription);
  await assert.rejects(f.database.run(() => { f.store.updateStatus(order.id, 'Packed'); throw new Error('rollback'); }));
  const events = await f.database.notificationQuery('SELECT status FROM @schema.vks_order_events WHERE order_id=$1', [order.id]);
  assert.deepEqual(events.rows.map((row) => row.status), ['Pending Payment', 'Confirmed']);
  await f.notifications.flush(async () => { throw { statusCode: 503 }; });
  let jobs = await f.database.notificationQuery('SELECT * FROM @schema.vks_push_deliveries');
  assert.equal(jobs.rows[0].state, 'pending');
  assert.equal(jobs.rows[0].attempts, 1);
  await f.database.notificationQuery('UPDATE @schema.vks_push_deliveries SET next_attempt=now()');
  await f.notifications.flush(async () => success);
  jobs = await f.database.notificationQuery('SELECT * FROM @schema.vks_push_deliveries');
  assert.equal(jobs.rows[0].state, 'sent');
  await f.database.run(() => f.store.updateStatus(order.id, 'Processing'));
  await f.notifications.flush(async () => { throw { statusCode: 410 }; });
  assert.equal((await f.database.notificationQuery('SELECT id FROM @schema.vks_push_subscriptions')).rowCount, 0);
});

test('subscription validation blocks SSRF and authenticated encryption rejects tampering', () => {
  const restore = configure();
  try {
    for (const endpoint of ['http://fcm.googleapis.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.evil.test/x', 'https://user@fcm.googleapis.com/x']) assert.throws(() => validateSubscription({ ...subscription, endpoint }));
    assert.throws(() => validateSubscription({ ...subscription, keys: { auth: 'short', p256dh: 'short' } }));
    const encrypted = encryptSubscription({ subscription, token: 'private' });
    const modified = Buffer.from(encrypted, 'base64'); modified[30] ^= 1;
    assert.throws(() => decryptSubscription(modified.toString('base64')));
  } finally { restore(); }
});

test('enrollment is order-scoped, bounded, removable and graceful without configured keys', async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const a = await f.create(), b = await f.create();
  assert.equal(f.notifications.config().enabled, true);
  for (let index = 0; index < 5; index++) await f.notifications.subscribe(a.id, a.trackingToken, { ...subscription, endpoint: `${subscription.endpoint}-${index}` });
  await assert.rejects(f.notifications.subscribe(a.id, a.trackingToken, subscription), /Too many/);
  await f.notifications.subscribe(b.id, b.trackingToken, subscription);
  await assert.rejects(f.notifications.unsubscribe(a.id, b.trackingToken, `${subscription.endpoint}-0`));
  await f.notifications.unsubscribe(a.id, a.trackingToken, `${subscription.endpoint}-0`);
  assert.equal((await f.database.notificationQuery('SELECT id FROM @schema.vks_push_subscriptions WHERE order_id=$1', [a.id])).rowCount, 4);
  assert.equal((await f.database.notificationQuery('SELECT id FROM @schema.vks_push_subscriptions WHERE order_id=$1', [b.id])).rowCount, 1);
  delete process.env.VAPID_PRIVATE_KEY;
  assert.deepEqual(f.notifications.config(), { enabled: false, publicKey: null });
  await assert.rejects(f.notifications.subscribe(a.id, a.trackingToken, subscription), /not configured/);
});

test('updating legacy orders does not invent timestamps for unrecorded statuses', async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const order = await f.create();
  await f.database.run(() => { f.store.submitReference(order.id, '123456789012'); f.store.updatePayment(order.id, 'Paid'); });
  await f.database.run(() => {
    const legacy = f.store.getOrder(order.id);
    legacy.status = 'Packed'; delete legacy.history;
    f.database.markChanged();
  });
  await f.database.run(() => {
    const updated = f.store.updateStatus(order.id, 'Shipped');
    assert.deepEqual(updated.history?.slice(0, 2), [{ status: 'Order Placed', at: order.createdAt }, { status: 'Packed', at: '' }]);
    assert.ok(updated.history?.[2].at);
  });
});
