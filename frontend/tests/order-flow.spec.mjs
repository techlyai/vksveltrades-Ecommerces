import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const load = require('./load-source.cjs');
const { rememberReceipt, receiptToken, readReceipts, pruneReceipts, trackingPath, activeOrderCount, copyOrderText, printOrder } = load('../lib/order-receipts.ts');
const { enableOrderPush } = load('../lib/push-client.ts');
const { api } = load('../lib/api.ts');

test('starting checkout does not save an order receipt; successful reconciliation removes stale credentials', async (t) => {
  const saved = new Map();
  globalThis.localStorage = { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ id: 'VKST-9998', trackingToken: 'f'.repeat(64), status: 'Pending Payment' })));
  await api.order([], {}, 'customer', 'f'.repeat(64));
  assert.equal(receiptToken('VKST-9998'), undefined);
  rememberReceipt('VKST-9997', 'e'.repeat(64));
  rememberReceipt('VKST-9996', 'd'.repeat(64));
  pruneReceipts([], ['VKST-9997']);
  assert.equal(receiptToken('VKST-9996'), 'd'.repeat(64));
  pruneReceipts([]);
  assert.equal(receiptToken('VKST-9997'), undefined);
});

test('receipt credentials persist, use fragment links, and badge counts the same active list', () => {
  const saved = new Map();
  globalThis.localStorage = { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  assert.equal(rememberReceipt('VKST-1001', 'a'.repeat(64)), true);
  assert.equal(receiptToken('VKST-1001'), 'a'.repeat(64));
  assert.equal(receiptToken('VKST-9999'), undefined);
  assert.equal(trackingPath('VKST-1001', 'a'.repeat(64)), `/orders/VKST-1001#token=${'a'.repeat(64)}`);
  assert.equal(rememberReceipt('VKST-1002', 'bad'), false);
  assert.equal(readReceipts().length, 1);
  assert.equal(activeOrderCount([{ id: '1', status: 'Packed' }, { id: '1', status: 'Packed' }, { id: '2', status: 'Delivered' }, { id: '3', status: 'Cancelled' }, { id: '4', status: 'Order Placed' }]), 2);
});

test('blocked browser storage keeps the current receipt in memory and reports it was not persisted', () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('blocked'); } };
  assert.equal(rememberReceipt('VKST-1003', 'b'.repeat(64)), false);
  assert.equal(receiptToken('VKST-1003'), 'b'.repeat(64));
});

test('copy uses the browser clipboard and reports clipboard failures', async () => {
  let copied;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (value) => { copied = value; } } } });
  await copyOrderText('VKST-1001');
  assert.equal(copied, 'VKST-1001');
  navigator.clipboard.writeText = async () => { throw new Error('denied'); };
  await assert.rejects(copyOrderText('VKST-1001'));
});

test('Print / Save as PDF opens the browser print dialog', () => {
  let calls = 0;
  globalThis.window = { print: () => calls++ };
  printOrder();
  assert.equal(calls, 1);
});

test('permission denial never registers or saves a subscription; granted permission saves exact order ownership', async () => {
  let permissionRequests = 0, registered = 0, stored;
  const subscription = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/test' }) };
  const registration = { pushManager: { getSubscription: async () => null, subscribe: async (options) => { assert.equal(options.userVisibleOnly, true); return subscription; } } };
  globalThis.window = { isSecureContext: true, PushManager: function () {}, Notification: {} };
  globalThis.Notification = { permission: 'denied', requestPermission: async () => { permissionRequests++; return 'granted'; } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { register: async (path) => { assert.equal(path, '/sw.js'); registered++; return registration; }, ready: Promise.resolve(registration) } } });
  api.subscribe = async (...args) => { stored = args; return { subscribed: true }; };
  await assert.rejects(enableOrderPush('VKST-1001', 'a'.repeat(64), 'AQID'), /blocked/);
  assert.equal(permissionRequests, 0); assert.equal(registered, 0); assert.equal(stored, undefined);
  Notification.permission = 'default';
  Notification.requestPermission = async () => 'default';
  await assert.rejects(enableOrderPush('VKST-1001', 'a'.repeat(64), 'AQID'), /not enabled/);
  assert.equal(registered, 0);
  Notification.requestPermission = async () => 'granted';
  await enableOrderPush('VKST-1001', 'a'.repeat(64), 'AQID');
  assert.equal(stored[0], 'VKST-1001'); assert.equal(stored[1], 'a'.repeat(64));
  window.isSecureContext = false;
  await assert.rejects(enableOrderPush('VKST-1001', 'a'.repeat(64), 'AQID'), /HTTPS/);
});
