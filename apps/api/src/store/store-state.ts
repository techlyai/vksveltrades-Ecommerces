import { Banner, Category, CustomerCategory, DeliveryRule, Order, Product, Shop } from './models';
import { normalizePaymentStatus } from './payment-status';
import * as defaults from './seed';

export type StoreState = {
  products: Product[];
  orders: Order[];
  categories: Category[];
  customerCategories: CustomerCategory[];
  deliveryRules: DeliveryRule[];
  banners: Banner[];
  shop: Shop;
};

export const collections = ['products', 'orders', 'categories', 'customerCategories', 'deliveryRules', 'banners'] as const;
export type Collection = typeof collections[number];

export function emptyStore(): StoreState {
  return structuredClone({
    products: defaults.products, orders: [], categories: defaults.categories,
    customerCategories: defaults.customerCategories, deliveryRules: defaults.deliveryRules,
    banners: defaults.banners, shop: defaults.shop,
  });
}

// Also used by the explicit legacy import. Never silently replace corrupt data.
export function parseStore(value: unknown): StoreState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid store data');
  const state = value as StoreState;
  for (const field of collections) {
    if (!Array.isArray(state[field])) throw new Error(`Missing collection: ${field}`);
    const ids = new Set<string>();
    for (const record of state[field]) {
      if (!record || typeof record.id !== 'string' || !record.id || ids.has(record.id)) {
        throw new Error(`Invalid or duplicate ID in ${field}`);
      }
      ids.add(record.id);
    }
  }
  if (!state.shop || typeof state.shop !== 'object' || Array.isArray(state.shop)) throw new Error('Missing shop configuration');
  if (!state.customerCategories.some((item) => item.id === 'customer')) throw new Error('Missing default customer category');
  for (const product of state.products) {
    if (!Number.isSafeInteger(product.stock) || product.stock < 0 || !Number.isFinite(product.price) || product.price < 0) {
      throw new Error('Invalid product stock or price');
    }
  }
  // Compatibility for receipts created before checkout/payment were separated.
  for (const order of state.orders) {
    order.payment.status = normalizePaymentStatus(order.payment.status);
    if (order.status === 'Cancelled' && ['UNPAID', 'PENDING_VERIFICATION'].includes(order.payment.status)) {
      order.payment.status = 'CANCELLED';
    }
    if (order.status === 'Cancelled' && order.payment.status !== 'REFUNDED' && order.payment.reference)
      order.refundRequired ??= true;
    if (order.status === 'Order Placed' && !['PAID', 'REFUNDED'].includes(order.payment.status)) {
      order.status = order.payment.reference ? 'Pending Verification' : 'Pending Payment';
      order.checkoutSession = true;
      order.history = [{ status: order.status, at: order.createdAt }];
    }
  }
  return state;
}
