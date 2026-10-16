import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import load from './load-source.cjs';

const { isWireProduct, wireColorPresets, wireColorError } = load('../lib/wire-colors.ts');
const { parseSavedCart, resolveCartLines } = load('../lib/cart.ts');

test('wire products are recognized without adding unrelated electrical products', () => {
  assert.equal(isWireProduct({ name: 'Copper 1.5mm', categoryId: 'wires' }), true);
  assert.equal(isWireProduct({ name: 'Suriya cable', categoryId: 'electrical' }), true);
  assert.equal(isWireProduct({ name: 'Copper roll', categoryId: 'custom' }, [{ id: 'custom', name: 'Wires & Cables' }]), true);
  assert.equal(isWireProduct({ name: 'Wireless switch', categoryId: 'electrical' }), false);
  assert.equal(isWireProduct({ name: 'White paint', categoryId: 'paints' }), false);
  assert.ok(wireColorPresets.some((color) => color.name === 'Black'));
  assert.ok(wireColorPresets.some((color) => color.name === 'Blue'));
});

test('wire editor validates available colors without inventing stock', () => {
  const color = { id: 'black', name: 'Black', color: '#202124', price: 118, stock: 0 };
  assert.equal(wireColorError([color]), '');
  assert.equal(wireColorError([]), '');
  assert.ok(wireColorError([color, { ...color, id: 'two', name: ' BLACK ' }]));
  for (const invalid of [{ stock: -1 }, { stock: 0.5 }, { price: NaN }, { name: '' }, { color: 'black' }]) assert.ok(wireColorError([{ ...color, ...invalid }]));
});

test('saved wire selections remain separate and resolve their own price and stock', () => {
  const product = { id: 'wire', name: 'Wire', categoryId: 'wires', price: 118, stock: 5, variants: [
    { id: 'black', name: 'Black', color: '#202124', price: 118, stock: 2 },
    { id: 'blue', name: 'Blue', color: '#2563eb', price: 236, stock: 3 },
  ] };
  const cart = parseSavedCart(JSON.parse(JSON.stringify([{ productId: 'wire', variantId: 'black', quantity: 1 }, { productId: 'wire', variantId: 'blue', quantity: 2 }])));
  const lines = resolveCartLines(cart, [product]);
  assert.deepEqual(lines.map((line) => [line.v.name, line.price, line.max]), [['Black', 118, 2], ['Blue', 236, 3]]);
  assert.equal(resolveCartLines([{ productId: 'wire', variantId: 'removed', quantity: 1 }], [product]).length, 0);
});
