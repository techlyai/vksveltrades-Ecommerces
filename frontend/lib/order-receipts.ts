export type OrderReceipt = { id: string; token: string };
let memory: OrderReceipt[] = [];
const key = 'vks-order-receipts-v1';
export function readReceipts(): OrderReceipt[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(value)) {
      const valid = value.filter((item) => /^VKST-\d+$/.test(item?.id) && /^[a-f0-9]{64}$/.test(item?.token));
      memory = [...new Map([...memory, ...valid].map((item) => [item.id, item])).values()].slice(0, 50);
    }
  } catch { /* A blocked storage API must not prevent this session's checkout. */ }
  return memory;
}
export function rememberReceipt(id: string, token?: string): boolean {
  if (!/^VKST-\d+$/.test(id) || !/^[a-f0-9]{64}$/.test(token || '')) return false;
  memory = [{ id, token: token! }, ...readReceipts().filter((item) => item.id !== id)].slice(0, 50);
  let persisted = true;
  try { localStorage.setItem(key, JSON.stringify(memory)); } catch { persisted = false; }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('vks-orders-changed'));
  return persisted;
}
export const receiptToken = (id: string) => readReceipts().find((item) => item.id === id)?.token;
export function pruneReceipts(ids: string[], checkedIds?: string[]) {
  memory = readReceipts().filter((item) => ids.includes(item.id) || (checkedIds && !checkedIds.includes(item.id)));
  try { localStorage.setItem(key, JSON.stringify(memory)); } catch { /* Keep this session's credentials when storage is blocked. */ }
}
export const trackingPath = (id: string, token?: string) => `/orders/${encodeURIComponent(id)}${token ? `#token=${encodeURIComponent(token)}` : ''}`;
export const activeOrderCount = (orders: Array<{ id: string; status: string }>) => new Set(orders.filter((order) => !['Delivered', 'Cancelled'].includes(order.status)).map((order) => order.id)).size;
export async function copyOrderText(text: string) {
  if (!navigator.clipboard?.writeText) throw new Error('Copy is unavailable. Select and copy the text manually.');
  await navigator.clipboard.writeText(text);
}
export function printOrder() { window.print(); }
