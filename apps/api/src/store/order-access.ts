import { createHash, timingSafeEqual } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { Order } from './models';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function authorizeOrder(order: Order | undefined, token?: string): Order {
  if (!order?.trackingHash || !/^[a-f0-9]{64}$/.test(token || '')
    || !timingSafeEqual(Buffer.from(order.trackingHash, 'hex'), Buffer.from(hashToken(token!), 'hex'))) {
    throw new NotFoundException('Order not found. Open your saved secure tracking link.');
  }
  return order;
}
export function customerOrder(order: Order) {
  const { trackingHash, adminArchivedAt, ...safe } = order;
  return safe;
}
