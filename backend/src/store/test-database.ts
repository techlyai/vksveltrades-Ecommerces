import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { StoreDatabase } from './store.database';
import { StoreService } from './store.service';

export async function testDatabase({ samples = false }: { samples?: boolean } = {}) {
  if (!process.env.DATABASE_URL) throw new Error('Run npm test to provision isolated storage');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `test_${randomBytes(10).toString('hex')}`;
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const previous = process.env.DATABASE_SCHEMA;
  process.env.DATABASE_SCHEMA = schema;
  const database = new StoreDatabase();
  await database.onModuleInit();
  // Business-rule fixtures start empty; sample migration tests opt into the
  // actual first-start catalog. Only this randomly named test schema is touched.
  if (!samples) await pool.query(`DELETE FROM "${schema}".vks_entities WHERE kind IN ('products', 'banners')`);
  const store = new StoreService(database);
  return {
    database, store, schema,
    async close() {
      await database.onModuleDestroy();
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await pool.end();
      if (previous === undefined) delete process.env.DATABASE_SCHEMA;
      else process.env.DATABASE_SCHEMA = previous;
    },
  };
}
