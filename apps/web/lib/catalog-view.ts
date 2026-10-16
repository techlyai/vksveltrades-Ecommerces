import type { Catalog, Product } from './types';

export function visibleProducts(catalog: Pick<Catalog, 'products' | 'categories'>) {
  const categories = new Set(catalog.categories.filter((category) => category.enabled).map((category) => category.id));
  return catalog.products.filter((product) => product.enabled && categories.has(product.categoryId));
}

export function filterProducts(products: Product[], category: string, query: string, sort: string) {
  const search = query.trim().toLocaleLowerCase();
  return products.filter((product) => (category === 'all' || product.categoryId === category)
    && `${product.name} ${product.short} ${product.hsn}`.toLocaleLowerCase().includes(search))
    .sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : sort === 'name' ? a.name.localeCompare(b.name) : 0);
}

export function productAvailability(product: Product) {
  const stock = product.variants?.length ? product.variants.reduce((total, variant) => total + variant.stock, 0) : product.stock;
  return { stock, unavailable: product.manualOutOfStock || stock <= 0, hasVariants: Boolean(product.variants?.length) };
}

export function safeBannerUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export const formatPrice = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(value);
