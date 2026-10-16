import type { CustomerCategory } from './models';

export const defaultCheckoutTiers: CustomerCategory[] = [
  { id: 'customer', name: 'Customer', discountPercent: 0, minimum: 0 },
  { id: 'engineers', name: 'Engineers', discountPercent: 5, minimum: 5000 },
  { id: 'electricians', name: 'Electricians', discountPercent: 10, minimum: 5000 },
];

export function findCheckoutTier(categories: CustomerCategory[], rule: CustomerCategory) {
  return categories.find((category) => category.id === rule.id)
    || (rule.id !== 'customer' ? categories.find((category) =>
      typeof category.name === 'string' && category.name.trim().toLowerCase().replace(/s$/, '') === rule.name.toLowerCase().replace(/s$/, '')) : undefined);
}

export function checkoutTiers(categories: CustomerCategory[]) {
  return defaultCheckoutTiers.flatMap((rule) => {
    const category = findCheckoutTier(categories, rule);
    return category ? [{ ...category, ...(rule.id === 'customer' ? { discountPercent: 0, minimum: 0 } : {}) }] : [];
  });
}
