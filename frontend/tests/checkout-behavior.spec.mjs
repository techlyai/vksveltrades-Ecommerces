import { strict as assert } from 'node:assert';
import { test, after } from 'node:test';
import { Module } from 'node:module';
import React from 'react';
import load from './load-source.cjs';

const previousCss = Module._extensions['.css'];
Module._extensions['.css'] = (module) => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) }; };
after(() => { if (previousCss) Module._extensions['.css'] = previousCss; else delete Module._extensions['.css']; });
const { Checkout, Payment } = load('../components/Storefront.tsx');
const { api, ApiError } = load('../lib/api.ts');
const { CancelOrder } = load('../components/store/CancelOrder.tsx');
const valid = { name: 'Test Customer', phone: '9876543210', address: '1 Test Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' };

// Exercise the real component handlers with isolated hook state, not a browser
// or a live customer order. Markup and backend persistence are tested separately.
function componentState(t, component, props, runEffects = false) {
  const state = [];
  const effects = [];
  let effectCursor = 0;
  let scheduled = [];
  let cursor = 0;
  t.mock.method(React, 'useState', (initial) => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
  });
  t.mock.method(React, 'useEffect', (effect, dependencies) => {
    if (!runEffects) return;
    const index = effectCursor++;
    const previous = effects[index];
    if (!previous || dependencies.some((value, key) => !Object.is(value, previous.dependencies[key]))) {
      scheduled.push(() => { previous?.cleanup?.(); effects[index] = { dependencies, cleanup: effect() }; });
    }
  });
  t.mock.method(React, 'useRef', (value) => ({ current: value }));
  t.after(() => { for (const effect of effects) effect?.cleanup?.(); });
  return () => { cursor = 0; effectCursor = 0; scheduled = []; const tree = component(props); for (const effect of scheduled) effect(); return tree; };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = find(child, predicate);
    if (found) return found;
  }
}
const form = (tree) => find(tree, (node) => node.type === 'form');
const field = (tree, name) => find(tree, (node) => node.props?.name === name);
const component = (tree, name) => find(tree, (node) => node.type?.name === name);
const event = (focus) => ({ preventDefault() {}, currentTarget: { querySelector(selector) { return { focus() { focus?.(selector); } }; } } });

test('cancellation requires confirmation, sends the owner token and reports backend failures', async (t) => {
  const previousWindow = globalThis.window;
  let confirmed = false, changed, events = 0;
  globalThis.window = { confirm: () => confirmed, dispatchEvent: () => events++ };
  t.after(() => { globalThis.window = previousWindow; });
  const cancelled = { id: 'VKST-1001', status: 'Cancelled', payment: { status: 'CANCELLED' } };
  const cancel = t.mock.method(api, 'cancel', async () => cancelled);
  const render = componentState(t, CancelOrder, { order: { ...cancelled, status: 'Pending Verification' }, token: 'a'.repeat(64), onChanged: (order) => { changed = order; } });
  const button = () => find(render(), (node) => node.type === 'button');
  await button().props.onClick();
  assert.equal(cancel.mock.calls.length, 0);
  confirmed = true;
  await button().props.onClick();
  assert.deepEqual(cancel.mock.calls[0].arguments, ['VKST-1001', 'a'.repeat(64)]);
  assert.equal(changed.status, 'Cancelled');
  assert.equal(events, 1);
  cancel.mock.mockImplementation(async () => { throw new Error('This order has already shipped.'); });
  await button().props.onClick();
  assert.equal(find(render(), (node) => node.props?.role === 'alert').props.children, 'This order has already shipped.');
});

test('empty checkout blocks the API, focuses the first error and clears errors after correction', async (t) => {
  const create = t.mock.method(api, 'order', async () => ({ id: 'VKST-TEST' }));
  let created;
  const render = componentState(t, Checkout, { catalog: { customerCategories: [], products: [{ id: 'test', name: 'Test product', price: 100, stock: 10 }] }, cart: [{ productId: 'test', quantity: 1 }], onCreated(value) { created = value; }, goto() {} });
  let focused;
  await form(render()).props.onSubmit(event((selector) => { focused = selector; }));
  assert.equal(create.mock.calls.length, 0);
  assert.equal(focused, '[name="name"]');
  for (const name of Object.keys(valid)) assert.ok(field(render(), name).props.error);
  for (const [name, value] of Object.entries(valid)) field(render(), name).props.onChange({ target: { value } });
  for (const name of Object.keys(valid)) assert.equal(field(render(), name).props.error, undefined);
  await form(render()).props.onSubmit(event());
  assert.equal(create.mock.calls.length, 1);
  assert.deepEqual(create.mock.calls[0].arguments[1], valid);
  assert.equal(created.id, 'VKST-TEST');
});

