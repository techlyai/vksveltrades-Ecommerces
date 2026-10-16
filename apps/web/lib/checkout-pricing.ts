import type { CustomerCategory } from './types';

export function orderGstLabel(order: { gstRate?: number; gstInclusive?: boolean }) {
  return `GST${order.gstRate !== undefined ? ` (${order.gstRate}%)` : ''}${order.gstInclusive !== false ? ' included' : ' added'}`;
}

// Formatting only. Discount eligibility and all money calculations belong to the API.
export const formatOrderMoney = (amount: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(amount);

const threshold = (amount: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(amount);

export function customerTypeLabel(category: CustomerCategory) {
  return category.id === 'customer'
    ? 'Customer — Standard Price (0% discount)'
    : `${category.name} — ${category.discountPercent}% discount on eligible orders above ${threshold(category.minimum)}`;
}

export function customerTypeHelp(category?: CustomerCategory) {
  return !category || category.id === 'customer' || !category.discountPercent
    ? 'Standard price. No customer-type discount.'
    : `${category.discountPercent}% applies only when the product subtotal is greater than ${threshold(category.minimum)}. Delivery charges are not discounted.`;
}
