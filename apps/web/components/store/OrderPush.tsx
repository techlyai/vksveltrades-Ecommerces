'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { enableOrderPush, pushSupportMessage } from '../../lib/push-client';
import styles from './OrderTracking.module.css';

export function OrderPush({ id, token }: { id: string; token?: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [message, setMessage] = useState('Checking notification availability…');
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(false);
    const unsupported = pushSupportMessage();
    if (unsupported) { setMessage(unsupported); return; }
    void api.pushConfig().then((config) => {
      setKey(config.enabled ? config.publicKey : null);
      setMessage(config.enabled ? 'Enable updates for this order on this device.' : 'Push notifications are not configured by the shop yet.');
    }).catch(() => setMessage('Unable to check notifications. Please reload to retry.'));
  }, [id]);
  const enable = async () => {
    if (!token || !key) return;
    setBusy(true);
    try { await enableOrderPush(id, token, key); setEnabled(true); setMessage('This device is subscribed to this order.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to enable notifications. Please retry.'); }
    finally { setBusy(false); }
  };
  const disable = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) await api.unsubscribe(id, token, subscription.endpoint);
      setEnabled(false); setMessage('Notifications for this order are turned off on this device.');
    } catch { setMessage('Unable to turn off notifications. Please retry.'); }
    finally { setBusy(false); }
  };
  return <aside className={styles.push} aria-label="Order notifications">
    <strong>Order notifications</strong><p role="status">{message}</p>
    <div className={styles.actions}><button onClick={() => void enable()} disabled={busy || !key || !token}>{busy ? 'Please wait…' : enabled ? 'Refresh subscription' : 'Enable notifications'}</button>
    {key && token && <button onClick={() => void disable()} disabled={busy}>Turn off for this order</button>}</div>
    <small>Delivery requires your permission and an active subscription. Browser, device and network settings may delay or prevent notifications.</small>
  </aside>;
}
