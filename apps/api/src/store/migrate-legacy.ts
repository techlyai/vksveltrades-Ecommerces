import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { StoreDatabase } from './store.database';
import { ImageStorage, uploadedImageName } from './image-storage.service';
import { emptyStore, parseStore } from './store-state';

// Explicit, non-destructive migration only. This module is not imported by the API.
export async function migrateLegacy(source: string, apply = false) {
  const dataFile = resolve(source);
  const raw = JSON.parse(await readFile(dataFile, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid legacy store');
  const defaults = emptyStore();
  const state = parseStore({ ...defaults, ...raw, shop: { ...defaults.shop, ...raw.shop } });
  const names = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === 'string' && value.startsWith('/api/media/uploads/')) {
      const name = value.slice('/api/media/uploads/'.length);
      if (!uploadedImageName.test(name)) throw new Error('Invalid legacy image reference');
      names.add(name);
    } else if (value && typeof value === 'object') {
      for (const child of Object.values(value)) collect(child);
    }
  };
  collect(state);
  const images = new Map<string, Buffer>();
  for (const name of names) {
    const bytes = await readFile(join(dirname(dataFile), 'uploads', name));
    if (bytes.length > 20 * 1024 * 1024 || (await sharp(bytes, { limitInputPixels: 25_000_000 }).metadata()).format !== 'webp') {
      throw new Error(`Invalid legacy image: ${name}`);
    }
    images.set(name, bytes);
  }
  if (!apply) return { applied: false, products: state.products.length, orders: state.orders.length, images: images.size };
  const database = new StoreDatabase();
  const storage = new ImageStorage();
  try {
    await database.onModuleInit();
    await storage.onModuleInit();
    await database.assertPristine();
    // Network transfers are deliberately outside the PostgreSQL transaction.
    for (const [name, bytes] of images) {
      try {
        const existing = await storage.get(name);
        if (!existing.equals(bytes)) throw new Error(`Import refused: Garage already has different content for ${name}`);
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
        await storage.put(name, bytes);
      }
    }
    // A competing admin save makes this fail safely instead of overwriting it.
    await database.importIntoEmptyStore(state);
    return { applied: true, products: state.products.length, orders: state.orders.length, images: images.size };
  } finally {
    await database.onModuleDestroy();
    storage.onModuleDestroy();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const source = args[args.indexOf('--source') + 1];
  if (!args.includes('--source') || !source || source.startsWith('--')) {
    console.error('Usage: npm run migrate:legacy -- --source /legacy/store.json [--apply]');
    process.exitCode = 1;
  } else {
    migrateLegacy(source, args.includes('--apply')).then((result) => console.log(JSON.stringify(result)))
      .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; });
  }
}
