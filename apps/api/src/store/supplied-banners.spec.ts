import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Pool } from 'pg';
import { testDatabase } from './test-database';

test('owner artwork is imported once at two seconds and stays editable or removable', async (t) => {
  const { database, store, close } = await testDatabase({ samples: true });
  t.after(close);
  await database.run(() => {
    const imported = store.banners.filter((banner) => banner.id.startsWith('owner-banner-'));
    assert.equal(imported.length, 13);
    for (const banner of imported) {
      assert.equal(banner.duration, 2);
      assert.match(banner.imageUrl!, /^\/banners\/[a-z-]+\.jpeg$/);
    }
    assert.equal(store.shop.bannerInterval, 2);
    assert.equal(store.shop.bannerAutoSlide, true);
    assert.ok(store.banners.filter((banner) => banner.id.startsWith('sample-banner-')).every((banner) => !banner.enabled));
    store.updateBanner('owner-banner-finolex', { title: 'Owner title', duration: 5, enabled: false });
    store.deleteBanner('owner-banner-astral');
  });
  await database.onModuleInit();
  await database.run(() => {
    assert.equal(store.banners.find((banner) => banner.id === 'owner-banner-finolex')?.title, 'Owner title');
    assert.equal(store.banners.find((banner) => banner.id === 'owner-banner-finolex')?.duration, 5);
    assert.equal(store.banners.some((banner) => banner.id === 'owner-banner-astral'), false);
  });
});

test('banner upgrade retains custom artwork and never changes delivery/payment settings', async (t) => {
  const { database, store, schema, close } = await testDatabase({ samples: true });
  t.after(close);
  await database.run(() => {
    store.updateBanner('sample-banner-electrical', { title: 'Custom promotion', imageUrl: '/api/uploads/owner.jpeg', enabled: true });
    store.updateShop({ minimumOrder: 450, defaultDeliveryCharge: 90, upiId: 'test@example' });
  });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await pool.query(`DELETE FROM "${schema}".vks_migrations WHERE name = 'owner-banner-artwork-v1'`); }
  finally { await pool.end(); }
  await database.onModuleInit();
  await database.run(() => {
    const custom = store.banners.find((banner) => banner.id === 'sample-banner-electrical')!;
    assert.equal(custom.title, 'Custom promotion');
    assert.equal(custom.imageUrl, '/api/uploads/owner.jpeg');
    assert.equal(custom.enabled, true);
    assert.equal(store.banners.filter((banner) => banner.id.startsWith('owner-banner-')).length, 13);
    assert.equal(store.shop.minimumOrder, 450);
    assert.equal(store.shop.defaultDeliveryCharge, 90);
    assert.equal(store.shop.upiId, 'test@example');
  });
});

test('department banners replace bundled brand banners once and keep admin edits', async (t) => {
  const { database, store, schema, close } = await testDatabase({ samples: true });
  t.after(close);
  await database.run(() => {
    const departments = store.banners.filter((banner) => banner.id.startsWith('category-banner-'));
    assert.deepEqual(departments.map((banner) => banner.title),
      ['Paints & Finishing', 'Hardware & Tools', 'Electrical Products', 'Plumbing Products', 'Cement & Construction']);
    assert.deepEqual(departments.map((banner) => banner.duration), [10, 5, 5, 5, 5]);
    assert.ok(departments.every((banner) => banner.enabled && banner.brands?.length && banner.linkType === 'category'));
    const paints = departments[0];
    assert.equal(paints.videoUrl, '/banners/paints.mp4');
    assert.equal(paints.linkValue, 'paints');
    assert.ok(store.banners.filter((banner) => banner.id.startsWith('owner-banner-')).every((banner) => banner.enabled === false));
    store.updateBanner('category-banner-paints', { brands: [' Dulux ', '', 'Birla Opus'], gallery: [], videoUrl: '' });
    store.deleteBanner('category-banner-cement');
    // An owner banner with an uploaded photo is not bundled artwork and must stay visible.
    store.updateBanner('owner-banner-cera', { imageUrl: '/api/media/uploads/cera.webp', enabled: true });
  });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await pool.query(`DELETE FROM "${schema}".vks_migrations WHERE name = 'category-banners-v1'`); }
  finally { await pool.end(); }
  await database.onModuleInit();
  await database.run(() => {
    const paints = store.banners.find((banner) => banner.id === 'category-banner-paints')!;
    assert.deepEqual(paints.brands, ['Dulux', 'Birla Opus']);
    assert.equal(paints.videoUrl, '');
    assert.equal(store.banners.some((banner) => banner.id === 'category-banner-cement'), true); // Re-run restores only missing records.
    assert.equal(store.banners.find((banner) => banner.id === 'owner-banner-cera')?.enabled, true);
    assert.throws(() => store.updateBanner('category-banner-paints', { videoUrl: 'javascript:alert(1).mp4' }), /Banner video/);
    assert.throws(() => store.updateBanner('category-banner-paints', { brands: ['x'.repeat(41)] }), /Brands/);
    assert.throws(() => store.updateBanner('category-banner-paints', { gallery: ['//evil.example/a.jpg'] }), /Image must/);
  });
});