test('checkout presents backend field failures beside the affected input', async (t) => {
  t.mock.method(api, 'order', async () => { throw new ApiError('Please check your details', { pincode: 'Pincode is required.' }); });
  const render = componentState(t, Checkout, { catalog: { customerCategories: [], products: [{ id: 'test', name: 'Test product', price: 100, stock: 10 }] }, cart: [], onCreated() { assert.fail('Invalid order must not complete'); }, goto() {} });
  for (const [name, value] of Object.entries(valid)) field(render(), name).props.onChange({ target: { value } });
  let focused;
  await form(render()).props.onSubmit(event((selector) => { focused = selector; }));
  assert.equal(field(render(), 'pincode').props.error, 'Pincode is required.');
  assert.equal(focused, '[name="pincode"]');
});

test('payment blocks invalid references and sends valid references with the receipt credential', async (t) => {
  const reference = t.mock.method(api, 'reference', async () => ({ id: 'VKST-TEST', payment: { status: 'PENDING_VERIFICATION' } }));
  let updated;
  const render = componentState(t, Payment, { order: { id: 'VKST-TEST', status: 'Pending Payment', trackingToken: 'test-credential', total: 100, payment: { expiresAt: '2026-10-12T11:00:00Z' }, items: [] }, setOrder(value) { updated = value; }, done() {} });
  await form(render()).props.onSubmit(event());
  assert.equal(reference.mock.calls.length, 0);
  assert.ok(field(render(), 'reference').props.error);
  field(render(), 'reference').props.onChange({ target: { value: '123456789012' } });
  assert.equal(field(render(), 'reference').props.error, '');
  await form(render()).props.onSubmit(event());
  assert.deepEqual(reference.mock.calls[0].arguments, ['VKST-TEST', '123456789012', 'test-credential']);
  assert.equal(updated.payment.status, 'PENDING_VERIFICATION');
});

test('Customer Type selection is sent unchanged to server order creation', async (t) => {
  const create = t.mock.method(api, 'order', async () => ({ id: 'VKST-TEST' }));
  const render = componentState(t, Checkout, { catalog: { customerCategories: [], products: [{ id: 'test', name: 'Test product', price: 100, stock: 10 }] }, cart: [], onCreated() {}, goto() {} });
  for (const [name, value] of Object.entries(valid)) field(render(), name).props.onChange({ target: { value } });
  assert.equal(component(render(), 'CustomerTypeSelect').props.value, 'customer');
  for (const id of ['customer', 'engineers', 'electricians']) {
    component(render(), 'CustomerTypeSelect').props.onChange(id);
    await form(render()).props.onSubmit(event());
    assert.equal(create.mock.calls.at(-1).arguments[2], id);
    assert.equal(create.mock.calls.at(-1).arguments.length, 4); // No client discount or total.
  }
});

test('customer and cart changes request fresh server quotes and ignore late obsolete quotes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previousWindow = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout };
  const requests = [];
  t.mock.method(api, 'quote', (cart, _customer, tier) => new Promise((resolve, reject) => requests.push({ cart, tier, resolve, reject })));
  const props = { catalog: { customerCategories: [], products: [{ id: 'test', name: 'Test product', price: 100, stock: 10 }] }, cart: [{ productId: 'test', quantity: 1 }], onCreated() {}, goto() {} };
  const render = componentState(t, Checkout, props, true);
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  for (const [name, value] of Object.entries(valid)) field(render(), name).props.onChange({ target: { value } });
  render(); t.mock.timers.tick(250);
  assert.equal(requests[0].tier, 'customer');
  component(render(), 'CustomerTypeSelect').props.onChange('engineers');
  render(); t.mock.timers.tick(250);
  component(render(), 'CustomerTypeSelect').props.onChange('electricians');
  render(); t.mock.timers.tick(250);
  assert.deepEqual(requests.map((item) => item.tier), ['customer', 'engineers', 'electricians']);
  const latest = { subtotal: 6000, discount: 600, discountPercent: 10, delivery: 0, gst: 0, total: 5400 };
  requests[2].resolve(latest); await Promise.resolve();
  assert.deepEqual(component(render(), 'CheckoutTotals').props.totals, latest);
  requests[1].resolve({ ...latest, discount: 300, total: 5700 }); await Promise.resolve();
  requests[0].resolve({ ...latest, discount: 0, total: 6000 }); await Promise.resolve();
  assert.deepEqual(component(render(), 'CheckoutTotals').props.totals, latest);
  props.cart = [{ productId: 'test', quantity: 2 }];
  assert.equal(component(render(), 'CheckoutTotals'), undefined);
  t.mock.timers.tick(250);
  assert.equal(requests[3].cart[0].quantity, 2);
  requests[3].resolve({ ...latest, subtotal: 12000, discount: 1200, total: 10800 }); await Promise.resolve();
  assert.equal(component(render(), 'CheckoutTotals').props.totals.total, 10800);
});
