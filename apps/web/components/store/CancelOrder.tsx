'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import type { Order } from '../../lib/types';
import { receiptToken } from '../../lib/order-receipts';

export function CancelOrder({ order, token, onChanged }: { order: Order; token?: string; onChanged?: (order: Order) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (['Cancelled', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'].includes(order.status)) return null;
  const cancel = async () => {
    if (busy || !window.confirm('Cancel this order? If you have paid, the shop must check the payment and process your refund.')) return;
    setBusy(true); setError('');
    try {
      const updated = await api.cancel(order.id, token || receiptToken(order.id));
      onChanged?.(updated);
      window.dispatchEvent(new Event('vks-orders-changed'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to cancel. Please retry.'); }
    finally { setBusy(false); }
  };
  return <div><button type="button" className="secondary" disabled={busy} onClick={() => void cancel()}>{busy ? 'Cancelling…' : 'Cancel Order'}</button>{error && <p role="alert">{error}</p>}</div>;
}