test('plumbing banner shows the transparent Astral tanks without cards, unless an admin changed it', async (t) => {
  const { database, store, schema, close } = await testDatabase({ samples: true });
  t.after(close);
  await database.run(() => {
    const plumbing = store.banners.find((banner) => banner.id === 'category-banner-plumbing')!;
    assert.equal(plumbing.theme, 'plumbing');
    assert.equal(plumbing.imageUrl, '/banners/dept-plumbing.webp');
    // Recreate the first-release record to prove the one-time upgrade.
    store.updateBanner('category-banner-plumbing', { imageUrl: '/banners/astral.jpeg', cutout: false, gallery: ['/banners/pvc-taps.jpeg', '/banners/leo.jpeg'] });
    assert.throws(() => store.updateBanner('category-banner-plumbing', { cutout: 'yes' as unknown as boolean }), /Transparent photo/);
  });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await pool.query(`DELETE FROM "${schema}".vks_migrations WHERE name = 'plumbing-banner-cutout-v1'`); }
  finally { await pool.end(); }
  await database.onModuleInit();
  await database.run(() => {
    const plumbing = store.banners.find((banner) => banner.id === 'category-banner-plumbing')!;
    assert.equal(plumbing.cutout, true);
    assert.deepEqual(plumbing.gallery, []);
    store.updateBanner('category-banner-plumbing', { cutout: false, gallery: ['/banners/leo.jpeg'] });
  });
  const again = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await again.query(`DELETE FROM "${schema}".vks_migrations WHERE name = 'plumbing-banner-cutout-v1'`); }
  finally { await again.end(); }
  await database.onModuleInit();
  await database.run(() => {
    const plumbing = store.banners.find((banner) => banner.id === 'category-banner-plumbing')!;
    assert.equal(plumbing.cutout, false); // A customised banner is left alone.
    assert.deepEqual(plumbing.gallery, ['/banners/leo.jpeg']);
  });
});

test('mockup artwork replaces earlier department images once and keeps admin photos', async (t) => {
  const { database, store, schema, close } = await testDatabase({ samples: true });
  t.after(close);
  await database.run(() => {
    const departments = store.banners.filter((banner) => banner.id.startsWith('category-banner-'));
    assert.deepEqual(departments.map((banner) => banner.theme), ['paints', 'hardware', 'electrical', 'plumbing', 'cement']);
    assert.deepEqual(departments.find((banner) => banner.theme === 'plumbing')!.brands, ['Astral', 'CERA', 'Taps & Fittings', 'Watertec']);
    assert.deepEqual(departments.find((banner) => banner.theme === 'electrical')!.brands, ['Finolex', 'Polycab', 'Kundan Cab', 'Philips', 'Surya']);
    // An earlier-release hardware banner and an admin-customised cement banner.
    store.updateBanner('category-banner-hardware', { imageUrl: '/banners/araldite.jpeg', theme: '', brands: ['Araldite'], description: 'Old copy.' });
    store.updateBanner('category-banner-cement', { imageUrl: '/api/media/uploads/owner-cement.webp', theme: '' });
    assert.throws(() => store.updateBanner('category-banner-cement', { theme: 'garden' }), /banner style/);
  });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await pool.query(`DELETE FROM "${schema}".vks_migrations WHERE name = 'department-banner-artwork-v1'`); }
  finally { await pool.end(); }
  await database.onModuleInit();
  await database.run(() => {
    const hardware = store.banners.find((banner) => banner.id === 'category-banner-hardware')!;
    assert.equal(hardware.imageUrl, '/banners/dept-hardware.webp');
    assert.equal(hardware.theme, 'hardware');
    assert.equal(hardware.description, 'Reliable tools and hardware for every job');
    const cement = store.banners.find((banner) => banner.id === 'category-banner-cement')!;
    assert.equal(cement.imageUrl, '/api/media/uploads/owner-cement.webp');
    assert.equal(cement.theme, '');
  });
});
