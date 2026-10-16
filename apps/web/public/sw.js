/* Push-only worker: never cache customer/order/API responses. */
const BRAND = 'VKS VEL TRADERS';
const validPath = (path, id) => typeof path === 'string' && /^VKST-\d+$/.test(id)
  && new RegExp(`^/orders/${id}#token=[a-f0-9]{64}$`).test(path);
let processing = Promise.resolve();

function receipts() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('vks-push-receipts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('seen');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function receipt(id, save = false) {
  const db = await receipts();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('seen', save ? 'readwrite' : 'readonly');
      const request = save ? transaction.objectStore('seen').put(Date.now(), id) : transaction.objectStore('seen').get(id);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (!payload || !validPath(payload.path, payload.orderId) || typeof payload.eventId !== 'string' || payload.eventId.length > 100) return;
  processing = processing.catch(() => {}).then(async () => {
    // A stable event ID also suppresses retries across worker restarts.
    if (await receipt(payload.eventId).catch(() => false)) return;
    await self.registration.showNotification(BRAND, {
      body: String(payload.body || `${payload.orderId}: ${payload.status}`).slice(0, 240),
      icon: '/brand/shop-logo.png', tag: `vks-${payload.eventId}`, renotify: false,
      data: { path: payload.path, orderId: payload.orderId },
    });
    await receipt(payload.eventId, true).catch(() => {});
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) client.postMessage({ type: 'order-updated', orderId: payload.orderId });
  });
  event.waitUntil(processing);
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { path, orderId } = event.notification.data || {};
  if (!validPath(path, orderId)) return;
  event.waitUntil((async () => {
    const url = new URL(path, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const current = windows.find((client) => new URL(client.url).origin === self.location.origin && new URL(client.url).pathname === `/orders/${orderId}`);
    if (current && 'navigate' in current) {
      const navigated = await current.navigate(url).catch(() => null);
      if (navigated) { await navigated.focus(); return; }
    }
    await self.clients.openWindow(url);
  })());
});
