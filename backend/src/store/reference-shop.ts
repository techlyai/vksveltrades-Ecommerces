import type { Shop } from './models';

// Public business details supplied in the owner's reference HTML. No credentials,
// payment identifiers, tax rates or order/delivery rules are imported.
export const referenceShopDetails = {
  legalName: 'Suriyaprakash S',
  gstin: '33POTPS8236C1Z7',
  phone: '+91 80153 03041',
  email: 'vksveltradersellur@gmail.com',
  address: '9, Jancyrani Puram 3rd Street, Sellur, Madurai, Tamil Nadu 625002',
  footerText: 'Genuine branded products, GST billing and doorstep delivery across Madurai.',
  openingHours: '',
} satisfies Partial<Shop>;

export function fillReferenceShopDetails(shop: Shop): Shop {
  const next = { ...shop };
  for (const key of Object.keys(referenceShopDetails) as (keyof typeof referenceShopDetails)[]) {
    if (!next[key]?.trim()) next[key] = referenceShopDetails[key];
  }
  return next;
}
