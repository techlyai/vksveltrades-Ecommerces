import type { CustomerDto } from './dto';

const labels: Record<keyof CustomerDto, string> = {
  name: 'Full name', phone: 'Mobile number', address: 'Address', area: 'Area / locality',
  city: 'City', district: 'District', state: 'State', pincode: 'Pincode',
};
export function validateCustomer(input: unknown) {
  const customer = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: Partial<Record<keyof CustomerDto, string>> = {};
  for (const key of Object.keys(labels) as Array<keyof CustomerDto>) {
    if (typeof customer[key] !== 'string' || !customer[key].trim()) errors[key] = `${labels[key]} is required.`;
  }
  if (!errors.phone && !/^[6-9]\d{9}$/.test(String(customer.phone).trim())) errors.phone = 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9.';
  if (!errors.pincode && !/^[1-9]\d{5}$/.test(String(customer.pincode).trim())) errors.pincode = 'Enter a valid 6-digit pincode (it cannot start with 0).';
  return errors;
}
