'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Order } from '../../lib/types';
import { receiptToken, rememberReceipt } from '../../lib/order-receipts';
import { OrderDetails } from './OrderDetails';
import styles from './OrderTracking.module.css';

export function OrderTracking({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [token, setToken] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    // A notification can navigate an already-open receipt by changing only its fragment.
    const changed = () => setRetry((value) => value + 1);
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => {
    let active = true;
    setOrder(null); setError('');
    const fromLink = new URLSearchParams(window.location.hash.slice(1)).get('token');
    const credential = /^[a-f0-9]{64}$/.test(fromLink || '') ? fromLink! : receiptToken(id);
    setToken(credential);
    if (!/^VKST-\d+$/.test(id) || !credential) { setError('This tracking link is incomplete. Open your saved secure receipt link or use My Orders on the device where you placed the order.'); setBusy(false); return; }
    const load = async () => {
      try {
        const latest = await api.track(id, '', credential);
        if (!active) return;
        setOrder(latest); setError('');
        if (fromLink && rememberReceipt(id, credential)) window.history.replaceState(null, '', window.location.pathname);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load this order. Please retry.'); }
      finally { if (active) setBusy(false); }
    };
    setBusy(true); void load();
    const update = () => { if (document.visibilityState === 'visible') void load(); };
    const interval = window.setInterval(update, 15000);
    window.addEventListener('focus', update);
    navigator.serviceWorker?.addEventListener('message', update);
    return () => { active = false; clearInterval(interval); window.removeEventListener('focus', update); navigator.serviceWorker?.removeEventListener('message', update); };
  }, [id, retry]);
  return <main className={`storefront-theme ${styles.page}`}>
    <nav className={styles.navigation}><a href="/">Continue shopping</a><a href="/?view=orders">My Orders</a></nav>
    {busy && !order && <p role="status">Loading your order…</p>}
    {error && <div className={styles.error} role="alert"><p>{error}</p><button onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
    {order && <OrderDetails order={order} token={token} />}
  </main>;
}
