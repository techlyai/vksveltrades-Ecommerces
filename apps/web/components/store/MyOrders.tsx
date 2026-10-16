'use client';

import { useState, type FormEvent } from 'react';
import type { Order } from '../../lib/types';
import { paymentStatusLabel } from '../../lib/payment-status';
import { api } from '../../lib/api';
import { formatPrice } from '../../lib/catalog-view';
import { ShopIcon } from '../ShopIcon';
import styles from './MyOrders.module.css';
import { receiptToken, trackingPath } from '../../lib/order-receipts';
import { OrderDetails } from './OrderDetails';
import { CancelOrder } from './CancelOrder';

export function MyOrders({ initial, onBack, orders = [], listError = '', onRetry }: { initial: Order | null; onBack: () => void; orders?: Order[]; listError?: string; onRetry?: () => void }) {
  const [id, setId] = useState(initial?.id || '');
  const [phone, setPhone] = useState(initial?.customer.phone.replace(/\D/g, '').slice(-10) || '');
  const [order, setOrder] = useState<Order | null>(initial && (initial.payment.reference || ['PAID', 'REFUNDED'].includes(initial.payment.status)) ? initial : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [changedOrders, setChangedOrders] = useState<Record<string, Order>>({});
  const latest = (item: Order) => {
    const changed = changedOrders[item.id];
    return changed && (changed.statusVersion || 0) > (item.statusVersion || 0) ? changed : item;
  };
  const currentOrders = orders.map(latest);
  const changed = (updated: Order) => {
    setChangedOrders((previous) => ({ ...previous, [updated.id]: updated }));
    setOrder(updated);
    onRetry?.();
  };
  const find = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setOrder(null);
    try { setOrder(await api.track(id.trim(), phone)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to find your order. Please try again.'); }
    finally { setBusy(false); }
  };
  return <main className={styles.page}>
    <header className={styles.heading}><button onClick={onBack}><ShopIcon name="chevron" />Continue shopping</button><h1>My Orders</h1></header>
    <section className={styles.saved} aria-label="Orders saved on this device"><h2>Orders on this device</h2><p>Secure receipts saved in this browser. Active orders exclude delivered and cancelled orders.</p>
      {listError && <p role="alert">{listError} <button onClick={onRetry}>Retry</button></p>}
      {!orders.length && <p>No saved orders yet. Use your secure receipt link or recover an older order below.</p>}
      {['Active orders', 'Order history'].map((label, index) => <div key={label}><h3>{label}</h3>{currentOrders.filter((item) => ['Cancelled', 'Delivered'].includes(item.status) === Boolean(index)).map((item) => <div key={item.id}><a href={trackingPath(item.id, receiptToken(item.id))}><b>{item.id}</b><span>{item.status}</span><span>Payment: {paymentStatusLabel(item.payment.status)}</span><strong>{formatPrice(item.total)}</strong></a><CancelOrder order={item} onChanged={changed} /></div>)}</div>)}
    </section>
    <section className={styles.card} aria-labelledby="order-lookup-title">
      <h2 id="order-lookup-title">View your orders</h2>
      <p>Enter your Order ID and mobile number. New orders must be saved on this device, or opened using their secure receipt link.</p>
      <form onSubmit={find} aria-busy={busy}>
        <label htmlFor="order-mobile">Mobile number</label>
        <input id="order-mobile" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile" pattern="[0-9]{10}" maxLength={10} title="Enter your 10-digit mobile number" value={phone} required disabled={busy} onChange={(event) => { setPhone(event.target.value.replace(/\D/g, '')); setOrder(null); }} />
        <label htmlFor="order-id">Order ID</label>
        <input id="order-id" name="orderId" className={styles.orderId} autoCapitalize="characters" spellCheck={false} placeholder="e.g. VKST-1005" maxLength={100} value={id} required disabled={busy} onChange={(event) => { setId(event.target.value.toUpperCase()); setOrder(null); }} />
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.submit} disabled={busy}>{busy ? 'Finding your order…' : 'View my orders'}<ShopIcon name="arrow" /></button>
      </form>
      <p className={styles.note}>Only orders placed with this mobile number are shown.</p>
    </section>
    {order && <div className={styles.result}><OrderDetails order={latest(orders.find((item) => item.id === order.id) || order)} token={order.trackingToken || receiptToken(order.id)} onChanged={changed} /></div>}
  </main>;
}
