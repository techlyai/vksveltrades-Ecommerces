import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { testDatabase } from './test-database';
import { validateSoundWav, validateSoundSettings } from './order-sound';
import { shop } from './seed';

function wav(seconds = .1) {
  const sampleRate = 8000, dataSize = Math.round(seconds * sampleRate) * 2;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(dataSize, 40);
  return bytes;
}

test('audio validation enforces real bounded PCM audio and rejects arbitrary settings/URLs', () => {
  assert.doesNotThrow(() => validateSoundWav(wav()));
  assert.doesNotThrow(() => validateSoundWav(wav(15)));
  for (const bytes of [Buffer.from('<html>not audio</html>'), wav(15.1), wav(0), Buffer.alloc(3 * 1024 * 1024 + 1)])
    assert.throws(() => validateSoundWav(bytes));
  for (const [offset, value] of [[20, 3], [22, 8], [32, 4], [34, 32]]) {
    const bytes = wav(); bytes.writeUInt16LE(value, offset); assert.throws(() => validateSoundWav(bytes));
  }
  const truncated = wav().subarray(0, 50); assert.throws(() => validateSoundWav(truncated));
  for (const patch of [{ orderSoundVolume: -1 }, { orderSoundVolume: 101 }, { orderSoundVolume: NaN }, { orderSoundEnabled: 'yes' },
    { orderSound: 'unknown' }, { orderSound: 'custom' }, { orderSoundUrl: 'https://example.com/file.wav' }, { orderSoundUrl: 'data:audio/wav;base64,AAAA' }])
    assert.throws(() => validateSoundSettings(patch as never, shop));
  assert.doesNotThrow(() => validateSoundSettings({ orderSound: 'ping', orderSoundEnabled: false, orderSoundVolume: 0 }, shop));
});

test('authenticated sound upload, alerts and preferences persist through the existing API and storage', async (t) => {
  const fixture = await testDatabase();
  const previous = { ADMIN_PASSWORD: process.env.ADMIN_PASSWORD, AUTH_SECRET: process.env.AUTH_SECRET };
  process.env.ADMIN_PASSWORD = randomUUID(); process.env.AUTH_SECRET = randomUUID();
  const start = async () => {
    const server = await NestFactory.create(AppModule, { logger: false });
    server.setGlobalPrefix('api'); await server.listen(0, '127.0.0.1'); return server;
  };
  let app = await start(), base = await app.getUrl(), token = '';
  t.after(async () => {
    await app.close(); await fixture.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const request = (path: string, method = 'GET', body?: unknown, authenticated = true) => fetch(base + '/api' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const upload = (bytes: Buffer, type = 'audio/wav', authenticated = true) => {
    const body = new FormData(); body.append('file', new Blob([new Uint8Array(bytes)], { type }), '../../clip.wav');
    return fetch(base + '/api/admin/order-sounds', { method: 'POST', headers: authenticated ? { Authorization: `Bearer ${token}` } : {}, body });
  };
  const login = await request('/auth/login', 'POST', { username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD }, false);
  token = (await login.json() as { accessToken: string }).accessToken;
  assert.equal((await request('/admin/order-alerts', 'GET', undefined, false)).status, 401);
  assert.equal((await upload(wav(), 'audio/wav', false)).status, 401);
  assert.equal((await upload(Buffer.from('not an audio file'))).status, 400);
  assert.equal((await upload(wav(), 'image/png')).status, 400);
  assert.equal((await upload(wav(16))).status, 400);
  assert.equal((await upload(Buffer.alloc(3 * 1024 * 1024 + 1))).status, 413);
  const uploaded = await upload(wav()); assert.equal(uploaded.status, 201);
  const { url } = await uploaded.json() as { url: string };
  assert.match(url, /^\/api\/media\/order-sounds\/[0-9a-f-]{36}\.wav$/);
  const settings = { orderSound: 'custom', orderSoundVolume: 43, orderSoundEnabled: true, orderSoundUrl: url, minimumOrder: 0 };
  assert.equal((await request('/admin/configuration/shop', 'PATCH', settings)).status, 200);
  for (const patch of [{ orderSound: 'invalid' }, { orderSoundVolume: 150 }, { orderSoundUrl: '/api/media/order-sounds/../../secret.wav' }])
    assert.equal((await request('/admin/configuration/shop', 'PATCH', patch)).status, 400);
  const productResponse = await request('/admin/products', 'POST', { imageUrl: '/test-product.webp', name: 'Alert test', categoryId: 'electrical', price: 500, stock: 2 });
  assert.equal(productResponse.status, 201);
  const product = await productResponse.json() as { id: string };
  const orderResponse = await request('/orders', 'POST', { customerCategoryId: 'customer', items: [{ productId: product.id, quantity: 1 }],
    customer: { name: 'Test', phone: '9876543210', address: '1 Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' } });
  assert.equal(orderResponse.status, 201);
  const order = await orderResponse.json() as { id: string; createdAt: string };
  const alerts = await (await request('/admin/order-alerts')).json() as any;
  assert.deepEqual(alerts.orders, [{ id: order.id, createdAt: order.createdAt }]);
  assert.equal(alerts.activeOrders, 1); assert.equal(alerts.sound.orderSoundVolume, 43); assert.equal(alerts.sound.orderSoundUrl, url);
  const catalog = await (await request('/catalog')).json() as any;
  assert.equal(catalog.shop.orderSoundUrl, undefined); assert.equal(catalog.shop.orderSound, undefined);
  await app.close(); app = await start(); base = await app.getUrl();
  const restored = await (await request('/admin/configuration')).json() as any;
  assert.equal(restored.shop.orderSoundUrl, url); assert.equal(restored.shop.orderSound, 'custom'); assert.equal(restored.shop.orderSoundVolume, 43);
  const audio = await fetch(base + url);
  assert.equal(audio.status, 200); assert.equal(audio.headers.get('content-type'), 'audio/wav');
  assert.equal(audio.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await audio.arrayBuffer()), wav());
  assert.equal((await fetch(base + '/api/media/order-sounds/invalid.wav')).status, 404);
  await request('/admin/orders/' + order.id + '/status', 'PATCH', { status: 'Cancelled' });
  assert.equal((await (await request('/admin/order-alerts')).json() as any).activeOrders, 0);
});
