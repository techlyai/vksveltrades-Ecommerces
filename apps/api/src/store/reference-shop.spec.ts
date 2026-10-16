import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Pool } from 'pg';
import { testDatabase } from './test-database';
import { referenceShopDetails } from './reference-shop';

test('reference footer data is imported without changing payment, delivery or minimum-order rules', async (t) => {
  const { database, store, close } = await testDatabase();
  t.after(close);
  await database.run(() => {
    for (const [key, value] of Object.entries(referenceShopDetails)) assert.equal(store.shop[key as keyof typeof store.shop], value);
    assert.equal(store.shop.minimumOrder, 0);
    assert.equal(store.shop.maduraiFree, false);
    assert.equal(store.shop.gstRate, 0);
    assert.equal(store.shop.upiId, process.env.PAYMENT_UPI_ID || '');
    store.updateShop({ upiId: 'test@example' });
    const publicShop = store.publicShop();
    assert.equal(publicShop.upiEnabled, true);
    assert.equal('upiId' in publicShop, false);
    store.updateShop({ upiId: '' });
    assert.equal(store.publicShop().upiEnabled, false);
    store.updateShop({ phone: '9999999999', footerText: '', openingHours: '9 AM–8 PM' });
  });
  await database.onModuleInit();
  await database.run(() => {
    assert.equal(store.shop.phone, '9999999999');
    assert.equal(store.shop.footerText, '');
    assert.equal(store.shop.openingHours, '9 AM–8 PM');
  });
});

test('footer upgrade fills blanks and preserves existing admin business details', async (t) => {
  const { database, store, schema, close } = await testDatabase();
  t.after(close);
  await database.run(() => store.updateShop({ phone: '9999999999', email: 'owner@example.com', address: 'Saved address', gstin: '', legalName: '', footerText: '' }));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await pool.query(`DELETE FROM "${schema}".vks_migrations WHERE name = 'reference-footer-details-v1'`); }
  finally { await pool.end(); }
  await database.onModuleInit();
  await database.run(() => {
    assert.equal(store.shop.phone, '9999999999');
    assert.equal(store.shop.email, 'owner@example.com');
    assert.equal(store.shop.address, 'Saved address');
    assert.equal(store.shop.gstin, referenceShopDetails.gstin);
    assert.equal(store.shop.legalName, referenceShopDetails.legalName);
    assert.equal(store.shop.footerText, referenceShopDetails.footerText);
  });
});
