import { api } from './api';

export function pushSupportMessage() {
  if (!window.isSecureContext) return 'Notifications require HTTPS (or localhost for testing).';
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window))
    return 'Push is not supported here. On iPhone/iPad, add this site to the Home Screen and open it there.';
  if (Notification.permission === 'denied') return 'Notifications are blocked. Enable them in browser site settings, then try again.';
  return '';
}
export async function enableOrderPush(id: string, token: string, publicKey: string) {
  const unsupported = pushSupportMessage();
  if (unsupported) throw new Error(unsupported);
  // Called directly from a click: do not request permission automatically on load.
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not enabled. You can still track your order here.');
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (letter) => letter.charCodeAt(0));
  const subscription = await registration.pushManager.getSubscription()
    || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api.subscribe(id, token, subscription.toJSON());
  return subscription;
}
