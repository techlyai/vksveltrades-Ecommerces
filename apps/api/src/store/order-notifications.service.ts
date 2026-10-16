import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { StoreDatabase } from './store.database';
import { authorizeOrder, hashToken } from './order-access';
import { decryptSubscription, encryptSubscription, validateSubscription } from './push-security';

export function notificationMessage(status: string) {
  const messages: Record<string, string> = {
    'Pending Payment': 'Checkout is awaiting payment. Your order is not confirmed.',
    'Pending Verification': 'Your reference was submitted. The shop still needs to verify payment.',
    'Order Placed': 'We have received your order.', 'Payment Confirmed': 'Your payment has been confirmed.',
    Confirmed: 'Your order is confirmed.', Processing: 'We are preparing your order.', Packed: 'Your order is packed.',
    Shipped: 'Your order has been shipped.', 'Out for Delivery': 'Your order is on its way to you.',
    Delivered: 'Your order has been delivered.', Cancelled: 'Your order has been cancelled.',
  };
  return messages[status] || 'Your order has been updated.';
}

@Injectable()
export class OrderNotifications implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(OrderNotifications.name);
  constructor(private readonly database: StoreDatabase) {}
  configured() {
    return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
      && /^[a-f0-9]{64}$/i.test(process.env.PUSH_ENCRYPTION_KEY || ''));
  }
  config() { return { enabled: this.configured(), publicKey: this.configured() ? process.env.VAPID_PUBLIC_KEY : null }; }
  onModuleInit() {
    if (!this.configured()) return;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    this.timer = setInterval(() => void this.flush().catch(() => this.logger.warn('Push queue unavailable; retrying later')), 5000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async subscribe(id: string, token: string, input: unknown) {
    if (!this.configured()) throw new ServiceUnavailableException('Push notifications are not configured yet');
    const subscription = validateSubscription(input);
    return this.database.run(async () => {
      const order = authorizeOrder(this.database.state.orders.find((order) => order.id === id), token);
      const hash = hashToken(subscription.endpoint);
      const existing = await this.database.notificationQuery('SELECT id FROM @schema.vks_push_subscriptions WHERE order_id=$1', [id]);
      const duplicate = await this.database.notificationQuery('SELECT id FROM @schema.vks_push_subscriptions WHERE order_id=$1 AND endpoint_hash=$2', [id, hash]);
      if (existing.rowCount! >= 5 && !duplicate.rowCount) throw new BadRequestException('Too many subscribed devices for this order');
      const saved = await this.database.notificationQuery(`INSERT INTO @schema.vks_push_subscriptions(id,order_id,endpoint_hash,encrypted)
        VALUES($1,$2,$3,$4) ON CONFLICT(order_id,endpoint_hash) DO UPDATE SET encrypted=EXCLUDED.encrypted RETURNING id`,
      [randomUUID(), id, hash, encryptSubscription({ subscription, token })]);
      const eventId = `${id}:${order.statusVersion || 0}`;
      await this.database.notificationQuery(`INSERT INTO @schema.vks_order_events(id,order_id,version,status) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [eventId, id, order.statusVersion || 0, order.status]);
      await this.database.notificationQuery(`INSERT INTO @schema.vks_push_deliveries(event_id,subscription_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [eventId, saved.rows[0].id]);
      return { subscribed: true };
    });
  }
  async unsubscribe(id: string, token: string, endpoint: string) {
    return this.database.run(async () => {
      authorizeOrder(this.database.state.orders.find((order) => order.id === id), token);
      if (typeof endpoint !== 'string' || endpoint.length > 2048) throw new BadRequestException('Invalid endpoint');
      await this.database.notificationQuery('DELETE FROM @schema.vks_push_subscriptions WHERE order_id=$1 AND endpoint_hash=$2', [id, hashToken(endpoint)]);
      return { subscribed: false };
    });
  }
  async flush(send: typeof webpush.sendNotification = webpush.sendNotification) {
    if (this.running || !this.configured()) return;
    this.running = true;
    try {
      await this.database.notificationQuery(`UPDATE @schema.vks_push_deliveries SET state='failed'
        WHERE state='pending' AND attempts>=5 AND locked_until<now()`);
      const jobs = await this.database.notificationQuery(`WITH due AS (
        SELECT event_id, subscription_id FROM @schema.vks_push_deliveries
        WHERE state='pending' AND next_attempt<=now() AND (locked_until IS NULL OR locked_until<now()) AND attempts<5
        ORDER BY next_attempt LIMIT 10 FOR UPDATE SKIP LOCKED
      ), claimed AS (
        UPDATE @schema.vks_push_deliveries d SET attempts=d.attempts+1,locked_until=now()+interval '90 seconds'
        FROM due WHERE d.event_id=due.event_id AND d.subscription_id=due.subscription_id RETURNING d.*
      ) SELECT c.*,e.order_id,e.status,e.created_at,s.encrypted FROM claimed c
        JOIN @schema.vks_order_events e ON e.id=c.event_id JOIN @schema.vks_push_subscriptions s ON s.id=c.subscription_id`);
      await Promise.all(jobs.rows.map(async (job) => {
        let state = 'sent';
        try {
          if (Date.now() - new Date(job.created_at).getTime() > 86400000) throw { statusCode: 400 };
          const { subscription, token } = decryptSubscription(job.encrypted);
          validateSubscription(subscription);
          await send(subscription, JSON.stringify({ eventId: job.event_id, orderId: job.order_id, status: job.status,
            title: 'VKS VEL TRADERS', body: `${job.order_id} · ${job.status}: ${notificationMessage(job.status)}`,
            path: `/orders/${encodeURIComponent(job.order_id)}#token=${token}` }), { TTL: 86400, timeout: 10000, urgency: 'normal' });
        } catch (error) {
          const code = (error as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await this.database.notificationQuery('DELETE FROM @schema.vks_push_subscriptions WHERE id=$1', [job.subscription_id]);
            return;
          }
          state = job.attempts >= 5 || code === 400 || code === 401 || code === 403 ? 'failed' : 'pending';
          // Do not log endpoints, tokens, keys or customer data.
          this.logger.warn(`Order push ${state}; attempt ${job.attempts}`);
        }
        await this.database.notificationQuery(`UPDATE @schema.vks_push_deliveries SET state=$1,locked_until=NULL,
          next_attempt=now()+($2 * interval '1 second') WHERE event_id=$3 AND subscription_id=$4 AND attempts=$5`,
        [state, Math.min(3600, 30 * 2 ** job.attempts), job.event_id, job.subscription_id, job.attempts]);
      }));
    } finally { this.running = false; }
  }
}
