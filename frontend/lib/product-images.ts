import type { Product } from './types';

export const productImageLabels = [
  'Main Product Image (Required)',
  'Additional Image 2 (Optional)',
  'Additional Image 3 (Optional)',
  'Additional Image 4 (Optional)',
] as const;

export function productImageSlots(product: Pick<Product, 'imageUrl' | 'imageUrls'>): string[] {
  const images = product.imageUrls ?? (product.imageUrl ? [product.imageUrl] : []);
  return Array.from({ length: 4 }, (_, index) => images[index]?.trim() ?? '');
}

export const productImages = (product: Pick<Product, 'imageUrl' | 'imageUrls'>) => productImageSlots(product).filter(Boolean);
