import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../app.module';
import { testDatabase } from './test-database';
import { validatePaintShade } from './paint-shades';
import { defaultPaintShades } from './paint-shade-defaults';

const sample = { name: 'Ocean shade', code: 'OC 100', brand: 'Shop card', family: 'Blues', color: '#225588', enabled: true };

test('shade validation rejects duplicate codes, unsafe image URLs and oversized order annotations', () => {
  assert.equal(defaultPaintShades.length, 133);
  const shade = validatePaintShade(sample, 'one', []);
  for (const patch of [null, [], { ...sample, name: ' ' }, { ...sample, code: '#' }, { ...sample, code: 'A\nB' },
    { ...sample, name: 'x'.repeat(51) }, { ...sample, family: '' }, { ...sample, enabled: 'yes' }, { ...sample, color: 'red' },
    { ...sample, brand: 'b'.repeat(30), code: 'c'.repeat(30), name: 'n'.repeat(30) },
    ...['javascript:alert(1)', 'https://example.com/photo.webp', '//external/photo.webp', '/api/media/uploads/../../private.webp', null].map((imageUrl) => ({ ...sample, imageUrl }))]) {
    assert.throws(() => validatePaintShade(patch, 'two', []));
  }
  assert.throws(() => validatePaintShade({ ...sample, code: 'oc-100' }, 'two', [shade]), /already exists/);
  assert.throws(() => validatePaintShade({ ...sample, code: 'oc100' }, 'two', [{ ...shade, enabled: false }]), /already exists/);
  assert.equal(validatePaintShade({ ...sample, code: 'OC-100' }, 'one', [shade]).code, 'OC-100');
  assert.equal(validatePaintShade({ ...sample, id: 'override', imageUrl: '' }, 'one', []).id, 'one');
  for (const entry of defaultPaintShades) assert.doesNotThrow(() => validatePaintShade(entry, entry.id, defaultPaintShades));
});

test('admin shade numbers and uploaded photos persist, hidden shades stay private, and old orders stay unchanged', async (t) => {
  const fixture = await testDatabase();
  const previous = { ADMIN_PASSWORD: process.env.ADMIN_PASSWORD, AUTH_SECRET: process.env.AUTH_SECRET };
  process.env.ADMIN_PASSWORD = randomUUID(); process.env.AUTH_SECRET = randomUUID();
  const start = async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1'); return app;
  };
  let app = await start(), base = `${await app.getUrl()}/api`, token = '';
  t.after(async () => {
    await app.close(); await fixture.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const request = (path: string, method = 'GET', body?: unknown, authenticated = true) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const login = await request('/auth/login', 'POST', { username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD });
  token = (await login.json() as { accessToken: string }).accessToken;
  for (const [path, method, body] of [['/paint-shades', 'GET', undefined], ['/paint-shades', 'POST', sample], ['/paint-shades/opus-ww0029', 'PATCH', sample]] as const)
    assert.equal((await request('/admin' + path, method, body, false)).status, 401);
  const initial = await (await request('/catalog')).json() as any;
  assert.equal(initial.paintShades.length, 133);
  const original = initial.paintShades.find((shade: any) => shade.code === 'WW 0029');
  assert.equal(original.name, 'Jasmine');
  const product = await fixture.database.run(() => {
    fixture.store.updateShop({ minimumOrder: 0, gstInclusive: true, gstRate: 18 });
    return fixture.store.createProduct({ imageUrl: '/test-product.webp', name: 'Paint', categoryId: 'paints', price: 118, stock: 10 });
  });
  const order = await fixture.database.run(() => fixture.store.createOrder({ customerCategoryId: 'customer',
    customer: { name: 'Shade Customer', phone: '9876543210', address: 'Test street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' },
    items: [{ productId: product.id, quantity: 1, customShadeCode: 'Birla Opus / WW 0029 / Jasmine' }],
  }));
  const image = await sharp({ create: { width: 60, height: 60, channels: 3, background: '#225588' } }).png().toBuffer();
  const form = new FormData(); form.append('file', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'shade.png');
  const upload = await fetch(base + '/admin/uploads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  assert.equal(upload.status, 201);
  const imageUrl = (await upload.json() as { url: string }).url;
  const create = await request('/admin/paint-shades', 'POST', { ...sample, imageUrl });
  assert.equal(create.status, 201);
  const created = await create.json() as any;
  const edited = await request(`/admin/paint-shades/${original.id}`, 'PATCH', { code: 'WW 0029-A', name: 'Jasmine revised', imageUrl });
  assert.equal(edited.status, 200);
  assert.equal((await edited.json() as any).id, original.id);
  const competing = await Promise.all([
    request(`/admin/paint-shades/${original.id}`, 'PATCH', { family: 'Warm neutrals' }),
    request(`/admin/paint-shades/${created.id}`, 'PATCH', { name: 'Ocean revised', enabled: false }),
  ]);
  assert.deepEqual(competing.map((response) => response.status), [200, 200]);
  assert.equal((await request('/admin/configuration/shop', 'PATCH', { paintShades: [] })).status, 400);
  assert.equal((await request('/admin/paint-shades', 'POST', { ...sample, code: 'OC-100' })).status, 400);
  assert.equal((await request('/admin/paint-shades/missing', 'PATCH', sample)).status, 404);
  const catalog = await (await request('/catalog')).json() as any;
  assert.equal(catalog.paintShades.length, 133);
  assert.equal(catalog.shop.paintShades, undefined);
  assert.equal(catalog.paintShades.some((shade: any) => shade.id === created.id), false);
  assert.equal(catalog.paintShades.find((shade: any) => shade.id === original.id).family, 'Warm neutrals');
  assert.equal(catalog.paintShades.find((shade: any) => shade.id === original.id).imageUrl, imageUrl);
  const configuration = await (await request('/admin/configuration')).json() as any;
  assert.equal(configuration.shop.paintShades, undefined, 'Unrelated settings saves cannot overwrite shade edits');
  await fixture.database.run(() => {
    assert.equal(fixture.store.getOrder(order.id).items[0].customShadeCode, 'Birla Opus / WW 0029 / Jasmine');
    assert.equal(fixture.store.getOrder(order.id).total, 118);
    assert.equal(fixture.store.getOrder(order.id).gst, 18);
  });
  await app.close(); app = await start(); base = `${await app.getUrl()}/api`;
  const restored = await (await request('/admin/paint-shades')).json() as any[];
  assert.equal(restored.length, 134);
  assert.equal(restored.find((shade) => shade.id === original.id).code, 'WW 0029-A');
  assert.equal(restored.find((shade) => shade.id === created.id).name, 'Ocean revised');
  const photo = await fetch(base.replace(/\/api$/, '') + imageUrl);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/webp');
  assert.equal((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).width, 60);
  assert.equal((await request(`/admin/paint-shades/${original.id}`, 'PATCH', { imageUrl: '' })).status, 200);
  const withoutPhoto = await (await request('/catalog')).json() as any;
  assert.equal(withoutPhoto.paintShades.find((shade: any) => shade.id === original.id).imageUrl, undefined);
});
