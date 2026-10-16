import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, PoolClient } from 'pg';
import { collections, emptyStore, parseStore, StoreState } from './store-state';
import { shopCategories } from './shop-categories';
import { sampleCatalog } from './sample-catalog';
import { fillReferenceShopDetails } from './reference-shop';
import { suppliedBanners, categoryBanners, isBundledOwnerBanner, isUnchangedSampleBanner, legacyPlumbingGallery, departmentArtwork, previousDepartmentImages } from './supplied-banners';
import { initializeOrderNotifications, queueOrderEvents } from './order-notification-schema';
import { defaultCheckoutTiers, findCheckoutTier } from './checkout-tiers';

type Transaction = { state: StoreState; dirty: boolean; revision: string; client: PoolClient };
export type AdminCredential = { passwordHash: string; version: string };

@Injectable()
export class StoreDatabase implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StoreDatabase.name);
  private readonly pool: Pool;
  private readonly scope = new AsyncLocalStorage<Transaction>();
  private readonly schema: string;

  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; file storage is not supported');
    const schema = process.env.DATABASE_SCHEMA || 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid DATABASE_SCHEMA');
    this.schema = `"${schema}"`;
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
      statement_timeout: 10000, idle_in_transaction_session_timeout: 15000,
    });
    this.pool.on('error', () => this.logger.error('PostgreSQL connection unavailable'));
  }

  async onModuleInit() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      // Serialize first-start DDL across API instances; released on commit/rollback.
      await client.query('SELECT pg_advisory_xact_lock(742193, 1)');
      // Authentication secrets are kept outside public shop/catalog data.
      await client.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.vks_admin_credentials (
        id smallint PRIMARY KEY CHECK (id = 1),
        password_hash text NOT NULL,
        version text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.vks_store (
        id smallint PRIMARY KEY CHECK (id = 1),
        schema_version integer NOT NULL CHECK (schema_version = 1),
        revision bigint NOT NULL DEFAULT 0,
        shop jsonb NOT NULL CHECK (jsonb_typeof(shop) = 'object'),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.vks_entities (
        kind text NOT NULL CHECK (kind IN ('products','orders','categories','customerCategories','deliveryRules','banners')),
        id text NOT NULL,
        position integer NOT NULL CHECK (position >= 0),
        payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND payload->>'id' = id),
        PRIMARY KEY (kind, id)
      )`);
      const defaults = emptyStore();
      const inserted = await client.query(`INSERT INTO ${this.schema}.vks_store (id, schema_version, shop)
        VALUES (1, 1, $1::jsonb) ON CONFLICT (id) DO NOTHING RETURNING id`, [JSON.stringify(defaults.shop)]);
      if (inserted.rowCount) await this.writeCollections(client, defaults);
      const version = await client.query(`SELECT schema_version FROM ${this.schema}.vks_store WHERE id = 1`);
      if (version.rows[0]?.schema_version !== 1) throw new Error('Unsupported database schema version');
      await this.initializeShopCategories(client, Boolean(inserted.rowCount));
      await this.initializeCheckoutTiers(client, Boolean(inserted.rowCount));
      await this.initializeSamples(client, Boolean(inserted.rowCount));
      await this.initializeReferenceDetails(client, Boolean(inserted.rowCount));
      await this.initializeSuppliedBanners(client, Boolean(inserted.rowCount));
      await this.initializeCategoryBanners(client, Boolean(inserted.rowCount));
      await this.initializePlumbingCutout(client, Boolean(inserted.rowCount));
      await this.initializeDepartmentArtwork(client, Boolean(inserted.rowCount));
      await initializeOrderNotifications(client, this.schema);
      const paymentMigration = await client.query(`INSERT INTO ${this.schema}.vks_migrations (name)
        VALUES ('pending-checkout-status-v2') ON CONFLICT DO NOTHING RETURNING name`);
      if (paymentMigration.rowCount) {
        await client.query(`SELECT id FROM ${this.schema}.vks_store WHERE id = 1 FOR UPDATE`);
        await client.query(`UPDATE ${this.schema}.vks_entities SET payload = payload || jsonb_build_object(
          'checkoutSession', true,
          'status', CASE WHEN coalesce(payload->'payment'->>'reference', '') <> '' THEN 'Pending Verification' ELSE 'Pending Payment' END,
          'history', jsonb_build_array(jsonb_build_object('status',
            CASE WHEN coalesce(payload->'payment'->>'reference', '') <> '' THEN 'Pending Verification' ELSE 'Pending Payment' END,
            'at', payload->>'createdAt')))
          WHERE kind = 'orders' AND payload->>'status' = 'Order Placed'
          AND payload->'payment'->>'status' NOT IN ('Paid', 'Refunded', 'PAID', 'REFUNDED')`);
        await client.query(`UPDATE ${this.schema}.vks_entities SET payload = jsonb_set(payload, '{payment,status}',
          to_jsonb(CASE payload->'payment'->>'status'
            WHEN 'Pending' THEN 'UNPAID' WHEN 'Processing' THEN 'PENDING_VERIFICATION'
            WHEN 'Paid' THEN 'PAID' WHEN 'Failed' THEN 'FAILED' WHEN 'Expired' THEN 'CANCELLED'
            WHEN 'Cancelled' THEN 'CANCELLED' WHEN 'Refunded' THEN 'REFUNDED'
            ELSE payload->'payment'->>'status' END)) WHERE kind = 'orders'`);
        await client.query(`UPDATE ${this.schema}.vks_entities SET payload = jsonb_set(payload, '{payment,status}', '"CANCELLED"'::jsonb)
          WHERE kind = 'orders' AND payload->>'status' = 'Cancelled'
          AND payload->'payment'->>'status' IN ('UNPAID', 'PENDING_VERIFICATION')`);
        await client.query(`UPDATE ${this.schema}.vks_entities SET payload = payload || '{"refundRequired":true}'::jsonb
          WHERE kind = 'orders' AND payload->>'status' = 'Cancelled'
          AND payload->'payment'->>'status' <> 'REFUNDED'
          AND coalesce(payload->'payment'->>'reference', '') <> '' AND NOT payload ? 'refundRequired'`);
        if (!inserted.rowCount) await client.query(`UPDATE ${this.schema}.vks_store SET revision = revision + 1, updated_at = now() WHERE id = 1`);
      }
      await client.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.vks_wishlists (
        owner_hash text PRIMARY KEY CHECK (owner_hash ~ '^[a-f0-9]{64}$'),
        product_ids text[] NOT NULL DEFAULT '{}',
        CHECK (cardinality(product_ids) <= 200),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async adminCredential(): Promise<AdminCredential | null> {
    const result = await this.pool.query(`SELECT password_hash AS "passwordHash", version
      FROM ${this.schema}.vks_admin_credentials WHERE id = 1`);
    return result.rows[0] ?? null;
  }

  async replaceAdminCredential(expectedVersion: string | null, credential: AdminCredential): Promise<boolean> {
    // Compare-and-swap prevents two simultaneous requests using the old password.
    const result = expectedVersion === null
      ? await this.pool.query(`INSERT INTO ${this.schema}.vks_admin_credentials (id, password_hash, version)
          VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING`, [credential.passwordHash, credential.version])
      : await this.pool.query(`UPDATE ${this.schema}.vks_admin_credentials
          SET password_hash = $1, version = $2, updated_at = now() WHERE id = 1 AND version = $3`,
        [credential.passwordHash, credential.version, expectedVersion]);
    return result.rowCount === 1;
  }

  private async initializeShopCategories(client: PoolClient, newStore: boolean) {
    await client.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.vks_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const migration = await client.query(`INSERT INTO ${this.schema}.vks_migrations (name)
      VALUES ('shop-categories-v1') ON CONFLICT (name) DO NOTHING RETURNING name`);
    if (!migration.rowCount) return;
    // Coordinate with admin writes as well as other starting API instances.
    await client.query(`SELECT id FROM ${this.schema}.vks_store WHERE id = 1 FOR UPDATE`);
    const existing = await client.query(`SELECT id, position, payload FROM ${this.schema}.vks_entities WHERE kind = 'categories'`);
    const offset = Math.max(-1, ...existing.rows.map((row) => row.position)) + 1;
    const missing = shopCategories.filter((category) => !existing.rows.some((row) =>
      row.id === category.id || String(row.payload.name).trim().toLowerCase() === category.name.toLowerCase()));
    if (!missing.length) return;
    await client.query(`INSERT INTO ${this.schema}.vks_entities (kind, id, position, payload)
      SELECT 'categories', id, position, payload FROM jsonb_to_recordset($1::jsonb)
      AS incoming(id text, position integer, payload jsonb)`,
    [JSON.stringify(missing.map((payload, index) => ({ id: payload.id, position: offset + index, payload })))]);
    if (!newStore) await client.query(`UPDATE ${this.schema}.vks_store SET revision = revision + 1, updated_at = now() WHERE id = 1`);
  }

  get state(): StoreState {
    const transaction = this.scope.getStore();
    if (!transaction) throw new Error('Shop access requires a database transaction');
    return transaction.state;
  }

  private async initializeCheckoutTiers(client: PoolClient, newStore: boolean) {
    const migration = await client.query(`INSERT INTO ${this.schema}.vks_migrations (name)
      VALUES ('checkout-trade-tiers-v1') ON CONFLICT (name) DO NOTHING RETURNING name`);
    if (!migration.rowCount) return;
    // Reuse startup's advisory lock and the same shop-row lock as order/admin writes.
    await client.query(`SELECT id FROM ${this.schema}.vks_store WHERE id = 1 FOR UPDATE`);
    const existing = await client.query(`SELECT id, position, payload FROM ${this.schema}.vks_entities
      WHERE kind = 'customerCategories' ORDER BY position, id`);
    let position = Math.max(-1, ...existing.rows.map((row) => row.position)) + 1;
    const incoming = defaultCheckoutTiers.map((rule) => {
      const matched = findCheckoutTier(existing.rows.map((row) => row.payload), rule);
      const row = existing.rows.find((item) => item.id === matched?.id);
      const payload = { ...matched, ...rule, id: matched?.id || rule.id };
      return { id: payload.id, position: row?.position ?? position++, payload };
    });
    await client.query(`INSERT INTO ${this.schema}.vks_entities (kind, id, position, payload)
      SELECT 'customerCategories', id, position, payload FROM jsonb_to_recordset($1::jsonb)
      AS incoming(id text, position integer, payload jsonb)
      ON CONFLICT (kind, id) DO UPDATE SET payload = EXCLUDED.payload`, [JSON.stringify(incoming)]);
    if (!newStore) await client.query(`UPDATE ${this.schema}.vks_store SET revision = revision + 1, updated_at = now() WHERE id = 1`);
  }

  private async initializeSamples(client: PoolClient, newStore: boolean) {
    const migration = await client.query(`INSERT INTO ${this.schema}.vks_migrations (name)
      VALUES ('requested-display-samples-v1') ON CONFLICT (name) DO NOTHING RETURNING name`);
    if (!migration.rowCount) return;
    await client.query(`SELECT id FROM ${this.schema}.vks_store WHERE id = 1 FOR UPDATE`);
    const categories = await client.query(`SELECT payload FROM ${this.schema}.vks_entities WHERE kind = 'categories' ORDER BY position, id`);
    const samples = sampleCatalog(categories.rows.map((row) => row.payload));
    for (const kind of ['products', 'banners'] as const) {
      const positions = await client.query(`SELECT coalesce(max(position), -1) + 1 AS offset FROM ${this.schema}.vks_entities WHERE kind = $1`, [kind]);
      const offset = positions.rows[0].offset;
      for (const [index, record] of samples[kind].entries()) {
        const payload = kind === 'banners' ? { ...record, order: offset + index } : record;
        await client.query(`INSERT INTO ${this.schema}.vks_entities (kind, id, position, payload)
          VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (kind, id) DO NOTHING`, [kind, payload.id, offset + index, JSON.stringify(payload)]);
      }
    }
    if (!newStore) await client.query(`UPDATE ${this.schema}.vks_store SET revision = revision + 1, updated_at = now() WHERE id = 1`);
  }

  private async initializeReferenceDetails(client: PoolClient, newStore: boolean) {
    const migration = await client.query(`INSERT INTO ${this.schema}.vks_migrations (name)
      VALUES ('reference-footer-details-v1') ON CONFLICT (name) DO NOTHING RETURNING name`);
    if (!migration.rowCount) return;
    const current = await client.query(`SELECT shop FROM ${this.schema}.vks_store WHERE id = 1 FOR UPDATE`);
    const shop = fillReferenceShopDetails(current.rows[0].shop);
    await client.query(`UPDATE ${this.schema}.vks_store SET shop = $1::jsonb,
      revision = revision + $2, updated_at = now() WHERE id = 1`, [JSON.stringify(shop), newStore ? 0 : 1]);
  }

  private async initializeSuppliedBanners(client: PoolClient, newStore: boolean) {
    const migration = await client.query(`INSERT INTO ${this.schema}.vks_migrations (name)
      VALUES ('owner-banner-artwork-v1') ON CONFLICT (name) DO NOTHING RETURNING name`);
    if (!migration.rowCount) return;
    await client.query(`SELECT id FROM ${this.schema}.vks_store WHERE id = 1 FOR UPDATE`);
    const categories = await client.query(`SELECT payload FROM ${this.schema}.vks_entities WHERE kind = 'categories' ORDER BY position, id`);
    const existing = await client.query(`SELECT payload FROM ${this.schema}.vks_entities WHERE kind = 'banners'`);
    // Hide only untouched placeholders; custom/admin banners are retained.
    for (const { payload } of existing.rows) {
      await client.query(`UPDATE ${this.schema}.vks_entities SET payload = $1::jsonb WHERE kind = 'banners' AND id = $2`,
        [JSON.stringify({ ...payload, duration: 2, ...(isUnchangedSampleBanner(payload, categories.rows.map((row) => row.payload)) ? { enabled: false } : {}) }), payload.id]);
    }
    const positions = await client.query(`SELECT coalesce(max(position), -1) + 1 AS offset FROM ${this.schema}.vks_entities WHERE kind = 'banners'`);
    const offset = positions.rows[0].offset;
    const incoming = suppliedBanners(categories.rows.map((row) => row.payload)).map((banner, index) => ({
      id: banner.id, position: offset + index, payload: { ...banner, order: offset + index },
    }));
    await client.query(`INSERT INTO ${this.schema}.vks_entities (kind, id, position, payload)
      SELECT 'banners', id, position, payload FROM jsonb_to_recordset($1::jsonb)
      AS incoming(id text, position integer, payload jsonb) ON CONFLICT (kind, id) DO NOTHING`, [JSON.stringify(incoming)]);
    await client.query(`UPDATE ${this.schema}.vks_store SET shop = shop || '{"bannerAutoSlide":true,"bannerInterval":2}'::jsonb,
      revision = revision + $1, updated_at = now() WHERE id = 1`, [newStore ? 0 : 1]);
  }

  private async initializeCategoryBanners(client: PoolClient, newStore: boolean) {
    const migration = await client.query(`INSERT INTO ${this.schema}.vks_migrations (name)
      VALUES ('category-banners-v1') ON CONFLICT (name) DO NOTHING RETURNING name`);
    if (!migration.rowCount) return;
    await client.query(`SELECT id FROM ${this.schema}.vks_store WHERE id = 1 FOR UPDATE`);
    const categories = await client.query(`SELECT payload FROM ${this.schema}.vks_entities WHERE kind = 'categories' ORDER BY position, id`);
    const existing = await client.query(`SELECT payload FROM ${this.schema}.vks_entities WHERE kind = 'banners'`);
    // Hide brand banners still on bundled artwork; uploaded/custom banners stay as they are.
    for (const { payload } of existing.rows) {
      if (payload.enabled === false || !isBundledOwnerBanner(payload)) continue;
      await client.query(`UPDATE ${this.schema}.vks_entities SET payload = $1::jsonb WHERE kind = 'banners' AND id = $2`,
        [JSON.stringify({ ...payload, enabled: false }), payload.id]);
    }
    const positions = await client.query(`SELECT coalesce(max(position), -1) + 1 AS offset FROM ${this.schema}.vks_entities WHERE kind = 'banners'`);
    const offset = positions.rows[0].offset;
    const incoming = categoryBanners(categories.rows.map((row) => row.payload)).map((banner, index) => ({
      id: banner.id, position: offset + index, payload: banner,
    }));
    await client.query(`INSERT INTO ${this.schema}.vks_entities (kind, id, position, payload)
      SELECT 'banners', id, position, payload FROM jsonb_to_recordset($1::jsonb)
      AS incoming(id text, position integer, payload jsonb) ON CONFLICT (kind, id) DO NOTHING`, [JSON.stringify(incoming)]);
    if (!newStore) await client.query(`UPDATE ${this.schema}.vks_store SET revision = revision + 1, updated_at = now() WHERE id = 1`);
  }

  private async initializePlumbingCutout(client: PoolClient, newStore: boolean) {
    const migration = await client.query(`INSERT INTO ${this.schema}.vks_migrations (name)
      VALUES ('plumbing-banner-cutout-v1') ON CONFLICT (name) DO NOTHING RETURNING name`);
    if (!migration.rowCount) return;
    await client.query(`SELECT id FROM ${this.schema}.vks_store WHERE id = 1 FOR UPDATE`);
    const current = await client.query(`SELECT payload FROM ${this.schema}.vks_entities WHERE kind = 'banners' AND id = 'category-banner-plumbing'`);
    const banner = current.rows[0]?.payload;
    // Only an untouched first-release plumbing banner changes; admin edits win.
    if (!banner || banner.imageUrl !== '/banners/astral.jpeg'
      || JSON.stringify(banner.gallery || []) !== JSON.stringify(legacyPlumbingGallery)) return;
    await client.query(`UPDATE ${this.schema}.vks_entities SET payload = $1::jsonb WHERE kind = 'banners' AND id = 'category-banner-plumbing'`,
      [JSON.stringify({ ...banner, gallery: [], cutout: true })]);
    if (!newStore) await client.query(`UPDATE ${this.schema}.vks_store SET revision = revision + 1, updated_at = now() WHERE id = 1`);
  }

  private async initializeDepartmentArtwork(client: PoolClient, newStore: boolean) {
    const migration = await client.query(`INSERT INTO ${this.schema}.vks_migrations (name)
      VALUES ('department-banner-artwork-v1') ON CONFLICT (name) DO NOTHING RETURNING name`);
    if (!migration.rowCount) return;
    await client.query(`SELECT id FROM ${this.schema}.vks_store WHERE id = 1 FOR UPDATE`);
    const current = await client.query(`SELECT payload FROM ${this.schema}.vks_entities WHERE kind = 'banners' AND id LIKE 'category-banner-%'`);
    let changed = 0;
    for (const { payload } of current.rows) {
      const department = payload.id.replace('category-banner-', '');
      const artwork = departmentArtwork(department);
      // Only banners still showing an earlier release's image get the mockup artwork; admin photos win.
      if (!artwork || !previousDepartmentImages[department]?.includes(payload.imageUrl)) continue;
      await client.query(`UPDATE ${this.schema}.vks_entities SET payload = $1::jsonb WHERE kind = 'banners' AND id = $2`,
        [JSON.stringify({ ...payload, ...artwork }), payload.id]);
      changed++;
    }
    if (!newStore && changed) await client.query(`UPDATE ${this.schema}.vks_store SET revision = revision + 1, updated_at = now() WHERE id = 1`);
  }

  async wishlist(owner: string): Promise<{ productIds: string[] }> {
    const result = await this.pool.query(`SELECT p.id FROM ${this.schema}.vks_wishlists w
      JOIN ${this.schema}.vks_entities p ON p.kind = 'products' AND p.id = ANY(w.product_ids)
      JOIN ${this.schema}.vks_entities c ON c.kind = 'categories' AND c.id = p.payload->>'categoryId'
      WHERE w.owner_hash = $1 AND p.payload->>'enabled' = 'true' AND c.payload->>'enabled' = 'true'
      ORDER BY array_position(w.product_ids, p.id)`, [owner]);
    return { productIds: result.rows.map((row) => row.id) };
  }

  async changeWishlist(owner: string, id: string, add: boolean): Promise<{ saved: boolean }> {
    if (!id || id.length > 200) throw new BadRequestException('Invalid product');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      if (add) {
        const product = await client.query(`SELECT p.id FROM ${this.schema}.vks_entities p
          JOIN ${this.schema}.vks_entities c ON c.kind = 'categories' AND c.id = p.payload->>'categoryId'
          WHERE p.kind = 'products' AND p.id = $1 AND p.payload->>'enabled' = 'true' AND c.payload->>'enabled' = 'true'`, [id]);
        if (!product.rowCount) throw new NotFoundException('Product is unavailable');
        await client.query(`INSERT INTO ${this.schema}.vks_wishlists (owner_hash) VALUES ($1) ON CONFLICT DO NOTHING`, [owner]);
        const current = await client.query(`SELECT product_ids FROM ${this.schema}.vks_wishlists WHERE owner_hash = $1 FOR UPDATE`, [owner]);
        // Prune items the storefront can no longer show, so an invisible/deleted
        // catalog cannot permanently consume all 200 saved slots.
        const visible = await client.query(`SELECT p.id FROM ${this.schema}.vks_entities p
          JOIN ${this.schema}.vks_entities c ON c.kind = 'categories' AND c.id = p.payload->>'categoryId'
          WHERE p.kind = 'products' AND p.id = ANY($1::text[]) AND p.payload->>'enabled' = 'true' AND c.payload->>'enabled' = 'true'
          ORDER BY array_position($1::text[], p.id)`, [current.rows[0].product_ids]);
        const ids: string[] = visible.rows.map((row) => row.id);
        if (!ids.includes(id)) {
          if (ids.length >= 200) throw new BadRequestException('Your wishlist is full. Remove an item first.');
          ids.push(id);
        }
        await client.query(`UPDATE ${this.schema}.vks_wishlists SET product_ids = $2::text[], updated_at = now() WHERE owner_hash = $1`, [owner, ids]);
      } else {
        await client.query(`UPDATE ${this.schema}.vks_wishlists SET product_ids = array_remove(product_ids, $2), updated_at = now() WHERE owner_hash = $1`, [owner, id]);
      }
      await client.query('COMMIT');
      return { saved: add };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  markChanged() {
    const transaction = this.scope.getStore();
    if (!transaction) throw new Error('Shop write requires a database transaction');
    transaction.dirty = true;
  }

  async run<T>(work: () => T | Promise<T>): Promise<T> {
    if (this.scope.getStore()) return work();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      // All business operations lock the same shop row before reading stock/orders.
      // This also coordinates different API processes, not just in-process requests.
      const meta = await client.query(`SELECT shop, revision FROM ${this.schema}.vks_store WHERE id = 1 FOR UPDATE`);
      if (!meta.rows[0]) throw new Error('Database has not been initialized');
      const records = await client.query(`SELECT kind, payload FROM ${this.schema}.vks_entities ORDER BY kind, position, id`);
      const state = emptyStore();
      for (const field of collections) state[field] = [];
      state.shop = meta.rows[0].shop;
      for (const record of records.rows) {
        (state[record.kind as typeof collections[number]] as { id: string }[]).push(record.payload);
      }
      const previous = new Map(state.orders.map((order) => [order.id, order.statusVersion || 0]));
      const transaction: Transaction = { state: parseStore(state), dirty: false, revision: meta.rows[0].revision, client };
      const result = await this.scope.run(transaction, work);
      if (transaction.dirty) {
        parseStore(transaction.state);
        await queueOrderEvents(client, this.schema, transaction.state.orders, previous);
        await this.writeCollections(client, transaction.state);
        await client.query(`UPDATE ${this.schema}.vks_store SET shop = $1::jsonb,
          revision = revision + 1, updated_at = now() WHERE id = 1`, [JSON.stringify(transaction.state.shop)]);
      }
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  // SQL is supplied only by internal notification code, never by request data.
  notificationQuery(sql: string, values: unknown[] = []) {
    return (this.scope.getStore()?.client || this.pool).query(sql.replaceAll('@schema', this.schema), values);
  }

  private async writeCollections(client: PoolClient, state: StoreState) {
    for (const kind of collections) {
      const records = state[kind].map((payload, position) => ({ id: payload.id, position, payload }));
      await client.query(`DELETE FROM ${this.schema}.vks_entities WHERE kind = $1 AND NOT (id = ANY($2::text[]))`,
        [kind, records.map((record) => record.id)]);
      if (!records.length) continue;
      await client.query(`INSERT INTO ${this.schema}.vks_entities AS current (kind, id, position, payload)
        SELECT $1, id, position, payload FROM jsonb_to_recordset($2::jsonb) AS incoming(id text, position integer, payload jsonb)
        ON CONFLICT (kind, id) DO UPDATE SET position = EXCLUDED.position, payload = EXCLUDED.payload
        WHERE current.position IS DISTINCT FROM EXCLUDED.position OR current.payload IS DISTINCT FROM EXCLUDED.payload`,
      [kind, JSON.stringify(records)]);
    }
  }

  async importIntoEmptyStore(state: StoreState) {
    const parsed = parseStore(state);
    await this.run(() => {
      const transaction = this.scope.getStore()!;
      if (transaction.revision !== '0') throw new Error('Import refused: database has already been changed');
      transaction.state = structuredClone(parsed);
      transaction.dirty = true;
    });
  }

  async assertPristine() {
    await this.run(() => {
      if (this.scope.getStore()!.revision !== '0') throw new Error('Import refused: database has already been changed');
    });
  }

  async health() {
    const result = await this.pool.query(`SELECT schema_version FROM ${this.schema}.vks_store WHERE id = 1`);
    if (result.rows[0]?.schema_version !== 1) throw new Error('Database not initialized');
  }

  async onModuleDestroy() { await this.pool.end(); }
}
