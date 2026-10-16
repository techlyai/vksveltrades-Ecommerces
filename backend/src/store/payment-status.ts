import type { PaymentStatus } from './models';

// Older admin clients may still send the original display values.
export function normalizePaymentStatus(status: string): PaymentStatus {
  const legacy: Record<string, PaymentStatus> = {
    Pending: 'UNPAID', Processing: 'PENDING_VERIFICATION', Paid: 'PAID',
    Failed: 'FAILED', Expired: 'CANCELLED', Cancelled: 'CANCELLED', Refunded: 'REFUNDED',
  };
  return legacy[status] || status as PaymentStatus;
}
