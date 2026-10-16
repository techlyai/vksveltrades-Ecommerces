import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function worker() {
  const handlers = {}, seen = new Map(), notifications = [], opened = [], navigated = [];
  const indexedDB = { open() {
    const request = {};
    request.result = { close() {}, transaction() {
      const tx = { objectStore() { return { get: (id) => { const result = { result: seen.get(id) }; queueMicrotask(() => tx.oncomplete()); return result; }, put: (value, id) => { seen.set(id, value); const result = {}; queueMicrotask(() => tx.oncomplete()); return result; } }; } };
      return tx;
    } };
    queueMicrotask(() => request.onsuccess()); return request;
  } };
  let windows = [];
  const self = { addEventListener: (name, callback) => { handlers[name] = callback; }, location: { origin: 'https://shop.example' },
    clients: { claim: async () => {}, matchAll: async () => windows, openWindow: async (url) => opened.push(url) },
    registration: { showNotification: async (...args) => notifications.push(args) }, skipWaiting() {},
  };
  runInNewContext(source, { self, indexedDB, URL, Date, Promise });
  const fire = async (name, data) => { let result; handlers[name]({ ...data, waitUntil: (promise) => { result = promise; } }); await result; };
  return { fire, notifications, opened, navigated, useExistingWindow(fails = false) {
    const client = { url: 'https://shop.example/orders/VKST-1001', postMessage() {}, navigate: async (url) => { navigated.push(url); return fails ? null : client; }, focus: async () => {} };
    windows = [client];
  } };
}

test('worker displays branded notifications once and opens exact order path in a new mobile-style window', async () => {
  const w = worker();
  const payload = { eventId: 'VKST-1001:2', orderId: 'VKST-1001', status: 'Packed', body: 'VKST-1001 · Packed', path: `/orders/VKST-1001#token=${'a'.repeat(64)}` };
  for (let count = 0; count < 2; count++) await w.fire('push', { data: { json: () => payload } });
  assert.equal(w.notifications.length, 1); assert.equal(w.notifications[0][0], 'VKS VEL TRADERS');
  await w.fire('notificationclick', { notification: { data: w.notifications[0][1].data, close() {} } });
  assert.equal(w.opened[0], `https://shop.example${payload.path}`);
  w.useExistingWindow();
  await w.fire('notificationclick', { notification: { data: w.notifications[0][1].data, close() {} } });
  assert.equal(w.navigated[0], `https://shop.example${payload.path}`);
  assert.equal(w.opened.length, 1);
  w.useExistingWindow(true);
  await w.fire('notificationclick', { notification: { data: w.notifications[0][1].data, close() {} } });
  assert.equal(w.opened.length, 2);
});

test('worker rejects malformed payloads and offsite notification destinations', async () => {
  const w = worker();
  await w.fire('push', { data: { json: () => { throw new Error('bad JSON'); } } });
  await w.fire('push', { data: { json: () => null } });
  await w.fire('push', { data: { json: () => ({ eventId: 'x', orderId: 'VKST-1001', path: 'https://evil.example/' }) } });
  await w.fire('notificationclick', { notification: { close() {}, data: { orderId: 'VKST-1001', path: 'https://evil.example/' } } });
  assert.equal(w.opened.length, 0); assert.equal(w.notifications.length, 0);
});
