import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { planOrderCleanup } from './order-cleanup-policy.mjs';

test('cleanup preserves financial records, releases only outstanding reservations and keeps retired numbers', () => {
  const order = (id, status, payment, extra = {}) => ({ kind: 'orders', payload: { id, status,
    payment: { method: 'UPI', status: payment }, items: [{ productId: 'lamp', quantity: 2 }], ...extra } });
  const records = [
    { kind: 'products', payload: { id: 'lamp', stock: 3 } },
    order('VKST-1001', 'Order Placed', 'Pending'),
    order('VKST-1002', 'Cancelled', 'Expired'),
    order('VKST-1003', 'Confirmed', 'Paid'),
    order('VKST-1004', 'Cancelled', 'Refunded'),
    order('VKST-1005', 'Pending Verification', 'Processing', { payment: { method: 'UPI', status: 'Processing', reference: '123456789012' } }),
    order('VKST-1006', 'Pending Payment', 'Pending', { submittedAt: '2026-10-16' }),
    order('VKST-1007', 'Order Placed', 'Pending', { payment: { method: 'Cash', status: 'Pending' } }),
  ];
  const original = structuredClone(records);
  const result = planOrderCleanup(records);
  assert.deepEqual(result.candidates.map((order) => order.id), ['VKST-1001', 'VKST-1002']);
  assert.equal(result.products[0].stock, 5);
  assert.equal(result.lastOrderNumber, 1007);
  assert.deepEqual(records, original);
});

test('cleanup refuses to restore missing variant inventory into a different stock bucket', () => {
  assert.throws(() => planOrderCleanup([
    { kind: 'products', payload: { id: 'lamp', stock: 2, variants: [] } },
    { kind: 'orders', payload: { id: 'VKST-1001', status: 'Pending Payment', payment: { method: 'UPI', status: 'Pending' }, items: [{ productId: 'lamp', variantId: 'removed', quantity: 1 }] } },
  ]), /variant is missing/);
});
