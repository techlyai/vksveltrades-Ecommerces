// Inspect by default. Never print customer details, tokens or payment references.
import { Pool } from 'pg';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { planOrderCleanup } from './order-cleanup-policy.mjs';

try { process.loadEnvFile(resolve('.env')); } catch { /* Deployment may inject configuration. */ }
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const schemaName = process.env.DATABASE_SCHEMA || 'public';
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schemaName)) throw new Error('Invalid schema');
const schema = `"${schemaName}"`;
const url = new URL(process.env.DATABASE_URL);
console.log(JSON.stringify({ environment: process.env.NODE_ENV || 'unconfirmed', schema: schemaName,
  localDatabase: ['localhost', '127.0.0.1', 'postgres'].includes(url.hostname), database: url.pathname }));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
let client;
try {
  client = await pool.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query(`SELECT id FROM ${schema}.vks_store WHERE id = 1 FOR UPDATE`);
  const records = await client.query(`SELECT kind, id, payload FROM ${schema}.vks_entities WHERE kind IN ('orders','products')`);
  const { orders, candidates, products, lastOrderNumber } = planOrderCleanup(records.rows);
  console.log(JSON.stringify({ orders: orders.map((order) => ({ id: order.id, status: order.status,
    payment: order.payment.status, hasReference: Boolean(order.payment.reference) })),
  cleanupCandidates: candidates.map((order) => order.id), preserved: orders.length - candidates.length }, null, 2));
  const apply = process.argv.includes('--apply');
  if (apply || process.argv.includes('--backup')) {
    // Backup must succeed before any deletion. Keep private and outside version control.
    const backup = {};
    for (const table of ['vks_store', 'vks_entities', 'vks_order_events', 'vks_push_subscriptions', 'vks_push_deliveries']) {
      backup[table] = (await client.query(`SELECT * FROM ${schema}.${table}`)).rows;
    }
    mkdirSync(resolve('.local/order-backups'), { recursive: true });
    const path = resolve('.local/order-backups', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(path, JSON.stringify({ schema: schemaName, backup }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(`Private backup saved: ${path}`);
  }
  if (apply) {
    if (!['development', 'test'].includes(process.env.NODE_ENV)
      || !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname))
      throw new Error('Cleanup refused: development/test environment and local database must both be confirmed. Production requires a separately reviewed cleanup.');
    const ids = candidates.map((order) => order.id);
    // Keep retired IDs so browser receipts can never refer to an unrelated future order.
    await client.query(`CREATE TABLE IF NOT EXISTS ${schema}.vks_retired_order_ids (id text PRIMARY KEY, retired_at timestamptz NOT NULL DEFAULT now())`);
    await client.query(`INSERT INTO ${schema}.vks_retired_order_ids(id) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING`, [ids]);
    for (const product of products) await client.query(`UPDATE ${schema}.vks_entities SET payload = $1::jsonb WHERE kind = 'products' AND id = $2`, [JSON.stringify(product), product.id]);
    await client.query(`DELETE FROM ${schema}.vks_push_subscriptions WHERE order_id = ANY($1::text[])`, [ids]);
    await client.query(`DELETE FROM ${schema}.vks_order_events WHERE order_id = ANY($1::text[])`, [ids]);
    await client.query(`DELETE FROM ${schema}.vks_entities WHERE kind = 'orders' AND id = ANY($1::text[])`, [ids]);
    await client.query(`UPDATE ${schema}.vks_store SET shop = jsonb_set(shop, '{lastOrderNumber}',
      to_jsonb(greatest(coalesce((shop->>'lastOrderNumber')::bigint, 1000), $1::bigint))),
      revision = revision + 1, updated_at = now() WHERE id = 1`, [lastOrderNumber]);
    await client.query('COMMIT');
    console.log(`Removed ${ids.length} abandoned unpaid records; paid/reference-bearing orders preserved.`);
  } else await client.query('ROLLBACK');
} catch (error) {
  await client?.query('ROLLBACK');
  console.error(error.code ? `Database cleanup failed (${error.code}).` : error.message);
  process.exitCode = 1;
} finally { client?.release(); await pool.end(); }
