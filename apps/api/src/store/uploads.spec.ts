import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../app.module';
import { testDatabase } from './test-database';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Pool } from 'pg';

test('admin photos are saved in Garage, records in PostgreSQL, and survive API restart', async () => {
  const fixture = await testDatabase();
  const directory = await mkdtemp(join(tmpdir(), 'vks-upload-test-'));
  const previous = { DATA_FILE: process.env.DATA_FILE, ADMIN_PASSWORD: process.env.ADMIN_PASSWORD, AUTH_SECRET: process.env.AUTH_SECRET };
  process.env.DATA_FILE = join(directory, 'store.json');
  process.env.ADMIN_PASSWORD = randomUUID();
  process.env.AUTH_SECRET = randomUUID();
  const start = async () => {
    const server = await NestFactory.create(AppModule, { logger: false });
    server.setGlobalPrefix('api');
    await server.listen(0, '127.0.0.1');
    return server;
  };
  let app = await start();
  let base = await app.getUrl();
  let token = '';
  const request = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, `${method} ${path}: ${response.status}`);
    return response.json() as Promise<any>;
  };
  const upload = async (bytes: Buffer, mime: string, authenticated = true) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), '../../photo.png');
    return fetch(`${base}/api/admin/uploads`, { method: 'POST', headers: authenticated ? { Authorization: `Bearer ${token}` } : {}, body: form });
  };
  try {
    const initial = await request('/catalog');
    for (const field of ['products', 'banners']) assert.deepEqual(initial[field], []);
    assert.equal(initial.categories.length, 11);
    assert.equal(initial.shop.phone, '+91 80153 03041');
    assert.equal(initial.shop.gstin, '33POTPS8236C1Z7');
    assert.deepEqual(initial.shop.trustBadges, []);
    token = (await request('/auth/login', 'POST', { username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD })).accessToken;
    assert.deepEqual(await request('/admin/categories'), initial.categories);
    for (const section of ['orders', 'customers']) assert.deepEqual(await request(`/admin/${section}`), []);
    const image = await sharp({ create: { width: 40, height: 30, channels: 4, background: '#315bea' } }).png().toBuffer();
    assert.equal((await upload(image, 'image/png', false)).status, 401);
    assert.equal((await upload(Buffer.from('<svg/>'), 'image/svg+xml')).status, 400);
    assert.equal((await upload(Buffer.from('not an image'), 'image/png')).status, 400);
    assert.equal((await upload(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png')).status, 413);
    const response = await upload(image, 'image/png');
    assert.equal(response.status, 201);
    const { url } = await response.json() as { url: string };
    assert.match(url, /^\/api\/media\/uploads\/[0-9a-f-]{36}\.webp$/);
    const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: 'garage', forcePathStyle: true,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } });
    try {
      const object = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: 'uploads/' + url.split('/').pop() }));
      assert.equal(object.ContentType, 'image/webp');
      assert.ok((await object.Body!.transformToByteArray()).length > 0);
    } finally { s3.destroy(); }
    const category = await request('/admin/categories', 'POST', { name: 'Upload test category', imageUrl: url, enabled: true });
    const product = await request('/admin/products', 'POST', { name: 'Upload test product', categoryId: category.id, imageUrl: url, price: 25, stock: 2, enabled: true });
    await request('/admin/products/' + product.id + '/stock', 'PUT', { quantity: 12 });
    await request('/admin/banners', 'POST', { label: 'Test', title: 'Test banner', description: 'Test image', categoryId: category.id, imageUrl: url, enabled: true });
    await request('/admin/configuration/shop', 'PATCH', { logoUrl: url });
    await app.close();
    app = await start();
    base = await app.getUrl();
    const catalog = await request('/catalog');
    assert.equal(catalog.shop.logoUrl, url);
    for (const field of ['products', 'banners']) assert.equal(catalog[field][0].imageUrl, url);
    assert.equal(catalog.categories.find((item: { id: string }) => item.id === category.id)?.imageUrl, url);
    assert.equal(catalog.products[0].stock, 12);
    const photo = await fetch(base + url);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/webp');
    assert.equal(photo.headers.get('x-content-type-options'), 'nosniff');
    const metadata = await sharp(Buffer.from(await photo.arrayBuffer())).metadata();
    assert.equal(metadata.width, 40);
    assert.equal(metadata.height, 30);
    assert.equal((await fetch(base + '/api/media/uploads/missing.webp')).status, 404);
    const health = await request('/health');
    assert.equal(health.database, 'postgresql');
    assert.equal(health.images, 'garage');
    const { readdir } = await import('node:fs/promises');
    assert.deepEqual(await readdir(directory), [], 'DATA_FILE must not be written or used for uploads');
    const sql = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await sql.query(`DROP TABLE "${fixture.schema}".vks_store`);
      assert.equal((await fetch(base + '/api/health')).status, 503);
      assert.equal((await fetch(base + '/api/catalog')).status, 503);
    } finally { await sql.end(); }
  } finally {
    await app.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
    await fixture.close();
  }
});
