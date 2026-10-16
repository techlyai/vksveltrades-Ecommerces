import type { Category, Product, Variant } from './types';

// Suggestions only; each product's saved variants determine what customers can buy.
export const wireColorPresets = [
  { name: 'Black', color: '#202124' },
  { name: 'Blue', color: '#2563eb' },
  { name: 'Red', color: '#dc2626' },
  { name: 'Yellow', color: '#facc15' },
  { name: 'Green', color: '#16a34a' },
  { name: 'White', color: '#f8fafc' },
  { name: 'Brown', color: '#92400e' },
  { name: 'Grey', color: '#6b7280' },
  { name: 'Orange', color: '#ea580c' },
  { name: 'Green / Yellow', color: '#84cc16' },
] as const;

export function isWireProduct(product: Pick<Product, 'categoryId' | 'name'>, categories: Category[] = []) {
  return product.categoryId === 'wires'
    || /\b(wires?|cables?)\b/i.test(categories.find((category) => category.id === product.categoryId)?.name ?? '')
    || /\b(wires?|cables?)\b/i.test(product.name);
}

export function wireColorError(variants: Variant[]): string {
  if (variants.length > 50) return 'Add at most 50 colors per product.';
  const names = new Set<string>();
  for (const variant of variants) {
    const name = variant.name.trim().toLowerCase();
    if (!name || name.length > 80) return 'Each color needs a name of up to 80 characters.';
    if (names.has(name)) return 'Use a different name for each color.';
    names.add(name);
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(variant.color)) return 'Choose a valid color swatch.';
    if (!Number.isFinite(variant.price) || variant.price < 0) return 'Enter a non-negative price for each color.';
    if (!Number.isSafeInteger(variant.stock) || variant.stock < 0) return 'Enter a whole, non-negative stock quantity for each color.';
  }
  return '';
}
