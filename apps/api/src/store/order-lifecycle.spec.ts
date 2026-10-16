import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { emptyStore, parseStore } from './store-state';
import { StoreDatabase } from './store.database';
import { StoreService } from './store.service';
import { OrdersController } from './orders.controller';

const customer = { name: 'Lifecycle Test', phone: '9876543210', address: '1 Test Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' };
function fixture() {
  const state = emptyStore();
  state.products = [];
  state.categories = [{ id: 'electrical', name: 'Electrical', icon: 'lamp', enabled: true }];
  state.shop.minimumOrder = 0;
  let writes = 0;
  const database = { state, markChanged() { writes++; } } as unknown as StoreDatabase;
  const store = new StoreService(database);
  const product = store.createProduct({ name: 'Lifecycle lamp', categoryId: 'electrical', imageUrl: '/test.webp', price: 100, stock: 10 });
  const dto = { customer, customerCategoryId: 'customer', items: [{ productId: product.id, quantity: 1 }] };
  return { state, store, product, dto, controller: new OrdersController(store), writes: () => writes };
}

test('checkout is temporary, hidden from both histories and alerts; retry reserves stock once', () => {
  const f = fixture();
  const a = f.store.createOrder(f.dto, 'a'.repeat(64));
  const b = f.store.createOrder(f.dto, 'a'.repeat(64));
  assert.equal(a.id, b.id);
  assert.equal(a.status, 'Pending Payment');
  assert.equal(a.payment.status, 'UNPAID');
  assert.equal(f.product.stock, 9);
  assert.equal(f.store.orders.length, 1);
  assert.deepEqual(f.store.adminOrders(), []);
  assert.deepEqual(f.store.orderAlerts().orders, []);
  assert.deepEqual(f.store.customerOrders([{ id: a.id, token: a.trackingToken }]), []);
  assert.throws(() => f.store.updateStatus(a.id, 'Confirmed'), /Verify payment/);
  assert.throws(() => f.store.updateShipment(a.id, { type: 'Courier' }), /verified payment/);
  assert.throws(() => f.store.updatePayment(a.id, 'Paid'));
});

test('reference validation, duplicate prevention and explicit manual verification', () => {
  const f = fixture();
  const a = f.store.createOrder(f.dto), b = f.store.createOrder(f.dto);
  for (const reference of ['', '1234567890', 'ABC123456789', '000000000000', '1234-56789012', null, 123456789012])
    assert.throws(() => f.store.submitReference(a.id, reference as string), /12-digit/);
  const submitted = f.store.submitReference(a.id, '123456789012');
  assert.equal(submitted.status, 'Pending Verification');
  assert.equal(submitted.payment.status, 'PENDING_VERIFICATION');
  assert.equal(f.store.customerOrders([{ id: a.id, token: a.trackingToken }]).length, 1);
  const version = submitted.statusVersion;
  f.store.submitReference(a.id, '123456789012');
  assert.equal(submitted.statusVersion, version);
  assert.throws(() => f.store.submitReference(b.id, '123456789012'), /already been submitted/);
  assert.throws(() => f.store.updateStatus(a.id, 'Shipped'), /Verify payment/);
  f.store.updatePayment(a.id, 'Paid');
  assert.equal(submitted.status, 'Confirmed');
  assert.equal(submitted.payment.status, 'PAID');
  f.store.updateStatus(a.id, 'Processing');
  assert.throws(() => f.store.updateStatus(a.id, 'Confirmed'), /backwards/);
});

