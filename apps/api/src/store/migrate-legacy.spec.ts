import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { testDatabase } from './test-database';
import { emptyStore } from './store-state';
import { migrateLegacy } from './migrate-legacy';
import { ImageStorage } from './image-storage.service';

test('explicit migration copies records/photos without modifying files or overwriting a live DB', async (t) => {
  const fixture = await testDatabase();
  t.after(() => fixture.close());
  const directory = await mkdtemp(join(tmpdir(), 'vks-migration-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'uploads'));
  const name = `${randomUUID()}.webp`;
  const photo = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#315bea' } }).webp().toBuffer();
  await writeFile(join(directory, 'uploads', name), photo);
  const state = emptyStore();
  state.shop.name = 'Imported shop';
  state.shop.logoUrl = `/api/media/uploads/${name}`;
  const text = JSON.stringify(state);
  const path = join(directory, 'store.json');
  await writeFile(path, text);
  assert.equal((await migrateLegacy(path)).applied, false);
  await fixture.database.run(() => assert.notEqual(fixture.store.shop.name, 'Imported shop'));
  assert.equal((await migrateLegacy(path, true)).applied, true);
  await fixture.database.run(() => assert.equal(fixture.store.shop.name, 'Imported shop'));
  assert.equal(await readFile(path, 'utf8'), text);
  const storage = new ImageStorage();
  try { assert.deepEqual(await storage.get(name), photo); } finally { storage.onModuleDestroy(); }
  await assert.rejects(migrateLegacy(path, true), /already been changed/);
});
