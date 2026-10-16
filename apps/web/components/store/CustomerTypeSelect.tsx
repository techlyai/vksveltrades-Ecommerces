'use client';

import type { CustomerCategory } from '../../lib/types';
import { customerTypeHelp, customerTypeLabel } from '../../lib/checkout-pricing';
import { RequiredLabel } from './CheckoutField';

export function CustomerTypeSelect({ categories, value, onChange }: {
  categories: CustomerCategory[]; value: string; onChange: (value: string) => void;
}) {
  return <div className="tier checkout-tier">
    <label htmlFor="checkout-customer-type">
      <RequiredLabel>Customer Type</RequiredLabel>
      <select id="checkout-customer-type" name="customerCategoryId" value={value} required
        aria-describedby="checkout-customer-type-help" onChange={(event) => onChange(event.target.value)}>
        {categories.map((category) => <option key={category.id} value={category.id}>{customerTypeLabel(category)}</option>)}
      </select>
      <small id="checkout-customer-type-help">{customerTypeHelp(categories.find((category) => category.id === value))}</small>
    </label>
  </div>;
}