test('cancellation checks ownership, is idempotent, releases stock once and prevents every fulfillment mutation', () => {
  const f = fixture();
  const a = f.store.createOrder(f.dto), b = f.store.createOrder(f.dto);
  assert.throws(() => f.controller.cancel(a.id, b.trackingToken), /Order not found/);
  f.store.submitReference(a.id, '123456789012');
  f.store.updatePayment(a.id, 'Paid');
  const cancelled = f.controller.cancel(a.id, a.trackingToken);
  assert.equal(cancelled.status, 'Cancelled');
  assert.equal(cancelled.payment.status, 'PAID');
  assert.equal(cancelled.refundRequired, true);
  assert.equal(f.product.stock, 9);
  f.controller.cancel(a.id, a.trackingToken);
  assert.equal(f.product.stock, 9);
  assert.throws(() => f.store.updateStatus(a.id, 'Shipped'), /cannot be reopened/);
  assert.throws(() => f.store.updatePayment(a.id, 'Paid'), /only record a refund/);
  assert.throws(() => f.store.updateShipment(a.id, { type: 'Courier' }), /verified payment/);
  assert.throws(() => f.store.submitReference(a.id, '123456789012'), /Cancelled/);
  f.store.updatePayment(a.id, 'Refunded');
  assert.equal(cancelled.payment.status, 'REFUNDED');
  assert.equal(f.store.getOrder(a.id).refundRequired, false);
  assert.equal(f.product.stock, 9);
  const restored = parseStore(JSON.parse(JSON.stringify(f.state)));
  assert.equal(restored.orders.find((order) => order.id === a.id)?.status, 'Cancelled');
});

test('expired checkout is cancelled and releases stock; a late reference is rejected', () => {
  const f = fixture();
  const a = f.store.createOrder(f.dto);
  a.payment.expiresAt = new Date(0).toISOString();
  assert.throws(() => f.store.submitReference(a.id, '123456789012'), /Cancelled/);
  assert.equal(f.product.stock, 10);
  assert.equal(f.store.getOrder(a.id).status, 'Cancelled');
  f.store.sweepExpired();
  assert.equal(f.product.stock, 10);
  assert.deepEqual(f.store.adminOrders(), []);
});

test('submitted payment cancellation stays in history and cannot free its reference for reuse', () => {
  const f = fixture();
  const a = f.store.createOrder(f.dto), b = f.store.createOrder(f.dto);
  f.store.submitReference(a.id, '123456789012');
  f.store.cancelOrder(a.id);
  assert.equal(a.payment.status, 'CANCELLED');
  assert.equal(f.store.adminOrders()[0].status, 'Cancelled');
  assert.throws(() => f.store.submitReference(b.id, '123456789012'), /already been submitted/);
});

test('dispatch and delivered orders cannot be cancelled by guests', () => {
  const f = fixture();
  const a = f.store.createOrder(f.dto);
  f.store.submitReference(a.id, '123456789012');
  f.store.updatePayment(a.id, 'Paid');
  f.store.updateStatus(a.id, 'Shipped');
  assert.throws(() => f.store.cancelOrder(a.id), /being dispatched/);
  f.store.updateStatus(a.id, 'Delivered');
  assert.throws(() => f.store.updateStatus(a.id, 'Cancelled'), /Delivered/);
});

test('retired order numbers are never reused after cleanup', () => {
  const f = fixture();
  f.state.shop.lastOrderNumber = 1200;
  assert.equal(f.store.createOrder(f.dto).id, 'VKST-1201');
  f.store.updateShop({ lastOrderNumber: 1 });
  assert.equal(f.store.createOrder(f.dto).id, 'VKST-1202');
});

test('legacy unpaid receipts are normalized while cancelled payment references retain their refund check', () => {
  const f = fixture();
  f.store.createOrder(f.dto);
  f.store.createOrder(f.dto);
  const raw = JSON.parse(JSON.stringify(f.state));
  raw.orders[0].status = 'Order Placed';
  raw.orders[0].payment.status = 'Pending';
  raw.orders[1].status = 'Cancelled';
  raw.orders[1].payment.status = 'Processing';
  raw.orders[1].payment.reference = '123456789012';
  const restored = parseStore(raw);
  assert.equal(restored.orders[0].status, 'Pending Payment');
  assert.equal(restored.orders[0].payment.status, 'UNPAID');
  assert.equal(restored.orders[1].status, 'Cancelled');
  assert.equal(restored.orders[1].payment.status, 'CANCELLED');
  assert.equal(restored.orders[1].refundRequired, true);
});
