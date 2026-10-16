import { strict as assert } from 'node:assert';
import { test, after } from 'node:test';
import { Module } from 'node:module';
import React from 'react';
import load from './load-source.cjs';

const previousCss = Module._extensions['.css'];
Module._extensions['.css'] = (module) => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) }; };
after(() => { if (previousCss) Module._extensions['.css'] = previousCss; else delete Module._extensions['.css']; });
const { Storefront } = load('../components/Storefront.tsx');
const ordersHook = load('../components/store/useCustomerOrders.ts');
const wishlistHook = load('../components/store/useWishlist.ts');
const { api } = load('../lib/api.ts');
const product = { id: 'one', name: 'Test product', price: 100, stock: 10, enabled: true, categoryId: 'electrical' };

function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, predicate); if (found) return found; }
}
const bar = (tree) => find(tree, (node) => node.props.className === 'floating-cart-summary');
const component = (tree, name) => find(tree, (node) => node.type?.name === name);
const flush = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };

function setup(t, initialCart = []) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const states = [], effects = [];
  let cursor = 0, effectCursor = 0, scheduled = [];
  const cleanup = () => { for (const effect of effects) effect?.cleanup?.(); };
  t.after(cleanup);
  const previous = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage };
  const saved = new Map([['vks-cart', JSON.stringify(initialCart)]]);
  const storage = { getItem: (key) => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
  globalThis.window = { location: { search: '' }, scrollTo() {}, setInterval: () => 0, clearInterval() {}, addEventListener() {}, removeEventListener() {}, localStorage: storage };
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  globalThis.localStorage = storage;
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  t.mock.method(ordersHook, 'useCustomerOrders', () => ({ orders: [], activeCount: 0, refresh() {} }));
  t.mock.method(wishlistHook, 'useWishlist', () => ({ ids: [], pending: [], ready: true, toggle() {}, refresh() {} }));
  t.mock.method(api, 'catalog', async () => ({ shop: { name: 'VKS VEL TRADERS', minimumOrder: 0 }, categories: [], products: [product], banners: [] }));
  t.mock.method(React, 'useState', (initial) => { const index = cursor++; if (!(index in states)) states[index] = initial;
    return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; });
  t.mock.method(React, 'useEffect', (effect, dependencies) => {
    const index = effectCursor++, previous = effects[index];
    if (!previous || dependencies.some((value, key) => !Object.is(value, previous.dependencies[key])))
      scheduled.push(() => { previous?.cleanup?.(); effects[index] = { dependencies, cleanup: effect() }; });
  });
  return { storage, render() {
    cursor = 0; effectCursor = 0; scheduled = [];
    const tree = Storefront({}); for (const effect of scheduled) effect(); return tree;
  } };
}

test('View Cart stays visible after adding products, updates totals and hides when the cart is emptied', async (t) => {
  const { render, storage } = setup(t);
  render(); await flush(); assert.equal(bar(render()), undefined);
  component(render(), 'StoreCatalog').props.onAdd(product);
  assert.ok(bar(render())); assert.equal(component(render(), 'StoreHeader').props.quantity, 1);
  t.mock.timers.tick(30000); assert.ok(bar(render()));
  component(render(), 'StoreCatalog').props.onAdd(product);
  assert.equal(component(render(), 'StoreHeader').props.quantity, 2);
  assert.equal(JSON.parse(storage.getItem('vks-cart'))[0].quantity, 2);
  component(render(), 'StoreCatalog').props.onDecrease(product);
  assert.ok(bar(render()));
  component(render(), 'StoreCatalog').props.onDecrease(product);
  assert.equal(bar(render()), undefined); assert.equal(component(render(), 'StoreHeader').props.quantity, 0);
});

test('a saved cart restores View Cart and navigation hides it on the cart page then restores it on return', async (t) => {
  const { render } = setup(t, [{ productId: product.id, quantity: 2 }]);
  render(); await flush(); assert.ok(bar(render()));
  find(bar(render()), (node) => node.type === 'button').props.onClick();
  assert.equal(bar(render()), undefined);
  assert.equal(component(render(), 'Cart').props.cart[0].quantity, 2);
  component(render(), 'Cart').props.goto('shop');
  assert.ok(bar(render()));
  component(render(), 'StoreHeader').props.onWishlist();
  assert.ok(bar(render()));
});

test('adding different custom shade codes keeps separate lines and respects shared stock', async (t) => {
  const { render, storage } = setup(t);
  render(); await flush();
  const paint = { ...product, customShadeEnabled: true, stock: 3 };
  const add = (code) => component(render(), 'StoreCatalog').props.onAdd(paint, undefined, code);
  add('#H10873'); add('N-204'); add(' #H10873 '); add('third');
  const saved = JSON.parse(storage.getItem('vks-cart'));
  assert.deepEqual(saved, [
    { productId: product.id, quantity: 2, customShadeCode: '#H10873' },
    { productId: product.id, quantity: 1, customShadeCode: 'N-204' },
  ]);
});
