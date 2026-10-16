'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { OrderAlertTracker, OrderSoundPlayer, type OrderAlertSnapshot, type OrderSoundSettings } from '../../lib/admin-order-sound';

type SoundContextValue = { test: (settings: OrderSoundSettings) => Promise<boolean>; upload: (file: File, signal: AbortSignal) => Promise<string>; status: ReactNode };
const SoundContext = createContext<SoundContextValue | null>(null);
export const useAdminOrderSound = () => {
  const value = useContext(SoundContext);
  if (!value) throw new Error('Order sound controls require the authenticated admin panel.');
  return value;
};
export function AdminOrderAlertStatus() { return <>{useAdminOrderSound().status}</>; }

export function AdminOrderAlerts({ token, onCount, onOrders, onArrival, children }: {
  token: string; onCount: (count: number) => void; onOrders: () => void; onArrival: () => void; children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<OrderAlertSnapshot | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const player = useRef<OrderSoundPlayer | null>(null);
  if (!player.current) player.current = new OrderSoundPlayer(setReady);
  const engine = player.current;
  const countCallback = useRef(onCount); countCallback.current = onCount;
  const arrivalCallback = useRef(onArrival); arrivalCallback.current = onArrival;

  useEffect(() => {
    let active = true, polling = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    const tracker = new OrderAlertTracker();
    const poll = async () => {
      if (!active || polling) return;
      polling = true; clearTimeout(timer);
      request = new AbortController();
      const currentRequest = request;
      const timeout = setTimeout(() => currentRequest.abort(), 10000);
      try {
        const result = await api.admin<OrderAlertSnapshot>('/order-alerts', token, { signal: request.signal });
        if (!active) return;
        setSnapshot(result); countCallback.current(result.activeOrders); setError('');
        const newIds = tracker.observe(result.orders);
        if (result.sound.orderSoundEnabled === false || result.sound.orderSoundVolume === 0) engine.stop();
        if (newIds.length) {
          arrivalCallback.current();
          setNotice(newIds.length === 1 ? `New order received: ${newIds[0]}` : `${newIds.length} new orders received.`);
          const played = await engine.play(result.sound);
          if (active && !played && result.sound.orderSoundEnabled !== false && result.sound.orderSoundVolume !== 0)
            setError('Click Enable order sounds to hear new-order alerts.');
        } else if (result.sound.orderSound === 'custom' && engine.ready) {
          // Preload the saved clip so a new order can play it immediately.
          void engine.prepare(result.sound.orderSoundUrl || '').catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Custom sound unavailable.'); });
        }
      } catch (reason) {
        if (active) setError(currentRequest.signal.aborted ? 'Order alerts could not connect. Retrying…' : reason instanceof Error ? reason.message : 'Order alerts could not connect. Retrying…');
      } finally {
        clearTimeout(timeout);
        polling = false;
        if (active) timer = setTimeout(() => { void poll(); }, 5000);
      }
    };
    const resume = () => { if (document.visibilityState === 'visible') void poll(); };
    void poll();
    window.addEventListener('focus', resume); document.addEventListener('visibilitychange', resume);
    return () => { active = false; clearTimeout(timer); request?.abort(); engine.close(); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [token, engine]);

  const enable = async () => {
    try { await engine.unlock(); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not enable audio.'); }
  };
  const enabled = snapshot?.sound.orderSoundEnabled !== false;
  const status = <div className="admin-order-alert-status" role="status" aria-live="polite">
    <span>{notice || (!snapshot ? 'Connecting order alerts…' : !enabled ? 'Order sounds are turned off.' : ready ? 'Order sounds are ready while this admin panel is open.' : 'Enable sound alerts for this admin session.')}</span>
    {enabled && !ready && <button type="button" onClick={() => { void enable(); }}>Enable order sounds</button>}
    {notice && <><button type="button" onClick={onOrders}>View orders</button><button type="button" aria-label="Dismiss new-order notice" onClick={() => setNotice('')}>Dismiss</button></>}
    {error && <small>{error}</small>}
  </div>;
  const context: SoundContextValue = {
    status,
    test: async (settings) => { await engine.unlock(); return engine.play(settings, true); },
    upload: async (file, signal) => {
      const wav = await engine.decodeUpload(file);
      const body = new FormData(); body.append('file', wav, 'notification.wav');
      const result = await api.admin<{ url: string }>('/order-sounds', token, { method: 'POST', body, signal });
      return result.url;
    },
  };
  return <SoundContext.Provider value={context}>{children}</SoundContext.Provider>;
}
