import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { cartLineKey, cartPreview, customShadesEnabled, parseSavedCart, resolveCartLines } from '../lib/cart.ts';

const products = [
  { id: 'lamp', price: 410, stock: 8 },
  { id: 'paint', price: 500, stock: 6, variants: [{ id: 'red', price: 650, stock: 3 }] },
];
test('empty carts have no summary quantity', () => {
  assert.deepEqual(cartPreview([], products), { quantity: 0, subtotal: 0 });
});

test('plain color names follow cart reloads without creating variants or changing prices and quantity limits', () => {
  const catalog = [{ id: 'plain', colorName: ' Dark Red ', price: 118, stock: 5 },
    { id: 'colored', colorName: 'Base color', price: 118, stock: 5, variants: [{ id: 'blue', name: 'Blue', price: 236, stock: 3 }] }];
  const cart = parseSavedCart(JSON.parse(JSON.stringify([{ productId: 'plain', quantity: 2, colorName: 'Forged' }, { productId: 'colored', variantId: 'blue', quantity: 1 }])));
  const lines = resolveCartLines(cart, catalog);
  assert.equal(lines[0].colorName, 'Dark Red'); assert.equal(lines[0].v, undefined); assert.equal(lines[0].max, 5);
  assert.equal(lines[1].colorName, 'Blue'); assert.equal(lines[1].price, 236); assert.equal(lines[1].max, 3);
  assert.deepEqual(cartPreview(cart, catalog), { quantity: 3, subtotal: 472 });
});
test('summary counts units and displays the screenshot subtotal from real prices', () => {
  assert.deepEqual(cartPreview([{ productId: 'lamp', quantity: 2 }], products), { quantity: 2, subtotal: 820 });
});

test('cart badge sums repeated product lines, decrements, and returns to zero', () => {
  const repeated = [{ productId: 'lamp', quantity: 2 }, { productId: 'lamp', quantity: 3 }, { productId: 'paint', variantId: 'red', quantity: 1 }];
  assert.equal(cartPreview(repeated, products).quantity, 6);
  assert.equal(cartPreview(repeated.slice(1), products).quantity, 4);
  assert.equal(cartPreview([], products).quantity, 0);
});
test('variant prices and quantity changes update the preview', () => {
  assert.deepEqual(cartPreview([{ productId: 'lamp', quantity: 1 }, { productId: 'paint', variantId: 'red', quantity: 2 }], products), { quantity: 3, subtotal: 1710 });
  assert.deepEqual(cartPreview([{ productId: 'paint', variantId: 'red', quantity: 1 }], products), { quantity: 1, subtotal: 650 });
});
test('deleted products and variants do not crash View Cart or corrupt line indexes', () => {
  const cart = [{ productId: 'deleted', quantity: 1 }, { productId: 'paint', variantId: 'gone', quantity: 1 }, { productId: 'lamp', quantity: 2 }];
  assert.deepEqual(cartPreview(cart, products), { quantity: 2, subtotal: 820 });
  assert.equal(resolveCartLines(cart, products)[0].cartIndex, 2);
});
test('invalid saved cart records are discarded and valid carts survive reload', () => {
  assert.deepEqual(parseSavedCart({}), []);
  const line = { productId: 'lamp', quantity: 2 };
  assert.deepEqual(parseSavedCart([null, {}, { ...line, quantity: -1 }, { ...line, quantity: '2' }, line]), [line]);
  assert.deepEqual(cartPreview(parseSavedCart(JSON.parse(JSON.stringify([line]))), products), { quantity: 2, subtotal: 820 });
});

test('custom shade codes survive reload and share the selected color stock across separate lines', () => {
  const line = { productId: 'paint', variantId: 'red', quantity: 1, customShadeCode: '#H10873' };
  const other = { ...line, customShadeCode: 'N-204' };
  assert.notEqual(cartLineKey(line), cartLineKey(other));
  assert.equal(cartLineKey(line), cartLineKey({ ...line, customShadeCode: ' #H10873 ' }));
  assert.deepEqual(parseSavedCart(JSON.parse(JSON.stringify([line, other]))), [line, other]);
  assert.equal(resolveCartLines([line, other], products)[0].max, 2);
  assert.equal(cartPreview([line, other], products).subtotal, 1300);
  assert.deepEqual(parseSavedCart([null, { ...line, customShadeCode: 12 }, { ...line, customShadeCode: 'x'.repeat(81) }, { ...line, customShadeCode: 'a\nb' }]), []);
  assert.equal(customShadesEnabled({ categoryId: 'paints' }), true);
  assert.equal(customShadesEnabled({ categoryId: 'paints', customShadeEnabled: false }), false);
  assert.equal(customShadesEnabled({ categoryId: 'electrical', customShadeEnabled: true }), true);
});
