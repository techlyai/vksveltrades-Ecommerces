import type { CartLine, Product, Variant } from './types';

export const productColorName = (product: Pick<Product, 'colorName'>, variant?: Pick<Variant, 'name'>) =>
  variant?.name?.trim() || product.colorName?.trim() || '';

export const customShadesEnabled = (product: Product) => product.customShadeEnabled ?? product.categoryId === 'paints';
export const cartLineKey = (line: Pick<CartLine, 'productId' | 'variantId' | 'customShadeCode'>) =>
  JSON.stringify([line.productId, line.variantId || '', line.customShadeCode?.trim() || '']);

export function parseSavedCart(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter((line): line is CartLine => Boolean(line)
    && typeof line.productId === 'string'
    && (line.variantId === undefined || typeof line.variantId === 'string')
    && (line.customShadeCode === undefined || (typeof line.customShadeCode === 'string'
      && line.customShadeCode.length <= 80 && !/[\u0000-\u001f\u007f]/.test(line.customShadeCode)))
    && Number.isSafeInteger(line.quantity) && line.quantity > 0);
}

// Display estimates only. The API remains authoritative for checkout totals.
export function resolveCartLines(cart: CartLine[], products: Product[]) {
  return cart.flatMap((line, cartIndex) => {
    const p = products.find((product) => product.id === line.productId);
    if (!p) return [];
    const v = p.variants?.find((variant) => variant.id === line.variantId);
    if (line.variantId && !v) return [];
    const otherQuantity = cart.reduce((sum, other, index) => index !== cartIndex && other.productId === line.productId
      && other.variantId === line.variantId ? sum + other.quantity : sum, 0);
    return [{ ...line, cartIndex, p, v, colorName: productColorName(p, v), price: v?.price ?? p.price, max: Math.max(0, (v?.stock ?? p.stock) - otherQuantity) }];
  });
}

export function cartPreview(cart: CartLine[], products: Product[]) {
  return resolveCartLines(cart, products).reduce((summary, line) => ({
    quantity: summary.quantity + line.quantity,
    subtotal: summary.subtotal + line.price * line.quantity,
  }), { quantity: 0, subtotal: 0 });
}
