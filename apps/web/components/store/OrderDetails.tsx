'use client';
import { useEffect, useState } from 'react';
import { CancelOrder } from './CancelOrder';
import type { Order } from '../../lib/types';
import { paymentStatusLabel } from '../../lib/payment-status';
import { formatOrderMoney as formatPrice } from '../../lib/checkout-pricing';
import { copyOrderText, printOrder, trackingPath } from '../../lib/order-receipts';
import { ShopWordmark } from './ShopWordmark';
import { OrderPush } from './OrderPush';
import { orderGstLabel } from '../../lib/checkout-pricing';
import { cartLineKey } from '../../lib/cart';
import styles from './OrderTracking.module.css';

export function OrderDetails({ order: incoming, token, onChanged, showCancel = true }: { order: Order; token?: string; onChanged?: (order: Order) => void; showCancel?: boolean }) {
  const [order, setOrder] = useState(incoming);
  useEffect(() => setOrder(incoming), [incoming]);
  const [message, setMessage] = useState('');
  const copy = async (link = false) => {
    try { await copyOrderText(link ? `${window.location.origin}${trackingPath(order.id, token)}` : order.id); setMessage(link ? 'Secure tracking link copied. Keep it private.' : 'Order ID copied.'); }
    catch { setMessage('Copy unavailable. Select your Order ID below, or use your saved tracking link.'); }
  };
  const timeline = order.history?.length ? order.history : [{ status: order.status, at: order.createdAt }];
  const paymentLabel = paymentStatusLabel(order.payment.status);
  return <section className={styles.details} aria-label="Order details">
    <div className={styles.receipt}>
      <ShopWordmark name="VKS VEL TRADERS" />
      <small>Electrical | Plumbing | Paints | Hardware</small>
      <span>Your Order ID</span><h1>{order.id}</h1>
      <p>Please save your Order ID or take a screenshot to track your order later.</p>
      <p className={styles.privateNote}>New orders also need the secure tracking link saved on this device. Keep that link private.</p>
      <div className={styles.actions}><button onClick={() => void copy()}>Copy Order ID</button><button onClick={printOrder}>Print / Save as PDF</button>{token && <button onClick={() => void copy(true)}>Copy secure tracking link</button>}</div>
      <p role="status" className={styles.feedback}>{message}</p>
    </div>
    <div className={styles.status}><span>Current status</span><h2>{order.status}</h2><p>Created {new Date(order.createdAt).toLocaleString('en-IN')}</p></div>
    <ol className={styles.timeline} aria-label="Order timeline">{timeline.map((event, index) => <li key={`${event.status}-${index}`} aria-current={index === timeline.length - 1 ? 'step' : undefined}><b>{event.status}</b>{event.at ? <time dateTime={event.at}>{new Date(event.at).toLocaleString('en-IN')}</time> : <small>Time unavailable for this older order</small>}</li>)}</ol>
    <div className={styles.grid}>
      <article><h3>Delivery information</h3><b>{order.customer.name}</b><p>{order.customer.address}, {order.customer.area}<br />{order.customer.city}, {order.customer.district}<br />{order.customer.state} – {order.customer.pincode}</p><p>{order.customer.phone}</p>{order.shipment && <p>{order.shipment.type}<br />{order.shipment.trackingNumber && <>Tracking: {order.shipment.trackingNumber}<br /></>}{order.shipment.expected && <>Expected: {order.shipment.expected}</>}</p>}</article>
      <article><h3>Payment information</h3><b>{paymentLabel}</b><p>{order.payment.method}</p>{order.customerCategory && <p>Customer Type: {order.customerCategory}</p>}{order.payment.reference && <p>Reference: {order.payment.reference}</p>}<dl><div><dt>Subtotal</dt><dd>{formatPrice(order.subtotal)}</dd></div><div><dt>Discount{order.discountPercent !== undefined ? ` (${order.discountPercent}%)` : ''}</dt><dd>{formatPrice(order.discount)}</dd></div><div><dt>Delivery</dt><dd>{formatPrice(order.delivery)}</dd></div><div><dt>{orderGstLabel(order)}</dt><dd>{formatPrice(order.gst)}</dd></div><div><dt>Total</dt><dd><strong>{formatPrice(order.total)}</strong></dd></div></dl></article>
    </div>
    <section className={styles.products}><h3>Products</h3>{order.items.map((item, index) => <article key={`${cartLineKey(item)}-${index}`}><div><b>{item.name}</b>{item.shade && <small>Color: {item.shade}</small>}{item.customShadeCode && <small className="custom-shade-code">Custom shade code: {item.customShadeCode}</small>}<small>{item.quantity} × {formatPrice(item.price)}</small></div><strong>{formatPrice(item.quantity * item.price)}</strong></article>)}</section>
    {order.status === 'Cancelled' && order.payment.status !== 'REFUNDED' && (order.payment.status === 'PAID' || order.payment.reference) && <p role="status">Cancelled. The shop must check your payment and process any refund due.</p>}
    {showCancel && <CancelOrder order={order} token={token} onChanged={(updated) => { setOrder(updated); onChanged?.(updated); }} />}
    <OrderPush id={order.id} token={token} />
  </section>;
}
