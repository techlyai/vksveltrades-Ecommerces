import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { validateCustomer } from './customer-validation';
import { testDatabase } from './test-database';
import type { CustomerDto } from './dto';

const customer: CustomerDto = { name: 'Test Customer', phone: '9876543210', address: '1 Test Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' };

test('customer validation rejects missing, blank, wrong-type and malformed required fields', () => {
  assert.deepEqual(validateCustomer(customer), {});
  for (const key of Object.keys(customer)) {
    for (const value of [undefined, null, '', '  ', 123, [], {}]) assert.deepEqual(Object.keys(validateCustomer({ ...customer, [key]: value })), [key]);
  }
  for (const phone of ['1234567890', '987654321', '98765432100', '98765abcde']) assert.ok(validateCustomer({ ...customer, phone }).phone);
  for (const pincode of ['025002', '62500', '6250020', '625abc']) assert.ok(validateCustomer({ ...customer, pincode }).pincode);
  for (const input of [null, undefined, [], 'invalid']) assert.equal(Object.keys(validateCustomer(input)).length, 8);
});

test('quote and order creation return field-specific 400 errors without reserving stock', async (t) => {
  const fixture = await testDatabase();
  t.after(() => fixture.close());
  const { database, store } = fixture;
  const product = await database.run(() => store.createProduct({ imageUrl: '/test-product.webp', name: 'Test lamp', categoryId: 'electrical', price: 500, stock: 4 }));
  const items = [{ productId: product.id, quantity: 1 }];
  for (const method of ['quote', 'createOrder'] as const) {
    for (const [key, value] of [...Object.keys(customer).map((key) => [key, '  ']), ['phone', '123'], ['pincode', '000000'], ['name', 123]]) {
      await assert.rejects(database.run(() => store[method]({ items, customer: { ...customer, [String(key)]: value }, customerCategoryId: 'customer' })), (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.equal(error.getStatus(), 400);
        const response = error.getResponse() as { fields: Record<string, string> };
        assert.ok(response.fields[String(key)]);
        return true;
      });
    }
  }
  await database.run(() => { assert.equal(store.products[0].stock, 4); assert.equal(store.orders.length, 0); });
  const order = await database.run(() => store.createOrder({ items, customer: Object.fromEntries(Object.entries(customer).map(([key, value]) => [key, ` ${value} `])) as unknown as CustomerDto, customerCategoryId: 'customer' }));
  assert.deepEqual(order.customer, customer);
  for (const reference of ['', '123', '1'.repeat(23), '12345-789012', 123456789012]) {
    await assert.rejects(database.run(() => store.submitReference(order.id, reference as string)), /12-digit UPI transaction reference/);
  }
  await database.run(() => assert.equal(store.getOrder(order.id).payment.status, 'UNPAID'));
  const updated = await database.run(() => store.submitReference(order.id, '123456789012'));
  assert.equal(updated.payment.status, 'PENDING_VERIFICATION');
  assert.equal(updated.payment.reference, '123456789012');
});
