import type { PoolClient } from 'pg';
import type { Order } from './models';

export async function initializeOrderNotifications(client: PoolClient, schema: string) {
  await client.query(`CREATE TABLE IF NOT EXISTS ${schema}.vks_order_events (
    id text PRIMARY KEY, order_id text NOT NULL, version integer NOT NULL,
    status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id, version)
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS ${schema}.vks_push_subscriptions (
    id uuid PRIMARY KEY, order_id text NOT NULL, endpoint_hash text NOT NULL,
    encrypted text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(order_id, endpoint_hash)
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS ${schema}.vks_push_deliveries (
    event_id text REFERENCES ${schema}.vks_order_events(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES ${schema}.vks_push_subscriptions(id) ON DELETE CASCADE,
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sent','failed')),
    attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(),
    locked_until timestamptz, PRIMARY KEY(event_id, subscription_id)
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS vks_push_due_idx ON ${schema}.vks_push_deliveries(next_attempt) WHERE state = 'pending'`);
  await client.query(`CREATE INDEX IF NOT EXISTS vks_push_subscription_delivery_idx ON ${schema}.vks_push_deliveries(subscription_id)`);
}

export async function queueOrderEvents(client: PoolClient, schema: string, orders: Order[], previous: Map<string, number>) {
  for (const order of orders) {
    const version = order.statusVersion || 0;
    if (previous.has(order.id) && previous.get(order.id) === version) continue;
    const id = `${order.id}:${version}`;
    await client.query(`INSERT INTO ${schema}.vks_order_events(id, order_id, version, status) VALUES($1,$2,$3,$4)
      ON CONFLICT DO NOTHING`, [id, order.id, version, order.status]);
    await client.query(`INSERT INTO ${schema}.vks_push_deliveries(event_id, subscription_id)
      SELECT $1, id FROM ${schema}.vks_push_subscriptions WHERE order_id = $2 ON CONFLICT DO NOTHING`, [id, order.id]);
  }
}
