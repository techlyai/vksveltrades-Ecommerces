import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import load from './load-source.cjs';

const { validateCustomer, validatePaymentReference, customerLabels } = load('../lib/checkout-validation.ts');
const valid = { name: 'Test Customer', phone: '9876543210', address: '1 Test Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' };

test('every mandatory customer field rejects missing, blank and non-string values', () => {
  assert.deepEqual(validateCustomer(valid), {});
  for (const key of Object.keys(customerLabels)) {
    for (const value of [undefined, null, '', ' \t ', 123, [], {}]) {
      assert.deepEqual(Object.keys(validateCustomer({ ...valid, [key]: value })), [key]);
    }
  }
  for (const value of [undefined, null, [], 'invalid']) assert.equal(Object.keys(validateCustomer(value)).length, 8);
});

test('Indian mobile numbers and pincodes enforce length and allowed starting digits', () => {
  for (const phone of ['1234567890', '5876543210', '987654321', '98765432100', '98765abcde']) assert.ok(validateCustomer({ ...valid, phone }).phone);
  for (const phone of ['6876543210', '7876543210', '8876543210', '9876543210']) assert.deepEqual(validateCustomer({ ...valid, phone }), {});
  for (const pincode of ['025002', '62500', '6250020', '625abc']) assert.ok(validateCustomer({ ...valid, pincode }).pincode);
  assert.deepEqual(validateCustomer(Object.fromEntries(Object.entries(valid).map(([key, value]) => [key, ` ${value} `]))), {});
});

test('mandatory UPI reference validation matches the existing server format', () => {
  for (const value of ['', ' ', '123456789', '1'.repeat(12), '1'.repeat(23), '12345-789012', 'ABC123456789', '1234567890']) assert.ok(validatePaymentReference(value));
  for (const value of ['123456789012', '987654321098']) assert.equal(validatePaymentReference(value), '');
});

test('API validation errors preserve the backend field messages for inline display', async (t) => {
  const { api, ApiError } = load('../lib/api.ts');
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ message: 'Check your details', fields: { phone: 'Mobile number is required.' } }), { status: 400 }));
  await assert.rejects(api.order([], valid, 'customer'), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, 'Check your details');
    assert.equal(error.fields.phone, 'Mobile number is required.');
    return true;
  });
});
