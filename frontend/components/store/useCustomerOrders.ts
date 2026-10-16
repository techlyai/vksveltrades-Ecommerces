'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { activeOrderCount, pruneReceipts, readReceipts } from '../../lib/order-receipts';
import type { Order } from '../../lib/types';

export function useCustomerOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const receipts = readReceipts();
    if (!receipts.length) { setOrders([]); return; }
    try {
      const latest = await api.customerOrders(receipts);
      // Retire stale/deleted/unsubmitted receipts only after a successful server lookup.
      pruneReceipts(latest.map((order) => order.id), receipts.map((receipt) => receipt.id));
      setOrders(latest); setError('');
    }
    catch { setError('Unable to refresh saved orders. Please retry.'); }
  }, []);
  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible') void refresh(); };
    update();
    const timer = window.setInterval(update, 15000);
    for (const name of ['focus', 'storage', 'vks-orders-changed']) window.addEventListener(name, update);
    document.addEventListener('visibilitychange', update);
    navigator.serviceWorker?.addEventListener('message', update);
    return () => {
      clearInterval(timer);
      for (const name of ['focus', 'storage', 'vks-orders-changed']) window.removeEventListener(name, update);
      document.removeEventListener('visibilitychange', update);
      navigator.serviceWorker?.removeEventListener('message', update);
    };
  }, [refresh]);
  return { orders, error, refresh, activeCount: activeOrderCount(orders) };
}
