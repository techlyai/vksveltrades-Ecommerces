import type { Customer } from './types';

export const customerLabels: Record<keyof Customer, string> = {
  name: 'Full name', phone: 'Mobile number', address: 'Address', area: 'Area / locality',
  city: 'City', district: 'District', state: 'State', pincode: 'Pincode',
};
export type CustomerErrors = Partial<Record<keyof Customer, string>>;
export function validateCustomer(input: unknown): CustomerErrors {
  const customer = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: CustomerErrors = {};
  for (const key of Object.keys(customerLabels) as Array<keyof Customer>) {
    if (typeof customer[key] !== 'string' || !customer[key].trim()) errors[key] = `${customerLabels[key]} is required.`;
  }
  if (!errors.phone && !/^[6-9]\d{9}$/.test(String(customer.phone).trim())) errors.phone = 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9.';
  if (!errors.pincode && !/^[1-9]\d{5}$/.test(String(customer.pincode).trim())) errors.pincode = 'Enter a valid 6-digit pincode (it cannot start with 0).';
  return errors;
}
export function validatePaymentReference(value: string) {
  return /^\d{12}$/.test(value) && !/^(\d)\1{11}$/.test(value) ? '' : 'Enter the 12-digit UPI transaction reference from your payment app.';
}
